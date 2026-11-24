// Vehicle repository: wraps Supabase reads and routes writes through the outbox.
import { v4 as uuid } from 'uuid';
import { supabase } from '../supabase';
import { enqueue, enqueueWrite } from '../sync';
import { vehicleArchive, vehicleUnarchive } from '../writes';
import type { VehicleRow } from '../types';

export type VehicleInput = Omit<VehicleRow, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'archived_at'>;

export async function listVehicles(): Promise<VehicleRow[]> {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .neq('status', 'archived')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getVehicle(id: string): Promise<VehicleRow | null> {
  const { data, error } = await supabase.from('vehicles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveVehicle(input: VehicleInput & { id?: string }): Promise<string> {
  const id = input.id ?? uuid();
  const now = new Date().toISOString();
  const payload = {
    ...input,
    id,
    created_at: input.id ? undefined : now,
    updated_at: now,
  };
  // Remove undefined fields
  const clean = Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined));
  await enqueueWrite('vehicles', 'upsert', clean, id);
  return id;
}

export async function archiveVehicle(id: string): Promise<void> {
  await enqueue(vehicleArchive(id, new Date().toISOString()));
}

export async function unarchiveVehicle(id: string): Promise<void> {
  await enqueue(vehicleUnarchive(id));
}

export async function deleteVehicle(id: string): Promise<void> {
  await enqueueWrite('vehicles', 'delete', { id }, id);
}
