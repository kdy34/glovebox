// Service record repository: all writes go through the save_record RPC (one transaction).
import { supabase } from '../supabase';
import { enqueue, enqueueWrite, isOffline } from '../sync';
import { saveRecordOrQueue, type RpcResponse, type SaveRecordArgs } from '../recordSave';
import type { RecordRow, LineItemRow } from '../types';

export type { LineItemInput, RecordInput, SaveRecordArgs } from '../recordSave';
export { RecordSaveError } from '../recordSave';

/**
 * Saves via the save_record RPC (record, line items, linked odometer reading and rule
 * reset in one transaction). Offline or on a network error the same RPC is queued in the
 * outbox (T096/T097). Validation / DB errors throw RecordSaveError and are never queued.
 */
export async function saveRecord(args: SaveRecordArgs): Promise<RecordRow> {
  const { data } = await saveRecordOrQueue(args, {
    isOffline,
    rpc: async (fn, rpcArgs) => (await (supabase.rpc as any)(fn, rpcArgs)) as RpcResponse,
    enqueue,
  });
  return data as RecordRow;
}

export async function listRecords(vehicleId: string): Promise<RecordRow[]> {
  const { data, error } = await supabase
    .from('service_records')
    .select('*')
    .eq('vehicle_id', vehicleId)
    .order('performed_on', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function getRecord(id: string): Promise<RecordRow | null> {
  const { data, error } = await supabase.from('service_records').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function getLineItems(recordId: string): Promise<LineItemRow[]> {
  const { data, error } = await supabase
    .from('line_items')
    .select('*')
    .eq('record_id', recordId)
    .order('position', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function deleteRecord(id: string): Promise<void> {
  await enqueueWrite('service_records', 'delete', { id }, id);
}
