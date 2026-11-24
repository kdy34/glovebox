// T046 — contract test: the app's Zod schema for AI drafts means exactly what
// specs/001-glovebox-mvp/contracts/receipt-extraction.schema.json says.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod/v4';
import contract from '../../../specs/001-glovebox-mvp/contracts/receipt-extraction.schema.json' with { type: 'json' };
import { ReceiptExtractionDraft } from '../../src/domain/extractionSchema.ts';
import { canonical } from './canonical.ts';

// io: 'input' — the shape we accept. (Output mode always reports additionalProperties: false,
// which would hide a missing .strict().)
const generated = () =>
  z.toJSONSchema(ReceiptExtractionDraft, { target: 'draft-2020-12', io: 'input' }) as Record<string, unknown>;

describe('T046 receipt extraction schema contract', () => {
  it('the app Zod schema equals contracts/receipt-extraction.schema.json', () => {
    assert.deepEqual(canonical(generated()), canonical(contract as Record<string, unknown>));
  });

  it('the comparison notices drift (a changed enum fails)', () => {
    const drifted = structuredClone(contract) as Record<string, any>;
    drifted.properties.warnings.items.enum.push('new_warning');
    assert.notDeepEqual(canonical(generated()), canonical(drifted));
  });

  it('the comparison notices drift (a changed bound fails)', () => {
    const drifted = structuredClone(contract) as Record<string, any>;
    drifted.properties.line_items.maxItems = 61;
    assert.notDeepEqual(canonical(generated()), canonical(drifted));
  });

  it('a valid draft parses; extra keys and a wrong schema_version are rejected', () => {
    const field = <T>(value: T) => ({ value, confidence: 0.9 });
    const draft = {
      schema_version: 1,
      is_receipt: true,
      fields: {
        shop_name: field("Joe's Auto"),
        shop_address: field(null),
        performed_on: field('2026-06-01'),
        odometer: field(150000),
        subtotal_cents: field(6495),
        tax_cents: field(312),
        total_cents: field(6807),
        suggested_category: field('oil_change'),
        suggested_title: field('Oil change'),
        is_diy_purchase: field(false),
      },
      line_items: [
        {
          item_type: 'part',
          description: 'Oil',
          quantity: 5,
          unit_price_cents: 899,
          amount_cents: 4495,
          confidence: 0.95,
        },
      ],
      warnings: [],
    };
    assert.equal(ReceiptExtractionDraft.safeParse(draft).success, true);
    assert.equal(ReceiptExtractionDraft.safeParse({ ...draft, extra: 1 }).success, false);
    assert.equal(ReceiptExtractionDraft.safeParse({ ...draft, schema_version: 2 }).success, false);
  });
});
