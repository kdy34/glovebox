# Implementation Plan: Glovebox MVP (v1.0)

**Branch**: `001-glovebox-mvp` | **Date**: 2026-11-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-glovebox-mvp/spec.md` (approved by Kutay on 2026-11-23)

## Summary

Glovebox is an iOS-first Expo/React Native app (TypeScript) on a Supabase backend:
- Postgres with row-level security
- Auth with Sign in with Apple and email
- Private Storage for receipts and photos
- Deno Edge Functions

Receipt photos are sent to a server-side **AI extraction function**. It calls a Gemini Flash vision model with a strict JSON schema, validates the result with Zod, and returns a *draft* that the user confirms (Principle II).

Business logic is pure TypeScript and test-first (Principle V):
- reminder engine
- mileage projection
- money math
- insights
- entitlement checks

Offline writes go through a local outbox with client-generated UUIDs and idempotent upserts. Reminders are local notifications. Reports are rendered on the device to PDF. Share links open a small static web viewer, hosted with the legal pages on Vercel, which reads a token-scoped edge function. Subscriptions use RevenueCat over StoreKit, with a server-side entitlement mirror and a remote kill switch.

## Technical Context

**Language/Version**:
- TypeScript 5.x in strict mode, for the app and the Edge Functions
- SQL (Postgres 15+) for the database

**Primary Dependencies**:
- **App**:
  - Expo SDK 57 (React Native 0.86, React 19.2), Expo Router
  - `@supabase/supabase-js`, TanStack Query (with persistence), `expo-sqlite` for the outbox, Zod, React Hook Form
  - `expo-image-picker`, `expo-image-manipulator`, `react-native-document-scanner-plugin` (VisionKit edge detection)
  - `expo-notifications`, `expo-print`, `expo-sharing`, `expo-apple-authentication`, `expo-secure-store`, `react-native-svg`
  - `react-native-purchases` (RevenueCat), `@sentry/react-native`, `posthog-react-native`, `i18next`
- **Server**:
  - Supabase (Postgres, Auth, Storage, Edge Functions on Deno)
  - Zod (npm)
  - JSZip for export
- **AI**: Google Gemini API, model `gemini-3.6-flash` by default, set by config, behind an `ExtractionProvider` interface.

**Storage**:
- Supabase Postgres (source of truth)
- Supabase Storage, with private buckets `receipts` and `vehicle-photos`
- On the device: SQLite outbox plus a persisted query cache

**Testing**:
- `node:test` (run with `tsx --test`, no extra dependencies) for domain logic; Jest (`jest-expo`) for components
- Plain SQL assertion tests (`supabase/tests/*.test.sql`, run with `supabase/tests/run.sh`) for schema and RLS; they run on local Supabase or plain Postgres 16 in CI
- `deno test` for Edge Functions
- A golden receipt set for extraction accuracy (SC-003)

**Target Platform**: iOS 16.4+ (iPhone first, iPad compatible). Android comes later from the same codebase.

**Project Type**: Mobile app + backend (BaaS + functions) + tiny static web site.

**Performance Goals**:
- Cold start under 2 s on an iPhone 12
- Timeline scroll at 60 fps with 500 records
- Receipt draft returned in 15 s or less at p90 (FR/US2)
- PDF for 50 records in under 5 s

**Constraints**:
- No secrets in the binary.
- Offline-capable core flows.
- AI cost under $0.10 per active user per month (SC-008).
- App Store Review Guidelines: account deletion, Sign in with Apple, subscription disclosure.
- Monetization kill switch.

**Scale/Scope**: v1 targets up to about 10k users on the Supabase Pro tier. The app has 15 screens, 12 tables and 5 edge functions.

## Constitution Check

*GATE: must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | How the plan satisfies it | Status |
|---|---|---|
| I. User owns data | `export-data` function (ZIP of JSON + CSV + images). `delete-account` function removes rows (ON DELETE CASCADE from `auth.users`), storage objects and share links. Private buckets, revocable share tokens, no ad SDKs, analytics allowlist with no PII. | ✅ |
| II. AI drafts, humans decide | The extraction returns a draft only; nothing is persisted as a record server-side. Per-field confidence drives UI flags. Generic rules are labelled; no diagnosis features. | ✅ |
| III. Works without AI | Manual record form is the primary path. Scan failures and timeouts route to the manual form with the photo attached. The VIN decoder is optional. | ✅ |
| IV. Secure by default | Gemini key and service-role key exist only in Edge Function secrets. RLS on every table, including ownership checks on foreign keys. Storage policies are scoped to the `{uid}/` prefix. Server-side Zod validation, MIME/size checks, an untrusted-AI-output posture, pinned dependencies. | ✅ |
| V. Test-first core | Domain modules (`reminders`, `projection`, `money`, `insights`, `entitlements`, `extraction-validate`) and RLS policies get failing tests first (see tasks.md). | ✅ |
| VI. Simple for one person | Managed services only. One provider seam (AI). No custom server. Local notifications instead of a push backend. A static site instead of a web app. | ✅ (one justified item below) |
| VII. Cross-platform, accessible, honest | Expo with iOS-only code isolated in `src/platform/`. Theme tokens checked for AA contrast, Dynamic Type, VoiceOver labels. The paywall shows price, terms, restore and cancel guidance. | ✅ |

**Post-design re-check (after Phase 1):** ✅ Still passes. The data model keeps `user_id` on every row for simple RLS, and the share viewer uses a token-scoped function rather than any public table access.

## Project Structure

### Documentation (this feature)

```text
specs/001-glovebox-mvp/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   ├── edge-functions.md
│   ├── receipt-extraction.schema.json
│   └── app-config.md
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
app/                                   # Expo app (iOS first)
├── app/                               # Expo Router routes
│   ├── _layout.tsx                    # providers: theme, query, auth, sentry, i18n
│   ├── onboarding.tsx
│   ├── (auth)/sign-in.tsx
│   ├── (tabs)/_layout.tsx             # Garage · Reminders · Insights · Settings
│   ├── (tabs)/index.tsx               # Garage
│   ├── (tabs)/reminders.tsx
│   ├── (tabs)/insights.tsx
│   ├── (tabs)/settings.tsx
│   ├── vehicle/new.tsx
│   ├── vehicle/[id]/index.tsx         # timeline + due chips
│   ├── vehicle/[id]/edit.tsx
│   ├── vehicle/[id]/rules.tsx
│   ├── vehicle/[id]/report.tsx        # PDF + share link
│   ├── record/new.tsx                 # manual form (also review target)
│   ├── record/[id].tsx
│   ├── scan/index.tsx                 # capture/import
│   ├── scan/review.tsx                # AI draft review
│   ├── odometer/new.tsx
│   ├── paywall.tsx
│   └── legal/[doc].tsx                # privacy, terms, ai-notice
├── src/
│   ├── domain/                        # PURE TS, no RN imports, 100% unit tested
│   │   ├── money.ts                   # cents math, totals, mismatch check
│   │   ├── categories.ts
│   │   ├── odometer.ts                # validation, rollback detection, unit conversion
│   │   ├── projection.ts              # miles/day regression from readings
│   │   ├── reminders.ts               # due computation, whichever-first, reset
│   │   ├── genericRules.ts            # labelled starter intervals
│   │   ├── insights.ts                # per period/category, cost per mile
│   │   ├── entitlements.ts            # limits from config + pro state
│   │   ├── extraction.ts              # Zod schema mirror + draft → form mapping
│   │   ├── duplicates.ts              # likely-duplicate receipt detection
│   │   └── vin.ts                     # VIN check digit validation
│   ├── data/
│   │   ├── supabase.ts                # client (anon key only), SecureStore session
│   │   ├── types.ts                   # generated DB types
│   │   ├── repositories/*.ts          # vehicles, records, rules, odometer, share, profile
│   │   ├── outbox.ts                  # SQLite queue, idempotent upserts, retry
│   │   ├── sync.ts                    # flush on reconnect/foreground
│   │   └── queries.ts                 # TanStack Query keys/hooks
│   ├── services/
│   │   ├── receipts.ts                # compress → upload → invoke extract-receipt
│   │   ├── vinDecoder.ts              # NHTSA vPIC, graceful fallback
│   │   ├── notifications.ts           # schedule/cancel local reminders
│   │   ├── report.ts                  # HTML template → PDF (expo-print)
│   │   ├── purchases.ts               # RevenueCat wrapper, kill switch aware
│   │   ├── config.ts                  # remote app_config + defaults
│   │   ├── analytics.ts               # allowlisted events only
│   │   └── account.ts                 # export / delete
│   ├── platform/                      # iOS-specific: apple auth, doc scanner
│   ├── ui/                            # design system
│   │   ├── theme.ts                   # tokens: color, type, spacing, radius (light/dark)
│   │   └── components/*.tsx           # Button, Card, TextField, MoneyField, DateField, Chip, EmptyState, ListRow, Sheet, Toast, BarChart, ProgressRing
│   ├── features/                      # screen-level components per story
│   └── i18n/en.json
├── assets/                            # icon, splash, illustrations
├── app.config.ts · eas.json · package.json · tsconfig.json · babel.config.js · jest.config.js
└── __tests__/                         # mirrors src/domain

supabase/
├── config.toml
├── migrations/
│   ├── 20261123000001_core_schema.sql
│   ├── 20261123000002_rls_policies.sql
│   ├── 20261123000003_storage.sql
│   └── 20261123000004_functions_quota.sql
├── seed.sql                           # app_config defaults
├── functions/
│   ├── _shared/{cors,auth,errors,config}.ts
│   ├── _shared/ai/{provider,gemini,prompt,schema}.ts
│   ├── extract-receipt/index.ts
│   ├── export-data/index.ts
│   ├── delete-account/index.ts
│   ├── public-report/index.ts
│   └── revenuecat-webhook/index.ts
└── tests/*.test.sql                   # SQL assertion tests: RLS, constraints, quota fn

web/                                   # static site on Vercel (no build step)
├── index.html                         # landing page
├── privacy.html · terms.html · support.html
├── r.html                             # shared-report viewer (/r/:token)
├── assets/{styles.css,report.js,logo.svg}
└── vercel.json                        # rewrites /r/:token → r.html, security headers

docs/
├── app-store/listing.md               # name, subtitle, keywords, description, screenshots plan
├── app-store/privacy-nutrition.md     # App Privacy answers mapped to data flows
├── app-store/review-notes.md          # demo account + notes for reviewer
└── launch-checklist.md
```

**Structure Decision**: A mobile app + backend layout in one repo, with `app/`, `supabase/` and `web/`. Domain logic lives in `app/src/domain` as pure TS, so it can be tested in Node and later shared with Android (same codebase) or the web viewer. The extraction schema is defined once in `supabase/functions/_shared/ai/schema.ts`. `app/src/domain/extraction.ts` mirrors it, and a contract test asserts the two stay identical against `contracts/receipt-extraction.schema.json`.

## Design Direction (visual)

- **Brand idea**: "Everything about your car, finally in one place." The feel is calm, trustworthy and premium-utility (think Apple Wallet or Things), not "car-bro".
- **Palette**:
  - Ink navy `#0F1B2D` for text and dark surfaces
  - Glovebox amber `#F2A900` as the accent: a nod to the dashboard light, used sparingly for CTAs and "due" states
  - Paper `#F7F5F0` for the light background
  - Slate neutrals
  - Success green `#2E9E6B` and overdue red `#D64545`
  - All pairs are checked for AA contrast.
- **Type**: SF Pro (system) with Dynamic Type. Numbers use tabular figures.
- **Signature moments**:
  - The scan animation: a receipt "folds" into the glovebox.
  - A "health ring" per vehicle showing how many reminders are on track.
  - Timeline cards with the shop name and a cost chip.
- **Motion**: Reanimated, subtle, and respects Reduce Motion. Haptics on save and scan success.

## Complexity Tracking

| Violation / added complexity | Why needed | Simpler alternative rejected because |
|---|---|---|
| Local SQLite outbox for offline writes | FR-010 requires offline logging without duplicates. Garages and driveways often have no signal. | Online-only writes would break US1 scenario 5. A full sync engine (PowerSync/WatermelonDB) is heavier and adds another vendor. A small outbox with client UUIDs and upserts is enough for a single-user, last-write-wins model. |
| Separate static web site (`web/`) | The share-link viewer (FR-025) and legal pages need public HTML. Supabase only serves HTML from Edge Functions with a paid custom domain. | Rendering HTML in the edge function needs a custom-domain add-on. A full Next.js app is overkill. A static page plus a JSON function is the simplest option. |
