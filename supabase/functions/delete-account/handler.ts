// delete-account (T042, contracts/edge-functions.md): permanently deletes the caller's
// account and data. Order: storage → share links → Apple revoke (best effort) → auth user
// (rows cascade). A failed step still deletes the user and returns partial_failure;
// the nightly orphan sweep (T095) finishes the cleanup.
import type { User } from '@supabase/supabase-js';
import { adminClient, requireUser } from '../_shared/auth.ts';
import { handle, HttpError, json } from '../_shared/errors.ts';
import { purgeUserStorage } from '../_shared/storage.ts';
import { revokeAppleToken } from '../_shared/apple.ts';

export interface DeleteAccountDeps {
  /** Audit sink. Lines never contain a user id or email. */
  log?: (line: string) => void;
  revokeApple?: (user: User, body: Record<string, unknown>) => Promise<void>;
  /** Removes the user's storage objects; returns how many. */
  purgeStorage?: (userId: string) => Promise<number>;
  now?: () => Date;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function createHandler(deps: DeleteAccountDeps = {}) {
  const log = deps.log ?? ((line: string) => console.log(line));
  const purgeStorage = deps.purgeStorage ?? ((uid: string) => purgeUserStorage(adminClient(), uid));
  const revokeApple = deps.revokeApple ?? revokeAppleToken;
  const now = deps.now ?? (() => new Date());

  return handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError('bad_request');
    const { user } = await requireUser(req);
    const body: unknown = await req.json().catch(() => null);
    if (!isObj(body) || body.confirm !== 'DELETE') throw new HttpError('confirmation_required');

    const admin = adminClient();
    const failed: string[] = [];
    let files = 0;

    try {
      files = await purgeStorage(user.id);
    } catch {
      failed.push('storage');
    }

    // Revoke first so links stop working even if the user delete below fails.
    const { error: linkErr } = await admin
      .from('share_links')
      .update({ revoked_at: now().toISOString() })
      .eq('user_id', user.id)
      .is('revoked_at', null);
    if (linkErr) failed.push('share_links');

    let appleRevoke: 'done' | 'failed' = 'done';
    try {
      await revokeApple(user, body);
    } catch {
      appleRevoke = 'failed'; // best effort: the user can also revoke in Apple ID settings
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
    if (deleteErr) failed.push('auth_user');

    log(
      JSON.stringify({
        event: failed.length ? 'account_delete_partial' : 'account_deleted',
        files,
        failed,
        apple_revoke: appleRevoke,
        at: now().toISOString(),
      }),
    );
    if (failed.length) throw new HttpError('partial_failure');
    return json({ deleted: true });
  });
}
