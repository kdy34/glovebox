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
