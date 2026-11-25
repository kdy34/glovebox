// Vehicle fuel type (002 FR-001…FR-003, FR-006). Pure TS.

export const FUEL_TYPES = ['gasoline', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'flex', 'other'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];
export const DEFAULT_FUEL_TYPE: FuelType = 'gasoline';

export function parseFuelType(value: string | null | undefined): FuelType {
  return (FUEL_TYPES as readonly string[]).includes(value ?? '') ? (value as FuelType) : DEFAULT_FUEL_TYPE;
}

export interface VpicFuelFields {
  primary?: string | null;
  secondary?: string | null;
  electrification?: string | null;
}

// vPIC uses "" or "Not Applicable" for missing values and sometimes lists several, comma-separated.
function first(value: string | null | undefined): string {
  const v = (value ?? '').split(',')[0]!.trim();
  return v === 'Not Applicable' ? '' : v;
}

const has = (text: string, token: string) => new RegExp(`\\b${token}\\b`, 'i').test(text);

/** Maps NHTSA's fuel fields to a fuel type with the FR-002 table (first match wins). */
export function fuelTypeFromVpic({ primary, secondary, electrification }: VpicFuelFields): FuelType | null {
  const level = (electrification ?? '').trim();
  // Whole tokens: "PHEV" contains the letters "HEV".
  if (has(level, 'BEV')) return 'electric';
  if (has(level, 'PHEV')) return 'plug_in_hybrid';
  if (has(level, 'HEV')) return 'hybrid';
  if (has(level, 'FCEV')) return 'other';

  const p = first(primary).toLowerCase();
  const s = first(secondary).toLowerCase();
  // A1: an engine as secondary fuel means a plug-in hybrid, even without a level.
  if (p === 'electric' && (s === 'gasoline' || s === 'diesel')) return 'plug_in_hybrid';
  if (p === 'electric') return 'electric';
  if (p === 'gasoline' && s === 'electric') return 'hybrid';
  if (p === 'diesel') return 'diesel';
  if (p === 'gasoline') return 'gasoline';
  if (/flexible fuel|\bffv\b|ethanol|\be85\b/.test(p)) return 'flex';
  if (p) return 'other';
  return null;
}

/** A VIN decode prefills the fuel type, but never overwrites a value the user chose (US1 AS3). */
export function applyDecodedFuelType(current: FuelType, decoded: FuelType | null, userTouched: boolean): FuelType {
  if (userTouched || decoded === null) return current;
  return decoded;
}

/** FR-006: a one-line notice when a car that wasn't electric is switched to electric. */
export function showsElectricNotice(saved: FuelType, selected: FuelType): boolean {
  return saved !== 'electric' && selected === 'electric';
}
