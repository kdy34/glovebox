// Exports bucket housekeeping. Export ZIPs live at exports/{uid}/{timestamp}.zip and
// expire after 24 h. export-data sweeps the caller's folder on every call; the nightly
// storage sweep (T095) schedules a sweep of the whole bucket.
import type { SupabaseClient } from '@supabase/supabase-js';

export const EXPORT_TTL_MS = 24 * 60 * 60_000;
const PAGE = 100;

async function listFolder(admin: SupabaseClient, prefix: string) {
  const out: { path: string; created_at: string | null; isFolder: boolean }[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from('exports').list(prefix, { limit: PAGE, offset });
    if (error) throw new Error('list failed in exports');
    for (const o of data ?? []) {
      out.push({ path: prefix ? `${prefix}/${o.name}` : o.name, created_at: o.created_at ?? null, isFolder: o.id === null });
    }
    if (!data || data.length < PAGE) return out;
  }
}

/** Removes exports older than 24 h, for one user or (no userId) the whole bucket. */
export async function cleanupExpiredExports(
  admin: SupabaseClient,
  opts: { userId?: string; now?: Date } = {},
): Promise<number> {
  const now = (opts.now ?? new Date()).getTime();
  const folders = opts.userId
    ? [opts.userId]
    : (await listFolder(admin, '')).filter((o) => o.isFolder).map((o) => o.path);
  let removed = 0;
  for (const folder of folders) {
    const expired = (await listFolder(admin, folder))
      .filter((o) => !o.isFolder && o.created_at && now - new Date(o.created_at).getTime() > EXPORT_TTL_MS)
      .map((o) => o.path);
    for (let i = 0; i < expired.length; i += PAGE) {
      const chunk = expired.slice(i, i + PAGE);
      const { error } = await admin.storage.from('exports').remove(chunk);
      if (error) throw new Error('remove failed in exports');
      removed += chunk.length;
    }
  }
  return removed;
}
