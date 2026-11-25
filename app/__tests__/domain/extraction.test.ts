// T048 — AI draft → record form (US2 AS2/AS3, FR-013/FR-014). The draft is untrusted: the form
// values it produces must be ones save_record and the DB constraints accept.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { correctedFields, draftToForm, formTotalsMismatch, type DraftForm } from '../../src/domain/extraction.ts';
import { lineAmountCents } from '../../src/domain/money.ts';
import type { ExtractionDraft } from '../../src/domain/extractionSchema.ts';

const f = <T>(value: T, confidence = 0.95) => ({ value, confidence });
function draft(fields: Partial<ExtractionDraft['fields']> = {}, over: Partial<ExtractionDraft> = {}): ExtractionDraft {
  return {
    schema_version: 1,
    is_receipt: true,
    fields: {
      shop_name: f("Joe's Auto"),
      shop_address: f('12 Main St, Arlington, VA'),
      performed_on: f('2026-06-01'),
      odometer: f(150123),
      subtotal_cents: f(6495),
      tax_cents: f(312),
      total_cents: f(6807),
      suggested_category: f('oil_change' as const),
      suggested_title: f('Oil change'),
      is_diy_purchase: f(false),
      ...fields,
    },
    line_items: [
      { item_type: 'part', description: '5W-30 synthetic', quantity: 5, unit_price_cents: 899, amount_cents: 4495, confidence: 0.97 },
      { item_type: 'labor', description: 'Labor', quantity: 1, unit_price_cents: 2000, amount_cents: 2000, confidence: 0.9 },
    ],
    warnings: [],
    ...over,
  };
}

let n = 0;
const opts = { today: '2026-06-10', newId: () => `id-${++n}` };
const form = (d: ExtractionDraft, low: string[] = []) => draftToForm(d, low, opts);

describe('draftToForm: fields', () => {
  it('maps a clean draft', () => {
    const r = form(draft());
    assert.equal(r.kind, 'service');
    assert.equal(r.category, 'oil_change');
    assert.equal(r.title, 'Oil change');
    assert.equal(r.performedOn, '2026-06-01');
    assert.equal(r.odometer, '150123');
    assert.equal(r.shopName, "Joe's Auto");
    assert.equal(r.shopAddress, '12 Main St, Arlington, VA');
    assert.equal(r.isDiy, false);
    assert.equal(r.taxCents, 312);
    assert.equal(r.receiptTotalCents, 6807);
    assert.equal(r.items.length, 2);
    assert.deepEqual(r.flags, []);
  });

  it('an expense category makes an expense record', () => {
    const r = form(draft({ suggested_category: f('fuel' as const) }));
    assert.equal(r.kind, 'expense');
    assert.equal(r.category, 'fuel');
  });

  it('a missing category falls back to other maintenance and is flagged', () => {
    const r = form(draft({ suggested_category: f(null, 0) }));
    assert.equal(r.category, 'other_maintenance');
    assert.ok(r.flags.includes('category'));
  });

  it('a missing, future or ambiguous date becomes today and is flagged', () => {
    for (const d of [draft({ performed_on: f(null, 0) }), draft({ performed_on: f('2026-07-01') })]) {
      const r = form(d);
      assert.equal(r.performedOn, '2026-06-10');
      assert.ok(r.flags.includes('performed_on'));
    }
    const amb = form(draft({}, { warnings: ['date_ambiguous'] }));
    assert.equal(amb.performedOn, '2026-06-01');
    assert.ok(amb.flags.includes('performed_on'), 'ambiguous date is flagged but kept');
  });

  it('a missing or non-positive odometer is left empty', () => {
    assert.equal(form(draft({ odometer: f(null, 0) })).odometer, '');
    const r = form(draft({ odometer: f(-5) }));
    assert.equal(r.odometer, '');
    assert.ok(r.flags.includes('odometer'));
  });

  it('truncates text to the DB limits (shop 120, address 240, title 120)', () => {
    const r = form(draft({ shop_name: f('S'.repeat(240)), shop_address: f('A'.repeat(240)), suggested_title: f('T'.repeat(240)) }));
    assert.equal(r.shopName.length, 120);
    assert.equal(r.shopAddress.length, 240);
    assert.equal(r.title!.length, 120);
  });

  it('a blank title becomes null (the form uses the category label)', () => {
    assert.equal(form(draft({ suggested_title: f('   ') })).title, null);
  });

  it('a negative tax is dropped and flagged', () => {
    const r = form(draft({ tax_cents: f(-10) }));
    assert.equal(r.taxCents, null);
    assert.ok(r.flags.includes('tax_cents'));
  });

  it('passes through the warnings for the banner', () => {
    assert.deepEqual(form(draft({}, { warnings: ['handwritten', 'totals_mismatch'] })).warnings, ['handwritten', 'totals_mismatch']);
  });
});

describe('draftToForm: low-confidence flags (FR-013)', () => {
  it('maps the server field names to form flags, in form order', () => {
    const r = form(draft(), ['tax_cents', 'odometer', 'shop_name', 'suggested_category', 'performed_on', 'is_diy_purchase']);
    assert.deepEqual(r.flags, ['category', 'performed_on', 'odometer', 'shop_name', 'is_diy', 'tax_cents']);
  });

  it('maps line_items[i] to the generated item id', () => {
    const r = form(draft(), ['line_items[1]']);
    assert.deepEqual(r.flags, [`item:${r.items[1]!.id}`]);
  });

  it('ignores unknown names', () => {
    assert.deepEqual(form(draft(), ['bogus', 'line_items[9]', 'subtotal_cents']).flags, []);
  });
});

describe('draftToForm: DIY detection default', () => {
  it('uses the model value when it has one', () => {
    assert.equal(form(draft({ is_diy_purchase: f(true) })).isDiy, true);
    assert.equal(form(draft({ is_diy_purchase: f(false) })).isDiy, false);
  });

  it('when unknown: DIY if there are parts and no labor, and flagged', () => {
    const parts = draft({ is_diy_purchase: f(null, 0) }, {
      line_items: [{ item_type: 'part', description: 'Oil filter', quantity: 1, unit_price_cents: 899, amount_cents: 899, confidence: 0.9 }],
    });
    const r = form(parts);
    assert.equal(r.isDiy, true);
    assert.ok(r.flags.includes('is_diy'));
    assert.equal(form(draft({ is_diy_purchase: f(null, 0) })).isDiy, false, 'labor present → not DIY');
  });
});

describe('draftToForm: line-item normalization', () => {
  const one = (li: Partial<ExtractionDraft['line_items'][number]>) =>
    form(draft({}, { line_items: [{ item_type: 'part', description: 'Part', quantity: 1, unit_price_cents: 100, amount_cents: 100, confidence: 0.9, ...li }] }));

  it('every item satisfies amount = round(quantity × unit price)', () => {
    for (const li of [
      { quantity: 1.23456, unit_price_cents: 1000, amount_cents: 1235 },
      { quantity: 3, unit_price_cents: 333, amount_cents: 1000 },
      { quantity: 2, unit_price_cents: 500, amount_cents: 1000 },
    ]) {
      const it0 = one(li).items[0]!;
      assert.equal(it0.amount_cents, lineAmountCents(it0.quantity, it0.unit_price_cents), JSON.stringify(li));
    }
  });

  it('rounds quantity to 3 decimals', () => {
    assert.equal(one({ quantity: 1.23456, unit_price_cents: 1000, amount_cents: 1235 }).items[0]!.quantity, 1.235);
  });

  it('keeps the printed amount when it disagrees with qty × price, and flags the line', () => {
    const r = one({ quantity: 3, unit_price_cents: 333, amount_cents: 1000 });
    assert.deepEqual([r.items[0]!.quantity, r.items[0]!.unit_price_cents, r.items[0]!.amount_cents], [1, 1000, 1000]);
    assert.ok(r.flags.includes(`item:${r.items[0]!.id}`));
  });

  it('a discount is always negative', () => {
    const r = one({ item_type: 'discount', unit_price_cents: 500, amount_cents: 500 });
    assert.deepEqual([r.items[0]!.unit_price_cents, r.items[0]!.amount_cents], [-500, -500]);
  });

  it('a negative non-discount line becomes a discount', () => {
    const r = one({ item_type: 'fee', unit_price_cents: -250, amount_cents: -250 });
    assert.equal(r.items[0]!.item_type, 'discount');
  });

  it('trims and collapses whitespace in descriptions; a blank one is flagged', () => {
    assert.equal(one({ description: '  Oil   filter \n' }).items[0]!.description, 'Oil filter');
    const blank = one({ description: '   ' });
    assert.equal(blank.items[0]!.description, '');
    assert.ok(blank.flags.includes(`item:${blank.items[0]!.id}`));
  });

  it('gives each item a fresh id', () => {
    const r = form(draft());
    assert.notEqual(r.items[0]!.id, r.items[1]!.id);
  });
});

describe('formTotalsMismatch (FR-014)', () => {
  it('flags a printed total that differs from items + tax by more than a cent', () => {
    assert.equal(formTotalsMismatch(6495, 312, 6807), false);
    assert.equal(formTotalsMismatch(6495, 312, 6808), false, '1 cent tolerance');
    assert.equal(formTotalsMismatch(6495, 312, 7000), true);
    assert.equal(formTotalsMismatch(6495, null, 6495), false, 'no tax counts as 0');
  });
  it('no printed total, no mismatch', () => {
    assert.equal(formTotalsMismatch(6495, 312, null), false);
  });
});

describe('correctedFields (SC-003)', () => {
  it('lists the draft fields the user changed', () => {
    const initial = form(draft());
    const final: DraftForm = {
      ...initial,
      odometer: '150223',
      taxCents: 300,
      items: [{ ...initial.items[0]!, description: '5W-30' }, initial.items[1]!],
    };
    assert.deepEqual(correctedFields(initial, final), ['odometer', 'tax_cents', 'line_items[0]']);
  });

  it('removed and added items count as corrections', () => {
    const initial = form(draft());
    const final: DraftForm = { ...initial, items: [initial.items[1]!, { ...initial.items[1]!, id: 'new' }] };
    assert.deepEqual(correctedFields(initial, final), ['line_items[0]', 'line_items[new]']);
  });

  it('nothing changed → nothing corrected', () => {
    const initial = form(draft());
    assert.deepEqual(correctedFields(initial, initial), []);
  });
});
