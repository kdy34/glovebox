// Receipt service (T055) with mocked native modules and a fake Supabase client:
// compress → hash → upload → attachments row → extract-receipt, and every error mapping.
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';

// ─── mocks ────────────────────────────────────────────────────────────────
const mockRender = jest.fn();
const mockResize = jest.fn();
jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: { manipulate: () => ({ renderAsync: () => mockRender(), resize: (a: unknown) => mockResize(a) }) },
}));
let mockBytes = new Uint8Array([1, 2, 3]).buffer;
const mockFileUris: string[] = [];
jest.mock('expo-file-system', () => ({
  File: class { constructor(uri: string) { mockFileUris.push(uri); } arrayBuffer() { return Promise.resolve(mockBytes); } },
}));
jest.mock('expo-crypto', () => ({
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
  digest: jest.fn(async () => new Uint8Array([0xab, 0x01]).buffer),
}));
jest.mock('@/data/ids', () => ({ newId: () => 'att-1' }));

type Result = { data?: unknown; error?: unknown };
const mockCalls: { op: string; args: unknown[] }[] = [];
const mockResults: Record<string, Result> = {};
/** A chainable query mockBuilder that records mockCalls and resolves to mockResults[table]. */
function mockBuilder(table: string) {
  const b: Record<string, unknown> = {};
  for (const op of ['select', 'eq', 'not', 'limit', 'insert', 'delete', 'maybeSingle']) {
    b[op] = (...args: unknown[]) => { mockCalls.push({ op: `${table}.${op}`, args }); return b; };
  }
  b.then = (resolve: (r: Result) => unknown) => resolve(mockResults[table] ?? { data: null, error: null });
  return b;
}
const mockStorage = { upload: jest.fn(), remove: jest.fn(async () => ({ error: null })) };
const mockInvoke = jest.fn();
const mockGetUser = jest.fn();
jest.mock('@/data/supabase', () => ({
  supabase: {
    from: (t: string) => mockBuilder(t),
    storage: { from: () => mockStorage },
    functions: { invoke: (...a: unknown[]) => mockInvoke(...a) },
    auth: { getUser: () => mockGetUser() },
  },
}));

import { ReceiptError, discardReceipt, extractReceipt, prepareReceipt, savedRecordWithImage, uploadReceipt } from '@/services/receipts';

const f = <T,>(value: T, confidence = 0.9) => ({ value, confidence });
const validDraft = {
  schema_version: 1, is_receipt: true,
  fields: {
    shop_name: f('Shop'), shop_address: f(null, 0), performed_on: f('2026-06-01'), odometer: f(null, 0),
    subtotal_cents: f(100), tax_cents: f(0), total_cents: f(100), suggested_category: f('oil_change'),
    suggested_title: f('Oil'), is_diy_purchase: f(false),
  },
  line_items: [], warnings: [],
};
const prepared = { uri: 'file:///x.jpg', mimeType: 'image/jpeg' as const, bytes: new Uint8Array([1, 2, 3]).buffer, sha256: 'ab01' };
const code = async (p: Promise<unknown>) => { try { await p; return 'resolved'; } catch (e) { return e instanceof ReceiptError ? e.code : String(e); } };

beforeEach(() => {
  mockCalls.length = 0; mockFileUris.length = 0;
  for (const k of Object.keys(mockResults)) delete mockResults[k];
  jest.clearAllMocks();
  mockBytes = new Uint8Array([1, 2, 3]).buffer;
  mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mockStorage.upload.mockResolvedValue({ error: null });
});

// ─── prepareReceipt ───────────────────────────────────────────────────────
describe('prepareReceipt', () => {
  const saved = { uri: 'file:///out.jpg' };
  it('resizes a wide image to 2000 px, saves JPEG and hashes the saved bytes', async () => {
    const saveAsync = jest.fn(async () => saved);
    mockRender.mockResolvedValueOnce({ width: 4032, saveAsync }).mockResolvedValueOnce({ width: 2000, saveAsync });
    const r = await prepareReceipt({ uri: 'file:///in.heic', mimeType: 'image/heic' });
    expect(mockResize).toHaveBeenCalledWith({ width: 2000 });
    expect(saveAsync).toHaveBeenCalledWith({ compress: 0.7, format: 'jpeg' });
    expect(mockFileUris).toEqual(['file:///out.jpg']); // the uploaded file is the one hashed
    expect(r).toEqual({ uri: 'file:///out.jpg', mimeType: 'image/jpeg', bytes: mockBytes, sha256: 'ab01' });
  });
  it('does not upscale a narrow image', async () => {
    mockRender.mockResolvedValueOnce({ width: 1200, saveAsync: async () => saved });
    await prepareReceipt({ uri: 'file:///in.jpg', mimeType: 'image/jpeg' });
    expect(mockResize).not.toHaveBeenCalled();
  });
  it('sends a PDF as it is', async () => {
    const r = await prepareReceipt({ uri: 'file:///r.pdf', mimeType: 'application/pdf' });
    expect(mockRender).not.toHaveBeenCalled();
    expect(r.mimeType).toBe('application/pdf');
    expect(mockFileUris).toEqual(['file:///r.pdf']);
  });
  it('refuses 10 MB or more before uploading', async () => {
    mockBytes = new ArrayBuffer(10 * 1024 * 1024);
    expect(await code(prepareReceipt({ uri: 'file:///r.pdf', mimeType: 'application/pdf' }))).toBe('file_too_large');
  });
});

// ─── uploadReceipt ────────────────────────────────────────────────────────
describe('uploadReceipt', () => {
  it('uploads the bytes to receipts/{uid}/{id}.jpg and creates the attachments row', async () => {
    expect(await uploadReceipt(prepared, 'veh-1')).toBe('att-1');
    expect(mockStorage.upload).toHaveBeenCalledWith('user-1/att-1.jpg', prepared.bytes, { contentType: 'image/jpeg', upsert: false });
    expect(mockCalls.find((c) => c.op === 'attachments.insert')!.args[0]).toEqual({
      id: 'att-1', user_id: 'user-1', vehicle_id: 'veh-1', bucket: 'receipts', storage_path: 'user-1/att-1.jpg',
      mime_type: 'image/jpeg', bytes: 3, sha256: 'ab01',
    });
  });
  it('signed out → unauthorized, nothing uploaded', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    expect(await code(uploadReceipt(prepared, 'veh-1'))).toBe('unauthorized');
    expect(mockStorage.upload).not.toHaveBeenCalled();
  });
  it('a network failure on upload → network; any other → provider_error', async () => {
    mockStorage.upload.mockResolvedValueOnce({ error: { message: 'Network request failed' } });
    expect(await code(uploadReceipt(prepared, 'veh-1'))).toBe('network');
    mockStorage.upload.mockResolvedValueOnce({ error: { message: 'new row violates row-level security policy' } });
    expect(await code(uploadReceipt(prepared, 'veh-1'))).toBe('provider_error');
  });
  it('if the row insert fails, the uploaded file is removed', async () => {
    mockResults.attachments = { error: { message: 'violates check constraint' } };
    expect(await code(uploadReceipt(prepared, 'veh-1'))).toBe('provider_error');
    expect(mockStorage.remove).toHaveBeenCalledWith(['user-1/att-1.jpg']);
  });
});

// ─── extractReceipt ───────────────────────────────────────────────────────
describe('extractReceipt', () => {
  it('returns the validated draft and passes the 35 s client timeout', async () => {
    mockInvoke.mockResolvedValue({ data: { extraction_id: 'ext-1', draft: validDraft, low_confidence_fields: ['odometer', 7], scans_remaining: 4 }, error: null });
    const r = await extractReceipt('att-1', 'veh-1');
    expect(mockInvoke).toHaveBeenCalledWith('extract-receipt', { body: { attachment_id: 'att-1', vehicle_id: 'veh-1' }, timeout: 35_000 });
    expect(r).toMatchObject({ extractionId: 'ext-1', lowConfidenceFields: ['odometer'], scansRemaining: 4 });
    expect(r.draft.fields.shop_name.value).toBe('Shop');
  });
  it('an invalid draft is untrusted output → provider_error', async () => {
    mockInvoke.mockResolvedValue({ data: { extraction_id: 'ext-1', draft: { ...validDraft, schema_version: 2 } }, error: null });
    expect(await code(extractReceipt('att-1', 'veh-1'))).toBe('provider_error');
  });
  it.each([
    [402, { error: { code: 'quota_exceeded' } }, 'quota_exceeded'],
    [422, { error: { code: 'not_a_receipt' } }, 'not_a_receipt'],
    [503, { error: { code: 'ai_disabled' } }, 'ai_disabled'],
    [504, null, 'timeout'],
  ])('HTTP %i (%j) → %s', async (status, body, expected) => {
    const res = { status, json: async () => { if (body === null) throw new Error('no body'); return body; } };
    mockInvoke.mockResolvedValue({ data: null, error: new FunctionsHttpError(res) });
    expect(await code(extractReceipt('att-1', 'veh-1'))).toBe(expected);
  });
  it('a client abort → timeout; no connection → network', async () => {
    mockInvoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new Error('The operation was aborted')) });
    expect(await code(extractReceipt('att-1', 'veh-1'))).toBe('timeout');
    mockInvoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError(new Error('Network request failed')) });
    expect(await code(extractReceipt('att-1', 'veh-1'))).toBe('network');
  });
});

// ─── lookups and cleanup ──────────────────────────────────────────────────
describe('savedRecordWithImage / discardReceipt', () => {
  it('finds a saved record with the same image hash', async () => {
    mockResults.attachments = { data: [{ record_id: 'rec-9' }], error: null };
    expect(await savedRecordWithImage('ab01')).toBe('rec-9');
    expect(mockCalls.map((c) => c.op)).toEqual(['attachments.select', 'attachments.eq', 'attachments.not', 'attachments.limit']);
  });
  it('discard removes an unlinked attachment and its file', async () => {
    mockResults.attachments = { data: { storage_path: 'user-1/att-1.jpg', record_id: null }, error: null };
    await discardReceipt('att-1');
    expect(mockCalls.some((c) => c.op === 'attachments.delete')).toBe(true);
    expect(mockStorage.remove).toHaveBeenCalledWith(['user-1/att-1.jpg']);
  });
  it('discard keeps an attachment already linked to a record', async () => {
    mockResults.attachments = { data: { storage_path: 'user-1/att-1.jpg', record_id: 'rec-1' }, error: null };
    await discardReceipt('att-1');
    expect(mockCalls.some((c) => c.op === 'attachments.delete')).toBe(false);
    expect(mockStorage.remove).not.toHaveBeenCalled();
  });
});
