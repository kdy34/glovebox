// Receipt capture (T054, FR-011): the iOS VisionKit scanner (edge detection + crop), with the
// photo library and a PDF picker as fallbacks. VisionKit only works on a real device; in the
// simulator `scanReceipt` returns 'unavailable' and the screen offers the pickers instead.
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import type { ReceiptMime } from '@/domain/receipt';

export interface PickedReceipt {
  uri: string;
  mimeType: ReceiptMime;
}

export type PickResult = { ok: true; receipt: PickedReceipt } | { ok: false; reason: 'cancelled' | 'unavailable' | 'denied' };

function imageMime(mime: string | null | undefined, uri: string): ReceiptMime {
  const m = (mime ?? '').toLowerCase();
  if (m === 'image/png' || /\.png$/i.test(uri)) return 'image/png';
  if (m === 'image/heic' || m === 'image/heif' || /\.hei[cf]$/i.test(uri)) return 'image/heic';
  return 'image/jpeg';
}

export async function scanReceipt(): Promise<PickResult> {
  try {
    // Loaded lazily so a build without the native module can still open the screen.
    const { default: DocumentScanner, ResponseType, ScanDocumentResponseStatus } = await import('react-native-document-scanner-plugin');
    const res = await DocumentScanner.scanDocument({ maxNumDocuments: 1, croppedImageQuality: 90, responseType: ResponseType.ImageFilePath });
    if (res.status === ScanDocumentResponseStatus.Cancel || !res.scannedImages?.length) return { ok: false, reason: 'cancelled' };
    const uri = res.scannedImages[0]!;
    return { ok: true, receipt: { uri: uri.startsWith('file://') ? uri : `file://${uri}`, mimeType: 'image/jpeg' } };
  } catch {
    return { ok: false, reason: 'unavailable' }; // simulator, no camera, or no VisionKit
  }
}

export async function pickReceiptPhoto(): Promise<PickResult> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: false });
  if (res.canceled || !res.assets?.length) return { ok: false, reason: 'cancelled' };
  const a = res.assets[0]!;
  return { ok: true, receipt: { uri: a.uri, mimeType: imageMime(a.mimeType, a.uri) } };
}

export async function pickReceiptPdf(): Promise<PickResult> {
  const res = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return { ok: false, reason: 'cancelled' };
  return { ok: true, receipt: { uri: res.assets[0]!.uri, mimeType: 'application/pdf' } };
}
