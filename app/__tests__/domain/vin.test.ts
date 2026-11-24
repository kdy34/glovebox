// T027 — VIN validation (FR-005/006). Check digit is a warning, not a blocker.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVin, validateVin } from '../../src/domain/vin.ts';

describe('normalizeVin', () => {
  it('uppercases and strips spaces/dashes', () => {
    assert.equal(normalizeVin(' 1hgcm82633a004352 '), '1HGCM82633A004352');
    assert.equal(normalizeVin('1HG-CM826-33A004352'), '1HGCM82633A004352');
  });
});

describe('validateVin', () => {
  it('accepts a VIN with a correct check digit', () => {
    assert.deepEqual(validateVin('1HGCM82633A004352'), { valid: true, checkDigitOk: true });
  });
  it('accepts a well-formed VIN with a bad check digit but flags it', () => {
    assert.deepEqual(validateVin('1HGCM82643A004352'), { valid: true, checkDigitOk: false });
  });
  it('rejects wrong length', () => {
    assert.deepEqual(validateVin('1HGCM8263'), { valid: false, reason: 'length' });
  });
  it('rejects I, O and Q', () => {
    assert.deepEqual(validateVin('1HGCM82633A00435I'), { valid: false, reason: 'characters' });
    assert.deepEqual(validateVin('OHGCM82633A004352'), { valid: false, reason: 'characters' });
  });
  it('accepts X as a check digit', () => {
    // 11111111111111111 has check digit 1; craft one whose check digit is X
    const r = validateVin('1M8GDM9AXKP042788');
    assert.equal(r.valid, true);
    assert.equal(r.valid && r.checkDigitOk, true);
  });
});
