// Mileage projection (T061, research R6): least-squares distance per day over the last 180 days
// of included readings; at least 2 readings at least 14 days apart. Values are in the vehicle's
// unit. Without a projection the reminder engine uses the time limit only (US3 AS2).
import { daysBetween, toMiles, type DistanceUnit, type Reading } from './odometer';

export const WINDOW_DAYS = 180;
export const MIN_SPAN_DAYS = 14;
const KM_PER_MILE = 1.609344;

export interface Projection {
  /** Distance per day, in the vehicle's unit; ≥ 0. */
  perDay: number;
  /** The latest included reading; projections start from it. */
  anchor: { readOn: string; value: number };
}

const toUnit = (value: number, from: DistanceUnit, to: DistanceUnit) => {
  const miles = toMiles(value, from);
  return to === 'km' ? miles * KM_PER_MILE : miles;
};

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function projectMileage(readings: readonly Reading[], today: string, unit: DistanceUnit): Projection | null {
  const since = addDays(today, -WINDOW_DAYS);
  const pts = readings
    .filter((r) => !r.isExcluded && r.readOn >= since && r.readOn <= today)
    .map((r) => ({ x: daysBetween(since, r.readOn), y: toUnit(r.value, r.unit, unit), readOn: r.readOn }))
    .sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 2 || pts.at(-1)!.x - pts[0]!.x < MIN_SPAN_DAYS) return null;

  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (const p of pts) { sxy += (p.x - mx) * (p.y - my); sxx += (p.x - mx) ** 2; }
  const slope = sxy / sxx;
  if (slope < 0) return null; // readings going down: not something to project from
  const last = pts.at(-1)!;
  return { perDay: slope, anchor: { readOn: last.readOn, value: last.y } };
}

export function odometerOn(p: Projection, date: string): number {
  return p.anchor.value + p.perDay * daysBetween(p.anchor.readOn, date);
}

/** The first day the projected odometer reaches `target`; null if the car isn't being driven. */
export function dateAtOdometer(p: Projection, target: number): string | null {
  const remaining = target - p.anchor.value;
  if (remaining <= 0) return p.anchor.readOn;
  if (p.perDay <= 0) return null;
  return addDays(p.anchor.readOn, Math.ceil(remaining / p.perDay - 1e-9));
}
