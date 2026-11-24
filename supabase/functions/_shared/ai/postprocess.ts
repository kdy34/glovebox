// Post-processing of a validated draft (contracts/edge-functions.md step 8).
import type { ExtractionDraft } from './schema.ts';

/** Recomputes the totals check and tidies warnings. Returns a new draft. */
export function postProcess(draft: ExtractionDraft): ExtractionDraft {
  const d = structuredClone(draft);
  const { subtotal_cents: sub, tax_cents: tax, total_cents: total } = d.fields;
  let warnings: ExtractionDraft['warnings'] = d.warnings.filter((w) => w !== 'totals_mismatch');
  if (sub.value !== null && tax.value !== null && total.value !== null && Math.abs(sub.value + tax.value - total.value) > 1) {
    warnings.push('totals_mismatch');
  }
  warnings = [...new Set(warnings)].slice(0, 10);
  d.warnings = warnings;
  return d;
}

/** "odometer", "line_items[2]", … whose value is present but below the confidence threshold. */
export function lowConfidenceFields(draft: ExtractionDraft, threshold: number): string[] {
  const out: string[] = [];
  for (const [name, field] of Object.entries(draft.fields)) {
    if (field.value !== null && field.confidence < threshold) out.push(name);
  }
  draft.line_items.forEach((li, i) => {
    if (li.confidence < threshold) out.push(`line_items[${i}]`);
  });
  return out;
}

/** The model read it as a receipt but found nothing usable. */
export function isUnreadable(draft: ExtractionDraft): boolean {
  return draft.fields.total_cents.value === null && draft.line_items.length === 0;
}
