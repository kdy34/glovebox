// T103c — display form of a vehicle make. NHTSA vPIC returns makes in capitals ("TOYOTA",
// "MERCEDES-BENZ"); title-case them, keeping the brands that write themselves differently.
const BRAND_SPELLING: Record<string, string> = {
  BMW: 'BMW',
  GMC: 'GMC',
  MINI: 'MINI',
  BYD: 'BYD',
  MG: 'MG',
  AMC: 'AMC',
  SRT: 'SRT',
  VPG: 'VPG',
  MCLAREN: 'McLaren',
  DELOREAN: 'DeLorean',
};

const titleWord = (w: string) => BRAND_SPELLING[w.toUpperCase()] ?? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();

export function formatMake(raw: string): string {
  const whole = raw.trim().replace(/\s+/g, ' ');
  if (!whole) return '';
  const known = BRAND_SPELLING[whole.toUpperCase()];
  if (known) return known;
  return whole
    .split(' ')
    .map((word) => word.split('-').map(titleWord).join('-'))
    .join(' ');
}
