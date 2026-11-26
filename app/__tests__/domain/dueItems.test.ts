// T063/T065 — due items across vehicles (one projection per vehicle, archived vehicles and
// inactive rules left out, sorted by urgency) and the local-notification plan (FR-021).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDueItems, planNotifications, MAX_SCHEDULED } from '../../src/domain/dueItems.ts';

const vehicle = (id: string, over: Record<string, unknown> = {}) => ({ id, status: 'active', odometer_unit: 'mi', ...over });
const rule = (id: string, vehicle_id: string, over: Record<string, unknown> = {}) => ({
  id, vehicle_id, name: id, interval_miles: null as number | null, interval_months: 6 as number | null, lead_days: 14, lead_miles: 500,
  last_done_on: '2026-06-01' as string | null, last_done_odometer: 150000 as number | null, is_active: true, created_at: '2026-01-01T00:00:00Z', ...over,
});
const reading = (read_on: string, value: number) => ({ read_on, value, unit: 'mi', is_excluded: false });

describe('buildDueItems', () => {
  it('computes each rule with its own vehicle\'s projection and sorts by urgency', () => {
    const items = buildDueItems(
      [vehicle('a'), vehicle('b')],
      [rule('a-time', 'a'), rule('b-miles', 'b', { interval_miles: 5000, interval_months: null }), rule('a-overdue', 'a', { last_done_on: '2025-01-01' })],
      { a: [], b: [reading('2026-06-01', 150000), reading('2026-07-01', 151000)] },
      '2026-07-10',
    );
    assert.deepEqual(items.map((i) => i.rule.id), ['a-overdue', 'b-miles', 'a-time']);
    assert.equal(items.find((i) => i.rule.id === 'b-miles')!.due.decidedBy, 'mileage');
    assert.equal(items.find((i) => i.rule.id === 'a-time')!.due.needsOdometer, false);
  });

  it('leaves out inactive rules, archived vehicles and rules of unknown vehicles', () => {
    const items = buildDueItems(
      [vehicle('a'), vehicle('z', { status: 'archived' })],
      [rule('off', 'a', { is_active: false }), rule('arch', 'z'), rule('ghost', 'missing'), rule('on', 'a')],
      {}, '2026-07-10',
    );
    assert.deepEqual(items.map((i) => i.rule.id), ['on']);
  });
});

describe('planNotifications', () => {
  const now = new Date(2026, 6, 10, 8, 0); // 10 Jul 2026, 08:00 local
  const items = buildDueItems([vehicle('a')], [
    rule('later', 'a', { last_done_on: '2026-06-01' }), // due 2026-12-01 → notify 2026-11-17
    rule('soon', 'a', { last_done_on: '2026-01-20' }), // due 2026-07-20 → in the lead time → today 09:00
    rule('overdue', 'a', { last_done_on: '2025-01-01' }),
  ], {}, '2026-07-10');

  it('one notification per rule at 09:00 local on its notification day; none once overdue', () => {
    const plan = planNotifications(items, now);
    assert.deepEqual(plan.map((p) => [p.ruleId, p.fireAt.getFullYear(), p.fireAt.getMonth() + 1, p.fireAt.getDate(), p.fireAt.getHours()]),
      [['soon', 2026, 7, 10, 9], ['later', 2026, 11, 17, 9]]);
    assert.equal(plan[0]!.identifier, 'glovebox-rule:soon:2026-07-20');
  });

  it('skips a time that has already passed today', () => {
    const plan = planNotifications(items, new Date(2026, 6, 10, 10, 0));
    assert.deepEqual(plan.map((p) => p.ruleId), ['later']);
  });

  it(`caps the plan at ${MAX_SCHEDULED} (iOS keeps 64 local notifications), soonest first`, () => {
    const many = buildDueItems([vehicle('a')], Array.from({ length: 80 }, (_, i) =>
      rule(`r${i}`, 'a', { last_done_on: `2026-${String((i % 6) + 6).padStart(2, '0')}-01` })), {}, '2026-07-10');
    const plan = planNotifications(many, now);
    assert.equal(plan.length, MAX_SCHEDULED);
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i - 1]!.fireAt <= plan[i]!.fireAt);
  });
});
