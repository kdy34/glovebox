// ReceiptExtractionDraft v1 — the app-side Zod schema for AI receipt drafts.
// Must mean exactly what specs/001-glovebox-mvp/contracts/receipt-extraction.schema.json
// says; __tests__/contracts/extractionSchema.test.ts enforces it (T046).
// AI output is untrusted: validate before use, and never save without the user confirming.
import { z } from 'zod/v4';

export const SCHEMA_VERSION = 1;

const MONEY = 100_000_000;
const conf = z.number().min(0).max(1);
const strField = z.object({ value: z.string().max(240).nullable(), confidence: conf }).strict();
const intField = z.object({ value: z.number().int().min(-MONEY).max(MONEY).nullable(), confidence: conf }).strict();

export const DRAFT_CATEGORIES = [
  'oil_change',
  'tire_rotation',
  'tires',
  'brakes',
  'battery',
  'filters',
  'fluids',
  'inspection',
  'repair',
  'body',
  'other_maintenance',
  'fuel',
  'registration',
  'parking_tolls',
  'other_expense',
] as const;

export const DRAFT_WARNINGS = [
  'totals_mismatch',
  'multiple_vehicles',
  'handwritten',
  'partial_receipt',
  'low_image_quality',
  'non_usd_currency',
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
          .object({
            value: z
              .string()
              .regex(/^\d{4}-\d{2}-\d{2}$/)
              .nullable(),
            confidence: conf,
          })
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
