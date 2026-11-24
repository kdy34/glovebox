// Money is always integer cents (data-model.md). No floats for stored values.

export const MAX_ABS_CENTS = 100_000_000; // $1,000,000

/** Parses user/receipt text like "$1,234.50" into cents. Returns null if invalid. */
export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.trim().replace(/[$,\s]/g, '');
  const match = /^(-)?(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const [, minus, whole = '0', frac = ''] = match;
  const padded = (frac + '000').slice(0, 3);
  let cents = Number(whole) * 100 + Number(padded.slice(0, 2));
  if (Number(padded[2]) >= 5) cents += 1; // round half up on the third decimal
  if (!Number.isSafeInteger(cents) || cents > MAX_ABS_CENTS) return null;
  return minus ? -cents : cents;
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

export function formatCents(cents: number): string {
  return usd.format(cents / 100);
}

/** amount = round(quantity × unit price) — must match save_record in SQL. */
export function lineAmountCents(quantity: number, unitPriceCents: number): number {
  const raw = quantity * unitPriceCents;
  // Round half away from zero, like Postgres round(numeric).
  return Math.sign(raw) * Math.round(Math.abs(raw) + Number.EPSILON);
}

export interface LineLike {
  quantity: number;
  unitPriceCents: number;
}

export interface Totals {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

export function computeTotals(items: readonly LineLike[], taxCents: number): Totals {
  const subtotalCents = items.reduce((sum, i) => sum + lineAmountCents(i.quantity, i.unitPriceCents), 0);
  return { subtotalCents, taxCents, totalCents: subtotalCents + taxCents };
}

/** FR-014: printed total disagrees with subtotal + tax by more than one cent. */
export function totalsMismatch(t: Totals): boolean {
  return Math.abs(t.subtotalCents + t.taxCents - t.totalCents) > 1;
}
