// Reminder engine (T061, FR-020/021/022). Next due is computed here, never stored
// (data-model.md). Whichever of the time and mileage limits comes first decides; mileage is
// projected from odometer history (projection.ts), and without a projection only the time limit
// gives a date and the app asks for a reading (US3 AS2). Distances are in the vehicle's unit.
import { addDays, dateAtOdometer, odometerOn, type Projection } from './projection';
import { daysBetween } from './odometer';

export interface RuleState {
  interval_miles: number | null;
  interval_months: number | null;
  lead_days: number;
  lead_miles: number;
  last_done_on: string | null;
  last_done_odometer: number | null;
  is_active: boolean;
  created_at: string;
}

export type DueStatus = 'overdue' | 'due_soon' | 'ok' | 'unknown';

export interface Due {
  status: DueStatus;
  /** Whichever comes first of the time and the projected-mileage due dates. */
  dueOn: string | null;
  dueOdometer: number | null;
  decidedBy: 'time' | 'mileage' | null;
  timeDueOn: string | null;
  mileageDueOn: string | null;
  daysLeft: number | null;
  distanceLeft: number | null;
  /** The rule has a mileage limit but there's no projection: ask for a current reading. */
  needsOdometer: boolean;
}

export interface DueContext {
  today: string;
  projection: Projection | null;
  /** Latest included reading, in the vehicle's unit. */
  latestOdometer: number | null;
}

/** Adds months, clamping to the month's last day (Jan 31 + 1 month = Feb 28/29). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${String(ny).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(Math.min(d, lastDay)).padStart(2, '0')}`;
}

export function computeDue(rule: RuleState, ctx: DueContext): Due | null {
  if (!rule.is_active) return null;
  // Never done: count from when the rule was created and from the latest reading.
  const baseOn = rule.last_done_on ?? rule.created_at.slice(0, 10);
  const baseOdo = rule.last_done_odometer ?? (rule.last_done_on ? null : ctx.latestOdometer);

  const timeDueOn = rule.interval_months ? addMonths(baseOn, rule.interval_months) : null;
  const dueOdometer = rule.interval_miles && baseOdo !== null ? baseOdo + rule.interval_miles : null;
  const mileageDueOn = dueOdometer !== null && ctx.projection ? dateAtOdometer(ctx.projection, dueOdometer) : null;

  let dueOn: string | null = null;
  let decidedBy: Due['decidedBy'] = null;
  if (timeDueOn && (!mileageDueOn || timeDueOn <= mileageDueOn)) { dueOn = timeDueOn; decidedBy = 'time'; }
  else if (mileageDueOn) { dueOn = mileageDueOn; decidedBy = 'mileage'; }

  const currentOdo = ctx.projection ? odometerOn(ctx.projection, ctx.today) : ctx.latestOdometer;
  const daysLeft = dueOn ? daysBetween(ctx.today, dueOn) : null;
  const distanceLeft = dueOdometer !== null && currentOdo !== null ? Math.round(dueOdometer - currentOdo) : null;

  let status: DueStatus;
  if ((daysLeft !== null && daysLeft < 0) || (distanceLeft !== null && distanceLeft < 0)) status = 'overdue';
  else if ((daysLeft !== null && daysLeft <= rule.lead_days) || (distanceLeft !== null && distanceLeft <= rule.lead_miles)) status = 'due_soon';
  else if (daysLeft === null && distanceLeft === null) status = 'unknown';
  else status = 'ok';

  return {
    status, dueOn, dueOdometer, decidedBy, timeDueOn, mileageDueOn, daysLeft, distanceLeft,
    needsOdometer: !!rule.interval_miles && !ctx.projection,
  };
}

export interface ResettableRule {
  vehicle_id: string;
  service_category: string;
  is_active: boolean;
  last_done_on: string | null;
  last_done_odometer: number | null;
}

/** FR-022, the same rule save_record applies in SQL (for optimistic UI and offline). */
export function resetRule<R extends ResettableRule>(
  rule: R,
  rec: { vehicle_id: string; kind: string; category: string; performed_on: string; odometer: number | null },
): R {
  if (rec.kind !== 'service' || !rule.is_active || rec.vehicle_id !== rule.vehicle_id || rec.category !== rule.service_category) return rule;
  if (rule.last_done_on && rule.last_done_on > rec.performed_on) return rule;
  return { ...rule, last_done_on: rec.performed_on, last_done_odometer: rec.odometer ?? rule.last_done_odometer };
}

const RANK: Record<DueStatus, number> = { overdue: 0, due_soon: 1, ok: 2, unknown: 3 };

export function compareUrgency(a: Pick<Due, 'status' | 'dueOn'>, b: Pick<Due, 'status' | 'dueOn'>): number {
  return RANK[a.status] - RANK[b.status] || (a.dueOn ?? '9999').localeCompare(b.dueOn ?? '9999');
}

/** The day to notify: lead_days before the due date, today if that has passed, none once overdue. */
export function notificationDay(due: Pick<Due, 'dueOn'>, leadDays: number, today: string): string | null {
  if (!due.dueOn || due.dueOn < today) return null;
  const day = addDays(due.dueOn, -leadDays);
  return day < today ? today : day;
}
