# Glovebox

Glovebox is a car service log for the work CARFAX never sees: independent mechanics and DIY maintenance.

- **Scan receipts.** Snap a receipt and get a verified service record.
- **Get reminded.** Glovebox tells you before the next service is due.
- **Sell with proof.** Share a clean service history when you sell the car.

This repo follows **Spec-Driven Development** with GitHub Spec Kit. The specs are the source of truth:

- Constitution: [.specify/memory/constitution.md](.specify/memory/constitution.md)
- Current feature: [specs/001-glovebox-mvp/](specs/001-glovebox-mvp/), which contains the spec, plan, data model, contracts, tasks and quickstart

## Layout

| Path | What |
|---|---|
| `app/` | Expo (React Native, TypeScript) iOS-first app |
| `app/src/domain/` | Pure business logic (money, reminders, insights, etc.), tested with `node:test` |
| `supabase/` | Postgres migrations, row-level security, Edge Functions (Deno), SQL tests |
| `web/` | Static site on Vercel: landing page, legal pages, shared-report viewer |
| `docs/` | App Store listing, privacy answers, QA and launch checklists |

## Quick commands

```bash
# Domain unit tests (no install needed beyond Node 22 + tsx)
npx tsx --test app/__tests__/domain/*.test.ts

# Database tests against a local Supabase (or any Postgres with supabase/tests/_stubs.sql)
./supabase/tests/run.sh

# App (first time)
cd app && ./scripts/bootstrap.sh && npx expo run:ios
```

The full setup and release steps are in [specs/001-glovebox-mvp/quickstart.md](specs/001-glovebox-mvp/quickstart.md).
