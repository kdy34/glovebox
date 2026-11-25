// T049 — likely-duplicate receipt (spec edge case; data-model.md "Duplicate receipt"): the same
// vehicle, date and total with a similar shop name, or the same image (sha256).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findLikelyDuplicate, normalizeShop, shopSimilar } from '../../src/domain/duplicates.ts';

const existing = [
  { id: 'r1', vehicle_id: 'v1', performed_on: '2026-06-01', total_cents: 6807, shop_name: "Joe's Auto Repair" },
  { id: 'r2', vehicle_id: 'v1', performed_on: '2026-05-01', total_cents: 2999, shop_name: null },
];
const attachments = [
  { record_id: 'r1', sha256: 'a'.repeat(64) },
  { record_id: null, sha256: 'b'.repeat(64) }, // a dropped draft, not a saved record
];
const cand = { vehicleId: 'v1', performedOn: '2026-06-01', totalCents: 6807, shopName: "JOE'S AUTO REPAIR.", sha256: 'c'.repeat(64) };

describe('normalizeShop / shopSimilar', () => {
  it('ignores case, punctuation and extra spaces', () => {
    assert.equal(normalizeShop("  Joe's   Auto-Repair, Inc. "), 'joes auto repair inc');
  });
  it('normalized Levenshtein ≤ 0.2 is similar', () => {
    assert.equal(shopSimilar("Joe's Auto Repair", 'Joes Auto Repiar'), true);
    assert.equal(shopSimilar('Jiffy Lube', 'Valvoline Instant Oil'), false);
  });
  it('two empty names (DIY) are similar; one empty is not', () => {
    assert.equal(shopSimilar(null, ''), true);
    assert.equal(shopSimilar(null, 'AutoZone'), false);
  });
});

describe('findLikelyDuplicate', () => {
  it('same vehicle, date, total and a similar shop', () => {
    assert.deepEqual(findLikelyDuplicate(cand, existing, attachments), { recordId: 'r1', reason: 'same_details' });
  });

  it('the same image of a saved record', () => {
    assert.deepEqual(
      findLikelyDuplicate({ ...cand, performedOn: '2026-01-01', sha256: 'a'.repeat(64) }, existing, attachments),
      { recordId: 'r1', reason: 'same_image' },
    );
  });

  it('the same image only counts when it belongs to a saved record', () => {
    assert.equal(findLikelyDuplicate({ ...cand, performedOn: '2026-01-01', sha256: 'b'.repeat(64) }, existing, attachments), null);
  });

  it('a different vehicle, date, total or shop is not a duplicate', () => {
    assert.equal(findLikelyDuplicate({ ...cand, vehicleId: 'v2' }, existing, attachments), null);
    assert.equal(findLikelyDuplicate({ ...cand, performedOn: '2026-06-02' }, existing, attachments), null);
    assert.equal(findLikelyDuplicate({ ...cand, totalCents: 6808 }, existing, attachments), null);
    assert.equal(findLikelyDuplicate({ ...cand, shopName: 'Midas' }, existing, attachments), null);
  });

  it('DIY records without a shop match on date and total', () => {
    assert.deepEqual(
      findLikelyDuplicate({ vehicleId: 'v1', performedOn: '2026-05-01', totalCents: 2999, shopName: null, sha256: null }, existing, []),
      { recordId: 'r2', reason: 'same_details' },
    );
  });

  it('can skip the record being edited', () => {
    assert.equal(findLikelyDuplicate(cand, existing, attachments, 'r1'), null);
  });
});
