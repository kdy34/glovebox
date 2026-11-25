// T103c — NHTSA vPIC returns makes in capitals ("TOYOTA"); show them the way the brand writes them.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatMake } from '../../src/domain/make.ts';

describe('formatMake', () => {
  it('title-cases plain makes', () => {
    assert.equal(formatMake('TOYOTA'), 'Toyota');
    assert.equal(formatMake('HONDA'), 'Honda');
    assert.equal(formatMake('KIA'), 'Kia');
  });
  it('handles multi-word and hyphenated makes', () => {
    assert.equal(formatMake('LAND ROVER'), 'Land Rover');
    assert.equal(formatMake('ALFA ROMEO'), 'Alfa Romeo');
    assert.equal(formatMake('MERCEDES-BENZ'), 'Mercedes-Benz');
    assert.equal(formatMake('ROLLS-ROYCE'), 'Rolls-Royce');
  });
  it('keeps brand spellings', () => {
    assert.equal(formatMake('BMW'), 'BMW');
    assert.equal(formatMake('GMC'), 'GMC');
    assert.equal(formatMake('MINI'), 'MINI');
    assert.equal(formatMake('MCLAREN'), 'McLaren');
    assert.equal(formatMake('BYD'), 'BYD');
  });
  it('trims and collapses spaces, and leaves empty input empty', () => {
    assert.equal(formatMake('  LAND   ROVER '), 'Land Rover');
    assert.equal(formatMake(''), '');
  });
});
