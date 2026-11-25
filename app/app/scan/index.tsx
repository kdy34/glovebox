// Scan capture screen (T056, US2, FR-011): pick the vehicle, scan with the camera (real device)
// or import a photo/PDF, then a processing state that respects Reduce Motion. Every failure
// goes on to the review screen as a manual form with the photo attached (FR-015).
import { useEffect, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useVehicles } from '@/data/queries';
import { pickReceiptPdf, pickReceiptPhoto, scanReceipt, type PickResult } from '@/platform/documentScanner';
import { ReceiptError, extractReceipt, prepareReceipt, savedRecordWithImage, uploadReceipt, type Extraction } from '@/services/receipts';
import { putScanSession } from '@/features/scan/session';
import type { ExtractErrorCode } from '@/domain/receipt';
import { track } from '@/services/analytics';
import { Button, Screen, SegmentedControl, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

const codeOf = (e: unknown): ExtractErrorCode => (e instanceof ReceiptError ? e.code : 'provider_error');

function ask(title: string, body: string, buttons: { text: string; value: string; style?: 'cancel' }[]): Promise<string> {
  return new Promise((resolve) => {
    Alert.alert(title, body, buttons.map((b) => ({ text: b.text, style: b.style, onPress: () => resolve(b.value) })), {
      cancelable: true,
      onDismiss: () => resolve('cancel'),
    });
  });
}

function Processing() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [reduceMotion, pulse]);
  return (
    <View style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xxxl }} accessibilityLiveRegion="polite">
      {reduceMotion ? null : <ActivityIndicator size="large" color={t.colors.primary} />}
      <Animated.View style={{ opacity: reduceMotion ? 1 : pulse }}>
        <Text variant="headline" center>{tr('scan.processing')}</Text>
      </Animated.View>
      <Text variant="footnote" color="textMuted" center>{tr('scan.processingHint')}</Text>
    </View>
  );
}

export default function ScanScreen() {
  const { vehicleId: paramVehicle } = useLocalSearchParams<{ vehicleId?: string }>();
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { data: vehicles = [] } = useVehicles();
  const [picked, setPicked] = useState<string | undefined>(paramVehicle);
  const vehicleId = picked ?? vehicles[0]?.id;
  const [busy, setBusy] = useState(false);

  const run = async (pick: () => Promise<PickResult>) => {
    if (!vehicleId || busy) return;
    const r = await pick();
    if (!r.ok) {
      if (r.reason === 'unavailable') Alert.alert(tr('scan.title'), tr('scan.scannerUnavailable'));
      return;
    }
    track('scan_started', {});
    setBusy(true);
    const started = Date.now();
    let attachmentId: string | null = null;
    let sha256: string | null = null;
    let extraction: Extraction | null = null;
    let error: ExtractErrorCode | null = null;
    try {
      const prepared = await prepareReceipt(r.receipt);
      sha256 = prepared.sha256;
      // The same image as a saved record: ask before spending a scan.
      const existing = await savedRecordWithImage(prepared.sha256).catch(() => null);
      if (existing) {
        const choice = await ask(tr('scan.duplicateImageTitle'), tr('scan.duplicateImageBody'), [
          { text: tr('common.cancel'), value: 'cancel', style: 'cancel' },
          { text: tr('scan.openExisting'), value: 'open' },
          { text: tr('scan.scanAnyway'), value: 'scan' },
        ]);
        if (choice !== 'scan') {
          setBusy(false);
          if (choice === 'open') router.replace(`/record/${existing}`);
          return;
        }
      }
      attachmentId = await uploadReceipt(prepared, vehicleId);
      extraction = await extractReceipt(attachmentId, vehicleId);
    } catch (e) {
      error = codeOf(e);
      track('scan_failed', { code: error });
    }
    const key = putScanSession({
      vehicleId, uri: r.receipt.uri, mimeType: r.receipt.mimeType, attachmentId, sha256, extraction, error,
      latencyMs: Date.now() - started,
    });
    setBusy(false);
    router.replace(`/scan/review?session=${key}`);
  };

  if (busy) return <Screen><Processing /></Screen>;

  return (
    <Screen scroll>
      <Text variant="callout" color="textMuted">{tr('scan.hint')}</Text>
      {vehicles.length > 1 ? (
        <SegmentedControl
          label={tr('scan.vehicleLabel')}
          layout="wrap"
          value={vehicleId ?? ''}
          onChange={setPicked}
          options={vehicles.map((v) => ({ value: v.id, label: v.nickname ?? `${v.year} ${v.make} ${v.model}` }))}
        />
      ) : null}
      <View style={{ gap: t.spacing.sm }}>
        <Button title={tr('scan.scan')} onPress={() => void run(scanReceipt)} disabled={!vehicleId} />
        <Button title={tr('scan.importPhoto')} variant="secondary" onPress={() => void run(pickReceiptPhoto)} disabled={!vehicleId} />
        <Button title={tr('scan.importPdf')} variant="secondary" onPress={() => void run(pickReceiptPdf)} disabled={!vehicleId} />
        <Button
          title={tr('scan.manualInstead')}
          variant="ghost"
          onPress={() => vehicleId && router.replace(`/record/new?vehicleId=${vehicleId}`)}
          disabled={!vehicleId}
        />
      </View>
    </Screen>
  );
}
