# Analysis: Vehicle fuel type

This is a manual cross-artifact check (spec ↔ plan ↔ tasks ↔ constitution), done by hand because the `/speckit-analyze` command isn't installed here. Date: 2026-11-25. It is read-only: findings are listed, not fixed silently.

## Coverage

| Requirement | Tasks | Covered |
|---|---|---|
| FR-001 column, NOT NULL, default, allowed values | T001, T002 | ✅ |
| FR-002 VIN mapping | T003, T004, T005 | ✅ |
| FR-003 editable choice, plain labels | T006, T007 | ✅ |
| FR-004 starter set filter, generic label | T009, T010 | ✅ |
| FR-005 export CSV + JSON | T008 | ✅ |
| FR-006 rules untouched, electric notice | T003 (`showsElectricNotice`), T007 | ✅ |
| US1 AS1–AS3 prefill / no overwrite | T003 (`applyDecodedFuelType`), T007 | ✅ |
| US1 AS4 / FR-007 Edit suggestion | T014, T015 | ✅ |
| US1 AS5 edit + offline | T007 (existing outbox upsert path) | ✅ |
| US1 AS6 / SC-003 migration | T001, T002 | ✅ |
| US1 AS7 notice | T007 | ✅ |
| FR-002 A1 row | T013 | ✅ |
| US2 AS1–AS3 | T009, T010 | ✅ |
| SC-001 mapping tests + live Prius | T003, T012 | ✅ |
| SC-002 | T009 | ✅ |

There are no orphan tasks. Every task maps to a requirement or a gate.

## Constitution

No conflicts (see plan.md Constitution Check). Principle V is satisfied by the test-first ordering: T001→T002, T003→T004, T006 (test then code), T008 (test then code), T009→T010.

## Findings

| ID | Severity | Where | Finding | Recommendation |
|---|---|---|---|---|
| A1 | Medium | spec FR-002 | If `ElectrificationLevel` is empty but `FuelTypePrimary = Electric` and `FuelTypeSecondary = Gasoline`, the approved table gives `electric`. That car has an engine, so it would lose its oil change, air filter and coolant suggestions. This contradicts the spec's own "rather over-suggest" rule. No live sample hit this case (every PHEV seen has a level, research R1), but vPIC data is uneven for older model years. | Add a row before "`FuelTypePrimary` = Electric": `FuelTypePrimary` = Electric and `FuelTypeSecondary` is Gasoline/Diesel → `plug_in_hybrid`. **Resolved 2026-11-25:** the row was added to FR-002 (T013). |
| A2 | Low | spec SC-001 | "Recorded NHTSA responses covering every row": no live sample exists for five cases (FCEV, CNG/other, Electric without a level, Gasoline + Electric without a level, and "nothing usable"). | Those rows use synthetic fixtures with the real response shape, labelled `synthetic` in the fixture file. |
| A3 | Low | spec FR-006 | The notice is shown whenever the type changes to electric, even if the car has no rules yet. The rules screen (001 T064) isn't built, so the form can't know. | Decided 2026-11-25: keep it for now; 001 T064 carries a note to show it only for cars with rules. |
| A4 | Low | spec FR-002 | Some flex-fuel cars report `Primary = Gasoline, Secondary = Ethanol (E85)`. These map to `gasoline`, not `flex`. | No behavior difference: both get the full set, and the user can change it. No change needed. |
| A6 | Low | 001 tasks.md T061/T064 | 001's T061 still says to implement `genericRules.ts`, which 002 now creates, and T064 didn't mention the fuel filter. | Fixed: T061 and T064 in 001 tasks.md now point to the 002 module and to `genericStarterSet(vehicle.fuel_type)`. |
| A7 | Low | research R3 / Edit form | A VIN decode in Edit could replace a fuel type (and year/make/model) saved in an earlier session. | Resolved 2026-11-25: FR-007, the decode only suggests and the user confirms each field (T014, T015). |
| A5 | Info | spec Out of scope / 001 T064 | `genericStarterSet` has no caller until 001 T064. | Tracked in tasks.md Dependencies. |
