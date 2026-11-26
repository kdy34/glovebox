// storage-sweep (T095): run nightly by pg_cron (supabase/cron/storage-sweep.sql). Not for
// clients: the caller must send the SWEEP_SECRET function secret in `x-sweep-secret`.
import { adminClient } from '../_shared/auth.ts';
import { HttpError, handle, json } from '../_shared/errors.ts';
import { sweepStorage, type SweepResult } from '../_shared/sweep.ts';

function sameSecret(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i]! ^ y[i]!;
  return diff === 0;
}

export function createHandler(deps: { sweep?: () => Promise<SweepResult> } = {}) {
  return handle(async (req) => {
    const secret = Deno.env.get('SWEEP_SECRET');
    const given = req.headers.get('x-sweep-secret') ?? '';
    if (!secret || !sameSecret(given, secret)) throw new HttpError('unauthorized');
    if (req.method !== 'POST') throw new HttpError('bad_request');
    const result = await (deps.sweep ?? (() => sweepStorage(adminClient())))();
    return json(result);
  });
}
