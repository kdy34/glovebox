# Tasks: Glovebox MVP (v1.0)

**Input**: Design documents from `specs/001-glovebox-mvp/`, which are plan.md, research.md, data-model.md, contracts/ and quickstart.md.

**Tests**: Required for the core logic, RLS and edge functions (constitution Principle V, Test-First). Test tasks come first in each phase, and the tests must FAIL before the code that makes them pass is written.

**Format**: `- [ ] T### [P] [US#] Description with exact file path`

- `[P]`: the task can run in parallel with others (different files, no unmet dependencies).
- `[US#]`: the user story the task belongs to (US1 to US7, from spec.md).

---

## Phase 1: Setup (shared infrastructure)

- [x] T001 Create the repo layout (`app/`, `supabase/`, `web/`, `docs/`). Add root `README.md`, `.gitignore` (env files, `.expo`, `node_modules`, `ios/`, `android/`) and `.editorconfig`.
- [x] T002 Scaffold the Expo SDK 57 TypeScript app with Expo Router in `app/`, including `app/package.json` with pinned versions, `app/tsconfig.json` (strict, `@/*` paths) and `app/babel.config.js`.
- [x] T003 [P] Configure `app/app.config.ts`:
  - name Glovebox, bundle ID `app.glovebox.ios`, iOS 16.4 minimum
  - permission strings for camera, photos and notifications
  - plugins: Apple auth, document scanner, notifications, Sentry
  - read `EXPO_PUBLIC_*` env values
- [x] T004 [P] Configure `app/eas.json` with development, preview and production profiles, plus `app/.env.example`.
- [x] T005 [P] Configure linting and formatting in `app/.eslintrc.js` and `app/.prettierrc`, Jest in `app/jest.config.js` (jest-expo), and npm scripts (`typecheck`, `lint`, `test`).
- [x] T006 [P] Initialize Supabase in `supabase/config.toml` (auth: Apple + email OTP; storage buckets) and add `supabase/.env.example`.
- [x] T007 [P] Add GitHub Actions CI in `.github/workflows/ci.yml` (domain tests, SQL tests on Postgres 16, app install + typecheck + lint + UI tests, `deno test`, gitleaks) and a manual EAS iOS build workflow in `.github/workflows/eas-build.yml`.

## Phase 2: Foundational (blocks all stories)

**Tests first**

- [x] T008 [P] Write SQL assertion tests in `supabase/tests/rls.test.sql`. Two users, A and B: A cannot select, insert, update or delete B's rows in any table, and cannot attach rows to B's vehicle.
- [x] T009 [P] Write SQL assertion tests in `supabase/tests/constraints.test.sql` covering:
  - `total_cents = subtotal + tax`
  - each category matches its kind
  - a rule must have at least one interval
  - VIN format
  - the discount sign rule

**Database**

- [x] T010 Write the core schema migration `supabase/migrations/20261123000001_core_schema.sql`:
  - all tables, checks, indexes, the `updated_at` trigger
  - the `profiles` insert trigger on `auth.users`
  - `user_id default auth.uid()`
- [x] T011 Write the RLS policy migration `supabase/migrations/20261123000002_rls_policies.sql`. Include the parent-ownership `with check` rules and the column grant for `receipt_extractions.corrected_fields`.
- [x] T012 Write the storage migration `supabase/migrations/20261123000003_storage.sql`: private buckets `receipts`, `vehicle-photos` and `exports`, with `{uid}/` prefix policies.
- [x] T013 Write `supabase/migrations/20261123000004_functions_quota.sql` with:
  - `consume_scan(p_limit)` and `refund_scan()` (security definer, service role only)
  - the `save_record(record, items)` RPC
  - share-link token generation as a column default
- [x] T014 [P] Seed the `app_config` defaults from contracts/app-config.md in `supabase/seed.sql`.

**Shared edge-function helpers**

- [x] T015 [P] Write `supabase/functions/_shared/cors.ts`, `auth.ts` (`getUser` from JWT), `errors.ts` (typed error responses) and `config.ts` (reads `app_config` with defaults).

**App foundation**

- [x] T016 [P] Build the design tokens (light/dark color, type scale, spacing, radius, AA-checked pairs) in `app/src/ui/theme.ts`.
- [x] T017 [P] Build the core UI components in `app/src/ui/components/`: Button, Card, TextField, MoneyField, DateField, Chip, ListRow, EmptyState, Sheet, Toast and Screen. All need VoiceOver labels and Dynamic Type support.
- [x] T018 [P] Set up i18n in `app/src/i18n/index.ts` and `app/src/i18n/en.json`.
- [x] T019 Write the Supabase client with a SecureStore session adapter in `app/src/data/supabase.ts`, and generated types in `app/src/data/types.ts`.
- [x] T020 [P] Write the remote config service with compiled defaults and caching in `app/src/services/config.ts`.
- [x] T021 [P] Write the Sentry init with PII scrubbing in `app/src/services/sentry.ts`, and allowlisted PostHog analytics in `app/src/services/analytics.ts`.
- [x] T022 Write the root layout `app/app/_layout.tsx` with providers (theme, query, auth gate, i18n, toasts), and the tab layout `app/app/(tabs)/_layout.tsx`.
- [x] T023 Build the auth screens in `app/app/(auth)/sign-in.tsx`: Sign in with Apple via `app/src/platform/appleAuth.ts`, and email OTP with a code-entry step.
- [x] T024 [P] Build the onboarding screen `app/app/onboarding.tsx`: 3 value slides ("Snap receipts", "Never miss service", "Sell with proof"), then sign-in.
- [x] T025 [P] Build the legal screens in `app/app/legal/[doc].tsx`, rendering the privacy policy, terms and AI notice from bundled markdown. Add the AI notice copy.

**Checkpoint**: a user can sign in and lands on an empty Garage tab. RLS tests pass.

---

## Phase 3: User Story 1 — Garage + manual service log (P1) 🎯 MVP

**Goal**: Add vehicles, log services and expenses by hand, and see a timeline. Offline-safe.
**Independent test**: quickstart §2 row US1.

**Tests first**

- [x] T026 [P] [US1] Write unit tests in `app/__tests__/domain/money.test.ts`: cents parsing and formatting, line totals, discounts, subtotal + tax = total, mismatch detection.
- [x] T027 [P] [US1] Write unit tests in `app/__tests__/domain/vin.test.ts`: format, check digit, the I/O/Q exclusions.
- [x] T028 [P] [US1] Write unit tests in `app/__tests__/domain/odometer.test.ts`: rollback detection, exclusion, unit handling.
- [x] T029 [P] [US1] Write outbox tests in `app/__tests__/data/outbox.test.ts`: ordered flush, idempotent retry, no duplicates after a simulated network failure.

**Implementation**

- [x] T030 [P] [US1] Implement `app/src/domain/money.ts`, `app/src/domain/vin.ts`, `app/src/domain/odometer.ts` and `app/src/domain/categories.ts`.
- [x] T031 [US1] Implement the SQLite outbox and sync triggers (reconnect, foreground) in `app/src/data/outbox.ts` and `app/src/data/sync.ts`.
- [x] T032 [P] [US1] Implement the repositories `app/src/data/repositories/vehicles.ts`, `records.ts` (via the `save_record` RPC) and `odometer.ts`, plus the query hooks in `app/src/data/queries.ts`.
- [x] T033 [P] [US1] Implement the NHTSA vPIC decoder service with a timeout and fallback in `app/src/services/vinDecoder.ts`.
- [x] T034 [US1] Build the Garage screen `app/app/(tabs)/index.tsx`: vehicle cards with photo, odometer and due chips; an empty state; an "Add vehicle" CTA.
- [x] T035 [US1] Build the add/edit vehicle screens `app/app/vehicle/new.tsx` and `app/app/vehicle/[id]/edit.tsx`: VIN entry and decode, manual year/make/model pickers, optional photo, archive and delete with confirmation.
- [x] T036 [US1] Build the vehicle detail screen `app/app/vehicle/[id]/index.tsx`: header, a timeline grouped by month, filters (service/expense), and a FAB with Scan / Manual / Odometer.
- [x] T037 [US1] Build the record form `app/app/record/new.tsx` and `app/app/record/[id].tsx`:
  - kind and category, date, odometer, shop or DIY toggle
  - line-items editor, tax, auto-computed total
  - attachments, notes
  - edit and delete
- [x] T038 [P] [US1] Build the odometer entry screen `app/app/odometer/new.tsx`, with a rollback warning and override.
- [x] T039 [US1] Wire the offline indicator and sync status toast in `app/src/features/sync/SyncBanner.tsx`.

**Checkpoint**: US1 is independently demoable. This is the MVP.

---

## Phase 4: User Story 6 — Account & data control (P2, launch-blocking)

**Goal**: In-app export and account deletion (App Store requirement).

- [x] T040 [P] [US6] Write Deno tests in `supabase/functions/delete-account/index.test.ts`: confirmation required, storage purged, user deleted, other users untouched.
- [x] T041 [P] [US6] Write Deno tests in `supabase/functions/export-data/index.test.ts`: the ZIP contains JSON, CSV and files only for the caller.
- [x] T042 [US6] Implement `supabase/functions/delete-account/index.ts` per contracts/edge-functions.md, including the Apple token revoke (best effort).
- [x] T043 [US6] Implement `supabase/functions/export-data/index.ts` with JSZip and signed URLs, plus a 24 h cleanup of the `exports` bucket.
- [x] T044 [US6] Build the Settings screen `app/app/(tabs)/settings.tsx`:
  - profile and units, notification lead time
  - Export my data, Delete account (double confirm, subscription-cancel guidance)
  - support email, legal links, app version
- [x] T045 [P] [US6] Implement the account service (export download + share sheet, delete + sign-out + local wipe) in `app/src/services/account.ts`.

**Checkpoint**: US6 passes quickstart §2 row US6.

> Done 2026-11-24. Function logic lives in `handler.ts` (a `createHandler(deps)` factory) and `index.ts` only calls `Deno.serve`. Run the Deno tests against local Supabase with `supabase/functions/test-local.sh`. Export ZIPs are built in memory, so very large exports hit Edge Function memory limits well below 500 MB; `data_only` is the fallback. Not yet run: the quickstart US6 row on a device.

---

## Phase 5: User Story 2 — Snap a receipt → verified record (P2)

**Goal**: AI draft from a photo, flagged uncertain fields, user confirms.
**Independent test**: quickstart §2 rows US2 and AI quality.

**Tests first**

- [x] T046 [P] [US2] Write the contract test `app/__tests__/contracts/extractionSchema.test.ts`: the app Zod schema equals `contracts/receipt-extraction.schema.json`.
- [x] T047 [P] [US2] Write Deno tests in `supabase/functions/extract-receipt/index.test.ts` with a mocked provider:
  - auth and ownership, MIME and size limits
  - quota consume and refund
  - invalid output rejected
  - prompt-injection text in the image is ignored (the output must still match the schema)
  - totals mismatch adds a warning
  - timeout returns 504
- [ ] T048 [P] [US2] Write unit tests in `app/__tests__/domain/extraction.test.ts` for draft → form mapping: low-confidence flags, the DIY detection default, line-item normalization.
- [ ] T049 [P] [US2] Write unit tests in `app/__tests__/domain/duplicates.test.ts` for likely-duplicate detection.

**Implementation**

- [x] T050 [P] [US2] Write the provider interface and Gemini implementation (JSON mode + response schema, 30 s timeout) in `supabase/functions/_shared/ai/provider.ts` and `supabase/functions/_shared/ai/gemini.ts`.
- [x] T051 [P] [US2] Write the system prompt (data-not-instructions, US receipt conventions, cents, ISO dates, confidence calibration) in `supabase/functions/_shared/ai/prompt.ts`, and the Zod schema in `supabase/functions/_shared/ai/schema.ts`.
- [x] T052 [US2] Implement `supabase/functions/extract-receipt/index.ts` per the contract.
  > Done 2026-11-24 (server side).
  > - Gemini gets an OpenAPI-subset `responseSchema` derived at runtime from the server Zod schema (`geminiResponseSchema()`), because the docs don't confirm which JSON Schema keywords `responseJsonSchema` accepts. Zod is the real check.
  > - With `monetization_enabled` off, everyone gets the free scan limit, per contracts/app-config.md. quickstart.md US7 says "the limit lifts", which contradicts this; decide which is right before US7.
  > - `unreadable` means `is_receipt` is true but there's no total and no line items.
  > - Not yet run: a real Gemini call (no key in this environment).
- [ ] T053 [P] [US2] Implement `app/src/domain/extraction.ts` and `app/src/domain/duplicates.ts`.
- [ ] T054 [P] [US2] Wrap the iOS VisionKit scanner in `app/src/platform/documentScanner.ts`, with the image-picker and PDF fallback.
- [ ] T055 [US2] Implement the receipt service (compress → sha256 → upload → attachment row → invoke the function → map errors to the manual fallback) in `app/src/services/receipts.ts`.
- [ ] T056 [US2] Build the scan capture screen `app/app/scan/index.tsx`: pick the vehicle, scan or import, and a processing animation that is respectful of Reduce Motion.
- [ ] T057 [US2] Build the draft review screen `app/app/scan/review.tsx`:
  - the record form pre-filled from the draft
  - flagged fields focused first, the original image on a zoomable top sheet
  - a mismatch banner and a duplicate prompt
  - on save, write `corrected_fields`
- [ ] T058 [P] [US2] Write the golden-set evaluation script `supabase/functions/_shared/ai/eval.ts` (field accuracy, totals accuracy, latency p90), and `docs/qa/receipts/README.md` explaining how to add receipts with expected JSON.

**Checkpoint**: US2 works end to end, and turning AI off falls back cleanly.

---

## Phase 6: User Story 3 — Reminders (P3)

**Tests first**

- [ ] T059 [P] [US3] Write unit tests in `app/__tests__/domain/projection.test.ts`: miles-per-day regression, the minimum-data rules, excluded readings ignored.
- [ ] T060 [P] [US3] Write unit tests in `app/__tests__/domain/reminders.test.ts`:
  - whichever-first rule
  - Due soon / Overdue thresholds
  - time-only fallback
  - reset after a matching record
  - month-end date math (e.g. Jan 31 + 1 mo)

**Implementation**

- [ ] T061 [P] [US3] Implement `app/src/domain/projection.ts`, `app/src/domain/reminders.ts` and `app/src/domain/genericRules.ts` (labelled generic starter set). Note: `genericRules.ts` already exists (`specs/002-vehicle-fuel-type`, R7 data + fuel filter); build projection and reminders on it and don't rewrite it.
- [ ] T062 [P] [US3] Implement the rules repository and hooks in `app/src/data/repositories/rules.ts`.
- [ ] T063 [US3] Implement the local notification scheduler (reschedule on data change and launch, permission pre-prompt) in `app/src/services/notifications.ts`.
- [ ] T064 [US3] Build the rules screen `app/app/vehicle/[id]/rules.tsx`: add from the generic set or custom, edit intervals, lead time, the "Generic — check your owner's manual" label. Offer `genericStarterSet(vehicle.fuel_type)` (002 FR-004) and use `rules.genericLabel`.
- [ ] T065 [US3] Build the Reminders tab `app/app/(tabs)/reminders.tsx`: due across all vehicles sorted by urgency, "Log it" quick action, and "Update odometer" when projection data is missing.
- [ ] T066 [P] [US3] Add a vehicle health ring component in `app/src/ui/components/ProgressRing.tsx`, and due chips on Garage cards.

---

## Phase 7: User Story 4 — Cost insights (P4)

- [ ] T067 [P] [US4] Write unit tests in `app/__tests__/domain/insights.test.ts`: totals by month, year and category group; cost per mile; the not-enough-data rule; expenses excluded from the maintenance history; cent-exact results against a fixture.
- [ ] T068 [US4] Implement `app/src/domain/insights.ts`.
- [ ] T069 [P] [US4] Build an SVG bar/stacked chart with accessibility summaries in `app/src/ui/components/BarChart.tsx`.
- [ ] T070 [US4] Build the Insights tab `app/app/(tabs)/insights.tsx`: vehicle selector, period switch, category breakdown, cost per mile, top expenses with drill-down, and the Pro gate via entitlements.
- [ ] T071 [P] [US4] Write the demo seed script `app/scripts/seedDemo.ts` and the expected-values fixture `docs/qa/insights-expected.json`.

---

## Phase 8: User Story 5 — Report PDF + share link (P5)

- [ ] T072 [P] [US5] Write Deno tests in `supabase/functions/public-report/index.test.ts`: revoked or unknown token returns 404; no email, notes or full VIN; costs and images only when the flags are set; view count increments.
- [ ] T073 [US5] Implement `supabase/functions/public-report/index.ts`, with CORS restricted to `SITE_ORIGIN` and a rate limit.
- [ ] T074 [P] [US5] Build the branded HTML report template and PDF generation with `expo-print`/`expo-sharing` in `app/src/services/report.ts`.
- [ ] T075 [P] [US5] Implement the share-link repository (create with options, list, revoke, copy) in `app/src/data/repositories/shareLinks.ts`.
- [ ] T076 [US5] Build the report screen `app/app/vehicle/[id]/report.tsx`: include costs/images toggles, preview, Share PDF, Create link (Pro), manage links.
- [ ] T077 [P] [US5] Build the web report viewer `web/r.html`, `web/assets/report.js` and `web/assets/styles.css`, plus the rewrites and security headers in `web/vercel.json`.

---

## Phase 9: User Story 7 — Glovebox Pro (P6)

- [ ] T078 [P] [US7] Write unit tests in `app/__tests__/domain/entitlements.test.ts`: free/pro limits from config, the kill switch forcing free, a lapsed Pro keeping data read-only above limits.
- [ ] T079 [P] [US7] Write Deno tests in `supabase/functions/revenuecat-webhook/index.test.ts`: secret check, event mapping, idempotency.
- [ ] T080 [US7] Implement `app/src/domain/entitlements.ts`, and use it in vehicle add, scan, insights and share links.
- [ ] T081 [US7] Implement `supabase/functions/revenuecat-webhook/index.ts`.
- [ ] T082 [US7] Implement the RevenueCat wrapper (configure only if monetization is enabled, `logIn` with the Supabase uid, restore, customer-info listener) in `app/src/services/purchases.ts`.
- [ ] T083 [US7] Build the paywall `app/app/paywall.tsx`: benefits, StoreKit price strings, trial terms, renewal disclosure, Restore, Terms and Privacy links, close button, no dark patterns.

---

## Phase 10: Polish, compliance & launch

- [ ] T084 [P] Write the Privacy Policy, Terms of Use and support pages in `web/privacy.html`, `web/terms.html` and `web/support.html`, and the landing page in `web/index.html`. These are plain-language templates for Kutay to review.
- [ ] T085 [P] Map the App Privacy answers to the actual data flows in `docs/app-store/privacy-nutrition.md`.
- [ ] T086 [P] Write the App Store listing (name, subtitle, keywords, description, screenshot storyboard) in `docs/app-store/listing.md`, and the review notes with a demo account in `docs/app-store/review-notes.md`.
- [ ] T087 [P] Create the app icon, splash screen and onboarding illustrations in `app/assets/` (SVG source plus exported PNGs).
- [ ] T088 Do an accessibility pass: VoiceOver labels, Dynamic Type XL, contrast and Reduce Motion across all screens. Record the results in `docs/qa/a11y.md`.
- [ ] T089 Do a security review pass per the constitution (secrets, RLS, storage, function input validation, dependency pins). Record the results in `docs/qa/security-review.md`.
- [ ] T090 [P] Measure performance (cold start, timeline with 500 records, PDF with 50 records) and record the results in `docs/qa/performance.md`.
- [ ] T091 Write the launch checklist (TestFlight ≥10 testers, crash-free ≥99.5%, submission steps, F-1 monetization gate) in `docs/launch-checklist.md`.
- [ ] T092 Run quickstart.md end to end on a real iPhone and record the results.
- [ ] T093 [P] Run a 5-person moderated usability test (sign up → add car → first record) and record the median time for SC-001 in `docs/qa/usability-sc001.md`.
- [ ] T094 [US2] Support multi-page receipts: allow up to 3 images per scan in `app/app/scan/index.tsx`, and send them as one request to `supabase/functions/extract-receipt/index.ts` (the edge case "receipt split across two photos").
- [ ] T095 [P] Add a nightly storage orphan sweep (objects with no matching `attachments` or `vehicles` row, and exports older than 24 h) as a scheduled function in `supabase/functions/storage-sweep/index.ts`, together with its cron entry.

## Converge: offline record sync (FR-010 / FR-022)

A converge pass found that an offline `saveRecord` queued separate `service_records`, `line_items` and `odometer_readings` upserts. That bypassed `save_record`: old line items were never replaced, a second odometer reading was created, and rule resets (FR-022) were skipped. It also queued validation errors and dropped failed entries after one attempt. Tests are in `app/__tests__/data/outbox.test.ts`.

- [x] T096 [US1] Add an `rpc` outbox operation. When `saveRecord` fails offline, enqueue one `rpc` entry `{fn:'save_record', args:{p_record, p_items}}` keyed by the record id, and remove the separate table upserts (`app/src/data/outbox.ts`, `app/src/data/recordSave.ts`, `app/src/data/repositories/records.ts`). Tests: an edited offline record replaces its line items; no duplicate odometer reading.
- [x] T097 [US1] Queue only when the network is down (NetInfo offline, or a fetch/network error with no SQLSTATE). Validation and DB errors (e.g. 22023, 23514, 42501) throw `RecordSaveError` and are shown in the record form, never queued. Test: a validation error is not queued.
- [x] T098 [US1] Never drop failed entries. Increment `attempts` and retry with exponential backoff (2 s base, 5 min cap, timer in `sync.ts`). After 5 attempts, set status `dead` and show it in `SyncBanner` ("1 change couldn't sync — tap to review", with Retry/Discard). Stop each flush at the first failure so order is preserved. Migrate the SQLite outbox schema to v2. Mount `SyncBanner` and call `initSync()` for signed-in users. Test: a transient failure is retried, not lost.
- [x] T099 [US1] Partial changes must not use upsert. PostgREST upsert is `INSERT ... ON CONFLICT`, so a partial payload always fails: 23502 (NOT NULL) for `archiveVehicle`, and 42501 (RLS check on the null `vehicle_id`) for `excludeOdometerReading` when sent as the API role. Add an `update` outbox operation (`.update(fields).eq('id', id)`). Use it for archive, unarchive (new `unarchiveVehicle` + `useUnarchiveVehicle`) and exclude (`app/src/data/writes.ts`). Enqueueing onto a pending upsert/update for the same id merges the fields; a pending delete is kept. The executor marks an entry dead at once when the error has a non-transient SQLSTATE; classes 08/40/53/57/58 are still retried. SQLite outbox schema v3. Tests: `app/__tests__/data/outbox.test.ts`, and `supabase/tests/partial_writes.test.sql` against real Postgres (partial upsert fails, partial update succeeds).
- [x] T100 [US6] Tie the outbox to the signed-in user. Every entry carries `user_id`. Enqueue needs a signed-in user. Flush, the pending count, the dead list and retry/discard only touch the current user's entries, so nothing is sent while signed out and nothing runs as anon. `purgeUser` removes every entry of a deleted account. Sign-out keeps entries for their owner, because dropping them would lose unsynced offline work (T098). SQLite outbox schema v4; rows from before this change are claimed by the first user who signs in (dev data only). `setSyncUser` is called on every auth change and stops the retry timer on sign-out. The query cache moves to `app/src/data/queryClient.ts` and is cleared on sign-out. Tests: `app/__tests__/data/outbox.test.ts`.

## Converge: email sign-in code (FR-001)

Bug: the sign-up and sign-in emails used Supabase's default templates, which show a confirmation link and no code. The app only accepts the 6-digit code (`app/app/(auth)/sign-in.tsx`), so a new user could not finish signing up.

- [x] T101 [US1] Add code-only email templates `supabase/templates/confirmation.html` (sign-up) and `supabase/templates/magic_link.html` (sign-in). Each is a short Glovebox-branded email with `{{ .Token }}` in large text and "Enter this code in the Glovebox app. It expires in 10 minutes.", with no link. Wire them in `supabase/config.toml` under `[auth.email.template.confirmation]` and `[auth.email.template.magic_link]` (subject + `content_path`). The hosted project gets the same templates through the dashboard (quickstart.md §3). Test: `supabase/functions/_shared/auth_email.test.ts` checks against local Auth + Mailpit, for a new user and then a returning user, that the email has a 6-digit code and no link or URL, and that `verifyOtp` with that code signs the user in.

## Converge: simulator hand-test fixes

- [x] T102 [US1] Bug (FR-005): saving a vehicle failed with "Could not save vehicle". Cause: `uuid` v4 calls `crypto.getRandomValues()`, and Hermes has no `crypto` global (confirmed in the running app: `typeof crypto === 'undefined'`), so every client-generated id threw before the write was queued. Replace `uuid` with `newId()` in `app/src/data/ids.ts` (expo-crypto `randomUUID()`) in the vehicle and odometer repositories and the record form, and remove `uuid`/`@types/uuid` from the app. Every save form's catch (vehicle add/edit, odometer, record) calls `reportSaveError` (`app/src/services/saveError.ts`): `console.error` + Sentry, with the real error appended to the alert in dev (`describeError`/`saveErrorMessage` in `app/src/domain/errors.ts`). Tests: `__tests__/data/ids.test.ts`, `__tests__/domain/errors.test.ts`. Verified in the simulator: a vehicle saved through the app's repository reached `public.vehicles`.
- [x] T103 [US1] UI fixes from hand-testing.
  (a) The selected Miles/Kilometers option was white text on nothing, because `Button` let a caller's `style` replace its own style (and its fill). Now `Button` merges the caller's style after its own. New `SegmentedControl` (`app/src/ui/components/SegmentedControl.tsx`, radio semantics) shows the selected option as a filled navy (`selectedBg`/`onSelected` tokens; dark mode uses a lighter navy, `#2E4A7A`), and that pair is in `textPairs`. Used for the unit choice in vehicle add/edit. Tests: `__tests__/ui/SegmentedControl.test.tsx`, `__tests__/domain/contrast.test.ts`.
  (b) Every stack screen has a translated title, which iOS also uses as the next screen's back label (`app/src/navigation/screens.ts`, wired in `app/app/_layout.tsx`). The `(tabs)` entry takes the focused tab's title, so screens pushed from a tab go back to "Garage", "Settings" and so on. The vehicle screen uses the vehicle's name as its title, with Edit in the header. The duplicate in-page headings are removed (vehicle add/edit, odometer, record form). Test: `__tests__/domain/screens.test.ts`.
  (c) The make from the NHTSA VIN decode is title-cased, keeping brand spellings ("TOYOTA" → "Toyota", "MERCEDES-BENZ" → "Mercedes-Benz", "BMW", "McLaren"): `formatMake` in `app/src/domain/make.ts`. Test: `__tests__/domain/make.test.ts`.
  (d) The sign-in legal line is one sentence, with Terms of Use and Privacy Policy as inline links instead of being repeated after it (`auth.legalPrefix`/`legalAnd`/`legalSuffix`). Test: `__tests__/domain/signInLegal.test.ts`.
- [x] T104 [US1] Bug: a Garage card for a car without a nickname shows "2009 Toyota Prius" twice, as the title and again as the subtitle. The subtitle must never repeat the title. With a nickname: title = nickname, subtitle = year make model (unchanged). Without one: title = year make model, subtitle = the trim if set, else "Last service {date}" from the latest service record (expenses don't count), else "No services logged yet" once records have loaded (nothing while they load, so the card never claims no services for a car that has some). `vehicleCardText`/`lastServiceDate` in `app/src/domain/vehicleCard.ts`, used by `app/app/(tabs)/index.tsx`. Test: `__tests__/domain/vehicleCard.test.ts`.

---

## Backlog (future specs, not part of 001)

- `002-fair-price-insights`: an opt-in, anonymized price benchmark ("you paid 30% more than typical for brake pads in the DMV"), built on an AWS data pipeline. Kutay's data-science portfolio piece. It gets a spec after the v1.0 launch.

---

## Dependencies & Execution Order

- **Setup (T001–T007)** → **Foundational (T008–T025)**. Foundational blocks all stories.
- **US1 (T026–T039)** comes first; it is the MVP and the data base for everything else.
- **US6 (T040–T045)** can run in parallel with US1's UI work after T010–T013. It must be done before any TestFlight build.
- **US2 (T046–T058)** needs US1's record form (T037), because the review screen reuses it.
- **US3 (T059–T066)** needs the US1 records and odometer data.
- **US4 (T067–T071)** needs US1. The Pro gate needs T080.
- **US5 (T072–T077)** needs US1. Share-link gating needs T080.
- **US7 (T078–T083)** can start after Foundational. Its gates are wired into US2, US4 and US5 as they land.
- **Polish (T084–T092)** comes last. T084–T087 can run in parallel at any time.

**Within each story**: tests first, which must fail → domain → data/services → screens.

**Parallel example (US1)**: T026–T029 together, then T030 + T032 + T033 together.

## MVP strategy

1. Ship an internal TestFlight build after Phase 3 + Phase 4 (US1 + US6): a manual log with export and delete.
2. Add US2 (AI scan) → first external beta.
3. Add US3 + US5 → public v1.0 candidate.
4. US4 and US7 complete the Pro value. Monetization stays off until Kutay's DSO confirmation.
