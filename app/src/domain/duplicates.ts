// Likely-duplicate receipt detection (T053; data-model.md "Duplicate receipt").
// Same vehicle + same date + equal total + similar shop name (normalized Levenshtein ≤ 0.2),
// or the same image (sha256) as an attachment of a saved record.

export interface DuplicateCandidate {
  vehicleId: string;
  performedOn: string;
  totalCents: number;
  shopName: string | null;
  sha256: string | null;
}

export interface ExistingRecord {
  id: string;
  vehicle_id: string;
  performed_on: string;
  total_cents: number;
  shop_name: string | null;
}

export interface ExistingAttachment {
  record_id: string | null;
  sha256: string | null;
}

export type DuplicateMatch = { recordId: string; reason: 'same_image' | 'same_details' };

export function normalizeShop(name: string | null | undefined): string {
  return (name ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length]!;
}

export function shopSimilar(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = normalizeShop(a);
  const y = normalizeShop(b);
  if (!x || !y) return !x && !y;
  return levenshtein(x, y) / Math.max(x.length, y.length) <= 0.2;
}

export function findLikelyDuplicate(
  c: DuplicateCandidate,
  records: readonly ExistingRecord[],
  attachments: readonly ExistingAttachment[],
  excludeRecordId?: string,
): DuplicateMatch | null {
  const saved = new Set(records.map((r) => r.id));
  if (c.sha256) {
    const hit = attachments.find((a) => a.sha256 === c.sha256 && a.record_id && a.record_id !== excludeRecordId && saved.has(a.record_id));
    if (hit?.record_id) return { recordId: hit.record_id, reason: 'same_image' };
  }
  const same = records.find((r) =>
    r.id !== excludeRecordId &&
    r.vehicle_id === c.vehicleId &&
    r.performed_on === c.performedOn &&
    r.total_cents === c.totalCents &&
    shopSimilar(r.shop_name, c.shopName));
  return same ? { recordId: same.id, reason: 'same_details' } : null;
}
