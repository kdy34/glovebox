// In-memory hand-off from the scan screen to the review screen (T056/T057). The draft is kept
// here instead of in route params (size, and it must never be persisted unconfirmed).
import type { Extraction } from '@/services/receipts';
import type { ExtractErrorCode } from '@/domain/receipt';

export interface ScanSession {
  vehicleId: string;
  /** Local file of the image or PDF, for the preview. */
  uri: string;
  mimeType: string;
  /** null when the upload itself failed (e.g. offline): nothing is attached then. */
  attachmentId: string | null;
  sha256: string | null;
  extraction: Extraction | null;
  error: ExtractErrorCode | null;
  /** Time from pick to draft, for the scan_succeeded latency bucket. */
  latencyMs: number;
}

const sessions = new Map<string, ScanSession>();

export function putScanSession(s: ScanSession): string {
  const key = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  sessions.set(key, s);
  return key;
}

export function getScanSession(key: string | undefined): ScanSession | null {
  return key ? sessions.get(key) ?? null : null;
}

export function dropScanSession(key: string | undefined): void {
  if (key) sessions.delete(key);
}
