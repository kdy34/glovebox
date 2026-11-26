// T060 — due computation (FR-020/021/022, US3 AS1–AS3/AS5): whichever limit comes first,
// Due soon / Overdue thresholds, time-only fallback, reset after a matching record, month-end math.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { addMonths, compareUrgency, computeDue, notificationDay, resetRule, type RuleState } from '../../src/domain/reminders.ts';
import type { Projection } from '../../src/domain/projection.ts';

const rule = (over: Partial<RuleState> = {}): RuleState => ({
  interval_miles: 5000,
  interval_months: 6,
  lead_days: 14,
  lead_miles: 500,
  last_done_on: '2026-06-01',
  last_done_odometer: 150000,
  is_active: true,
  created_at: '2026-01-10T12:00:00Z',
  ...over,
});
// ~1,000 mi a month, anchored at the service
const projection: Projection = { perDay: 1000 / 30, anchor: { readOn: '2026-06-01', value: 150000 } };
const ctx = (today: string, p: Projection | null = projection, latestOdometer: number | null = 150000) => ({ today, projection: p, latestOdometer });

describe('addMonths (month-end math)', () => {
  it('clamps to the last day of a shorter month', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2028-01-31', 1), '2028-02-29'); // leap year
    assert.equal(addMonths('2026-03-31', 6), '2026-09-30');
    assert.equal(addMonths('2026-08-31', 6), '2027-02-28');
  });
  it('rolls over years and keeps ordinary days', () => {
    assert.equal(addMonths('2026-06-01', 6), '2026-12-01');
    assert.equal(addMonths('2026-11-15', 14), '2028-01-15');
  });
});

describe('computeDue: whichever limit comes first (AS1)', () => {
  it('the spec example: oil change at 150,000 on 1 June, ~1,000 mi/month, 5,000 mi / 6 months', () => {
    const d = computeDue(rule(), ctx('2026-06-10'))!;
    assert.equal(d.timeDueOn, '2026-12-01');
    assert.equal(d.dueOdometer, 155000);
    assert.equal(d.mileageDueOn, '2026-10-29');
    assert.equal(d.dueOn, '2026-10-29');
    assert.equal(d.decidedBy, 'mileage');
    assert.equal(d.status, 'ok');
    assert.equal(d.needsOdometer, false);
  });

  it('time decides when the car is driven little', () => {
    const slow: Projection = { perDay: 5, anchor: projection.anchor };
    const d = computeDue(rule(), ctx('2026-06-10', slow))!;
    assert.equal(d.dueOn, '2026-12-01');
    assert.equal(d.decidedBy, 'time');
  });

  it('mileage-only and time-only rules', () => {
    assert.equal(computeDue(rule({ interval_months: null }), ctx('2026-06-10'))!.decidedBy, 'mileage');
    const t = computeDue(rule({ interval_miles: null }), ctx('2026-06-10'))!;
    assert.deepEqual([t.decidedBy, t.dueOn, t.dueOdometer], ['time', '2026-12-01', null]);
  });
});

describe('computeDue: Due soon / Overdue (AS5: shown in the app whatever the notification permission)', () => {
  it('ok well before the lead time', () => {
    assert.equal(computeDue(rule({ interval_miles: null }), ctx('2026-11-01'))!.status, 'ok');
  });
  it('due soon within lead_days of the date (inclusive), and on the due date itself', () => {
    const r = rule({ interval_miles: null });
    assert.equal(computeDue(r, ctx('2026-11-16'))!.status, 'ok');
    assert.equal(computeDue(r, ctx('2026-11-17'))!.status, 'due_soon');
    assert.equal(computeDue(r, ctx('2026-12-01'))!.status, 'due_soon');
    assert.equal(computeDue(r, ctx('2026-11-17'))!.daysLeft, 14);
  });
  it('overdue the day after the due date', () => {
    const d = computeDue(rule({ interval_miles: null }), ctx('2026-12-02'))!;
    assert.equal(d.status, 'overdue');
    assert.equal(d.daysLeft, -1);
  });
  it('due soon within lead_miles of the due mileage; overdue once it is reached', () => {
    const r = rule({ interval_months: null });
    // projected 154,600 on 2026-10-17 (138 days) → 400 left
    const soon = computeDue(r, ctx('2026-10-17'))!;
    assert.equal(soon.status, 'due_soon');
    assert.equal(soon.distanceLeft, 400);
    assert.equal(computeDue(r, ctx('2026-11-01'))!.status, 'overdue');
  });
  it('a real reading past the due mileage is overdue even without a projection', () => {
    const d = computeDue(rule({ interval_months: null }), ctx('2026-07-01', null, 155200))!;
    assert.equal(d.status, 'overdue');
    assert.equal(d.distanceLeft, -200);
  });
});

describe('computeDue: time-only fallback (AS2)', () => {
  it('without a projection, the time limit decides and the app asks for an odometer reading', () => {
    const d = computeDue(rule(), ctx('2026-06-10', null))!;
    assert.deepEqual([d.dueOn, d.decidedBy, d.mileageDueOn, d.needsOdometer], ['2026-12-01', 'time', null, true]);
    assert.equal(d.dueOdometer, 155000, 'the due mileage is still known');
  });
  it('a mileage-only rule with no readings at all is unknown', () => {
    const d = computeDue(rule({ interval_months: null, last_done_odometer: null }), ctx('2026-06-10', null, null))!;
    assert.deepEqual([d.status, d.dueOn, d.dueOdometer, d.needsOdometer], ['unknown', null, null, true]);
  });
  it('a time-only rule never asks for the odometer', () => {
    assert.equal(computeDue(rule({ interval_miles: null }), ctx('2026-06-10', null))!.needsOdometer, false);
  });
});

describe('computeDue: never done yet', () => {
  it('counts from when the rule was created and from the latest reading', () => {
    const d = computeDue(rule({ last_done_on: null, last_done_odometer: null }), ctx('2026-02-01', null, 140000))!;
    assert.equal(d.timeDueOn, '2026-07-10');
    assert.equal(d.dueOdometer, 145000);
  });
});

describe('computeDue: inactive rules', () => {
  it('are not computed', () => {
    assert.equal(computeDue(rule({ is_active: false }), ctx('2026-06-10')), null);
  });
});

describe('resetRule (FR-022, mirrors save_record)', () => {
  const base = { vehicle_id: 'v1', service_category: 'oil_change', is_active: true, last_done_on: '2026-06-01', last_done_odometer: 150000 };
  const rec = { vehicle_id: 'v1', kind: 'service', category: 'oil_change', performed_on: '2026-11-20', odometer: 154800 };

  it('a matching service resets the rule', () => {
    assert.deepEqual(resetRule(base, rec), { ...base, last_done_on: '2026-11-20', last_done_odometer: 154800 });
  });
  it('keeps the previous odometer when the record has none', () => {
    assert.deepEqual(resetRule(base, { ...rec, odometer: null }), { ...base, last_done_on: '2026-11-20' });
  });
  it('ignores an older record, another category, another vehicle, an expense, an inactive rule', () => {
    for (const r of [{ ...rec, performed_on: '2026-05-01' }, { ...rec, category: 'brakes' }, { ...rec, vehicle_id: 'v2' }, { ...rec, kind: 'expense' }]) {
      assert.deepEqual(resetRule(base, r), base, JSON.stringify(r));
    }
    assert.deepEqual(resetRule({ ...base, is_active: false }, rec), { ...base, is_active: false });
  });
  it('the same date resets too (a correction of that service)', () => {
    assert.equal(resetRule(base, { ...rec, performed_on: '2026-06-01', odometer: 150010 }).last_done_odometer, 150010);
  });
});

describe('compareUrgency', () => {
  it('overdue first, then due soon, then ok, then unknown; sooner first within a group', () => {
    const items = [
      { status: 'ok', dueOn: '2026-12-01' }, { status: 'unknown', dueOn: null }, { status: 'overdue', dueOn: '2026-05-01' },
      { status: 'due_soon', dueOn: '2026-07-01' }, { status: 'overdue', dueOn: '2026-04-01' }, { status: 'ok', dueOn: '2026-08-01' },
    ] as const;
    const sorted = [...items].sort(compareUrgency).map((d) => `${d.status}:${d.dueOn}`);
    assert.deepEqual(sorted, ['overdue:2026-04-01', 'overdue:2026-05-01', 'due_soon:2026-07-01', 'ok:2026-08-01', 'ok:2026-12-01', 'unknown:null']);
  });
});

describe('notificationDay (FR-021)', () => {
  it('lead_days before the due date', () => {
    assert.equal(notificationDay({ dueOn: '2026-12-01' }, 14, '2026-06-10'), '2026-11-17');
  });
  it('today when the lead time has started but the due date has not passed', () => {
    assert.equal(notificationDay({ dueOn: '2026-12-01' }, 14, '2026-11-20'), '2026-11-20');
  });
  it('nothing once it is overdue, or when there is no due date', () => {
    assert.equal(notificationDay({ dueOn: '2026-12-01' }, 14, '2026-12-02'), null);
    assert.equal(notificationDay({ dueOn: null }, 14, '2026-06-10'), null);
  });
});
