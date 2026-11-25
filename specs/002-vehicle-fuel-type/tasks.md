# Tasks: Vehicle fuel type

**Input**: `specs/002-vehicle-fuel-type/` (spec.md, plan.md, research.md, data-model.md).

**Tests**: Test-first (constitution V). Each test task comes before the code that makes it pass, and must fail first.

**Format**: `- [ ] T### [P] [US#] Description with exact file path`. Task IDs are local to 002.

---

## Phase 1: Foundational (database)

- [ ] T001 [US1] Write SQL tests in `supabase/tests/fuel_type.test.sql`: a vehicle that existed before the migration reads back as `gasoline` (drop the column, insert, re-apply the migration file) (SC-003); an insert without `fuel_type` gets `gasoline`; every allowed value is accepted; an unknown value is rejected; NULL is rejected with 23502 (FR-001).
- [ ] T002 [US1] Add `supabase/migrations/20261125000001_vehicle_fuel_type.sql`. Apply locally with `supabase migration up` and regenerate `app/src/data/types.ts`.

## Phase 2: User Story 1 — The app knows what my car runs on (P1)

- [ ] T003 [P] [US1] Record the vPIC fixtures in `app/__tests__/domain/fixtures/vpic.ts` (trimmed live responses from research.md R1, plus labelled synthetic ones for the FR-002 rows with no live sample) and write `app/__tests__/domain/fuelType.test.ts`: every FR-002 row, first-match order (PHEV with Primary=Electric → `plug_in_hybrid`), the "Gasoline, Electric" multi-value case, nothing usable → `null`; `parseFuelType`; `applyDecodedFuelType` keeps a touched value (AS3); `showsElectricNotice` (FR-006) (SC-001).
- [ ] T004 [US1] Implement `app/src/domain/fuelType.ts`.
- [ ] T005 [US1] Map the fuel type in `app/src/services/vinDecoder.ts` (read `FuelTypeSecondary` and `ElectrificationLevel`; return `fuelType: FuelType | null`).
- [ ] T006 [P] [US1] Extend `app/__tests__/ui/SegmentedControl.test.tsx` for `layout="wrap"` (options wrap, radio semantics and selected fill kept), then add the layout to `app/src/ui/components/SegmentedControl.tsx`.
- [ ] T007 [US1] Add the fuel type choice to `app/app/vehicle/new.tsx` and `app/app/vehicle/[id]/edit.tsx` (FR-003), with decode prefill that never overrides a touched value (AS1–AS3), saved through the existing outbox path (AS4). Edit shows the FR-006 notice. Strings in `app/src/i18n/en.json`.
- [ ] T008 [P] [US1] Extend `supabase/functions/export-data/index.test.ts` to expect `fuel_type` in `csv/vehicles.csv` and `data.json`, then add the column in `supabase/functions/export-data/handler.ts` (FR-005).

## Phase 3: User Story 2 — Starter reminders fit the car (P1)

- [ ] T009 [P] [US2] Write `app/__tests__/domain/genericRules.test.ts`: electric excludes exactly oil change, engine air filter and coolant check and keeps the 12 V battery check and tire rotation (SC-002); every other fuel type gets the full R7 set; every item is `source: 'generic'`, has at least one interval and a valid service category, and has an i18n name.
- [ ] T010 [US2] Implement `app/src/domain/genericRules.ts` (R7 data + `genericStarterSet`) and add `rules.generic.*` names to `app/src/i18n/en.json` (FR-004).

## Phase 4: Converge

- [ ] T011 Run all gates (typecheck, lint, domain + UI tests, SQL tests, function tests). Update 001 `data-model.md` (vehicles table) and `CLAUDE.md` status.
- [ ] T012 [US1] Live check in the simulator: decode the 2009 Prius VIN → the form shows **Hybrid** (SC-001, second half).

---

## Dependencies

- T001 → T002 → T007, T008 (the column must exist).
- T003 → T004 → T005 → T007. T006 → T007.
- T009 → T010. US2 is independent of US1's UI.
- 001 T061 builds the reminder engine on `genericRules.ts`; 001 T064 (rules screen) reads `genericStarterSet(vehicle.fuel_type)`.
