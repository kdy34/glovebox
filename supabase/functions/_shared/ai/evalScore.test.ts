// T058 — golden-set scoring (SC-003): field accuracy, totals accuracy, latency p90.
import { assertEquals } from '@std/assert';
import { percentile, scoreReceipt, summarize, type Expected } from './evalScore.ts';
import type { ExtractionDraft } from './schema.ts';

const f = <T>(value: T, confidence = 0.9) => ({ value, confidence });
const draft = (fields: Partial<ExtractionDraft['fields']> = {}, items: ExtractionDraft['line_items'] = []): ExtractionDraft => ({
  schema_version: 1,
  is_receipt: true,
  fields: {
    shop_name: f("JOE'S AUTO"), shop_address: f(null, 0), performed_on: f('2026-06-01'), odometer: f(150123),
    subtotal_cents: f(6495), tax_cents: f(312), total_cents: f(6807), suggested_category: f('oil_change' as const),
    suggested_title: f('Oil change'), is_diy_purchase: f(false), ...fields,
  },
  line_items: items,
  warnings: [],
});
const expected: Expected = {
  fields: { shop_name: "Joe's Auto", performed_on: '2026-06-01', odometer: 150123, tax_cents: 312, total_cents: 6807 },
  line_item_amounts_cents: [4495, 2000],
};
const items = (amounts: number[]): ExtractionDraft['line_items'] =>
  amounts.map((a) => ({ item_type: 'part', description: 'x', quantity: 1, unit_price_cents: a, amount_cents: a, confidence: 0.9 }));

Deno.test('a perfect draft scores every field and the total', () => {
  const s = scoreReceipt(expected, draft({}, items([2000, 4495])));
  assertEquals([s.correct, s.total, s.totalCorrect, s.wrong], [7, 7, true, []]);
});

Deno.test('shop names compare without case or punctuation; wrong fields are listed', () => {
  const s = scoreReceipt(expected, draft({ odometer: f(150132), total_cents: f(6808) }, items([4495])));
  assertEquals(s.correct, 4); // shop, date, tax, one line item
  assertEquals(s.wrong, ['odometer', 'total_cents', 'line_items']);
  assertEquals(s.totalCorrect, false);
});

Deno.test('an extra line item does not count as correct', () => {
  const s = scoreReceipt(expected, draft({}, items([4495, 2000, 100])));
  assertEquals(s.correct, 7);
  assertEquals(s.wrong, ['line_items']);
});

Deno.test('a failed extraction scores zero but still counts its fields', () => {
  const s = scoreReceipt(expected, null);
  assertEquals([s.correct, s.total, s.totalCorrect], [0, 7, false]);
});

Deno.test('percentile and summary (SC-003: ≥85% fields, ≥95% totals)', () => {
  assertEquals(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
  assertEquals(percentile([], 90), 0);
  const sum = summarize([
    { name: 'a', latencyMs: 1000, score: { correct: 9, total: 10, totalCorrect: true, wrong: ['x'] } },
    { name: 'b', latencyMs: 3000, score: { correct: 8, total: 10, totalCorrect: false, wrong: ['y', 'z'] } },
  ]);
  assertEquals(sum.fieldAccuracy, 0.85);
  assertEquals(sum.totalsAccuracy, 0.5);
  assertEquals(sum.passes, { fields: true, totals: false });
  assertEquals(sum.latencyP90Ms, 3000);
});
