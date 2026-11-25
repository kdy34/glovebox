# Data model: Vehicle fuel type

Changes on top of `specs/001-glovebox-mvp/data-model.md`.

## Enum

| Name | Values |
|---|---|
| `fuel_type` | `gasoline`, `diesel`, `hybrid`, `plug_in_hybrid`, `electric`, `flex`, `other` |

As in 001, this is a `CHECK` constraint on `text`, not a Postgres enum type.

## `vehicles` (changed)

| column | type | notes |
|---|---|---|
| fuel_type | text | NOT NULL, default `gasoline`, constraint `vehicles_fuel_type_check` |

- **Migration**: `supabase/migrations/20261125000001_vehicle_fuel_type.sql`, a single `alter table … add column … not null default 'gasoline'`. Postgres fills existing rows with the default, so every pre-existing vehicle reads back as `gasoline` (SC-003). Older app versions that leave the column out keep working.
- **RLS**: unchanged. The column is covered by the existing `vehicles_*` policies.
- **Export**: `fuel_type` is added to `csv/vehicles.csv`. `data.json` already selects every column.

## Generic starter set (not stored)

`app/src/domain/genericRules.ts`, R7 data. Each item has a key, an i18n name key, a `service_category`, at least one interval, `source: 'generic'`, and `notFor: FuelType[]`.

| key | service_category | interval | notFor |
|---|---|---|---|
| `oil_change` | `oil_change` | 5,000 mi / 6 mo | `electric` |
| `tire_rotation` | `tire_rotation` | 6,000 mi | — |
| `brake_inspection` | `brakes` | 12 mo | — |
| `engine_air_filter` | `filters` | 15,000 mi | `electric` |
| `cabin_filter` | `filters` | 12 mo | — |
| `coolant_check` | `fluids` | 12 mo | `electric` |
| `battery_check` | `battery` | 12 mo | — (the 12 V battery) |
| `wipers` | `other_maintenance` | 12 mo | — |
| `inspection_registration` | `inspection` | 12 mo (date set by the user) | — |
