// Edit vehicle: a VIN decode suggests changes; it never changes saved values by itself (002 FR-007).
import type { FuelType } from './fuelType';

/** The form's current values, as the form holds them (year as text). */
export interface VehicleFields {
  year: string;
  make: string;
  model: string;
  trim: string;
  fuelType: FuelType;
}

export interface DecodedFields {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  fuelType: FuelType | null;
}

export type SuggestionField = keyof VehicleFields;

export interface VinSuggestion {
  field: SuggestionField;
  current: string;
  suggested: string;
}

const ORDER: readonly SuggestionField[] = ['year', 'make', 'model', 'trim', 'fuelType'];

/** Decoded values that are present and differ from the form, in a fixed order. */
export function vinSuggestions(current: VehicleFields, decoded: DecodedFields): VinSuggestion[] {
  const out: VinSuggestion[] = [];
  for (const field of ORDER) {
    const raw = decoded[field];
    if (raw === null || raw === undefined) continue;
    const suggested = String(raw).trim();
    if (!suggested || suggested === current[field].trim()) continue;
    out.push({ field, current: current[field], suggested });
  }
  return out;
}

/** Applies only the suggestions whose field the user kept selected. */
export function applyVinSuggestions(
  current: VehicleFields,
  suggestions: readonly VinSuggestion[],
  accepted: ReadonlySet<SuggestionField>,
): VehicleFields {
  const next = { ...current };
  for (const s of suggestions) {
    if (!accepted.has(s.field)) continue;
    if (s.field === 'fuelType') next.fuelType = s.suggested as FuelType;
    else next[s.field] = s.suggested;
  }
  return next;
}
