// T057 — linking a saved AI/fallback record to its receipt goes through the outbox as partial
// updates with exactly the columns the client may write (receipt_extractions has a column-level
// grant on corrected_fields only, so any extra key would fail with 42501).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attachmentLink, extractionCorrections } from '../../src/data/writes.ts';

describe('attachmentLink', () => {
  it('is an update of attachments with only record_id', () => {
    assert.deepEqual(attachmentLink('att-1', 'rec-1'), { id: 'att-1', table: 'attachments', operation: 'update', payload: { record_id: 'rec-1' } });
  });
});

describe('extractionCorrections', () => {
  it('is an update of receipt_extractions with only corrected_fields', () => {
    assert.deepEqual(extractionCorrections('ext-1', ['odometer', 'line_items[0]']), {
      id: 'ext-1', table: 'receipt_extractions', operation: 'update', payload: { corrected_fields: ['odometer', 'line_items[0]'] },
    });
  });
  it('de-duplicates and caps the list', () => {
    const many = Array.from({ length: 100 }, (_, i) => `line_items[${i}]`);
    assert.equal(extractionCorrections('e', [...many, ...many]).payload.corrected_fields.length, 70);
    assert.deepEqual(extractionCorrections('e', ['odometer', 'odometer']).payload.corrected_fields, ['odometer']);
  });
});

// T062 — rule writes: a full upsert that never clears last_done_* on edit, and partial updates.
import { ruleActive, ruleUpsert } from '../../src/data/writes.ts';

describe('ruleUpsert / ruleActive', () => {
  const fields = { name: 'Oil', service_category: 'oil_change' as const, interval_miles: 5000, interval_months: 6, lead_days: 14, lead_miles: 500 };
  it('a new rule carries vehicle, source and its baseline', () => {
    assert.deepEqual(ruleUpsert('r1', 'v1', fields, { source: 'generic', baseline: { last_done_on: '2026-06-01', last_done_odometer: 150000 } }), {
      id: 'r1', table: 'maintenance_rules', operation: 'upsert',
      payload: { id: 'r1', vehicle_id: 'v1', ...fields, source: 'generic', last_done_on: '2026-06-01', last_done_odometer: 150000 },
    });
  });
  it('an edit sends no last_done_* (so the reset history is kept)', () => {
    const e = ruleUpsert('r1', 'v1', fields, {});
    assert.ok(!('last_done_on' in e.payload) && !('last_done_odometer' in e.payload) && !('source' in e.payload));
  });
  it('turning a rule off is a partial update', () => {
    assert.deepEqual(ruleActive('r1', false), { id: 'r1', table: 'maintenance_rules', operation: 'update', payload: { is_active: false } });
  });
});
