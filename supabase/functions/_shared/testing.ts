// Test helpers for Edge Function tests against the local Supabase stack.
// Run with ./test-local.sh, which exports SUPABASE_URL / SUPABASE_ANON_KEY /
// SUPABASE_SERVICE_ROLE_KEY from `supabase status`. Not imported by any function.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { listAll } from './storage.ts';

function need(name: string): string {
  const v = Deno.env.get(name);
  if (!v) throw new Error(`${name} is not set. Run the tests with supabase/functions/test-local.sh.`);
  return v;
}

const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export function testAdmin(): SupabaseClient {
  return createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), opts);
}

export interface TestUser {
  id: string;
  email: string;
  jwt: string;
  /** Client acting as this user (RLS applies). */
  db: SupabaseClient;
}

/** Creates a confirmed email user and signs them in. Delete with deleteTestUser in `finally`. */
export async function createTestUser(label = 'user'): Promise<TestUser> {
  const email = `${label}-${crypto.randomUUID()}@test.glovebox.dev`;
  const password = `pw-${crypto.randomUUID()}`;
  const admin = testAdmin();
  const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr || !created.user) throw new Error(`createUser failed: ${createErr?.message}`);
  const anon = createClient(need('SUPABASE_URL'), need('SUPABASE_ANON_KEY'), opts);
  const { data: session, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
  if (signInErr || !session.session) throw new Error(`signIn failed: ${signInErr?.message}`);
  const jwt = session.session.access_token;
  const db = createClient(need('SUPABASE_URL'), need('SUPABASE_ANON_KEY'), {
    ...opts,
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  return { id: created.user.id, email, jwt, db };
}

/** Removes a test user, their storage objects and (by cascade) their rows. Ignores "already gone". */
export async function deleteTestUser(user: TestUser | undefined): Promise<void> {
  if (!user) return;
  const admin = testAdmin();
  for (const bucket of ['receipts', 'vehicle-photos', 'exports']) {
    const paths = await listAll(admin, bucket, user.id);
    if (paths.length) await admin.storage.from(bucket).remove(paths);
  }
  await admin.auth.admin.deleteUser(user.id).catch(() => undefined);
}

export { listAll } from './storage.ts';

/** A tiny but valid JPEG (1×1). */
export const JPEG_BYTES = Uint8Array.from(atob(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
), (c) => c.charCodeAt(0));

export function jsonRequest(path: string, body: unknown, jwt?: string, method = 'POST'): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  return new Request(`http://127.0.0.1/functions/v1/${path}`, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
}

/** Inserts a vehicle for the user (through RLS) and returns its id. */
export async function addVehicle(user: TestUser, make = 'Toyota'): Promise<string> {
  const id = crypto.randomUUID();
  const { error } = await user.db.from('vehicles').insert({ id, year: 2009, make, model: 'Prius' });
  if (error) throw new Error(`addVehicle: ${error.message}`);
  return id;
}

/** Uploads a receipt image and creates its attachments row. Returns the attachment id and path. */
export async function addReceipt(
  user: TestUser,
  vehicleId: string,
  bytes: Uint8Array = JPEG_BYTES,
  mime = 'image/jpeg',
): Promise<{ id: string; path: string }> {
  const id = crypto.randomUUID();
  const ext = mime === 'application/pdf' ? 'pdf' : mime.split('/')[1];
  const path = `${user.id}/${id}.${ext}`;
  const up = await user.db.storage.from('receipts').upload(path, bytes, { contentType: mime });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  const { error } = await user.db
    .from('attachments')
    .insert({ id, vehicle_id: vehicleId, storage_path: path, mime_type: mime, bytes: bytes.byteLength });
  if (error) throw new Error(`attachment row: ${error.message}`);
  return { id, path };
}

export async function readJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}
