// Golden-set scoring for receipt extraction (T058, SC-003). Pure, so it is unit-tested; the
// runner in eval.ts does the file and provider I/O.
import type { ExtractionDraft } from './schema.ts';

type FieldName = keyof ExtractionDraft['fields'];

/** `<receipt>.expected.json`: only the fields listed are scored. */
export interface Expected {
  fields: Partial<Record<FieldName, string | number | boolean | null>>;
  /** Every line item's amount, any order. */
  line_item_amounts_cents?: number[];
}

export interface ReceiptScore {
  correct: number;
  total: number;
  /** total_cents exactly right (SC-003's "totals correct"). */
  totalCorrect: boolean;
  wrong: string[];
}

const TEXT_FIELDS = new Set<FieldName>(['shop_name', 'shop_address', 'suggested_title']);
const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export function scoreReceipt(expected: Expected, draft: ExtractionDraft | null): ReceiptScore {
  const wrong: string[] = [];
  let correct = 0;
  const names = Object.keys(expected.fields) as FieldName[];
  for (const name of names) {
    const want = expected.fields[name];
    const got = draft?.fields[name]?.value ?? null;
    const ok = TEXT_FIELDS.has(name) ? norm(got) === norm(want) : got === want;
    if (ok) correct++;
    else wrong.push(name);
  }
  const amounts = expected.line_item_amounts_cents ?? [];
  if (amounts.length || draft?.line_items.length) {
    const left = [...(draft?.line_items ?? []).map((li) => li.amount_cents)];
    let matched = 0;
    for (const a of amounts) {
      const i = left.indexOf(a);
      if (i >= 0) { matched++; left.splice(i, 1); }
    }
    correct += matched;
    if (matched < amounts.length || left.length > 0) wrong.push('line_items');
  }
  const wantTotal = expected.fields.total_cents;
  return {
    correct,
    total: names.length + amounts.length,
    totalCorrect: draft !== null && wantTotal !== undefined && draft.fields.total_cents.value === wantTotal,
    wrong,
  };
}

/** Nearest-rank percentile. */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export interface ReceiptRun {
  name: string;
  latencyMs: number;
  score: ReceiptScore;
  error?: string;
}

export function summarize(runs: readonly ReceiptRun[]) {
  const correct = runs.reduce((s, r) => s + r.score.correct, 0);
  const total = runs.reduce((s, r) => s + r.score.total, 0);
  const fieldAccuracy = total ? correct / total : 0;
  const totalsAccuracy = runs.length ? runs.filter((r) => r.score.totalCorrect).length / runs.length : 0;
  return {
    receipts: runs.length,
    fieldAccuracy,
    totalsAccuracy,
    latencyP50Ms: percentile(runs.map((r) => r.latencyMs), 50),
    latencyP90Ms: percentile(runs.map((r) => r.latencyMs), 90),
    passes: { fields: fieldAccuracy >= 0.85, totals: totalsAccuracy >= 0.95 },
  };
}
