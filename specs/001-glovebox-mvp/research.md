# Phase 0 Research: Glovebox MVP

Researched 2026-11-23. Each entry has a Decision, a Rationale, and the Alternatives considered. Items marked *verify at setup* depend on vendor pages that change often, so re-check them when you create the accounts.

## R1. Mobile framework
- **Decision**: Expo SDK 57 (React Native 0.86, React 19.2) with Expo Router and EAS Build/Submit. Minimum iOS 16.4.
- **Rationale**:
  - One TypeScript codebase for iOS now and Android later.
  - EAS builds and submits to the App Store without hand-managing Xcode signing.
  - The SDK 57 table lists iOS 16.4+ and Xcode 26.4+.
- **Alternatives**:
  - Native Swift/SwiftUI: best iOS feel, but a full rewrite for Android.
  - Flutter: a new language for Kutay, and weaker Expo-style tooling for solo shipping.
  - SDK 58 beta: avoided for launch stability. Upgrade after release.

## R2. Backend
- **Decision**: Supabase covers Postgres, Auth, Storage and Edge Functions.
- **Rationale**:
  - Postgres with row-level security matches Principle IV.
  - Auth supports Apple and email out of the box.
  - Edge Functions keep secrets off the device.
  - The free tier works for development, and Pro (~$25/mo) for launch. *Verify at setup.*
- **Alternatives**:
  - Firebase: NoSQL is a weaker fit for relational records and SQL insights.
  - A custom FastAPI on a VPS: more ops work for one person (Principle VI).

## R3. AI receipt extraction
- **Decision**: Gemini Flash vision through the Gemini API, model `gemini-3.6-flash` by default. JSON mode with a response schema, then Zod validation on the server. The model ID and provider are set by config behind an `ExtractionProvider` interface, so we can A/B test `gemini-3-flash` or a Flash-Lite model, or switch to OpenAI, without an app release.
- **Rationale**:
  - Multimodal LLMs read messy receipts and handwriting far better than plain OCR + regex.
  - Structured output keeps responses parseable.
  - Kutay already has Gemini experience (CareerGENAI).
- **Cost estimate** (*verify at setup*):
  - Gemini 3.6 Flash is $0.75 per 1M input tokens and $3.75 per 1M output tokens through 31 Dec 2026, then $1.50 / $7.50.
  - One scan ≈ 1–2k input tokens (image + prompt) and ≤1k output tokens ≈ **$0.004–0.006 today**, **≈$0.01 from Jan 2027**.
  - Free tier (5 scans/month) costs ≈ $0.03–0.05 per user per month. SC-008 (<$0.10) holds.
- **Safety**:
  - Text in the image is treated as untrusted data: system prompt isolation, no tools, schema-only output.
  - Output is validated, numbers are bounds-checked, and string lengths are capped.
  - Images are sent only for extraction. Use a paid-tier API key, whose terms say prompts aren't used for training. *Verify the data-use terms.*
- **Alternatives**:
  - Apple Vision OCR on the device plus an LLM on text only: cheaper, but loses layout cues. Kept as a v1.1 option for pre-cropping.
  - AWS Textract AnalyzeExpense: strong on receipts, but costlier per page and adds another cloud.
  - A fine-tuned custom model: not justified without data (YAGNI).

## R4. Document capture
- **Decision**: `react-native-document-scanner-plugin` (iOS VisionKit) for edge detection and perspective correction, with `expo-image-picker` for library and PDF import. Images go through `expo-image-manipulator`: resized to 2000 px long edge and saved as JPEG at quality 0.7.
- **Rationale**: VisionKit gives the native "scan document" UX that users trust. It needs an EAS dev build (not Expo Go), which is acceptable.
- **Alternatives**: Plain `expo-camera` with custom cropping takes more work for a worse result.

## R5. Offline & sync
- **Decision**:
  - Writes use client-generated UUIDv7 IDs and go to a SQLite outbox (`expo-sqlite`). The outbox is flushed in order through PostgREST `upsert` (on conflict by id) when the app is online or foregrounded.
  - Reads come from a TanStack Query cache persisted to disk.
  - Conflicts resolve as last write wins by `updated_at`. This is acceptable because there is one user per account.
  - Attachments queue until online and keep a local file URI until upload.
- **Rationale**: This meets FR-010 with the least machinery, and UUID upserts make retries idempotent, so there are no duplicates.
- **Alternatives**: PowerSync or WatermelonDB are more capable but add a vendor and schema duplication. Keep them for multi-device conflict needs.

## R6. Reminders & notifications
- **Decision**:
  - The due-date engine runs on the device in `src/domain/reminders.ts`.
  - Notifications are scheduled locally with `expo-notifications` for the next due item of each rule, rescheduled after every data change and at app launch.
  - No push server in v1.
- **Mileage projection**: A least-squares miles-per-day estimate over the last 180 days of readings (minimum 2 readings, 14 days apart). If it isn't available, only the time limit is used and the app asks for a reading (US3 AS2).
- **Alternatives**: Server-side cron + APNs push would work even if the app is never opened, but adds infrastructure. Revisit in v1.1 if analytics show missed reminders.

## R7. Generic maintenance intervals
- **Decision**:
  - Ship a conservative, clearly labelled generic starter set: oil every 5,000 mi / 6 mo (user-editable), tire rotation every 6,000 mi, brake inspection every 12 mo, engine air filter every 15,000 mi, cabin filter every 12 mo, coolant check every 12 mo, battery check every 12 mo, wipers every 12 mo, and a state inspection/registration date set by the user.
  - Each rule shows the label "Generic — check your owner's manual".
- **Rationale**: Manufacturer schedule data needs licensing. Principle II requires sources to be honest.
- **Alternatives**: Licensed OEM schedule APIs are a v2 Pro feature if demand exists.

## R8. VIN decoding
- **Decision**: NHTSA vPIC `DecodeVinValues` (free, no key), called from the app with a 5 s timeout. VIN check digit is validated locally first. On failure, fall back to manual year, make and model.
- **Alternatives**: Paid VIN APIs give richer trim data but aren't needed in v1.

## R9. Subscriptions
- **Decision**:
  - RevenueCat (`react-native-purchases`) over StoreKit, with products `glovebox_pro_monthly` ($3.99) and `glovebox_pro_annual` ($24.99, 7-day trial). The entitlement is named `pro`.
  - A RevenueCat webhook updates a server-side `entitlements` table. Edge functions read that table for quota and share gating.
  - Kill switch: `app_config.monetization_enabled`. When false, the paywall is hidden, purchases are not initialized, and everyone gets free limits.
- **Rationale**: RevenueCat handles receipts, renewals and restore, and works on Android later. It is free up to a revenue threshold. *Verify at setup.*
- **Apple notes**: Enroll in the App Store Small Business Program (15% commission). Subscription disclosure must appear on the paywall.

## R10. Reports & share links
- **Decision**:
  - The PDF is built on the device from an HTML template with `expo-print` and shared with `expo-sharing`.
  - Share link: the app creates a `share_links` row with a 32-byte random URL-safe token.
  - The viewer is `https://<site>/r/<token>`, a static page on Vercel. It calls the `public-report` edge function, which returns sanitized JSON for that one vehicle and signed thumbnail URLs only if images are included.
- **Rationale**: Supabase Edge Functions only serve HTML when a custom domain is configured, so the HTML lives on a static host and the function returns JSON. Kutay already uses Vercel.
- **Alternatives**: Server-side PDF rendering (Puppeteer) is heavy. A Supabase custom domain costs extra.

## R11. Observability & analytics
- **Decision**:
  - Sentry for crashes, with PII scrubbing on and no attachment or receipt content.
  - PostHog for product analytics, with an explicit event allowlist (`signup_completed`, `vehicle_added`, `record_saved{source}`, `scan_started`, `scan_succeeded`, `scan_failed{code}`, `reminder_created`, `report_generated`, `share_link_created`, `paywall_viewed`, `purchase_completed`). No user content, no IDFA, so no ATT prompt.
- **Alternatives**: Skip analytics entirely. That was rejected because SC-009 needs traction metrics.

## R12. Auth
- **Decision**:
  - Sign in with Apple (`expo-apple-authentication` → Supabase `signInWithIdToken`).
  - Email via one-time code (OTP), which avoids passwords and deep-link complexity.
  - The session is stored in `expo-secure-store`.
- **Apple rules**: Account deletion in-app. Revoke Apple tokens on deletion where possible (the Supabase/Apple revoke flow).

## R13. Legal & compliance (not legal advice; Kutay reviews)
- **Decision**: Plain-language Privacy Policy and Terms of Use in `web/`. Each data category is mapped to an App Privacy answer in `docs/app-store/privacy-nutrition.md`:
  - Contact info: email
  - Identifiers: user ID
  - User content: photos, other
  - Usage data
  - Diagnostics
  - Purchases

  None is used for tracking.
- **Policies the documents must cover**: support email, data deletion path, AI notice, and subprocessors (Supabase, Google Gemini, RevenueCat, Sentry, PostHog, Vercel).
- **Work authorization**: The monetization kill switch exists per the constitution. Kutay confirms with his DSO before enabling revenue.

## R14. Testing strategy
- **Decision**: `node:test` for `src/domain` (written test-first, zero dependencies), Jest for components, plain SQL assertion tests for RLS and constraints (no pgTAP dependency, so they also run on plain Postgres in CI) (each table checks that user A cannot read or write user B's rows), Deno tests for edge functions with a mocked provider, and a golden receipt evaluation script (`supabase/functions/_shared/ai/eval.ts`) that scores field accuracy for SC-003.
