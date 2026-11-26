// T066 — a car's reminder health for the ring and the Garage chips.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { vehicleHealth } from '../../src/domain/health.ts';

const s = (...statuses: string[]) => statuses.map((status) => ({ status })) as { status: 'ok' | 'due_soon' | 'overdue' | 'unknown' }[];

describe('vehicleHealth', () => {
  it('share of known reminders that are on track; counts for the chips', () => {
    assert.deepEqual(vehicleHealth(s('ok', 'ok', 'due_soon', 'overdue')), { score: 0.5, overdue: 1, dueSoon: 1, tracked: 4, tone: 'danger' });
  });
  it('tone: any overdue → danger, else any due soon → accent, else success', () => {
    assert.equal(vehicleHealth(s('ok', 'due_soon'))!.tone, 'accent');
    assert.equal(vehicleHealth(s('ok'))!.tone, 'success');
  });
  it('unknown reminders do not count either way', () => {
    assert.deepEqual(vehicleHealth(s('ok', 'unknown')), { score: 1, overdue: 0, dueSoon: 0, tracked: 1, tone: 'success' });
  });
  it('no reminders → no ring', () => {
    assert.equal(vehicleHealth([]), null);
    assert.equal(vehicleHealth(s('unknown')), null);
  });
});
