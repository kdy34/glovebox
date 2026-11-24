// Clients for Edge Functions.
//  - userClient: acts as the caller (RLS applies) — preferred whenever possible.
//  - adminClient: service role — only for server-written tables and storage cleanup.
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2';
import { HttpError } from './errors.ts';

const url = () => Deno.env.get('SUPABASE_URL')!;

export function adminClient(): SupabaseClient {
  return createClient(url(), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function userClient(req: Request): SupabaseClient {
  const authorization = req.headers.get('Authorization') ?? '';
  return createClient(url(), Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Verifies the caller's JWT with Supabase Auth. Throws `unauthorized` otherwise. */
export async function requireUser(req: Request): Promise<{ user: User; db: SupabaseClient }> {
  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) throw new HttpError('unauthorized');
  const db = userClient(req);
  const { data, error } = await db.auth.getUser(authorization.slice('Bearer '.length));
  if (error || !data.user) throw new HttpError('unauthorized');
  return { user: data.user, db };
}

/** Constant-time string compare for shared secrets (webhooks). */
export function safeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}
