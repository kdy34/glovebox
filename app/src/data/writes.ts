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

export interface ProfileFields {
  display_name?: string | null;
  distance_unit?: 'mi' | 'km';
  reminder_lead_days?: number;
  notifications_enabled?: boolean;
}

/** Settings changes (T044). An update keyed by the user id: profiles has no insert policy. */
export function profileUpdate(userId: string, fields: ProfileFields): NewOutboxEntry {
  if (fields.distance_unit !== undefined && fields.distance_unit !== 'mi' && fields.distance_unit !== 'km') {
    throw new Error('distance_unit must be mi or km');
  }
  const lead = fields.reminder_lead_days;
  if (lead !== undefined && (!Number.isInteger(lead) || lead < 0 || lead > 90)) {
    throw new Error('reminder_lead_days must be an integer 0–90');
  }
  if (fields.display_name && fields.display_name.length > 80) throw new Error('display_name is too long');
  return { id: userId, table: 'profiles', operation: 'update', payload: { ...fields } };
}

/** US2: link the receipt image to the record it became (a partial update; RLS checks ownership). */
export function attachmentLink(attachmentId: string, recordId: string): NewOutboxEntry {
  return { id: attachmentId, table: 'attachments', operation: 'update', payload: { record_id: recordId } };
}

/**
 * US2 / SC-003: which draft fields the user corrected. Only `corrected_fields` may be sent:
 * the client's grant on receipt_extractions covers that one column.
 */
export function extractionCorrections(extractionId: string, fields: readonly string[]): NewOutboxEntry & { payload: { corrected_fields: string[] } } {
  // 10 draft fields + at most 60 line items
  const corrected_fields = [...new Set(fields)].slice(0, 70);
  return { id: extractionId, table: 'receipt_extractions', operation: 'update', payload: { corrected_fields } };
}
