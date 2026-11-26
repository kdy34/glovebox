// Due items across all vehicles (T063/T065/T066) and the local-notification plan (FR-021).
// Pure: the hooks in features/reminders feed it query data.
import { latestIncluded, type DistanceUnit, type Reading } from './odometer';
import { projectMileage } from './projection';
import { compareUrgency, computeDue, notificationDay, type Due, type RuleState } from './reminders';

export interface VehicleLike { id: string; status: string; odometer_unit: string }
export interface RuleLike extends RuleState { id: string; vehicle_id: string }
export interface ReadingRow { read_on: string; value: number; unit: string; is_excluded: boolean }

export interface DueItem<V extends VehicleLike, R extends RuleLike> {
  vehicle: V;
  rule: R;
  due: Due;
}

const toReading = (r: ReadingRow): Reading => ({ readOn: r.read_on, value: r.value, unit: r.unit as DistanceUnit, isExcluded: r.is_excluded });

export function buildDueItems<V extends VehicleLike, R extends RuleLike>(
  vehicles: readonly V[],
  rules: readonly R[],
  readingsByVehicle: Readonly<Record<string, readonly ReadingRow[] | undefined>>,
  today: string,
): DueItem<V, R>[] {
  const ctxByVehicle = new Map<string, { vehicle: V; projection: ReturnType<typeof projectMileage>; latest: number | null }>();
  for (const v of vehicles) {
    if (v.status !== 'active') continue;
    const unit = v.odometer_unit as DistanceUnit;
    const readings = (readingsByVehicle[v.id] ?? []).map(toReading).filter((r) => r.unit === unit);
    ctxByVehicle.set(v.id, { vehicle: v, projection: projectMileage(readings, today, unit), latest: latestIncluded(readings)?.value ?? null });
  }
  const items: DueItem<V, R>[] = [];
  for (const rule of rules) {
    const c = ctxByVehicle.get(rule.vehicle_id);
    if (!c) continue;
    const due = computeDue(rule, { today, projection: c.projection, latestOdometer: c.latest });
    if (due) items.push({ vehicle: c.vehicle, rule, due });
  }
  return items.sort((a, b) => compareUrgency(a.due, b.due));
}

/** iOS keeps at most 64 pending local notifications; leave room for others. */
export const MAX_SCHEDULED = 60;
export const NOTIFY_HOUR = 9;

export interface PlannedNotification {
  identifier: string;
  ruleId: string;
  vehicleId: string;
  fireAt: Date;
}

const localDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** One notification per rule at 09:00 local on its notification day, soonest first, future only. */
export function planNotifications(items: readonly DueItem<VehicleLike, RuleLike>[], now: Date): PlannedNotification[] {
  const today = localDate(now);
  const out: PlannedNotification[] = [];
  for (const { rule, vehicle, due } of items) {
    const day = notificationDay(due, rule.lead_days, today);
    if (!day) continue;
    const [y, m, d] = day.split('-').map(Number) as [number, number, number];
    const fireAt = new Date(y, m - 1, d, NOTIFY_HOUR, 0, 0, 0);
    if (fireAt <= now) continue;
    out.push({ identifier: `glovebox-rule:${rule.id}:${due.dueOn}`, ruleId: rule.id, vehicleId: vehicle.id, fireAt });
  }
  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime()).slice(0, MAX_SCHEDULED);
}
