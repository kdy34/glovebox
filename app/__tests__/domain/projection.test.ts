// T059 — mileage projection (research R6): least-squares distance per day over the last 180 days,
// at least 2 included readings at least 14 days apart; excluded readings are ignored.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dateAtOdometer, odometerOn, projectMileage } from '../../src/domain/projection.ts';
import type { Reading } from '../../src/domain/odometer.ts';

const r = (readOn: string, value: number, extra: Partial<Reading> = {}): Reading => ({ value, unit: 'mi', readOn, isExcluded: false, ...extra });

describe('projectMileage', () => {
  it('fits distance per day by least squares', () => {
    // 1,000 mi every 30 days, with noise around the line
    const p = projectMileage([r('2026-04-02', 148000), r('2026-05-02', 149050), r('2026-06-01', 149950), r('2026-07-01', 151000)], '2026-07-10', 'mi');
    assert.ok(p);
    assert.ok(Math.abs(p.perDay - 33.3) < 0.5, `perDay ${p.perDay}`);
    assert.deepEqual(p.anchor, { readOn: '2026-07-01', value: 151000 });
  });

  it('needs at least two included readings', () => {
    assert.equal(projectMileage([], '2026-07-10', 'mi'), null);
    assert.equal(projectMileage([r('2026-06-01', 150000)], '2026-07-10', 'mi'), null);
  });

  it('needs the readings to span at least 14 days', () => {
    assert.equal(projectMileage([r('2026-06-01', 150000), r('2026-06-10', 150300)], '2026-07-10', 'mi'), null);
    assert.ok(projectMileage([r('2026-06-01', 150000), r('2026-06-15', 150300)], '2026-07-10', 'mi'));
  });

  it('ignores excluded readings', () => {
    const p = projectMileage([r('2026-05-01', 149000), r('2026-05-20', 1000, { isExcluded: true }), r('2026-05-31', 150000)], '2026-06-10', 'mi');
    assert.ok(p);
    assert.ok(Math.abs(p.perDay - 1000 / 30) < 0.01);
    assert.equal(projectMileage([r('2026-05-01', 149000), r('2026-05-31', 150000, { isExcluded: true })], '2026-06-10', 'mi'), null);
  });

  it('uses only the last 180 days', () => {
    // an old fast period, then a recent slow one: only the recent one counts
    const p = projectMileage([r('2025-01-01', 100000), r('2025-02-01', 110000), r('2026-05-01', 149000), r('2026-05-31', 149300)], '2026-06-10', 'mi');
    assert.ok(p);
    assert.ok(Math.abs(p.perDay - 10) < 0.01);
  });

  it('a car that is not driven projects 0 per day; a falling fit gives no projection', () => {
    assert.equal(projectMileage([r('2026-05-01', 150000), r('2026-05-31', 150000)], '2026-06-10', 'mi')!.perDay, 0);
    assert.equal(projectMileage([r('2026-05-01', 150300), r('2026-05-31', 150000)], '2026-06-10', 'mi'), null);
  });

  it('converts readings to the vehicle unit', () => {
    const p = projectMileage([r('2026-05-01', 1609.344, { unit: 'km' }), r('2026-05-31', 3218.688, { unit: 'km' })], '2026-06-10', 'mi');
    assert.ok(p);
    assert.ok(Math.abs(p.perDay - 1000 / 30) < 0.01);
    assert.ok(Math.abs(p.anchor.value - 2000) < 0.001);
  });
});

describe('odometerOn / dateAtOdometer', () => {
  const p = { perDay: 1000 / 30, anchor: { readOn: '2026-06-01', value: 150000 } };

  it('projects the odometer on a date', () => {
    assert.equal(Math.round(odometerOn(p, '2026-07-01')), 151000);
    assert.equal(odometerOn(p, '2026-06-01'), 150000);
  });

  it('finds the date a mileage is reached (rounded up to a whole day)', () => {
    assert.equal(dateAtOdometer(p, 155000), '2026-10-29'); // 5,000 mi at 33.3/day = 150 days
    assert.equal(dateAtOdometer(p, 150001), '2026-06-02');
  });

  it('a mileage already passed is reached on the anchor date', () => {
    assert.equal(dateAtOdometer(p, 149000), '2026-06-01');
  });

  it('a car that is not driven never reaches a higher mileage', () => {
    assert.equal(dateAtOdometer({ ...p, perDay: 0 }, 155000), null);
  });
});
