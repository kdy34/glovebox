// File checks for uploaded receipts: size limit and magic bytes that match the declared type.
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB; "10 MB or more" is refused
export const RECEIPT_MIME = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'] as const;

const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);
const starts = (b: Uint8Array, sig: number[]) => sig.every((v, i) => b[i] === v);

/** True when the bytes really are the declared type. */
export function matchesMime(bytes: Uint8Array, mime: string): boolean {
  switch (mime) {
    case 'image/jpeg':
      return starts(bytes, [0xff, 0xd8, 0xff]);
    case 'image/png':
      return starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case 'application/pdf':
      return starts(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case 'image/heic': {
      const ftyp = new TextDecoder().decode(bytes.subarray(4, 8));
      const brand = new TextDecoder().decode(bytes.subarray(8, 12));
      return ftyp === 'ftyp' && HEIC_BRANDS.has(brand);
    }
    default:
      return false;
  }
}
