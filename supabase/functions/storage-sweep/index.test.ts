// T095 — nightly storage sweep, against local Supabase (./test-local.sh):
// - attachments with no record_id older than 24 h are deleted with their files (unsaved drafts)
// - storage objects with no matching row (receipts: attachments; vehicle-photos: vehicles) older
//   than 24 h are removed; younger ones are kept (an upload may be in flight)
// - exports older than 24 h are removed
// - only a caller with the sweep secret may run it
import { assert, assertEquals } from '@std/assert';
import { createHandler } from './handler.ts';
import { sweepStorage } from '../_shared/sweep.ts';
import { addReceipt, addVehicle, createTestUser, deleteTestUser, JPEG_BYTES, jsonRequest, testAdmin } from '../_shared/testing.ts';

const DAY = 24 * 60 * 60_000;

async function exists(bucket: string, path: string): Promise<boolean> {
  const dir = path.slice(0, path.lastIndexOf('/'));
  const name = path.slice(path.lastIndexOf('/') + 1);
  const { data } = await testAdmin().storage.from(bucket).list(dir, { search: name, limit: 10 });
  return (data ?? []).some((o) => o.name === name);
}
async function rowExists(id: string): Promise<boolean> {
  const { data } = await testAdmin().from('attachments').select('id').eq('id', id).maybeSingle();
  return !!data;
}

Deno.test('storage-sweep: unlinked attachments, orphan objects and old exports', async () => {
  const u = await createTestUser('sweep');
  try {
    const admin = testAdmin();
    const vehicleId = await addVehicle(u);

    // unsaved draft from two days ago → deleted with its file
    const oldDraft = await addReceipt(u, vehicleId);
    await admin.from('attachments').update({ created_at: new Date(Date.now() - 2 * DAY).toISOString() }).eq('id', oldDraft.id);
    // unsaved draft from just now → kept (the user may still be reviewing it)
    const newDraft = await addReceipt(u, vehicleId);
    // saved record's receipt from two days ago → kept
    const linked = await addReceipt(u, vehicleId);
    const recordId = crypto.randomUUID();
    const saved = await u.db.rpc('save_record', {
      p_record: { id: recordId, vehicle_id: vehicleId, kind: 'expense', category: 'fuel', title: 'Fuel', performed_on: '2026-06-01', subtotal_cents: 100, tax_cents: 0 },
      p_items: [],
    });
    assert(!saved.error, saved.error?.message);
    await u.db.from('attachments').update({ record_id: recordId }).eq('id', linked.id);
    await admin.from('attachments').update({ created_at: new Date(Date.now() - 2 * DAY).toISOString() }).eq('id', linked.id);
    // a receipt file with no attachments row (the row insert failed) → orphan
    const orphan = `${u.id}/${crypto.randomUUID()}.jpg`;
    assert(!(await u.db.storage.from('receipts').upload(orphan, JPEG_BYTES, { contentType: 'image/jpeg' })).error);
    // vehicle photos: one for a live vehicle, one for a vehicle that no longer exists
    const photo = `${u.id}/${vehicleId}/cover.jpg`;
    const strayPhoto = `${u.id}/${crypto.randomUUID()}/cover.jpg`;
    for (const p of [photo, strayPhoto]) {
      assert(!(await u.db.storage.from('vehicle-photos').upload(p, JPEG_BYTES, { contentType: 'image/jpeg' })).error);
    }

    // run 1, now: only the old unlinked draft goes; fresh orphans are within the grace period
    const r1 = await sweepStorage(admin, { onlyUsers: [u.id] }); // scoped: the local DB may hold dev data
    assert(r1.unlinkedAttachments >= 1);
    assertEquals(await rowExists(oldDraft.id), false, 'old unlinked attachment row deleted');
    assertEquals(await exists('receipts', oldDraft.path), false, 'and its file');
    assertEquals(await rowExists(newDraft.id), true, 'a fresh unlinked attachment is kept');
    assertEquals(await rowExists(linked.id), true, 'a linked attachment is kept');
    assertEquals(await exists('receipts', orphan), true, 'a fresh orphan file is kept (upload may be in flight)');
    assertEquals(await exists('vehicle-photos', strayPhoto), true);

    // run 2, two days later: orphans past the grace period go; linked data stays
    const r2 = await sweepStorage(admin, { now: new Date(Date.now() + 2 * DAY), onlyUsers: [u.id] });
    assert(r2.orphanObjects >= 2);
    assertEquals(await exists('receipts', orphan), false, 'orphan receipt file removed');
    assertEquals(await exists('vehicle-photos', strayPhoto), false, "photo of a deleted vehicle removed");
    assertEquals(await exists('vehicle-photos', photo), true, "a live vehicle's photo is kept");
    assertEquals(await rowExists(linked.id), true);
    assertEquals(await exists('receipts', linked.path), true, "a saved record's receipt file is kept");
    assertEquals(await rowExists(newDraft.id), false, 'the other draft is now old and unlinked, so it goes too');
  } finally {
    await deleteTestUser(u);
  }
});

Deno.test('storage-sweep: requires the sweep secret', async () => {
  Deno.env.set('SWEEP_SECRET', 'test-sweep-secret');
  const handler = createHandler({ sweep: () => Promise.resolve({ unlinkedAttachments: 0, orphanObjects: 0, expiredExports: 0 }) });
  assertEquals((await handler(jsonRequest('storage-sweep', {}))).status, 401);
  const wrong = new Request('http://127.0.0.1/functions/v1/storage-sweep', { method: 'POST', headers: { 'x-sweep-secret': 'nope' } });
  assertEquals((await handler(wrong)).status, 401);
  const ok = new Request('http://127.0.0.1/functions/v1/storage-sweep', { method: 'POST', headers: { 'x-sweep-secret': 'test-sweep-secret' } });
  const res = await handler(ok);
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { unlinkedAttachments: 0, orphanObjects: 0, expiredExports: 0 });
  Deno.env.delete('SWEEP_SECRET');
  assertEquals((await handler(ok)).status, 401, 'no secret configured → nobody may run it');
});
