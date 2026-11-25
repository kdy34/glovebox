# CLAUDE.md — Glovebox

These are instructions for Claude Code working in this repo.

## Workflow: Spec-Driven Development (GitHub Spec Kit), always

- **Specs are the source of truth.** Read these first:
  - `.specify/memory/constitution.md`
  - `specs/001-glovebox-mvp/spec.md`, `plan.md`, `data-model.md`, `contracts/`, `tasks.md`
- **Before writing code:** find the task ID in `tasks.md`.
- **After a task is done:** mark it `- [x]`.
- **New work:** new features or changes go in a new `specs/###-name/` folder (constitution → spec → plan → tasks → implement → converge).
- **Never skip phases silently.** If you compress one, say so.
- **Optional setup:** `uv tool install specify-cli && specify init . --integration claude` installs the `/speckit-*` commands. The layout is already compatible.
- **Test-first** (constitution V): write the failing test, see it fail, implement, see it pass. This applies to core logic, RLS, and Edge Functions.

## Commands

```bash
# app
cd app && ./scripts/bootstrap.sh        # first time; commit package-lock.json afterwards
npm run typecheck && npm run lint && npm test
npx expo run:ios                         # dev build (document scanner needs a real device)

# domain tests only (fast, no RN)
cd app && npx tsx --test __tests__/domain/*.test.ts

# database
supabase start && supabase db reset      # migrations + seed
./supabase/tests/run.sh                  # SQL tests (RLS, constraints, quota, save_record)
supabase gen types typescript --local > app/src/data/types.ts

# functions (against local Supabase: supabase start)
./supabase/functions/test-local.sh       # exports SUPABASE_* from `supabase status`, runs deno task test
```

## Rules

- **No secrets in `app/`.** Only `EXPO_PUBLIC_*` values (the Supabase URL, the anon key, and similar). The Gemini key, the service-role key and webhook secrets live in Supabase function secrets.
- **Keep `app/src/domain/` pure TypeScript.** No React Native imports. Tests use `node:test`.
- **Money:** integer cents.
- **Service dates:** `YYYY-MM-DD` dates, not timestamps.
- **IDs:** client-generated UUIDs, written with idempotent upserts (offline outbox).
- **Records:** every record write goes through the `save_record` RPC, so the record, its line items, its odometer reading and any rule reset happen in one transaction.
- **AI output is untrusted data.** Validate it against `contracts/receipt-extraction.schema.json`, and never save a record without the user confirming it.
- **Monetization** must respect `app_config.monetization_enabled` (the kill switch), both client-side and server-side.
- **UI:** use the tokens in `src/ui/tokens.ts`. Any new text/background pair goes into `textPairs` and must pass the AA contrast test.
- **Text:** user-facing strings live in `src/i18n/en.json`. Don't hard-code them in screens; existing placeholders should be migrated.

## Status

- Progress lives in `specs/001-glovebox-mvp/tasks.md` and `specs/002-vehicle-fuel-type/tasks.md`, the source of truth.
- Last checkpoint: US1, converge T096–T106, US6 (T040–T045), US2 (T046–T058). 002 (vehicle fuel type) T001–T016 done. Open in-app checks: 002 T012 and 001 T107 (simulator walkthroughs). A real Gemini run needs `GEMINI_API_KEY` in `supabase/.env.local`.
- **Next:** T107 simulator walkthrough, then US3 reminders (T059–T066).
