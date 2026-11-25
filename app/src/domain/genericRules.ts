// Generic maintenance starter set (001 R7, 001 FR-019) filtered by fuel type (002 FR-004).
// Every item is labelled generic ("Generic — check your owner's manual", rules.genericLabel).
// 001 T061 builds the reminder engine on this; 001 T064 offers genericStarterSet(vehicle.fuel_type).
import type { ServiceCategory } from './categories';
import type { FuelType } from './fuelType';

export interface GenericRule {
  key: string;
  nameKey: string; // i18n key in en.json
  serviceCategory: ServiceCategory;
  intervalMiles: number | null;
  intervalMonths: number | null;
  source: 'generic';
  notFor: readonly FuelType[];
}

const rule = (
  key: string,
  serviceCategory: ServiceCategory,
  intervalMiles: number | null,
  intervalMonths: number | null,
  notFor: readonly FuelType[] = [],
): GenericRule => ({ key, nameKey: `rules.generic.${key}`, serviceCategory, intervalMiles, intervalMonths, source: 'generic', notFor });

// Hybrids and plug-in hybrids still have an engine, and unknown fuels ("other") get the full set:
// a labelled generic item is better than a hidden one (002 spec, edge cases).
export const GENERIC_RULES: readonly GenericRule[] = [
  rule('oil_change', 'oil_change', 5000, 6, ['electric']),
  rule('tire_rotation', 'tire_rotation', 6000, null),
  rule('brake_inspection', 'brakes', null, 12),
  rule('engine_air_filter', 'filters', 15000, null, ['electric']),
  rule('cabin_filter', 'filters', null, 12),
  rule('coolant_check', 'fluids', null, 12, ['electric']),
  rule('battery_check', 'battery', null, 12), // the 12 V battery: electric cars have one too
  rule('wipers', 'other_maintenance', null, 12),
  rule('inspection_registration', 'inspection', null, 12), // the user sets the due date (002 research R4)
];

export function genericStarterSet(fuelType: FuelType): GenericRule[] {
  return GENERIC_RULES.filter((r) => !r.notFor.includes(fuelType));
}
