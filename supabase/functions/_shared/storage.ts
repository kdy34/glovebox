// Storage helpers shared by delete-account, export-data and the cleanup sweep.
import type { SupabaseClient } from '@supabase/supabase-js';

export const USER_BUCKETS = ['receipts', 'vehicle-photos', 'exports'] as const;
const PAGE = 100;

/** Every object path under `prefix`, recursing into folders and paging through results. */
export async function listAll(client: SupabaseClient, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await client.storage.from(bucket).list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list failed in ${bucket}`);
    for (const o of data ?? []) {
      const path = `${prefix}/${o.name}`;
      // Folders come back with a null id.
      if (o.id === null) out.push(...(await listAll(client, bucket, path)));
      else out.push(path);
    }
    if (!data || data.length < PAGE) return out;
  }
}

/** Removes every object under `{userId}/` in the user buckets. Returns how many were removed. */
export async function purgeUserStorage(admin: SupabaseClient, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of USER_BUCKETS) {
    const paths = await listAll(admin, bucket, userId);
    for (let i = 0; i < paths.length; i += PAGE) {
      const chunk = paths.slice(i, i + PAGE);
      const { error } = await admin.storage.from(bucket).remove(chunk);
      if (error) throw new Error(`remove failed in ${bucket}`);
      removed += chunk.length;
    }
  }
  return removed;
}
