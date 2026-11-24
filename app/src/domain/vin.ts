// VIN validation (ISO 3779 / NHTSA 49 CFR 565). Check digit failures are warnings:
// some imported and pre-1981 vehicles don't follow it (data-model.md).

export type VinResult =
  | { valid: true; checkDigitOk: boolean }
  | { valid: false; reason: 'length' | 'characters' };

const TRANSLIT: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export function normalizeVin(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '');
}

export function validateVin(input: string): VinResult {
  const vin = normalizeVin(input);
  if (vin.length !== 17) return { valid: false, reason: 'length' };
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return { valid: false, reason: 'characters' };

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const ch = vin[i]!;
    const value = /\d/.test(ch) ? Number(ch) : TRANSLIT[ch]!;
    sum += value * WEIGHTS[i]!;
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return { valid: true, checkDigitOk: vin[8] === expected };
}
