// T040 — delete-account: confirmation required, storage purged, user deleted, other users untouched.
// Runs against local Supabase: ./test-local.sh
import { assert, assertEquals, assertFalse } from '@std/assert';
import { createHandler } from './handler.ts';
import {
  addReceipt,
  addVehicle,
  createTestUser,
  deleteTestUser,
  JPEG_BYTES,
  jsonRequest,
  listAll,
  readJson,
  testAdmin,
  type TestUser,
} from '../_shared/testing.ts';

const quiet = { log: () => {} };

/** Gives the user a receipt, a nested vehicle photo, an old export and a share link. */
async function seed(user: TestUser) {
  const admin = testAdmin();
  const vehicleId = await addVehicle(user);
  const receipt = await addReceipt(user, vehicleId);
  const photo = `${user.id}/${vehicleId}/cover.jpg`;
  const up = await user.db.storage.from('vehicle-photos').upload(photo, JPEG_BYTES, { contentType: 'image/jpeg' });
  if (up.error) throw new Error(up.error.message);
  const exp = await admin.storage
    .from('exports')
    .upload(`${user.id}/2026-11-01.zip`, new Uint8Array([0x50, 0x4b, 3, 4]), { contentType: 'application/zip' });
  if (exp.error) throw new Error(exp.error.message);
  const link = await user.db.from('share_links').insert({ vehicle_id: vehicleId }).select('token').single();
  if (link.error) throw new Error(link.error.message);
  return { vehicleId, receipt, photo, token: link.data.token as string };
}

async function objectCount(userId: string): Promise<number> {
  const admin = testAdmin();
  let n = 0;
  for (const b of ['receipts', 'vehicle-photos', 'exports']) n += (await listAll(admin, b, userId)).length;
  return n;
}

Deno.test('delete-account: 401 without a valid JWT', async () => {
  const res = await createHandler(quiet)(jsonRequest('delete-account', { confirm: 'DELETE' }));
  assertEquals(res.status, 401);
  assertEquals(((await readJson(res)).error as { code: string }).code, 'unauthorized');
});

Deno.test('delete-account: 400 confirmation_required unless confirm is exactly "DELETE"', async () => {
  const a = await createTestUser('del-confirm');
  try {
    for (const body of [{}, { confirm: 'delete' }, { confirm: true }, null]) {
      const res = await createHandler(quiet)(jsonRequest('delete-account', body, a.jwt));
      assertEquals(res.status, 400, JSON.stringify(body));
      assertEquals(((await readJson(res)).error as { code: string }).code, 'confirmation_required');
    }
    const still = await testAdmin().auth.admin.getUserById(a.id);
    assert(still.data.user, 'user is not deleted without confirmation');
  } finally {
    await deleteTestUser(a);
  }
});

Deno.test('delete-account: purges storage, deletes the user and rows, leaves other users alone', async () => {
  const a = await createTestUser('del-a');
  const b = await createTestUser('del-b');
  const admin = testAdmin();
  const logs: string[] = [];
  try {
    const seededA = await seed(a);
    const seededB = await seed(b);
    assertEquals(await objectCount(a.id), 3);

    const res = await createHandler({ log: (l) => logs.push(l) })(jsonRequest('delete-account', { confirm: 'DELETE' }, a.jwt));
    assertEquals(res.status, 200);
    assertEquals(await res.json(), { deleted: true });

    // storage purged, including the nested vehicle photo
    assertEquals(await objectCount(a.id), 0, "A's files are gone from all three buckets");
    // auth user deleted, rows cascaded
    const gone = await admin.auth.admin.getUserById(a.id);
    assertFalse(gone.data.user, 'auth user deleted');
    const { count: vehicles } = await admin.from('vehicles').select('id', { count: 'exact', head: true }).eq('user_id', a.id);
    assertEquals(vehicles, 0);
    const { count: links } = await admin.from('share_links').select('id', { count: 'exact', head: true }).eq('token', seededA.token);
    assertEquals(links, 0, "A's share links no longer resolve");

    // B untouched
    assertEquals(await objectCount(b.id), 3, "B's files are intact");
    const { data: bVehicle } = await admin.from('vehicles').select('id').eq('id', seededB.vehicleId).maybeSingle();
    assert(bVehicle, "B's vehicle is intact");
    const { data: bLink } = await admin.from('share_links').select('revoked_at').eq('token', seededB.token).single();
    assertEquals(bLink?.revoked_at, null, "B's share link still works");

    // anonymized audit line
    assertEquals(logs.length, 1);
    assertFalse(logs[0]!.includes(a.id), 'audit log has no user id');
    assertFalse(logs[0]!.includes(a.email), 'audit log has no email');
    const audit = JSON.parse(logs[0]!);
    assertEquals(audit.event, 'account_deleted');
    assertEquals(audit.files, 3);
  } finally {
    await deleteTestUser(a);
    await deleteTestUser(b);
  }
});

Deno.test('delete-account: a failing Apple revoke does not block deletion', async () => {
  const a = await createTestUser('del-apple');
  try {
    const res = await createHandler({
      ...quiet,
      revokeApple: () => Promise.reject(new Error('apple is down')),
    })(jsonRequest('delete-account', { confirm: 'DELETE' }, a.jwt));
    assertEquals(res.status, 200);
    assertFalse((await testAdmin().auth.admin.getUserById(a.id)).data.user);
  } finally {
    await deleteTestUser(a);
  }
});

Deno.test('delete-account: a storage failure still deletes the user and reports partial_failure', async () => {
  const a = await createTestUser('del-partial');
  const logs: string[] = [];
  try {
    const res = await createHandler({
      log: (l) => logs.push(l),
      purgeStorage: () => Promise.reject(new Error(`storage down for ${a.id}`)),
    })(jsonRequest('delete-account', { confirm: 'DELETE' }, a.jwt));
    assertEquals(res.status, 500);
    assertEquals(((await readJson(res)).error as { code: string }).code, 'partial_failure');
    assertFalse((await testAdmin().auth.admin.getUserById(a.id)).data.user, 'user deleted anyway');
    assertFalse(logs.join('\n').includes(a.id), 'error logs carry no user id');
  } finally {
    await deleteTestUser(a);
  }
});
