// Odometer readings: rollback detection, implausible jumps, unit handling.

export type DistanceUnit = 'mi' | 'km';

export interface Reading {
  value: number;
  unit: DistanceUnit;
  /** ISO calendar date, YYYY-MM-DD */
  readOn: string;
  isExcluded: boolean;
}

export type NewReading = Omit<Reading, 'isExcluded'>;

export type ReadingCheck =
  | { ok: true }
  | { ok: false; warning: 'rollback'; previous: number }
  | { ok: false; warning: 'implausible_jump'; milesPerDay: number };

const KM_PER_MILE = 1.609344;
const MAX_PLAUSIBLE_MILES_PER_DAY = 5000;

export function toMiles(value: number, unit: DistanceUnit): number {
  return unit === 'km' ? value / KM_PER_MILE : value;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function sortedIncluded(readings: readonly Reading[]): Reading[] {
  return readings.filter((r) => !r.isExcluded).sort((a, b) => a.readOn.localeCompare(b.readOn) || a.value - b.value);
}

export function latestIncluded(readings: readonly Reading[]): Reading | undefined {
  return sortedIncluded(readings).at(-1);
}

/**
 * Checks a new reading against history. A reading is compared with the latest
 * included reading on or before its date, so back-dated entries are allowed when
 * they fit the timeline.
 */
export function checkNewReading(readings: readonly Reading[], next: NewReading): ReadingCheck {
  const history = sortedIncluded(readings);
  const before = history.filter((r) => r.readOn <= next.readOn).at(-1);
  const nextMiles = toMiles(next.value, next.unit);

  if (before) {
    const prevMiles = toMiles(before.value, before.unit);
    if (nextMiles < prevMiles) return { ok: false, warning: 'rollback', previous: before.value };
    const days = Math.max(daysBetween(before.readOn, next.readOn), 1);
    const perDay = (nextMiles - prevMiles) / days;
    if (perDay > MAX_PLAUSIBLE_MILES_PER_DAY) {
      return { ok: false, warning: 'implausible_jump', milesPerDay: Math.round(perDay) };
    }
  }

  const after = history.find((r) => r.readOn > next.readOn);
  if (after && nextMiles > toMiles(after.value, after.unit)) {
    // back-dated reading higher than a later one — also a rollback relative to the timeline
    return { ok: false, warning: 'rollback', previous: after.value };
  }
  return { ok: true };
}
