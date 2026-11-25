# Research: Vehicle fuel type

## R1. What NHTSA vPIC returns for fuel

- **Decision**: Read `FuelTypePrimary`, `FuelTypeSecondary` and `ElectrificationLevel` from `decodevinvaluesextended` (already used by 001 R8). Map them with the FR-002 table.
- **Evidence** (live decodes, 2026-11-25; trimmed copies are the test fixtures in `app/__tests__/domain/fixtures/vpic.ts`):

  | VIN pattern | Vehicle | FuelTypePrimary | FuelTypeSecondary | ElectrificationLevel | FR-002 result |
  |---|---|---|---|---|---|
  | `JTDKB20U09…` | 2009 Toyota Prius | Gasoline | Electric | Strong HEV (Hybrid Electric Vehicle) | `hybrid` |
  | `5YJ3E1EA7K…` | 2019 Tesla Model 3 | Electric | — | BEV (Battery Electric Vehicle) | `electric` |
  | `JN1AZ0CP5C…` | 2012 Nissan Leaf | Electric | — | BEV (Battery Electric Vehicle) | `electric` |
  | `1G1RC6E40B…` | 2011 Chevrolet Volt | **Electric** | Gasoline | PHEV (Plug-in Hybrid Electric Vehicle) | `plug_in_hybrid` |
  | `JTDKN3DP5D…` | 2013 Toyota Prius Plug-in | **Electric** | Gasoline | PHEV (Plug-in Hybrid Electric Vehicle) | `plug_in_hybrid` |
  | `3VWLL7AJ9D…` | 2013 VW Jetta TDI | Diesel | — | — | `diesel` |
  | `1FT7W2BT5G…` | 2016 Ford F-250 | Diesel | — | — | `diesel` |
  | `1FTFW1ET5D…` | 2013 Ford F-150 | Gasoline | — | — | `gasoline` |
  | `1GNSKBE01D…` | 2013 Chevrolet Tahoe | Flexible Fuel Vehicle (FFV) | — | — | `flex` |

- **Findings**:
  - The assumption in spec.md holds: all three fields are present. Empty fields come back as `""`.
  - Plug-in hybrids report `FuelTypePrimary = Electric`. `ElectrificationLevel` must be checked first, as the table does; otherwise the Volt would be `electric` and lose its oil change.
  - "PHEV" contains the letters "HEV". Matching uses whole tokens (`\bPHEV\b`, `\bHEV\b`), not substrings.
  - Analysis A1 (decided 2026-11-25): `Primary = Electric` with a Gasoline/Diesel secondary and no level → `plug_in_hybrid`.
  - No live sample was found for FCEV, CNG/LPG, "Electric" without an electrification level, or "Gasoline + Electric" without a level. Those rows are covered by synthetic fixtures, labelled as such.

## R2. Where the fuel choice lives in the form

- **Decision**: A seven-option single choice, using `SegmentedControl` with a new wrapping layout (`layout="wrap"`, two or three options per row). It reuses the already contrast-tested `selectedBg`/`onSelected` pair, so no new token pair is needed.
- **Rationale**: Seven labels ("Plug-in hybrid" is the longest) do not fit one row at phone width, especially with Dynamic Type. A picker sheet would hide the current value behind a tap. Wrapped radio chips stay one tap and VoiceOver-friendly (radiogroup/radio).

## R3. Decode vs. the user's choice

- **Add form**: the form keeps a "user touched the fuel type" flag. A decode sets the fuel type only when the flag is off and the decode gave a value (`applyDecodedFuelType`).
- **Edit form** (revised 2026-11-25, FR-007): a decode never changes a field. `vinSuggestions` lists the decoded values that are present and differ (year, make, model, trim, fuel type). The form shows them as one suggestion with a toggle per field, selected by default, and `applyVinSuggestions` changes only the fields the user keeps selected and applies. Trim is included because it is overwritten the same way; leaving it out would mean silently ignoring a decoded value, or silently overwriting.

## R4. Inspection/registration interval

- **Decision**: In the generic set, "Inspection / registration" has a 12-month interval, and the user edits the date in the rules screen (001 T064).
- **Rationale**: 001's `maintenance_rules` requires at least one interval (constraints test). Most US states renew yearly, and the rule is labelled generic.
