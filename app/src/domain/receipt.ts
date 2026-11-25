// Receipt upload + extraction helpers (T055). Pure TS; the service in src/services/receipts.ts
// does the I/O. Error codes follow contracts/edge-functions.md (extract-receipt), plus the
// client-side ones: network, file_too_large before upload, and timeout from the client abort.

export const RECEIPT_MIME = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'] as const;
export type ReceiptMime = (typeof RECEIPT_MIME)[number];
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // bucket limit; the function requires < 10 MB
/** FR-015: the function gives up at 30 s; the client waits a little longer before falling back. */
export const CLIENT_TIMEOUT_MS = 35_000;

export const EXTRACT_ERROR_CODES = [
  'quota_exceeded', 'not_a_receipt', 'unreadable', 'ai_disabled', 'provider_error', 'timeout',
  'file_too_large', 'unsupported_type', 'attachment_not_found', 'unauthorized', 'network',
] as const;
export type ExtractErrorCode = (typeof EXTRACT_ERROR_CODES)[number];

const EXT: Record<ReceiptMime, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/heic': 'heic', 'application/pdf': 'pdf' };

export function receiptStoragePath(userId: string, attachmentId: string, mime: ReceiptMime): string {
  return `${userId}/${attachmentId}.${EXT[mime]}`;
}

export function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const BY_STATUS: Record<number, ExtractErrorCode> = {
  401: 'unauthorized', 402: 'quota_exceeded', 404: 'attachment_not_found', 413: 'file_too_large',
  415: 'unsupported_type', 422: 'unreadable', 503: 'provider_error', 504: 'timeout',
};

/** Maps an extract-receipt error response to a code. `status` null = no response (network). */
export function extractErrorCode(status: number | null, body: unknown): ExtractErrorCode {
  if (status === null) return 'network';
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  if (typeof code === 'string' && (EXTRACT_ERROR_CODES as readonly string[]).includes(code)) return code as ExtractErrorCode;
  return BY_STATUS[status] ?? 'provider_error';
}

/** The plain message shown above the manual form (US2 AS4/AS5). */
export const fallbackMessageKey = (code: ExtractErrorCode) => `scan.error.${code}` as const;
