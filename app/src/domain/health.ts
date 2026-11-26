// A car's reminder health (T066): the share of its known reminders that are on track, for the
// progress ring, and the overdue / due-soon counts for the Garage chips.
import type { DueStatus } from './reminders';

export interface Health {
  score: number;
  overdue: number;
  dueSoon: number;
  tracked: number;
  tone: 'danger' | 'accent' | 'success';
}

export function vehicleHealth(dues: readonly { status: DueStatus }[]): Health | null {
  const known = dues.filter((d) => d.status !== 'unknown');
  if (!known.length) return null;
  const overdue = known.filter((d) => d.status === 'overdue').length;
  const dueSoon = known.filter((d) => d.status === 'due_soon').length;
  const ok = known.length - overdue - dueSoon;
  return { score: ok / known.length, overdue, dueSoon, tracked: known.length, tone: overdue ? 'danger' : dueSoon ? 'accent' : 'success' };
}
