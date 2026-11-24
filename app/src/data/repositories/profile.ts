// Profile + entitlement reads; settings writes go through the outbox as partial updates.
import { supabase } from '../supabase';
import { enqueue } from '../sync';
import { profileUpdate, type ProfileFields } from '../writes';

export interface ProfileRow {
  id: string;
  display_name: string | null;
  distance_unit: 'mi' | 'km';
  reminder_lead_days: number;
  notifications_enabled: boolean;
}

export async function getProfile(userId: string): Promise<ProfileRow | null> {
  const { data, error } = await (supabase.from('profiles') as any)
    .select('id, display_name, distance_unit, reminder_lead_days, notifications_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as ProfileRow | null;
}

export async function updateProfile(userId: string, fields: ProfileFields): Promise<void> {
  await enqueue(profileUpdate(userId, fields));
}

/** True when the server-side entitlement is active (FR-027). */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  const { data } = await (supabase.from('entitlements') as any)
    .select('is_pro, expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  const row = data as { is_pro: boolean; expires_at: string | null } | null;
  if (!row?.is_pro) return false;
  return !row.expires_at || new Date(row.expires_at).getTime() > Date.now();
}
