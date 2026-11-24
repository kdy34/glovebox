// ReceiptExtractionDraft v1 — server-side copy of the Zod schema (T051).
// Kept in step with contracts/receipt-extraction.schema.json by schema.test.ts, like the
// app copy (app/src/domain/extractionSchema.ts) is by the T046 contract test.
// Model output is validated with this before anything else touches it.
import { z } from 'zod/v4';

export const SCHEMA_VERSION = 1;

const MONEY = 100_000_000;
const conf = z.number().min(0).max(1);
const strField = z.object({ value: z.string().max(240).nullable(), confidence: conf }).strict();
const intField = z.object({ value: z.number().int().min(-MONEY).max(MONEY).nullable(), confidence: conf }).strict();

export const DRAFT_CATEGORIES = [
  'oil_change', 'tire_rotation', 'tires', 'brakes', 'battery', 'filters', 'fluids', 'inspection', 'repair', 'body',
  'other_maintenance', 'fuel', 'registration', 'parking_tolls', 'other_expense',
] as const;

export const DRAFT_WARNINGS = [
  'totals_mismatch', 'multiple_vehicles', 'handwritten', 'partial_receipt', 'low_image_quality', 'non_usd_currency',
  'date_ambiguous',
] as const;

export const LineItemDraft = z
  .object({
    item_type: z.enum(['part', 'labor', 'fee', 'discount']),
    description: z.string().min(1).max(200),
    quantity: z.number().gt(0).max(10_000),
    unit_price_cents: z.number().int().min(-MONEY).max(MONEY),
    amount_cents: z.number().int().min(-MONEY).max(MONEY),
    confidence: conf,
  })
  .strict();

export const ReceiptExtractionDraft = z
  .object({
    schema_version: z.literal(SCHEMA_VERSION),
    is_receipt: z.boolean(),
    fields: z
      .object({
        shop_name: strField,
        shop_address: strField,
        performed_on: z
          .object({ value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(), confidence: conf })
          .strict(),
        odometer: intField,
        subtotal_cents: intField,
        tax_cents: intField,
        total_cents: intField,
        suggested_category: z.object({ value: z.enum(DRAFT_CATEGORIES).nullable(), confidence: conf }).strict(),
        suggested_title: strField,
        is_diy_purchase: z.object({ value: z.boolean().nullable(), confidence: conf }).strict(),
      })
      .strict(),
    line_items: z.array(LineItemDraft).max(60),
    warnings: z.array(z.enum(DRAFT_WARNINGS)).max(10),
  })
  .strict();

export type ExtractionDraft = z.infer<typeof ReceiptExtractionDraft>;
export type ExtractionLineItem = z.infer<typeof LineItemDraft>;

// ─── Gemini response schema ────────────────────────────────────────────────
// Gemini's responseSchema takes an OpenAPI 3.0 subset: upper-case single `type`,
// `nullable`, string-only `enum`, counts as strings, no $ref/const/additionalProperties.
// It steers generation only; ReceiptExtractionDraft above is the real check.
type J = Record<string, unknown>;

function toGemini(node: J): J {
  if (Array.isArray(node.anyOf)) {
    const parts = node.anyOf as J[];
    const nonNull = parts.filter((p) => p.type !== 'null');
    if (nonNull.length === 1) return { ...toGemini(nonNull[0]!), nullable: true };
    throw new Error('unsupported anyOf in response schema');
  }
  const out: J = {};
  let types = node.type === undefined ? [] : Array.isArray(node.type) ? [...(node.type as string[])] : [node.type as string];
  const nullable = types.includes('null') || (Array.isArray(node.enum) && (node.enum as unknown[]).includes(null));
  types = types.filter((t) => t !== 'null');
  if ('const' in node) {
    out.type = Number.isInteger(node.const) ? 'INTEGER' : typeof node.const === 'string' ? 'STRING' : 'NUMBER';
    if (typeof node.const === 'string') out.enum = [node.const];
    return out;
  }
  if (Array.isArray(node.enum)) {
    out.type = 'STRING';
    out.enum = (node.enum as unknown[]).filter((v) => v !== null).map(String);
    if (nullable) out.nullable = true;
    return out;
  }
  const t = types[0] ?? (node.properties ? 'object' : node.items ? 'array' : 'string');
  out.type = t.toUpperCase();
  if (nullable) out.nullable = true;
  for (const k of ['minimum', 'maximum', 'minLength', 'maxLength', 'pattern'] as const) if (k in node) out[k] = node[k];
  if ('exclusiveMinimum' in node && !('minimum' in node)) out.minimum = node.exclusiveMinimum;
  if ('minItems' in node) out.minItems = String(node.minItems);
  if ('maxItems' in node) out.maxItems = String(node.maxItems);
  if (node.properties) {
    const props = node.properties as Record<string, J>;
    out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGemini(v)]));
    out.required = [...((node.required as string[]) ?? [])];
    out.propertyOrdering = Object.keys(props);
  }
  if (node.items) out.items = toGemini(node.items as J);
  return out;
}

let cached: J | null = null;
export function geminiResponseSchema(): J {
  cached ??= toGemini(z.toJSONSchema(ReceiptExtractionDraft, { io: 'input' }) as J);
  return structuredClone(cached);
}
