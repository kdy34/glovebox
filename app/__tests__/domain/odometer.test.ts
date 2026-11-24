// T028 — odometer validation (US1, edge cases: rollback, km).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { checkNewReading, latestIncluded, toMiles, type Reading } from '../../src/domain/odometer.ts';

const readings: Reading[] = [
  { value: 150000, unit: 'mi', readOn: '2026-06-01', isExcluded: false },
  { value: 151500, unit: 'mi', readOn: '2026-08-01', isExcluded: false },
  { value: 999999, unit: 'mi', readOn: '2026-09-01', isExcluded: true }, // typo the user excluded
];

describe('latestIncluded', () => {
  it('returns the newest reading that is not excluded', () => {
    assert.equal(latestIncluded(readings)?.value, 151500);
  });
  it('returns undefined when there are no readings', () => {
    assert.equal(latestIncluded([]), undefined);
  });
});

describe('checkNewReading', () => {
  it('is ok when the value increases', () => {
    assert.deepEqual(checkNewReading(readings, { value: 152000, unit: 'mi', readOn: '2026-10-01' }), { ok: true });
  });
  it('warns on rollback (lower than the latest reading on or before that date)', () => {
    assert.deepEqual(checkNewReading(readings, { value: 140000, unit: 'mi', readOn: '2026-10-01' }), {
      ok: false,
      warning: 'rollback',
      previous: 151500,
    });
  });
  it('allows back-dated readings that fit between existing ones', () => {
    assert.deepEqual(checkNewReading(readings, { value: 150700, unit: 'mi', readOn: '2026-07-01' }), { ok: true });
  });
  it('warns on an implausible jump (> 5,000 mi/day)', () => {
    const r = checkNewReading(readings, { value: 300000, unit: 'mi', readOn: '2026-08-02' });
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.warning, 'implausible_jump');
  });
  it('compares across units', () => {
    // 245,000 km ≈ 152,236 mi → not a rollback
    assert.deepEqual(checkNewReading(readings, { value: 245000, unit: 'km', readOn: '2026-10-01' }), { ok: true });
  });
});

describe('toMiles', () => {
  it('converts km to miles', () => {
    assert.equal(Math.round(toMiles(100, 'km')), 62);
    assert.equal(toMiles(100, 'mi'), 100);
  });
});
