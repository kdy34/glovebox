// Draft review screen (T057, US2 AS1–AS5): the record form pre-filled from the AI draft, flagged
// fields first, the original image on a zoomable sheet, the mismatch banner and duplicate
// prompt (in RecordForm). After a failed scan it is the manual form with the photo attached.
import { useMemo, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import RecordForm from '../record/_form';
import { dropScanSession, getScanSession } from '@/features/scan/session';
import { draftToForm } from '@/domain/extraction';
import { fallbackMessageKey } from '@/domain/receipt';
import { newId } from '@/data/ids';
import { discardReceipt } from '@/services/receipts';
import { Button, Card, Screen, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

function ReceiptPreview({ uri, mimeType }: { uri: string; mimeType: string }) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const [open, setOpen] = useState(false);
  if (mimeType === 'application/pdf') {
    return <Card><Text variant="callout">{tr('record.receiptPdf')}</Text></Card>;
  }
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="imagebutton"
        accessibilityLabel={tr('record.receiptImage')}
        accessibilityHint={tr('record.receiptTapToZoom')}
        style={{ borderRadius: t.radius.md, overflow: 'hidden', backgroundColor: t.colors.surfaceAlt }}
      >
        <Image source={{ uri }} style={{ width: '100%', height: 180 }} resizeMode="cover" />
        <View style={{ padding: t.spacing.xs, backgroundColor: t.colors.surface }}>
          <Text variant="caption" color="textMuted" center>{tr('record.receiptTapToZoom')}</Text>
        </View>
      </Pressable>
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
          <View style={{ padding: t.spacing.md, alignItems: 'flex-end' }}>
            <Button title={tr('common.close')} variant="ghost" onPress={() => setOpen(false)} />
          </View>
          <ScrollView
            maximumZoomScale={5}
            minimumZoomScale={1}
            centerContent
            contentContainerStyle={{ flexGrow: 1 }}
            accessibilityLabel={tr('record.receiptImage')}
          >
            <Image source={{ uri }} style={{ width: '100%', aspectRatio: 0.6 }} resizeMode="contain" />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

export default function ScanReview() {
  const { session: key } = useLocalSearchParams<{ session: string }>();
  const { t: tr } = useTranslation();
  const t = useTheme();
  const session = getScanSession(key);
  const draft = useMemo(() => {
    if (!session?.extraction) return null;
    const today = new Date().toISOString().slice(0, 10);
    return draftToForm(session.extraction.draft, session.extraction.lowConfidenceFields, { today, newId });
  }, [session]);

  if (!session) {
    return (
      <Screen>
        <Text variant="callout" center>{tr('common.somethingWrong')}</Text>
        <Button title={tr('common.back')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    );
  }

  const leave = () => {
    if (session.attachmentId) void discardReceipt(session.attachmentId).catch(() => undefined);
    dropScanSession(key);
    router.back();
  };

  return (
    <RecordForm
      vehicleId={session.vehicleId}
      receipt={{ attachmentId: session.attachmentId, extractionId: session.extraction?.extractionId ?? null, draft, latencyMs: session.latencyMs }}
      header={
        <View style={{ gap: t.spacing.md }}>
          <ReceiptPreview uri={session.uri} mimeType={session.mimeType} />
          {session.error ? (
            <Card accessibilityLiveRegion="polite">
              <Text variant="callout">{tr(fallbackMessageKey(session.error))}</Text>
            </Card>
          ) : null}
        </View>
      }
      onSaved={() => {
        dropScanSession(key);
        router.replace(`/vehicle/${session.vehicleId}`);
      }}
      onCancel={leave}
    />
  );
}
