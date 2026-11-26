// Record amounts (T108). With line items the total is computed (subtotal = Σ items, total =
// subtotal + tax). Without items the user enters the total, and save_record trusts the given
// subtotal (total − tax): simple expenses such as "Fuel $42.10".

export type AmountsResult =
  | { ok: true; subtotalCents: number; taxCents: number; totalCents: number }
  | { ok: false; reason: 'no_amount' | 'tax_exceeds_total' };

export function recordAmounts(input: {
  items: readonly { amount_cents: number | null }[];
  taxCents: number | null;
  enteredTotalCents: number | null;
}): AmountsResult {
  const tax = input.taxCents ?? 0;
  if (input.items.length > 0) {
    const subtotal = input.items.reduce((s, it) => s + (it.amount_cents ?? 0), 0);
    return { ok: true, subtotalCents: subtotal, taxCents: tax, totalCents: subtotal + tax };
  }
  const total = input.enteredTotalCents;
  if (total === null || total < 0) return { ok: false, reason: 'no_amount' };
  if (tax > total) return { ok: false, reason: 'tax_exceeds_total' };
  return { ok: true, subtotalCents: total - tax, taxCents: tax, totalCents: total };
}
