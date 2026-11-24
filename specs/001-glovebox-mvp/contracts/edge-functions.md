# Contract: Edge Functions (Supabase, Deno)

## Common rules

- **Base URL**: `https://<project>.supabase.co/functions/v1/<name>`
- **Auth**: every function requires `Authorization: Bearer <user JWT>`, verified with `supabase.auth.getUser`. Two exceptions:
  - `public-report` is anonymous and uses a token instead.
  - `revenuecat-webhook` uses a shared secret.
- **Errors** always come back as `{ "error": { "code": string, "message": string } }`, with a 4xx or 5xx status. Messages are safe to show to the user; there are no stack traces.
- **CORS**: the app doesn't need it. The only allowed origin is the `web/` site, and only for `public-report`.

---

## `POST /extract-receipt`

Turns a receipt image (already uploaded) into a draft record.

**Request**
```json
{ "attachment_id": "uuid", "vehicle_id": "uuid" }
```

The file must already be uploaded to `receipts/{uid}/{attachment_id}.*`, and the `attachments` row must exist and belong to the caller.

**Processing**
1. Verify the user. Load the attachment through the service role and check that `user_id` matches the caller.
2. Check the file: MIME type is one of the allowed types and the size is under 10 MB.
3. Read `app_config.ai`. If `enabled` is false, return `ai_disabled`.
4. Work out the scan limit:
   - If monetization is enabled and `entitlements.is_pro` is true, use the pro limit.
   - Otherwise use the free limit.
5. Call `consume_scan(user_id, limit)`. If it returns false, return `quota_exceeded`.
6. Create a `receipt_extractions` row with status `pending`.
7. Download the image and call the provider with:
   - the system prompt (`_shared/ai/prompt.ts`)
   - the response schema
   - a 30 s timeout
8. Validate the response with Zod against `receipt-extraction.schema.json`, then post-process it:
   - clamp the values
   - recompute the totals check and add `totals_mismatch` if `|subtotal + tax − total| > 1`
9. Update the row to `succeeded` with the draft, or `failed` with an `error_code`.
10. If the failure is the provider's (`provider_error`, `timeout`, `invalid_output`), refund the scan.

**200 Response**
```json
{ "extraction_id": "uuid", "draft": { "...ReceiptExtractionDraft v1..." }, "low_confidence_fields": ["odometer", "line_items[2]"], "scans_remaining": 4 }
```

**Errors**

| status | code | when |
|---|---|---|
| 401 | `unauthorized` | missing or invalid JWT |
| 404 | `attachment_not_found` | attachment doesn't exist or isn't the caller's |
| 413 | `file_too_large` | file is 10 MB or more |
| 415 | `unsupported_type` | MIME type not allowed |
| 402 | `quota_exceeded` | body also has `{"limit":5,"resets_on":"2026-12-01"}` |
| 422 | `not_a_receipt` | the model returned `is_receipt: false` |
| 422 | `unreadable` | the image couldn't be read |
| 503 | `ai_disabled` | `app_config.ai.enabled` is false |
| 503 | `provider_error` | the AI provider failed |
| 504 | `timeout` | the provider took longer than 30 s |

**Client behavior**: on any error, open the manual form with the photo attached (FR-015). On `quota_exceeded`, also offer the paywall, but only if monetization is enabled.

**Security**: the prompt tells the model that the image is data, not instructions. The function uses no tools or function-calling and does no URL fetching. Output fields are length-capped and validated against the schema. Raw model text is never echoed back to the client.

---

## `POST /export-data`

Builds a ZIP of everything the user owns.

**Request**: `{}`

**Processing**: the function uses the caller's JWT to select all of the caller's rows. A service-role key is not needed for reading, because RLS already scopes the results. It then builds a ZIP containing:
- `glovebox-export/data.json`: every table
- `csv/*.csv`: vehicles, records, line_items, odometer, rules
- `files/…`: the attachments and vehicle photos

The ZIP is uploaded to `exports/{uid}/{timestamp}.zip`, a private bucket where objects expire after 24 h through a cleanup job.

**200 Response**:
```json
{ "url": "<signed url, 15 min>", "bytes": 123456, "expires_at": "…" }
```

**Errors**:
- `413 export_too_large`: over 500 MB. The response then offers a JSON-only export.

---

## `POST /delete-account`

Permanently deletes the caller's account and data.

**Request**: `{ "confirm": "DELETE" }`

**Processing (service role)**:
1. List and remove all objects under `{uid}/` in `receipts`, `vehicle-photos` and `exports`.
2. Revoke all share links. This happens anyway when the rows cascade.
3. If the user signed in with Apple, revoke the Apple token (best effort).
4. Call `auth.admin.deleteUser(uid)`. All rows cascade-delete.
5. Write an anonymized audit log line: no user id, just a count and a timestamp.

**200 Response**: `{ "deleted": true }`

**Errors**:
- `400 confirmation_required`
- `500 partial_failure`: the step that failed is retried by a nightly reconciliation that sweeps storage orphans.

---

## `GET /public-report?token=<43 chars>`

Anonymous. Called by `web/r.html`.

**Processing (service role)**:
1. Look up the `share_links` row by token where `revoked_at is null`. Otherwise return `404 not_available`.
2. Increment `view_count`.
3. Return a sanitized report.

**200 Response**
```json
{
  "vehicle": { "nickname": "…", "year": 2009, "make": "Toyota", "model": "Prius", "trim": "…", "vin_last6": "123456" },
  "generated_at": "…",
  "odometer": [{ "read_on": "2026-01-02", "value": 150123, "unit": "mi" }],
  "records": [{ "performed_on": "…", "odometer": 150123, "title": "…", "category": "oil_change", "shop_name": "…", "is_diy": false, "line_items": [{ "description": "…" }], "total_cents": 6499, "images": ["<signed url 10 min>"] }],
  "totals": { "records": 12, "spend_cents": 182300 },
  "branding": { "pro": true }
}
```

**What is never returned**:
- the owner's email or name
- other vehicles
- the full VIN (last 6 characters only)
- notes
- costs, unless `include_costs` is set (`total_cents` and `totals.spend_cents` are omitted)
- images, unless `include_images` is set

**Headers**:
- `Cache-Control: no-store`
- CORS limited to the site origin

**Rate limiting**: 60 requests per minute per IP, using a simple in-memory limiter per instance. The token search space is 2^256.

---

## `POST /revenuecat-webhook`

Updates the `entitlements` table from RevenueCat events.

**Auth**: `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>`, compared in constant time.

**Processing**: an idempotent upsert of `entitlements` for `event.app_user_id`.

| Event types | Effect |
|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `PRODUCT_CHANGE`, `UNCANCELLATION` | `is_pro = true`, `expires_at = event.expiration_at_ms` |
| `CANCELLATION` | keep Pro until `expires_at` |
| `EXPIRATION`, `BILLING_ISSUE` (after grace) | `is_pro = false` |

Unknown event types return 200 and are ignored.

**Response**: `200 {}`

---

## Direct PostgREST access (from the app, anon key + user JWT)

All CRUD on these tables goes through `supabase-js` with RLS: `vehicles`, `odometer_readings`, `service_records`, `line_items`, `attachments`, `maintenance_rules`, `share_links` (insert/revoke) and `profiles`. Writes are upserts with client UUIDs.

Records and their line items are saved atomically with the RPC `save_record(record jsonb, items jsonb)`. It is `security invoker`, so RLS applies. In one transaction it:
1. upserts the record
2. replaces its line items
3. upserts the linked odometer reading
4. resets any matching rules (FR-022)
