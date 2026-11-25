// NHTSA vPIC VIN decoder (FR-006). Free, no key needed.
// Timeout: 8 s. Falls back gracefully (returns null) if unavailable.
import { formatMake } from '@/domain/make';

const VPIC_BASE = 'https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvaluesextended';
const TIMEOUT_MS = 8_000;

export interface VinDecodeResult {
  year: number | null;
  make: string | null;
  model: string | null;
  trim: string | null;
  bodyClass: string | null;
  driveType: string | null;
  engineCylinders: string | null;
  fuelType: string | null;
}

function pickFirst(value: string | null | undefined): string | null {
  if (!value || value === 'Not Applicable' || value === '0') return null;
  // vPIC sometimes returns comma-separated values; take the first
  return value.split(',')[0]?.trim() ?? null;
}

export async function decodeVin(vin: string): Promise<VinDecodeResult | null> {
  const url = `${VPIC_BASE}/${encodeURIComponent(vin)}?format=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const json = await res.json() as {
      Results?: {
        ModelYear?: string;
        Make?: string;
        Model?: string;
        Trim?: string;
        BodyClass?: string;
        DriveType?: string;
        EngineCylinders?: string;
        FuelTypePrimary?: string;
        ErrorCode?: string;
      }[];
    };

    const r = json.Results?.[0];
    if (!r) return null;
    // ErrorCode 0 = no error; 1 = VIN corrected; others = decode failed
    if (r.ErrorCode && !['0', '1', '0 - No errors detected'].includes(r.ErrorCode)) return null;

    const year = r.ModelYear ? parseInt(r.ModelYear, 10) : null;
    const make = pickFirst(r.Make);
    return {
      year: year && !isNaN(year) ? year : null,
      make: make ? formatMake(make) : null, // "TOYOTA" → "Toyota" (T103c)
      model: pickFirst(r.Model),
      trim: pickFirst(r.Trim),
      bodyClass: pickFirst(r.BodyClass),
      driveType: pickFirst(r.DriveType),
      engineCylinders: pickFirst(r.EngineCylinders),
      fuelType: pickFirst(r.FuelTypePrimary),
    };
  } catch {
    return null; // network error, timeout, or parse error — degrade gracefully
  } finally {
    clearTimeout(timer);
  }
}
