// 002 T014 — Edit vehicle: a VIN decode only suggests; the user confirms each field (FR-007, US1 AS4).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyVinSuggestions, vinSuggestions, type VehicleFields } from '../../src/domain/vinSuggestion.ts';

const saved: VehicleFields = { year: '2009', make: 'Toyota', model: 'Prius', trim: '', fuelType: 'gasoline' };
const decoded = { year: 2010, make: 'Toyota', model: 'Prius', trim: 'Touring', fuelType: 'hybrid' as const };

describe('vinSuggestions', () => {
  it('lists only present fields that differ, in a fixed order', () => {
    assert.deepEqual(vinSuggestions(saved, decoded), [
      { field: 'year', current: '2009', suggested: '2010' },
      { field: 'trim', current: '', suggested: 'Touring' },
      { field: 'fuelType', current: 'gasoline', suggested: 'hybrid' },
    ]);
  });

  it('ignores decoded fields that are missing', () => {
    assert.deepEqual(vinSuggestions(saved, { year: null, make: null, model: null, trim: null, fuelType: null }), []);
  });

  it('treats differences in surrounding spaces only as equal', () => {
    assert.deepEqual(vinSuggestions({ ...saved, model: 'Prius ' }, { ...decoded, year: 2009, trim: null, fuelType: null }), []);
  });

  it('lists make and model when they differ', () => {
    assert.deepEqual(
      vinSuggestions(saved, { year: 2009, make: 'Honda', model: 'Fit', trim: null, fuelType: 'gasoline' }).map((s) => s.field),
      ['make', 'model'],
    );
  });
});

describe('applyVinSuggestions', () => {
  const suggestions = vinSuggestions(saved, decoded);

  it('changes only the accepted fields', () => {
    assert.deepEqual(applyVinSuggestions(saved, suggestions, new Set(['fuelType'])), { ...saved, fuelType: 'hybrid' });
  });

  it('changes every accepted field', () => {
    assert.deepEqual(applyVinSuggestions(saved, suggestions, new Set(['year', 'trim', 'fuelType'])),
      { year: '2010', make: 'Toyota', model: 'Prius', trim: 'Touring', fuelType: 'hybrid' });
  });

  it('nothing accepted (Dismiss) leaves the form unchanged', () => {
    assert.deepEqual(applyVinSuggestions(saved, suggestions, new Set()), saved);
  });

  it('ignores accepted fields that were not suggested', () => {
    assert.deepEqual(applyVinSuggestions(saved, suggestions, new Set(['make'])), saved);
  });
});
