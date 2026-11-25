// Odometer repository: reads and writes odometer readings.
import { newId } from '../ids';
import { supabase } from '../supabase';
import { enqueue, enqueueWrite } from '../sync';
import { odometerExclude } from '../writes';
import type { OdometerRow } from '../types';

export interface OdometerInput {
  vehicle_id: string;
  value: number;
  unit: 'mi' | 'km';
  read_on: string; // YYYY-MM-DD
  is_excluded?: boolean;
  record_id?: string | null;
  source?: 'manual' | 'record' | 'receipt';
}

export async function listOdometerReadings(vehicleId: string): Promise<OdometerRow[]> {
  const { data, error } = await supabase
    .from('odometer_readings')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('read_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveOdometerReading(input: OdometerInput & { id?: string }): Promise<string> {
  const id = input.id ?? newId();
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    id,
    vehicle_id: input.vehicle_id,
    value: input.value,
    unit: input.unit,
    read_on: input.read_on,
    is_excluded: input.is_excluded ?? false,
    source: input.source ?? 'manual',
    record_id: input.record_id ?? null,
    updated_at: now,
  };
  await enqueueWrite('odometer_readings', 'upsert', payload, id);
  return id;
}

export async function excludeOdometerReading(id: string): Promise<void> {
  await enqueue(odometerExclude(id));
}
