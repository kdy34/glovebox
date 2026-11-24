# Glovebox Constitution

Glovebox is an iOS-first, cross-platform car maintenance app for people whose service history lives on paper: owners who use independent mechanics or do their own maintenance (DIY). A photo of a receipt becomes a verified service record. The record history becomes reminders, cost insight and a resale-ready report.

## Core Principles

### I. The User Owns Their Data
- Every record, photo and document belongs to the user.
- Users MUST be able to export all of their data (PDF and CSV/JSON) and delete their account and all associated data from inside the app, at any time and without contacting support.
- We collect the minimum data needed to deliver a feature. We never sell user data, and we never use it for third-party advertising profiles.
- Receipt images are private by default. They are shared only through a link the user explicitly creates and can revoke.

### II. AI Drafts, Humans Decide
- Anything the AI extracts (date, mileage, shop, line items, costs) is a **draft** until the user confirms it.
- The UI MUST make uncertain fields visible and editable before saving.
- Glovebox MUST NOT present mechanical diagnoses, failure predictions or safety judgements as fact. Reminders cite their source: the user's own rule, the owner's-manual interval the user entered, or a generic interval clearly labelled as generic.

### III. Works Without AI
- Every core flow (add vehicle, log a service, reminders, costs, report) MUST have a complete manual path.
- If the AI provider is slow, down or over quota, the app degrades to manual entry and never blocks the user or loses data.

### IV. Secure by Default
- No secrets ship in the mobile binary. AI provider keys and privileged keys live only on the server side.
- Every table enforces row-level security, so a user can only read or write their own rows.
- Storage buckets are private, and access uses short-lived signed URLs.
- Inputs are validated on the server. Uploaded files are type- and size-checked.
- Dependencies are pinned. Security-relevant changes get a review pass before release.

### V. Test-First for Core Logic
- The reminder engine, cost calculations, AI response parsing/validation, entitlement checks and database access policies MUST have automated tests. These tests are written before the implementation and must fail first.
- UI is verified with targeted component tests plus the manual quickstart walkthrough.

### VI. Simple Enough for One Person
- Prefer managed services and boring, well-documented tools over custom infrastructure.
- No feature ships without a clear user story in a spec. YAGNI applies: no speculative abstraction beyond the one seam we know we need, the AI provider interface.
- Operating cost MUST stay predictable, with per-user AI rate limits and server-side quotas.

### VII. Cross-Platform Ready, Accessible, Honest UX
- Code must stay portable to Android without a rewrite.
- iOS-only APIs are allowed only behind a small platform module.
- Screens meet WCAG 2.1 AA contrast, support Dynamic Type and VoiceOver labels, and work one-handed.
- No dark patterns: subscriptions are cancellable and clearly priced, with no fake urgency.

## Additional Constraints

- **Platform:** iOS 16+ first, through the App Store. Android/Google Play comes later from the same codebase.
- **Stack guardrails** (details are decided in plan.md): a cross-platform TypeScript mobile app, a managed Postgres backend with auth and file storage, server-side functions for AI and webhooks, and a store-billing layer that works on both iOS and Android.
- **Compliance:**
  - Apple App Review Guidelines, including in-app account deletion, Sign in with Apple when other social logins exist, and accurate App Privacy "nutrition labels".
  - Apple subscription rules (StoreKit for digital goods).
  - US state privacy laws applicable to a small app (CCPA/CPRA, Virginia VCDPA): privacy policy, terms of use, and a data-request path.
- **Work authorization (owner note):** Glovebox is published by an individual developer on F-1 status. Monetization MUST sit behind a remote kill switch so revenue features can be turned off without an app update. The owner is responsible for confirming work authorization with the DSO or an immigration attorney. This constitution is not legal advice.
- **Market:** US only, miles, USD and English for v1. Units and strings MUST be localizable from day one.

## Development Workflow & Quality Gates

1. Spec-Driven Development (GitHub Spec Kit): constitution → spec → clarify → plan → tasks → analyze → implement → converge. Specs are the source of truth.
2. Every feature lives in `specs/###-name/`. Each pull request references its spec and task IDs.
3. Before merging:
   - Type check passes.
   - Lint passes.
   - Unit tests pass.
   - Policy (RLS) tests pass.
   - No secrets in the diff.
4. Before release:
   - Quickstart walkthrough on a real device.
   - TestFlight beta with at least 10 testers.
   - App Privacy answers re-checked against actual data flows.
   - Privacy policy updated if data use changed.

## Governance

- This constitution overrides other practices. Amendments require a written rationale, a semantic version bump, and a review of any spec or plan the change affects.
- Complexity that violates a principle must be justified in the plan's Complexity Tracking table, together with the simpler alternative that was rejected.

**Version**: 1.0.0 | **Ratified**: 2026-11-23 | **Last Amended**: 2026-11-23
