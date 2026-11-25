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
