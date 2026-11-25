# Feature Specification: Vehicle fuel type

**Feature Branch**: `002-vehicle-fuel-type` (work lands on `main`, like 001)
**Created**: 2026-11-25
**Status**: Approved 2026-11-25
**Input**: "Add fuel_type to vehicles: gasoline, diesel, hybrid, plug_in_hybrid, electric, flex, other. Required; default gasoline for existing rows. Fill it from the NHTSA VIN decode (FuelTypePrimary + ElectrificationLevel) and let the user change it in the form. The generic reminder starter set must not suggest oil change, engine air filter or coolant for electric cars."

## Why

Glovebox suggests generic maintenance rules (001 FR-019, research R7). Today it would suggest an oil change for a Tesla, which is wrong and undermines trust in every other suggestion (constitution II: reminders must be honest about their source and never mislead). The vehicle's fuel type is the smallest piece of data that lets the starter set fit the car. It is also useful in the report and export.

## Clarifications

### Session 2026-11-25

- Q: Which fuel types get the full starter set? → A: Gasoline, diesel, hybrid, plug-in hybrid, flex and other all get the full R7 set.
- Q: What stays for electric cars? → A: Everything except oil change, engine air filter and coolant check. The 12 V battery check and tire rotation stay.
- Q: What happens to existing rules when the fuel type changes? → A: Nothing. Rules are the user's data and are never changed or deleted. When the type changes **to** electric, the Edit vehicle form shows a one-line notice: "Some reminders may not apply to electric cars — review them" (FR-006). No automatic deletion.
- Requirement and success-criterion IDs are local to this feature (FR-001…, SC-001…). References to 001 keep the `001` prefix.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The app knows what my car runs on (Priority: P1)

When a user adds a car by VIN, Glovebox fills in the fuel type along with year, make and model. The user can check it and change it. Cars added without a VIN default to Gasoline, which the user can change.

**Independent Test**: Add a 2009 Toyota Prius by VIN → the form shows **Hybrid**. Add a Tesla Model 3 by VIN → **Electric**. Add a car by hand → **Gasoline**, changeable to Diesel. Each saved vehicle keeps its fuel type after signing out and back in.

**Acceptance Scenarios**:
1. **Given** the Add vehicle form, **When** a VIN decodes, **Then** the fuel type is prefilled from NHTSA's `FuelTypePrimary` and `ElectrificationLevel` (mapping below) and stays editable.
2. **Given** the VIN decode has no usable fuel data, or there is no VIN, **When** the form opens, **Then** the fuel type is **Gasoline**.
3. **Given** the user changed the fuel type by hand, **When** they then edit the VIN and it decodes again, **Then** the user's choice is kept (a decode never overwrites a value the user set).
4. **Given** an existing vehicle, **When** the user opens Edit vehicle, **Then** they can change the fuel type, and the change is saved (also offline, through the outbox).
5. **Given** vehicles that existed before this feature, **When** the migration runs, **Then** each has fuel type **Gasoline**, and the user can correct it.
6. **Given** an existing vehicle whose fuel type is not Electric, **When** the user selects Electric in Edit vehicle, **Then** a one-line notice reads "Some reminders may not apply to electric cars — review them", and no rule is changed or deleted (on save or otherwise).

### User Story 2 — Starter reminders fit the car (Priority: P1)

The generic starter set of maintenance rules leaves out items that don't apply to the car's fuel type.

**Independent Test**: Ask for the starter set for an electric car → no oil change, no engine air filter, no coolant check; tire rotation, brake inspection, cabin filter, battery check (the 12 V battery), wipers and inspection/registration remain. For every other fuel type the full R7 set is offered.

**Acceptance Scenarios**:
1. **Given** an electric vehicle, **When** the generic starter set is built, **Then** it excludes oil change, engine air filter and coolant check.
2. **Given** a gasoline, diesel, hybrid, plug-in hybrid, flex or other vehicle, **When** the generic starter set is built, **Then** it contains the full R7 set (plug-in hybrids and hybrids still have an engine).
3. **Given** any starter rule, **When** it is shown, **Then** it keeps the "Generic — check your owner's manual" label (001 US3 AS4).

### Edge cases
- **Hybrid and plug-in hybrid**: the engine still needs oil, an air filter and coolant, so they get the full set.
- **"Other"** (CNG, LPG, hydrogen fuel cell, anything unmapped): full set. We'd rather over-suggest a labelled generic item than hide one.
- **A user changes a car from Gasoline to Electric** after starter rules were added: existing rules are the user's data and are **not** deleted or changed. Only new suggestions change. The Edit form shows the FR-006 notice. (Rules UI is 001 T064; it reads the filtered set.)
- **NHTSA returns several values** ("Gasoline, Electric"): the mapping uses the first `FuelTypePrimary` value plus `ElectrificationLevel` and `FuelTypeSecondary` (below).
- **Old app versions** that don't send `fuel_type` keep working: the column has a default, so inserts without it succeed (as Gasoline).

## Requirements *(mandatory)*

- **FR-001**: Each vehicle MUST have a fuel type, one of `gasoline`, `diesel`, `hybrid`, `plug_in_hybrid`, `electric`, `flex`, `other`. It is required (NOT NULL), and existing and unspecified rows default to `gasoline`. The database enforces the allowed values.
- **FR-002**: The VIN decode MUST prefill the fuel type with this mapping (first match wins):

  | NHTSA input | fuel_type |
  |---|---|
  | `ElectrificationLevel` contains "BEV" | `electric` |
  | `ElectrificationLevel` contains "PHEV" | `plug_in_hybrid` |
  | `ElectrificationLevel` contains "HEV" (mild, strong, unknown level) | `hybrid` |
  | `ElectrificationLevel` contains "FCEV" | `other` |
  | `FuelTypePrimary` = Electric | `electric` |
  | `FuelTypePrimary` = Gasoline and `FuelTypeSecondary` = Electric | `hybrid` |
  | `FuelTypePrimary` = Diesel | `diesel` |
  | `FuelTypePrimary` = Gasoline | `gasoline` |
  | `FuelTypePrimary` mentions Flexible Fuel / FFV / Ethanol / E85 | `flex` |
  | any other non-empty `FuelTypePrimary` (CNG, LPG, Hydrogen, …) | `other` |
  | nothing usable | no prefill (form keeps its current value) |

- **FR-003**: The Add and Edit vehicle forms MUST show the fuel type as an editable single choice with plain-language labels: Gasoline, Diesel, Hybrid, Plug-in hybrid, Electric, Flex fuel, Other.
- **FR-004**: The generic starter set MUST exclude oil change, engine air filter and coolant check for `electric` vehicles, and include the full R7 set for every other fuel type. Each generic rule keeps its "generic" label.
- **FR-005**: The data export MUST include the fuel type (vehicles CSV and JSON), per constitution I.
- **FR-006**: Changing a vehicle's fuel type MUST NOT change or delete any of its maintenance rules. When the Edit vehicle form's fuel type is changed from a non-electric type to `electric`, the form MUST show the one-line notice "Some reminders may not apply to electric cars — review them".

### Key entities
- **Vehicle** (001): gains `fuel_type`.
- **Generic starter rule** (001 R7): each item lists the fuel types it does **not** apply to.

## Success Criteria *(mandatory)*
- **SC-001**: The mapping gives the right fuel type for recorded NHTSA responses covering every row of the FR-002 table (unit-tested). A live decode of the 2009 Prius VIN in the simulator prefills **Hybrid**.
- **SC-002**: No electric vehicle is ever offered an oil change, engine air filter or coolant starter rule (unit test over the starter set).
- **SC-003**: Existing vehicles keep working after the migration with no user action (SQL test: pre-existing rows read back as `gasoline`).

## Out of scope
- Fuel-economy tracking or fuel-type-specific cost insights.
- EV-specific rules (e.g. battery coolant, cabin-air only schedules) beyond removing the three that don't apply.
- Changing the report (US5) layout. The report can show the fuel type later.

## Assumptions
- NHTSA's `decodevinvaluesextended` endpoint (already used, R8) returns `FuelTypePrimary`, `FuelTypeSecondary` and `ElectrificationLevel`.
- The 12 V battery check still applies to electric cars, so "battery check" stays in their starter set.
- The generic starter set module (`app/src/domain/genericRules.ts`, 001 T061) doesn't exist yet. This feature creates it with the R7 data and the fuel filter; T061 builds the projection and reminder engine on top of it.
