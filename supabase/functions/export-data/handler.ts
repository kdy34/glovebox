// export-data (T043, contracts/edge-functions.md): a ZIP of everything the caller owns.
// Rows and files are read with the CALLER's client, so RLS makes "only the caller's data"
// structural. The service role is used only to store the ZIP (users can't write to the
// exports bucket) and to sign its URL.
//
// ZIP layout:
//   glovebox-export/data.json             every table
//   glovebox-export/csv/{vehicles,records,line_items,odometer,rules}.csv
//   glovebox-export/files/receipts/...    receipt images and PDFs
//   glovebox-export/files/vehicle-photos/...
import JSZip from 'jszip';
import type { SupabaseClient } from '@supabase/supabase-js';
import { adminClient, requireUser } from '../_shared/auth.ts';
import { toCsv } from '../_shared/csv.ts';
import { handle, HttpError, json } from '../_shared/errors.ts';
import { cleanupExpiredExports } from '../_shared/exports.ts';
import { listAll } from '../_shared/storage.ts';

export interface ExportDataDeps {
  /** Files above this total are refused (413) unless data_only. Default 500 MB. */
  maxBytes?: number;
  now?: () => Date;
}

const ROOT = 'glovebox-export';
const SIGNED_URL_SECONDS = 15 * 60;
const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

const TABLES = [
  'profiles',
  'vehicles',
  'service_records',
  'line_items',
  'odometer_readings',
  'maintenance_rules',
  'attachments',
  'share_links',
  'receipt_extractions',
  'usage_counters',
  'entitlements',
] as const;

const CSV: Record<string, { table: (typeof TABLES)[number]; columns: string[] }> = {
  vehicles: {
    table: 'vehicles',
    columns: ['id', 'nickname', 'year', 'make', 'model', 'trim', 'vin', 'odometer_unit', 'status', 'archived_at', 'created_at'],
  },
  records: {
    table: 'service_records',
    columns: [
      'id', 'vehicle_id', 'kind', 'category', 'title', 'performed_on', 'odometer', 'shop_name', 'shop_address',
      'is_diy', 'currency', 'subtotal_cents', 'tax_cents', 'total_cents', 'notes', 'source', 'created_at',
    ],
  },
  line_items: {
    table: 'line_items',
    columns: ['id', 'record_id', 'position', 'item_type', 'description', 'quantity', 'unit_price_cents', 'amount_cents'],
  },
  odometer: {
    table: 'odometer_readings',
    columns: ['id', 'vehicle_id', 'value', 'unit', 'read_on', 'source', 'record_id', 'is_excluded'],
  },
  rules: {
    table: 'maintenance_rules',
    columns: [
      'id', 'vehicle_id', 'name', 'service_category', 'interval_miles', 'interval_months', 'lead_days', 'lead_miles',
      'last_done_on', 'last_done_odometer', 'is_active',
    ],
  },
};

type Row = Record<string, unknown>;

async function selectAll(db: SupabaseClient, table: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select('*').range(from, from + 999);
    if (error) throw new HttpError('internal');
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < 1000) return rows;
  }
}

async function vehiclePhotoSizes(db: SupabaseClient, uid: string): Promise<{ path: string; bytes: number }[]> {
  const paths = await listAll(db, 'vehicle-photos', uid);
  const out: { path: string; bytes: number }[] = [];
  for (const path of paths) {
    const dir = path.slice(0, path.lastIndexOf('/'));
    const name = path.slice(path.lastIndexOf('/') + 1);
    const { data } = await db.storage.from('vehicle-photos').list(dir, { search: name, limit: 1 });
    out.push({ path, bytes: Number((data?.[0]?.metadata as { size?: number } | undefined)?.size ?? 0) });
  }
  return out;
}

export function createHandler(deps: ExportDataDeps = {}) {
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const now = deps.now ?? (() => new Date());

  return handle(async (req) => {
    if (req.method !== 'POST') throw new HttpError('bad_request');
    const { user, db } = await requireUser(req);
    const body: unknown = await req.json().catch(() => ({}));
    const dataOnly = typeof body === 'object' && body !== null && (body as Row).data_only === true;

    const tables: Record<string, Row[]> = {};
    for (const t of TABLES) tables[t] = await selectAll(db, t);

    const receipts = tables.attachments!.map((a) => ({ path: a.storage_path as string, bytes: Number(a.bytes) }));
    const photos = dataOnly ? [] : await vehiclePhotoSizes(db, user.id);
    const fileBytes = receipts.reduce((s, f) => s + f.bytes, 0) + photos.reduce((s, f) => s + f.bytes, 0);
    if (!dataOnly && fileBytes > maxBytes) throw new HttpError('export_too_large', { data_only_available: true });

    const generatedAt = now();
    const zip = new JSZip();
    const root = zip.folder(ROOT)!;
    root.file(
      'data.json',
      JSON.stringify({ format: 'glovebox-export', version: 1, generated_at: generatedAt.toISOString(), tables }, null, 2),
    );
    for (const [name, spec] of Object.entries(CSV)) root.file(`csv/${name}.csv`, toCsv(spec.columns, tables[spec.table]!));

    if (!dataOnly) {
      const add = async (bucket: string, path: string) => {
        const { data, error } = await db.storage.from(bucket).download(path);
        if (error || !data) return; // a missing object shouldn't fail the whole export
        root.file(`files/${bucket}/${path.slice(user.id.length + 1)}`, new Uint8Array(await data.arrayBuffer()));
      };
      for (const r of receipts) await add('receipts', r.path);
      for (const p of photos) await add('vehicle-photos', p.path);
    }

    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
    const admin = adminClient();
    await cleanupExpiredExports(admin, { userId: user.id, now: generatedAt }).catch(() => 0);
    const path = `${user.id}/${generatedAt.toISOString().replace(/[:.]/g, '-')}.zip`;
    const up = await admin.storage.from('exports').upload(path, bytes, { contentType: 'application/zip', upsert: true });
    if (up.error) throw new HttpError('internal');
    const signed = await admin.storage.from('exports').createSignedUrl(path, SIGNED_URL_SECONDS);
    if (signed.error || !signed.data) throw new HttpError('internal');

    return json({
      url: signed.data.signedUrl,
      bytes: bytes.byteLength,
      expires_at: new Date(Date.now() + SIGNED_URL_SECONDS * 1000).toISOString(),
    });
  });
}
