// Outbox entries for partial changes (T099). Pure TypeScript so they can be tested.
// These go out as UPDATE ... WHERE id = $id. An upsert would be INSERT ... ON CONFLICT,
// which fails NOT NULL (23502) for any payload that isn't a full row.
// updated_at is set by the set_updated_at trigger, so it isn't sent.
import type { NewOutboxEntry } from './outbox';

export function vehicleArchive(id: string, nowIso: string): NewOutboxEntry {
  return { id, table: 'vehicles', operation: 'update', payload: { status: 'archived', archived_at: nowIso } };
}

export function vehicleUnarchive(id: string): NewOutboxEntry {
  return { id, table: 'vehicles', operation: 'update', payload: { status: 'active', archived_at: null } };
}

export function odometerExclude(id: string): NewOutboxEntry {
  return { id, table: 'odometer_readings', operation: 'update', payload: { is_excluded: true } };
}
