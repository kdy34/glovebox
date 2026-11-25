# Data Model: Glovebox MVP

## Conventions

- **Money** is stored as integer **cents** (`bigint`), in USD for v1. The schema has a currency column so other currencies can be added later.
- **Service dates** are stored as `date`, not timestamps. A timezone change on the device cannot shift them.
- **Primary keys** are `uuid` and are generated **on the client** (UUIDv7). That makes offline upserts idempotent: retrying the same write cannot create a duplicate.
- Every user-owned table has `user_id uuid not null references auth.users(id) on delete cascade`.
  - It defaults to `auth.uid()`, so the client never has to send it.
  - It is the only column that RLS policies check.
- Every table has `created_at` and `updated_at timestamptz`. A trigger sets `updated_at` on each update.
- **Odometer values** are integers in the vehicle's unit (`mi` or `km`), stored together with that unit.

## Enums (Postgres `CHECK` constraints on `text`)

These are checks rather than Postgres enum types, so values are easy to extend later.

| Name | Values |
|---|---|
| `distance_unit` | `mi`, `km` |
| `vehicle_status` | `active`, `archived` |
| `record_kind` | `service`, `expense` |
| `service_category` | `oil_change`, `tire_rotation`, `tires`, `brakes`, `battery`, `filters`, `fluids`, `inspection`, `repair`, `body`, `other_maintenance` |
| `expense_category` | `fuel`, `insurance`, `registration`, `parking_tolls`, `other_expense` |
| `line_item_type` | `part`, `labor`, `fee`, `discount` |
| `record_source` | `manual`, `ai` |
| `reading_source` | `manual`, `record`, `receipt` |
| `rule_source` | `generic`, `owners_manual`, `user` |
| `extraction_status` | `pending`, `succeeded`, `failed` |

The **Insights grouping** (US4) is a mapping in `src/domain/categories.ts`, not stored data:

| Insights group | Categories |
|---|---|
| maintenance | `oil_change`, `tire_rotation`, `filters`, `fluids`, `battery`, `inspection`, `other_maintenance` |
| repair | `repair`, `brakes`, `body` |
| tires | `tires` |
| fuel | `fuel` |
| insurance | `insurance` |
| registration | `registration` |
| other | `parking_tolls`, `other_expense` |

## Tables

### `profiles`
One row per user, created by a trigger on `auth.users` insert.

| column | type | notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| display_name | text | ≤ 80 chars, nullable |
| distance_unit | text | default `mi` |
| reminder_lead_days | int | default 14, range 0–90 |
| notifications_enabled | bool | default true (in-app preference) |
| onboarding_completed_at | timestamptz | nullable |
| created_at / updated_at | timestamptz | |

### `vehicles`

| column | type | notes |
|---|---|---|
| id | uuid PK | client-generated |
| user_id | uuid FK | |
| nickname | text | ≤ 40, nullable |
| year | int | 1950 … current year + 1 |
| make / model | text | each ≤ 40, required |
| trim | text | ≤ 60, nullable |
| vin | text | nullable, 17 chars `[A-HJ-NPR-Z0-9]`, unique per user (partial index where not null) |
| odometer_unit | text | default `mi` |
| fuel_type | text | NOT NULL, default `gasoline`; `gasoline`, `diesel`, `hybrid`, `plug_in_hybrid`, `electric`, `flex`, `other` (added by `specs/002-vehicle-fuel-type`) |
| photo_path | text | storage key in `vehicle-photos`, nullable |
| status | text | default `active` |
| archived_at | timestamptz | set when archived |
| created_at / updated_at | | |

**State transitions**: `active` → `archived`, and back with "unarchive". Deleting a vehicle is permanent and cascades to its records, readings, rules and share links. Attachment files are removed by an `after delete` trigger that enqueues storage cleanup, or by the delete flow in the app.

### `odometer_readings`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id, vehicle_id | uuid FK | vehicle `on delete cascade` |
| value | int | 0 … 2,000,000 |
| unit | text | `mi` or `km` |
| read_on | date | |
| source | text | `reading_source` |
| record_id | uuid FK → service_records, nullable, `on delete cascade` | |
| is_excluded | bool | default false; true when the user overrides a rollback warning |

Index: `(vehicle_id, read_on desc)`.

### `service_records`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id, vehicle_id | uuid FK | |
| kind | text | `record_kind` |
| category | text | must match `kind`: a service category or an expense category |
| title | text | ≤ 120, e.g. "Oil change + rotation" |
| performed_on | date | not in the future (+1 day tolerance) |
| odometer | int | nullable |
| shop_name | text | ≤ 120, nullable |
| shop_address | text | ≤ 240, nullable |
| is_diy | bool | default false |
| currency | text | default `USD` |
| subtotal_cents | bigint | sum of line items (validated in app + function) |
| tax_cents | bigint | ≥ 0 |
| total_cents | bigint | **CHECK `total_cents = subtotal_cents + tax_cents`** |
| notes | text | ≤ 2,000 |
| source | text | `record_source` |
| extraction_id | uuid FK → receipt_extractions, nullable | audit trail for AI-assisted records |
| created_at / updated_at | | |

Index: `(vehicle_id, performed_on desc)`.

### `line_items`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | |
| record_id | uuid FK | `on delete cascade` |
| position | int | |
| item_type | text | `line_item_type` |
| description | text | 1–200 chars |
| quantity | numeric(10,3) | > 0, default 1 |
| unit_price_cents | bigint | negative only when `item_type = 'discount'` |
| amount_cents | bigint | = round(quantity × unit_price), computed in app, CHECK sign rule |

### `attachments`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id, vehicle_id | uuid FK | |
| record_id | uuid FK | nullable; null while a draft is pending |
| bucket | text | `receipts` |
| storage_path | text | `{user_id}/{attachment_id}.{ext}` |
| mime_type | text | `image/jpeg`, `image/png`, `image/heic` or `application/pdf` |
| bytes | int | ≤ 10 MB |
| sha256 | text | used for duplicate detection |
| created_at | | |

### `receipt_extractions`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id | uuid | |
| attachment_id | uuid FK | `on delete cascade` |
| status | text | `extraction_status` |
| provider / model | text | e.g. `gemini` / `gemini-3.6-flash` |
| latency_ms | int | |
| draft | jsonb | validated output (contracts/receipt-extraction.schema.json) |
| error_code | text | `unreadable`, `not_a_receipt`, `timeout`, `quota_exceeded`, `provider_error`, `invalid_output` |
| corrected_fields | text[] | set on save, for measuring accuracy (SC-003) |
| created_at | | |

Clients can **read** their own rows. **Writes** happen only through the `extract-receipt` function (service role), except for the `corrected_fields` update, which the client can make on its own row.

### `maintenance_rules`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id, vehicle_id | uuid FK | |
| name | text | ≤ 60 |
| service_category | text | `service_category` |
| interval_miles | int | nullable, 100 … 200,000 |
| interval_months | int | nullable, 1 … 120 |
| — | — | **CHECK at least one interval is not null** |
| lead_days | int | default 14 |
| lead_miles | int | default 500 |
| source | text | `rule_source` |
| last_done_on | date | nullable |
| last_done_odometer | int | nullable |
| is_active | bool | default true |
| created_at / updated_at | | |

Next due is **computed** on the device (in `domain/reminders.ts`), not stored. That avoids a second source of truth.

**Reset rule (FR-022)**: saving a record whose `category = service_category` for the same vehicle, with `performed_on ≥ last_done_on`, updates `last_done_on` and `last_done_odometer`. This happens inside the `save_record` RPC transaction (see contracts/edge-functions.md).

### `share_links`

| column | type | notes |
|---|---|---|
| id | uuid PK | |
| user_id, vehicle_id | uuid FK | |
| token | text | unique; 43-character base64url of 32 random bytes, generated **in the DB** (`encode(gen_random_bytes(32),'base64')` → url-safe) |
| include_costs | bool | default false |
| include_images | bool | default false |
| view_count | int | default 0 |
| revoked_at | timestamptz | nullable |
| created_at | | |

Public access goes only through the `public-report` function (service role). It checks `revoked_at is null`. There are **no anonymous RLS policies.**

### `usage_counters`

| column | type | notes |
|---|---|---|
| user_id | uuid | |
| period | date | first day of the month |
| scans | int | default 0 |

PK `(user_id, period)`. Clients can read it. It is written only by the SQL function `consume_scan(p_user_id uuid, p_limit int) returns boolean`, which is `security definer`, does an atomic upsert-and-check, and is callable only by `service_role`.

### `entitlements`

| column | type | notes |
|---|---|---|
| user_id | uuid PK | |
| is_pro | bool | |
| product_id | text | |
| period_type | text | `trial`, `normal` or `intro` |
| expires_at | timestamptz | |
| store | text | `app_store` or `play_store` |
| updated_at | | |

Clients can read their own row. It is written only by `revenuecat-webhook`. The RevenueCat `app_user_id` is the Supabase user id.

### `app_config`

| column | type | notes |
|---|---|---|
| key | text PK | |
| value | jsonb | |

Readable by `anon` and `authenticated`. Writable only through the dashboard (service role). Keys are listed in [contracts/app-config.md](./contracts/app-config.md).

## Relationships

```text
auth.users 1─1 profiles
auth.users 1─* vehicles 1─* service_records 1─* line_items
                       │                 └─* attachments ─* receipt_extractions
                       ├─* odometer_readings (optional link to record)
                       ├─* maintenance_rules
                       └─* share_links
auth.users 1─* usage_counters ; 1─1 entitlements
```

## RLS summary

- Every user-owned table has RLS enabled.
- **select / insert / update / delete** for `authenticated` all use `using (user_id = auth.uid())` and `with check (user_id = auth.uid())`.
- Child tables add an ownership check on the parent in `with check`. For example, on `service_records` the check is `exists (select 1 from vehicles v where v.id = vehicle_id and v.user_id = auth.uid())`. This stops a user from attaching a row to another user's vehicle. `service_records` also requires `extraction_id is null or owns_extraction(extraction_id)` (T106), because FK checks bypass RLS.
- `receipt_extractions`, `usage_counters` and `entitlements`: `select` only for clients. The one exception is `receipt_extractions.corrected_fields`, which the client may update through a column-level grant.
- **Storage** (`receipts`, `vehicle-photos`) is private. Policy: `bucket_id = '<b>' and (storage.foldername(name))[1] = auth.uid()::text` for select, insert, update and delete.

## Validation rules (shared app + server)

- VIN: 17 chars, excluding I/O/Q, check digit valid (warn rather than block, because some imports fail the check).
- Odometer: a reading lower than the latest included reading for that vehicle triggers a rollback warning. If the user overrides it, the reading is saved with `is_excluded = true`, which removes it from projections.
- Money: `|cents| ≤ 100,000,000` ($1M). `total = subtotal + tax`. Extraction mismatches over 1 cent are flagged (FR-014).
- Duplicate receipt: the same vehicle, the same `performed_on`, `total_cents` equal, and a similar shop name (normalized Levenshtein ≤ 0.2), or the same attachment `sha256`. The app shows a "Looks like a duplicate" prompt.
