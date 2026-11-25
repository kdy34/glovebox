# Implementation Plan: Vehicle fuel type

**Branch**: `002-vehicle-fuel-type` (work lands on `main`) | **Date**: 2026-11-25 | **Spec**: [spec.md](./spec.md) (approved 2026-11-25)

## Summary

Add a required `fuel_type` column to `vehicles` (default `gasoline`). The VIN decoder maps NHTSA's three fuel fields to it, and the Add/Edit forms let the user change it. A new pure domain module holds the R7 generic starter set and filters out oil change, engine air filter and coolant check for electric cars. The export gets the new column. Existing rules are never touched; the Edit form shows a one-line notice when a car becomes electric.

## Technical Context

Same stack as 001 (Expo SDK 57, Supabase, `node:test` domain tests, Jest UI tests, plain-SQL tests, `deno test`). No new dependencies.

## Constitution Check

| Principle | How the plan satisfies it | Status |
|---|---|---|
| I. User owns data | `fuel_type` is in the CSV and JSON export (FR-005). Changing the fuel type never deletes the user's rules (FR-006). | ✅ |
| II. Honest reminders | Electric cars are not offered rules that don't apply. Every starter rule stays labelled generic. Unknown or exotic fuels get the full set rather than a hidden item. | ✅ |
| III. Works without AI / network | The fuel type is a manual choice with a default. The VIN decode only prefills it. | ✅ |
| IV. Secure by default | A DB `CHECK` enforces allowed values. RLS is unchanged and already covers the row. | ✅ |
| V. Test-first | Mapping, starter-set filter, prefill rule and notice rule are pure functions with failing tests first; SQL tests for the column; export test for the CSV. | ✅ |
| VI. Simple | One column, one pure module, one reused UI component with a layout option. | ✅ |
| VII. Accessible | The choice is a radiogroup with labelled radios, wraps at phone width, uses the AA-tested `selectedBg`/`onSelected` pair. Strings in `en.json`. | ✅ |

## Design

- **Database**: `supabase/migrations/20261125000001_vehicle_fuel_type.sql` (see data-model.md). Applied locally with `supabase migration up` (not `db reset`, which would wipe local dev data). Types regenerated into `app/src/data/types.ts`.
- **Domain** (`app/src/domain/`, pure TS):
  - `fuelType.ts`: `FUEL_TYPES`, `FuelType`, `DEFAULT_FUEL_TYPE`, `parseFuelType` (string → `FuelType`, unknown → `gasoline`), `fuelTypeFromVpic({ primary, secondary, electrification })` (FR-002 table), `applyDecodedFuelType(current, decoded, userTouched)` (spec AS3, Add form), `showsElectricNotice(saved, selected)` (FR-006).
  - `vinSuggestion.ts`: `vinSuggestions(current, decoded)` and `applyVinSuggestions(current, suggestions, accepted)` for the Edit form (FR-007).
  - `genericRules.ts`: `GENERIC_RULES` (R7) and `genericStarterSet(fuelType)` (FR-004).
- **Service**: `app/src/services/vinDecoder.ts` reads `FuelTypeSecondary` and `ElectrificationLevel` and returns `fuelType: FuelType | null` from `fuelTypeFromVpic`.
- **UI**: `SegmentedControl` gets `layout?: 'row' | 'wrap'`. Add/Edit vehicle forms show "Fuel type" (FR-003). Edit shows the FR-006 notice below the choice. All strings in `src/i18n/en.json` (`vehicle.fuelTypeLabel`, `vehicle.fuel.*`, `vehicle.electricNotice`, `rules.generic.*`).
- **Export**: `supabase/functions/export-data/handler.ts` adds `fuel_type` to the vehicles CSV columns.

## Project Structure

```text
specs/002-vehicle-fuel-type/
├── spec.md  plan.md  research.md  data-model.md  tasks.md  analysis.md
supabase/migrations/20261125000001_vehicle_fuel_type.sql      # new
supabase/tests/fuel_type.test.sql                              # new
supabase/functions/export-data/{handler.ts,index.test.ts}      # changed
app/src/domain/{fuelType.ts,genericRules.ts}                   # new
app/src/services/vinDecoder.ts                                 # changed
app/src/ui/components/SegmentedControl.tsx                     # changed (layout)
app/app/vehicle/new.tsx, app/app/vehicle/[id]/edit.tsx         # changed
app/__tests__/domain/{fuelType.test.ts,genericRules.test.ts}   # new
app/__tests__/domain/fixtures/vpic.ts                          # new (recorded + synthetic)
app/__tests__/ui/SegmentedControl.test.tsx                     # changed
```

## Complexity Tracking

None.
