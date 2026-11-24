// Service record repository: all writes go through the save_record RPC (one transaction).
import { supabase } from '../supabase';
import { enqueueWrite } from '../sync';
import type { RecordRow, LineItemRow } from '../types';

export interface LineItemInput {
  id: string;
  item_type: 'part' | 'labor' | 'fee' | 'discount';
  description: string;
  quantity: number;
  unit_price_cents: number;
  amount_cents: number;
  position: number;
}

export interface RecordInput {
  id: string;
  vehicle_id: string;
  kind: 'service' | 'expense';
  category: string;
  title: string;
  performed_on: string; // YYYY-MM-DD
  odometer?: number | null;
  shop_name?: string | null;
  shop_address?: string | null;
  is_diy?: boolean;
  currency?: string;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  notes?: string | null;
  source?: 'manual' | 'ai';
  extraction_id?: string | null;
}

export interface OdometerInput {
  id: string;
  vehicle_id: string;
  value: number;
  unit: 'mi' | 'km';
  read_on: string; // YYYY-MM-DD
  source?: 'manual' | 'record' | 'receipt';
  record_id?: string | null;
}

export interface SaveRecordArgs {
  record: RecordInput;
  items: LineItemInput[];
  odometer?: OdometerInput | null;
}

export async function saveRecord(args: SaveRecordArgs): Promise<RecordRow> {
  const { data, error } = await (supabase.rpc as any)('save_record', {
    p_record: args.record,
    p_items: args.items,
  }) as { data: RecordRow | null; error: { message: string } | null };
  if (error) {
    // If offline, queue the individual parts
    await enqueueWrite('service_records', 'upsert', args.record as unknown as Record<string, unknown>, args.record.id);
    for (const item of args.items) {
      await enqueueWrite('line_items', 'upsert', { ...item, record_id: args.record.id } as unknown as Record<string, unknown>, item.id);
    }
    if (args.odometer) {
      await enqueueWrite('odometer_readings', 'upsert', args.odometer as unknown as Record<string, unknown>, args.odometer.id);
    }
    // Return optimistic data
    return args.record as unknown as RecordRow;
  }
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
