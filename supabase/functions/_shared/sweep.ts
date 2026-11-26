// Nightly storage sweep (T095). Runs with the service role.
// 1. Attachments with no record_id older than 24 h (scans the user never saved) are deleted
//    together with their files; their receipt_extractions rows cascade.
// 2. Objects with no matching row older than 24 h are removed: receipts without an attachments
//    row, vehicle photos without a vehicles row ({uid}/{vehicle_id}/...). Younger objects are
//    kept, because the app uploads the file before it inserts the row.
// 3. Exports older than 24 h are removed (cleanupExpiredExports).
import type { SupabaseClient } from '@supabase/supabase-js';
import { cleanupExpiredExports } from './exports.ts';

export const SWEEP_GRACE_MS = 24 * 60 * 60_000;
const PAGE = 100;
const ROWS = 1000;

export interface SweepResult {
  unlinkedAttachments: number;
  orphanObjects: number;
  expiredExports: number;
}

interface Obj { path: string; createdAt: number | null }

async function listObjects(admin: SupabaseClient, bucket: string, prefix: string): Promise<Obj[]> {
  const out: Obj[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list failed in ${bucket}`);
    for (const o of data ?? []) {
      const path = prefix ? `${prefix}/${o.name}` : o.name;
      if (o.id === null) out.push(...(await listObjects(admin, bucket, path)));
      else out.push({ path, createdAt: o.created_at ? new Date(o.created_at).getTime() : null });
    }
    if (!data || data.length < PAGE) return out;
  }
}

async function remove(admin: SupabaseClient, bucket: string, paths: string[]): Promise<number> {
  for (let i = 0; i < paths.length; i += PAGE) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(i, i + PAGE));
    if (error) throw new Error(`remove failed in ${bucket}`);
  }
  return paths.length;
}

async function allRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += ROWS) {
    const { data, error } = await fetchPage(from, from + ROWS - 1);
    if (error) throw new Error('select failed');
    out.push(...(data ?? []));
    if (!data || data.length < ROWS) return out;
  }
}

export async function sweepStorage(
  admin: SupabaseClient,
  opts: { now?: Date; onlyUsers?: string[] } = {},
): Promise<SweepResult> {
  const now = (opts.now ?? new Date()).getTime();
  const cutoff = new Date(now - SWEEP_GRACE_MS).toISOString();
  const scope = opts.onlyUsers;

  // 1. unlinked attachments
  const unlinked = await allRows<{ id: string; storage_path: string }>((from, to) => {
    let q = admin.from('attachments').select('id, storage_path').is('record_id', null).lt('created_at', cutoff);
    if (scope) q = q.in('user_id', scope);
    return q.order('id').range(from, to);
  });
  if (unlinked.length) {
    await remove(admin, 'receipts', unlinked.map((a) => a.storage_path));
    for (let i = 0; i < unlinked.length; i += ROWS) {
      const { error } = await admin.from('attachments').delete().in('id', unlinked.slice(i, i + ROWS).map((a) => a.id));
      if (error) throw new Error('delete failed in attachments');
    }
  }

  // 2. orphan objects
  const old = (o: Obj) => o.createdAt !== null && now - o.createdAt > SWEEP_GRACE_MS;
  const folders = async (bucket: string) =>
    scope ?? (await admin.storage.from(bucket).list('', { limit: 10_000 })).data?.filter((o) => o.id === null).map((o) => o.name) ?? [];

  const attachmentPaths = new Set((await allRows<{ storage_path: string }>((from, to) => {
    let q = admin.from('attachments').select('storage_path');
    if (scope) q = q.in('user_id', scope);
    return q.order('id').range(from, to);
  })).map((a) => a.storage_path));
  const vehicleIds = new Set((await allRows<{ id: string }>((from, to) => {
    let q = admin.from('vehicles').select('id');
    if (scope) q = q.in('user_id', scope);
    return q.order('id').range(from, to);
  })).map((v) => v.id));

  let orphanObjects = 0;
  for (const folder of await folders('receipts')) {
    const objs = (await listObjects(admin, 'receipts', folder)).filter((o) => old(o) && !attachmentPaths.has(o.path));
    orphanObjects += await remove(admin, 'receipts', objs.map((o) => o.path));
  }
  for (const folder of await folders('vehicle-photos')) {
    const objs = (await listObjects(admin, 'vehicle-photos', folder))
      .filter((o) => old(o) && !vehicleIds.has(o.path.split('/')[1] ?? ''));
    orphanObjects += await remove(admin, 'vehicle-photos', objs.map((o) => o.path));
  }

  // 3. exports
  let expiredExports = 0;
  if (scope) for (const userId of scope) expiredExports += await cleanupExpiredExports(admin, { userId, now: new Date(now) });
  else expiredExports = await cleanupExpiredExports(admin, { now: new Date(now) });

  return { unlinkedAttachments: unlinked.length, orphanObjects, expiredExports };
}
