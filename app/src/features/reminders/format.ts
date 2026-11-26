import type { TFunction } from 'i18next';
// Small display helpers shared by the reminder screens and notifications.
import type { VehicleRow } from '@/data/types';

export function formatDueDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function vehicleLabel(v: Pick<VehicleRow, 'nickname' | 'year' | 'make' | 'model'>): string {
  return v.nickname?.trim() || `${v.year} ${v.make} ${v.model}`;
}

export function formatDistance(n: number, unit: string): string {
  return `${Math.round(n).toLocaleString('en-US')} ${unit}`;
}

/** Today as a local YYYY-MM-DD (service dates are calendar dates). */
export function localToday(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Tr = TFunction;

/** "Due Oct 29, 2026 or at 155,000 mi, whichever comes first", or whichever part is known. */
export function dueText(tr: Tr, due: { dueOn: string | null; dueOdometer: number | null }, unit: string): string | null {
  const date = due.dueOn ? formatDueDate(due.dueOn) : null;
  const odo = due.dueOdometer !== null ? formatDistance(due.dueOdometer, unit) : null;
  if (date && odo) return tr('reminders.dueOnOrAt', { date, odo });
  if (date) return tr('reminders.dueOn', { date });
  if (odo) return tr('reminders.dueAt', { odo });
  return null;
}

export const STATUS_TONE = { overdue: 'danger', due_soon: 'accent', ok: 'success', unknown: 'neutral' } as const;
