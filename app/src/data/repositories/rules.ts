// Maintenance rules repository (T062). Reads from Supabase; writes go through the outbox.
// Next due is computed on the device (domain/reminders.ts), never stored.
import { newId } from '../ids';
import { supabase } from '../supabase';
import { enqueue, enqueueWrite } from '../sync';
import { ruleActive, ruleUpsert } from '../writes';
import type { MaintenanceRuleRow } from '../types';
import type { RuleFields } from '@/domain/ruleForm';

export async function listRules(vehicleId: string): Promise<MaintenanceRuleRow[]> {
  const { data, error } = await supabase.from('maintenance_rules').select('*').eq('vehicle_id', vehicleId).order('created_at');
  if (error) throw error;
  return data ?? [];
}

/** Every rule of the signed-in user (RLS), for the Reminders tab and notifications. */
export async function listAllRules(): Promise<MaintenanceRuleRow[]> {
  const { data, error } = await supabase.from('maintenance_rules').select('*').order('created_at');
  if (error) throw error;
  return data ?? [];
}

export interface SaveRuleArgs {
  id?: string;
  vehicleId: string;
  fields: RuleFields;
  /** New rules only. */
  source?: 'generic' | 'owners_manual' | 'user';
  baseline?: { last_done_on: string; last_done_odometer: number | null } | null;
}

export async function saveRule(args: SaveRuleArgs): Promise<string> {
  const id = args.id ?? newId();
  await enqueue(ruleUpsert(id, args.vehicleId, args.fields, args.id ? {} : { source: args.source ?? 'user', baseline: args.baseline }));
  return id;
}

export async function setRuleActive(id: string, isActive: boolean): Promise<void> {
  await enqueue(ruleActive(id, isActive));
}

export async function deleteRule(id: string): Promise<void> {
  await enqueueWrite('maintenance_rules', 'delete', { id }, id);
}
