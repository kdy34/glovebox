// T108 — a record may have only a total and no line items (e.g. "Fuel $42.10"). save_record
// then trusts subtotal_cents (= total − tax). With line items the total is computed.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recordAmounts } from '../../src/domain/recordAmounts.ts';

const item = (amount: number) => ({ amount_cents: amount });

describe('recordAmounts', () => {
  it('with line items: subtotal = sum, total = subtotal + tax; an entered total is ignored', () => {
    assert.deepEqual(recordAmounts({ items: [item(4495), item(2000)], taxCents: 312, enteredTotalCents: 1 }),
      { ok: true, subtotalCents: 6495, taxCents: 312, totalCents: 6807 });
  });

  it('total only: subtotal = total − tax', () => {
    assert.deepEqual(recordAmounts({ items: [], taxCents: null, enteredTotalCents: 4210 }),
      { ok: true, subtotalCents: 4210, taxCents: 0, totalCents: 4210 });
    assert.deepEqual(recordAmounts({ items: [], taxCents: 210, enteredTotalCents: 4210 }),
      { ok: true, subtotalCents: 4000, taxCents: 210, totalCents: 4210 });
  });

  it('no items and no total is refused', () => {
    assert.deepEqual(recordAmounts({ items: [], taxCents: 100, enteredTotalCents: null }), { ok: false, reason: 'no_amount' });
  });

  it('a tax larger than the total is refused', () => {
    assert.deepEqual(recordAmounts({ items: [], taxCents: 500, enteredTotalCents: 400 }), { ok: false, reason: 'tax_exceeds_total' });
  });

  it('a negative total is refused', () => {
    assert.deepEqual(recordAmounts({ items: [], taxCents: null, enteredTotalCents: -5 }), { ok: false, reason: 'no_amount' });
  });

  it('a $0 total is allowed (e.g. a warranty repair)', () => {
    assert.deepEqual(recordAmounts({ items: [], taxCents: null, enteredTotalCents: 0 }), { ok: true, subtotalCents: 0, taxCents: 0, totalCents: 0 });
  });

  it('missing item amounts count as 0', () => {
    assert.deepEqual(recordAmounts({ items: [{ amount_cents: null }, item(100)], taxCents: null, enteredTotalCents: null }),
      { ok: true, subtotalCents: 100, taxCents: 0, totalCents: 100 });
  });
});
