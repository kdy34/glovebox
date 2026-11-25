// Receipt service (T055): compress → sha256 → upload → attachments row → extract-receipt.
// Every failure maps to an ExtractErrorCode so the screen can fall back to the manual form
// with the photo attached (FR-015). The draft is validated again here: AI output is untrusted.
import * as Crypto from 'expo-crypto';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { supabase } from '@/data/supabase';
import { newId } from '@/data/ids';
import { ReceiptExtractionDraft, type ExtractionDraft } from '@/domain/extractionSchema';
import {
  CLIENT_TIMEOUT_MS,
  MAX_RECEIPT_BYTES,
  extractErrorCode,
  receiptStoragePath,
  toHex,
  type ExtractErrorCode,
  type ReceiptMime,
} from '@/domain/receipt';
import type { PickedReceipt } from '@/platform/documentScanner';

const MAX_WIDTH = 2000; // enough for small receipt print, well under the 10 MB limit
const JPEG_QUALITY = 0.7;

export class ReceiptError extends Error {
  constructor(public readonly code: ExtractErrorCode) {
    super(code);
    this.name = 'ReceiptError';
  }
}

export interface PreparedReceipt {
  uri: string;
  mimeType: ReceiptMime;
  bytes: ArrayBuffer;
  sha256: string;
}

/** Images are resized and re-encoded as JPEG; PDFs are sent as they are. */
export async function prepareReceipt(picked: PickedReceipt): Promise<PreparedReceipt> {
  let uri = picked.uri;
  let mimeType = picked.mimeType;
  if (mimeType !== 'application/pdf') {
    const ctx = ImageManipulator.manipulate(uri);
    let image = await ctx.renderAsync();
    if (image.width > MAX_WIDTH) {
      ctx.resize({ width: MAX_WIDTH });
      image = await ctx.renderAsync();
    }
    const saved = await image.saveAsync({ compress: JPEG_QUALITY, format: SaveFormat.JPEG });
    uri = saved.uri;
    mimeType = 'image/jpeg';
  }
  // Upload and hash the exact same bytes (a Blob from fetch(uri) can upload as 0 bytes in RN).
  const bytes = await new File(uri).arrayBuffer();
  if (bytes.byteLength >= MAX_RECEIPT_BYTES) throw new ReceiptError('file_too_large');
  const sha256 = toHex(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)));
  return { uri, mimeType, bytes, sha256 };
}

/** A saved record that already has this exact image, if any (checked before spending a scan). */
export async function savedRecordWithImage(sha256: string): Promise<string | null> {
  const { data } = await supabase
    .from('attachments')
    .select('record_id')
    .eq('sha256', sha256)
    .not('record_id', 'is', null)
    .limit(1);
  return data?.[0]?.record_id ?? null;
}

/** Uploads to receipts/{uid}/{id}.{ext} and creates the attachments row (record_id null until saved). */
export async function uploadReceipt(prepared: PreparedReceipt, vehicleId: string): Promise<string> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new ReceiptError('unauthorized');
  const attachmentId = newId();
  const path = receiptStoragePath(userId, attachmentId, prepared.mimeType);
  const up = await supabase.storage.from('receipts').upload(path, prepared.bytes, { contentType: prepared.mimeType, upsert: false });
  if (up.error) throw new ReceiptError(isNetworkError(up.error) ? 'network' : 'provider_error');
  const { error } = await supabase.from('attachments').insert({
    id: attachmentId,
    user_id: userId,
    vehicle_id: vehicleId,
    bucket: 'receipts',
    storage_path: path,
    mime_type: prepared.mimeType,
    bytes: prepared.bytes.byteLength,
    sha256: prepared.sha256,
  });
  if (error) {
    await supabase.storage.from('receipts').remove([path]);
    throw new ReceiptError(isNetworkError(error) ? 'network' : 'provider_error');
  }
  return attachmentId;
}

export interface Extraction {
  extractionId: string;
  draft: ExtractionDraft;
  lowConfidenceFields: string[];
  scansRemaining: number | null;
}

export async function extractReceipt(attachmentId: string, vehicleId: string): Promise<Extraction> {
  const { data, error } = await supabase.functions.invoke('extract-receipt', {
    body: { attachment_id: attachmentId, vehicle_id: vehicleId },
    timeout: CLIENT_TIMEOUT_MS,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response;
      const body = await res.json().catch(() => null);
      throw new ReceiptError(extractErrorCode(res.status, body));
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
      const aborted = /abort|timeout/i.test(String((error.context as Error | undefined)?.message ?? error.message));
      throw new ReceiptError(aborted ? 'timeout' : 'network');
    }
    throw new ReceiptError('provider_error');
  }
  const body = data as { extraction_id?: unknown; draft?: unknown; low_confidence_fields?: unknown; scans_remaining?: unknown };
  const parsed = ReceiptExtractionDraft.safeParse(body?.draft);
  if (!parsed.success || typeof body.extraction_id !== 'string') throw new ReceiptError('provider_error');
  const low = Array.isArray(body.low_confidence_fields) ? body.low_confidence_fields.filter((x): x is string => typeof x === 'string') : [];
  return {
    extractionId: body.extraction_id,
    draft: parsed.data,
    lowConfidenceFields: low,
    scansRemaining: typeof body.scans_remaining === 'number' ? body.scans_remaining : null,
  };
}

function isNetworkError(err: { message?: string } | null): boolean {
  return /network|fetch|offline|timed out/i.test(err?.message ?? '');
}
