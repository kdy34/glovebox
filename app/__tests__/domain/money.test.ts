// T026 — money math (FR-007, FR-014). Integer cents everywhere.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMoneyToCents,
  formatCents,
  lineAmountCents,
  computeTotals,
  totalsMismatch,
} from '../../src/domain/money.ts';

describe('parseMoneyToCents', () => {
  it('parses common user inputs', () => {
    assert.equal(parseMoneyToCents('64.99'), 6499);
    assert.equal(parseMoneyToCents('$1,234.5'), 123450);
    assert.equal(parseMoneyToCents('  12 '), 1200);
    assert.equal(parseMoneyToCents('-5.00'), -500);
    assert.equal(parseMoneyToCents('0.1'), 10);
  });
  it('avoids floating point drift', () => {
    assert.equal(parseMoneyToCents('0.29'), 29);
    assert.equal(parseMoneyToCents('1.005'), 101); // rounds half up on the 3rd decimal
  });
  it('rejects garbage', () => {
    assert.equal(parseMoneyToCents(''), null);
    assert.equal(parseMoneyToCents('abc'), null);
    assert.equal(parseMoneyToCents('1.2.3'), null);
  });
  it('rejects amounts above $1,000,000', () => {
    assert.equal(parseMoneyToCents('1000000.01'), null);
  });
});

describe('formatCents', () => {
  it('formats USD', () => {
    assert.equal(formatCents(6499), '$64.99');
    assert.equal(formatCents(123450), '$1,234.50');
    assert.equal(formatCents(-500), '-$5.00');
    assert.equal(formatCents(0), '$0.00');
  });
});

describe('lineAmountCents', () => {
  it('multiplies quantity × unit price and rounds to the cent', () => {
    assert.equal(lineAmountCents(5, 899), 4495);
    assert.equal(lineAmountCents(1.5, 333), 500); // 499.5 → 500
    assert.equal(lineAmountCents(1, -500), -500);
  });
});

describe('computeTotals', () => {
  it('sums line items and adds tax (matches save_record)', () => {
    const t = computeTotals(
      [
        { quantity: 5, unitPriceCents: 899 },
        { quantity: 1, unitPriceCents: 2500 },
        { quantity: 1, unitPriceCents: -500 },
      ],
      312,
    );
    assert.deepEqual(t, { subtotalCents: 6495, taxCents: 312, totalCents: 6807 });
  });
  it('handles no line items', () => {
    assert.deepEqual(computeTotals([], 0), { subtotalCents: 0, taxCents: 0, totalCents: 0 });
  });
});

describe('totalsMismatch', () => {
  it('flags when subtotal + tax differs from the printed total by more than 1 cent', () => {
    assert.equal(totalsMismatch({ subtotalCents: 6495, taxCents: 312, totalCents: 6807 }), false);
    assert.equal(totalsMismatch({ subtotalCents: 6495, taxCents: 312, totalCents: 6808 }), false);
    assert.equal(totalsMismatch({ subtotalCents: 6495, taxCents: 312, totalCents: 7000 }), true);
  });
});
