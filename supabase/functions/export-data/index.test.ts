// T041 — export-data: the ZIP contains JSON, CSV and files, only for the caller.
// Runs against local Supabase: ./test-local.sh
import { assert, assertEquals, assertFalse, assertStringIncludes } from '@std/assert';
import JSZip from 'jszip';
import { createHandler } from './handler.ts';
import { cleanupExpiredExports } from '../_shared/exports.ts';
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

const ROOT = 'glovebox-export';
const TRICKY = 'Big "Red", the\nPrius';

async function seed(user: TestUser, make: string) {
  const vehicleId = await addVehicle(user, make);
  await user.db.from('vehicles').update({ nickname: TRICKY, fuel_type: 'hybrid' }).eq('id', vehicleId);
  const saved = await user.db.rpc('save_record', {
    p_record: {
      id: crypto.randomUUID(),
      vehicle_id: vehicleId,
      kind: 'service',
      category: 'oil_change',
      title: `Oil change at ${make}`,
      performed_on: '2026-06-01',
      odometer: 150000,
      tax_cents: 0,
    },
    p_items: [{ item_type: 'part', description: 'Oil', quantity: 1, unit_price_cents: 4999, amount_cents: 4999 }],
  });
  if (saved.error) throw new Error(saved.error.message);
  const receipt = await addReceipt(user, vehicleId);
  const photo = `${user.id}/${vehicleId}/cover.jpg`;
  const up = await user.db.storage.from('vehicle-photos').upload(photo, JPEG_BYTES, { contentType: 'image/jpeg' });
  if (up.error) throw new Error(up.error.message);
  return { vehicleId, receipt, photo };
}

async function download(url: string): Promise<JSZip> {
  const res = await fetch(url);
  assertEquals(res.status, 200);
  return JSZip.loadAsync(new Uint8Array(await res.arrayBuffer()));
}

Deno.test('export-data: 401 without a valid JWT', async () => {
  const res = await createHandler()(jsonRequest('export-data', {}));
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("export-data: ZIP has data.json, CSVs and files — only the caller's", async () => {
  const a = await createTestUser('exp-a');
  const b = await createTestUser('exp-b');
  try {
    const seededA = await seed(a, 'Toyota');
    const seededB = await seed(b, 'Honda');

    const res = await createHandler()(jsonRequest('export-data', {}, a.jwt));
    assertEquals(res.status, 200);
    const body = await readJson(res);
    assert(typeof body.url === 'string' && typeof body.bytes === 'number' && typeof body.expires_at === 'string');
    const expiresIn = new Date(body.expires_at as string).getTime() - Date.now();
    assert(expiresIn > 14 * 60_000 && expiresIn <= 15 * 60_000 + 5_000, 'signed URL lasts 15 minutes');

    const zip = await download(body.url as string);
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]!.dir).sort();

    // JSON: every table, only A's rows
    const data = JSON.parse(await zip.file(`${ROOT}/data.json`)!.async('string'));
    for (const t of ['profiles', 'vehicles', 'service_records', 'line_items', 'odometer_readings', 'maintenance_rules', 'attachments', 'share_links', 'receipt_extractions']) {
      assert(Array.isArray(data.tables[t]), `data.json has ${t}`);
    }
    assertEquals(data.tables.vehicles.map((v: { id: string }) => v.id), [seededA.vehicleId]);
    assertEquals(data.tables.vehicles[0].fuel_type, 'hybrid', 'data.json has the fuel type (002 FR-005)');
    assertEquals(data.tables.service_records.length, 1);
    assertEquals(data.tables.service_records[0].title, 'Oil change at Toyota');
    assertEquals(data.tables.profiles.map((p: { id: string }) => p.id), [a.id]);
    assertFalse(JSON.stringify(data).includes(b.id), "nothing of B's");
    assertFalse(JSON.stringify(data).includes('Honda'), "nothing of B's");

    // CSV
    for (const c of ['vehicles', 'records', 'line_items', 'odometer', 'rules']) {
      assert(names.includes(`${ROOT}/csv/${c}.csv`), `csv/${c}.csv present`);
    }
    const vehiclesCsv = await zip.file(`${ROOT}/csv/vehicles.csv`)!.async('string');
    assertStringIncludes(vehiclesCsv, '"Big ""Red"", the\nPrius"', 'commas, quotes and newlines are escaped');
    const vehicleHeader = vehiclesCsv.split('\r\n')[0]!.split(',');
    const fuelCol = vehicleHeader.indexOf('fuel_type');
    assert(fuelCol >= 0, 'vehicles.csv has a fuel_type column (002 FR-005)');
    assertStringIncludes(vehiclesCsv, ',hybrid,', 'vehicles.csv has the fuel type value');
    const recordsCsv = await zip.file(`${ROOT}/csv/records.csv`)!.async('string');
    assertEquals(recordsCsv.trim().split('\r\n').length, 2, 'header + one record');

    // files: A's receipt and vehicle photo, nothing of B's
    const receiptName = seededA.receipt.path.slice(a.id.length + 1);
    assert(names.includes(`${ROOT}/files/receipts/${receiptName}`), 'receipt image included');
    assert(names.includes(`${ROOT}/files/vehicle-photos/${seededA.photo.slice(a.id.length + 1)}`), 'vehicle photo included');
    const receipt = await zip.file(`${ROOT}/files/receipts/${receiptName}`)!.async('uint8array');
    assertEquals(receipt, JPEG_BYTES);
    assertFalse(names.some((n) => n.includes(seededB.receipt.id) || n.includes(seededB.vehicleId)), "no files of B's");

    // stored privately under A's folder
    const stored = await listAll(testAdmin(), 'exports', a.id);
    assertEquals(stored.length, 1);
  } finally {
    await deleteTestUser(a);
    await deleteTestUser(b);
  }
});

Deno.test('export-data: too large → 413 export_too_large; data_only still works', async () => {
  const a = await createTestUser('exp-big');
  try {
    await seed(a, 'Toyota');
    const res = await createHandler({ maxBytes: 10 })(jsonRequest('export-data', {}, a.jwt));
    assertEquals(res.status, 413);
    assertEquals(((await readJson(res)).error as { code: string }).code, 'export_too_large');

    const ok = await createHandler({ maxBytes: 10 })(jsonRequest('export-data', { data_only: true }, a.jwt));
    assertEquals(ok.status, 200);
    const zip = await download((await readJson(ok)).url as string);
    const names = Object.keys(zip.files);
    assert(names.includes(`${ROOT}/data.json`));
    assertFalse(names.some((n) => n.startsWith(`${ROOT}/files/`) && !zip.files[n]!.dir), 'no files in a data-only export');
  } finally {
    await deleteTestUser(a);
  }
});

Deno.test('exports cleanup: removes exports older than 24 h, keeps newer ones and other buckets', async () => {
  const a = await createTestUser('exp-clean');
  const admin = testAdmin();
  try {
    const vehicleId = await addVehicle(a);
    await addReceipt(a, vehicleId);
    await admin.storage.from('exports').upload(`${a.id}/x.zip`, new Uint8Array([0x50, 0x4b, 3, 4]), { contentType: 'application/zip' });

    const soon = new Date(Date.now() + 60 * 60_000);
    assertEquals(await cleanupExpiredExports(admin, { userId: a.id, now: soon }), 0);
    assertEquals((await listAll(admin, 'exports', a.id)).length, 1, 'an hour-old export is kept');

    const later = new Date(Date.now() + 25 * 60 * 60_000);
    assertEquals(await cleanupExpiredExports(admin, { userId: a.id, now: later }), 1);
    assertEquals((await listAll(admin, 'exports', a.id)).length, 0, 'a 25-hour-old export is removed');
    assertEquals((await listAll(admin, 'receipts', a.id)).length, 1, 'receipts are never touched');
  } finally {
    await deleteTestUser(a);
  }
});
