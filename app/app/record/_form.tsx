// Shared record form (T037): kind, category, date, odometer, shop/DIY, line items, tax, total, notes.
// With `receipt` (T057) it starts from an AI draft (or a failed scan): flagged fields, the
// mismatch banner, a duplicate prompt, and on save it links the image and records corrections.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatCents, lineAmountCents } from '@/domain/money';
import { recordAmounts } from '@/domain/recordAmounts';
import { SERVICE_CATEGORIES, EXPENSE_CATEGORIES, categoryLabelKey, kindOf, type Category, type RecordKind } from '@/domain/categories';
import { useSaveRecord, useRecord, useLineItems, useDeleteRecord, useVehicle, useRecords } from '@/data/queries';
import { correctedFields, formTotalsMismatch, type DraftForm, type FormFlag } from '@/domain/extraction';
import { findLikelyDuplicate } from '@/domain/duplicates';
import { enqueue } from '@/data/sync';
import { attachmentLink, extractionCorrections } from '@/data/writes';
import { track } from '@/services/analytics';
import { RecordSaveError, type LineItemInput, type RecordInput } from '@/data/repositories/records';
import { Button, Card, DateField, Divider, MoneyField, Screen, Text, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';
import { reportSaveError } from '@/services/saveError';
import { newId } from '@/data/ids';

/** A record that starts from a receipt scan (T057). */
export interface ReceiptContext {
  /** The uploaded image; linked to the record on save. null if the upload failed. */
  attachmentId: string | null;
  /** Set when the AI produced a draft. */
  extractionId: string | null;
  draft: DraftForm | null;
  /** Pick → draft time, for the scan_succeeded latency bucket. */
  latencyMs?: number;
}

interface Props {
  vehicleId?: string;
  recordId?: string;
  onSaved: (id: string) => void;
  onDeleted?: () => void;
  onCancel: () => void;
  receipt?: ReceiptContext;
  /** Shown above the form (receipt preview, fallback message). */
  header?: ReactNode;
  /** T065 "Log it": start a new record in this category. */
  initialCategory?: string;
}

type ItemType = 'part' | 'labor' | 'fee' | 'discount';

interface LineItemDraft {
  id: string;
  item_type: ItemType;
  description: string;
  quantity: number;
  unit_price_cents: number | null;
  amount_cents: number | null;
}

function LineItemRow({ item, onChange, onRemove, flagged, autoFocus }: {
  item: LineItemDraft;
  onChange: (updated: LineItemDraft) => void;
  onRemove: () => void;
  flagged?: boolean;
  autoFocus?: boolean;
}) {
  const t = useTheme();
  const { t: tr } = useTranslation();

  const updateQtyOrPrice = (qty: number, price: number | null) => {
    const amount = price !== null ? lineAmountCents(qty, price) : null;
    onChange({ ...item, quantity: qty, unit_price_cents: price, amount_cents: amount });
  };

  return (
    <View style={{ gap: t.spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: t.spacing.sm, alignItems: 'center' }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={tr('record.descriptionLabel')}
            value={item.description}
            onChangeText={(v) => onChange({ ...item, description: v })}
            accessibilityLabel={tr('record.descriptionLabel')}
            flagged={flagged}
            autoFocus={autoFocus}
          />
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel={tr('record.removeItem')}
          hitSlop={8}
          style={{ padding: t.spacing.xs, marginTop: t.spacing.lg }}
        >
          <Text variant="body" color="dangerText">×</Text>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={tr('record.quantityLabel')}
            value={String(item.quantity)}
            onChangeText={(v) => {
              const q = parseFloat(v) || 1;
              updateQtyOrPrice(q, item.unit_price_cents);
            }}
            keyboardType="decimal-pad"
            accessibilityLabel={tr('record.quantityLabel')}
          />
        </View>
        <View style={{ flex: 2 }}>
          <MoneyField
            label={tr('record.unitPriceLabel')}
            cents={item.unit_price_cents}
            onChangeCents={(c) => updateQtyOrPrice(item.quantity, c)}
            accessibilityLabel={tr('record.unitPriceLabel')}
          />
        </View>
        <View style={{ flex: 2 }}>
          <MoneyField
            label={tr('record.amountLabel')}
            cents={item.amount_cents}
            onChangeCents={(c) => onChange({ ...item, amount_cents: c })}
            allowNegative={item.item_type === 'discount'}
            accessibilityLabel={tr('record.amountLabel')}
            flagged={flagged}
          />
        </View>
      </View>
    </View>
  );
}

function saveErrorKey(err: unknown): string {
  if (!(err instanceof RecordSaveError)) return 'record.saveError';
  if (err.code === '22023' || err.code === '23514') return 'record.saveInvalid';
  if (err.code === '42501') return 'record.saveForbidden';
  return 'record.saveError';
}

export default function RecordForm({ vehicleId: propVehicleId, recordId, onSaved, onDeleted, onCancel, receipt, header, initialCategory }: Props) {
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { mutateAsync: save, isPending } = useSaveRecord();
  const { mutateAsync: deleteRecord } = useDeleteRecord();
  const { data: existing } = useRecord(recordId ?? '');
  const { data: existingItems = [] } = useLineItems(recordId ?? '');

  const vehicleId = propVehicleId ?? existing?.vehicle_id ?? '';
  const { data: vehicle } = useVehicle(vehicleId);
  const { data: vehicleRecords = [] } = useRecords(receipt ? vehicleId : '');
  const draft = receipt?.draft ?? null;

  const today = new Date().toISOString().slice(0, 10);

  // Form state
  // A receipt draft seeds the initial state (it is known at mount).
  const startCategory = (SERVICE_CATEGORIES as readonly string[]).includes(initialCategory ?? '') || (EXPENSE_CATEGORIES as readonly string[]).includes(initialCategory ?? '')
    ? (initialCategory as Category) : null;
  const [kind, setKind] = useState<RecordKind>(draft?.kind ?? (startCategory ? kindOf(startCategory) : 'service'));
  const [category, setCategory] = useState<Category>(draft?.category ?? startCategory ?? 'oil_change');
  const [date, setDate] = useState(draft?.performedOn ?? today);
  const [odometer, setOdometer] = useState(draft?.odometer ?? '');
  const [shopName, setShopName] = useState(draft?.shopName ?? '');
  const [shopAddress, setShopAddress] = useState(draft?.shopAddress ?? '');
  const [isDiy, setIsDiy] = useState(draft?.isDiy ?? false);
  const [taxCents, setTaxCents] = useState<number | null>(draft?.taxCents ?? null);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>(draft?.items ?? []);
  // T108: without line items the user enters the total (e.g. fuel); a draft brings the printed one.
  const [enteredTotalCents, setEnteredTotalCents] = useState<number | null>(draft && draft.items.length === 0 ? draft.receiptTotalCents : null);
  // FR-013: fields to check; a flag clears once the user edits that field.
  const [flags, setFlags] = useState<ReadonlySet<FormFlag>>(new Set(draft?.flags ?? []));
  const unflag = (f: FormFlag) => setFlags((prev) => { if (!prev.has(f)) return prev; const n = new Set(prev); n.delete(f); return n; });
  const firstTextFlag = draft?.flags.find((f) => f === 'odometer' || f === 'shop_name' || f === 'shop_address' || f === 'tax_cents' || f.startsWith('item:'));

  // Prefill from existing record — multiple setState calls per effect is intentional here
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!existing) return;
    setKind(existing.kind as RecordKind);
    setCategory(existing.category as Category);
    setDate(existing.performed_on);
    setOdometer(existing.odometer ? String(existing.odometer) : '');
    setShopName(existing.shop_name ?? '');
    setShopAddress(existing.shop_address ?? '');
    setIsDiy(existing.is_diy);
    setTaxCents(existing.tax_cents);
    setEnteredTotalCents(existing.total_cents);
    setNotes(existing.notes ?? '');
  }, [existing]);

  useEffect(() => {
    if (!existingItems.length) return;
    setItems(existingItems.map((it) => ({
      id: it.id,
      item_type: it.item_type as ItemType,
      description: it.description,
      quantity: it.quantity,
      unit_price_cents: it.unit_price_cents,
      amount_cents: it.amount_cents,
    })));
  }, [existingItems]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const categories = kind === 'service' ? SERVICE_CATEGORIES : EXPENSE_CATEGORIES;

  const handleSetKind = (k: RecordKind) => {
    setKind(k);
    if (k === 'service' && !SERVICE_CATEGORIES.includes(category as typeof SERVICE_CATEGORIES[number])) {
      setCategory('oil_change');
    } else if (k === 'expense' && !EXPENSE_CATEGORIES.includes(category as typeof EXPENSE_CATEGORIES[number])) {
      setCategory('fuel');
    }
  };

  const amounts = useMemo(() => recordAmounts({ items, taxCents, enteredTotalCents }), [items, taxCents, enteredTotalCents]);
  const itemized = items.length > 0;
  const subtotalCents = amounts.ok ? amounts.subtotalCents : 0;
  const totalCents = amounts.ok ? amounts.totalCents : (enteredTotalCents ?? 0);

  const addItem = () => {
    setItems((prev) => [...prev, {
      id: newId(),
      item_type: 'labor',
      description: '',
      quantity: 1,
      unit_price_cents: null,
      amount_cents: null,
    }]);
  };

  const mismatch = draft && itemized ? formTotalsMismatch(subtotalCents, taxCents, draft.receiptTotalCents) : false;

  /** The form as a DraftForm, to compare with the AI draft (corrected_fields, SC-003). */
  const currentAsDraft = (): DraftForm | null => draft && ({
    ...draft, kind, category, performedOn: date, odometer, shopName, shopAddress, isDiy, taxCents,
    items: items.map((it) => ({ ...it, unit_price_cents: it.unit_price_cents ?? 0, amount_cents: it.amount_cents ?? 0 })),
  });

  const doSave = useCallback(async () => {
    if (!vehicleId) return;
    const id = recordId ?? newId();
    const odomNum = odometer ? parseInt(odometer.replace(/,/g, ''), 10) : null;

    const record: RecordInput = {
      id,
      vehicle_id: vehicleId,
      kind,
      category,
      // The AI's title ("Oil change + rotation") while the user keeps its category.
      title: draft?.title && category === draft.category ? draft.title : tr(categoryLabelKey(category)),
      performed_on: date,
      odometer: odomNum ?? null,
      shop_name: isDiy ? null : (shopName.trim() || null),
      shop_address: isDiy ? null : (shopAddress.trim() || null),
      is_diy: isDiy,
      currency: 'USD',
      subtotal_cents: subtotalCents,
      tax_cents: taxCents ?? 0,
      total_cents: totalCents,
      notes: notes.trim() || null,
      source: receipt?.extractionId ? 'ai' : 'manual',
      extraction_id: receipt?.extractionId ?? null,
    };

    const lineItems: LineItemInput[] = items.map((it, i) => ({
      id: it.id,
      item_type: it.item_type,
      description: it.description,
      quantity: it.quantity,
      unit_price_cents: it.unit_price_cents ?? 0,
      amount_cents: it.amount_cents ?? 0,
      position: i,
    }));

    try {
      await save({ record, items: lineItems });
      // Queued after the record, so the outbox sends them in order (also offline).
      if (receipt?.attachmentId) await enqueue(attachmentLink(receipt.attachmentId, id));
      const now = currentAsDraft();
      if (receipt?.extractionId && draft && now) {
        const corrected = correctedFields(draft, now);
        await enqueue(extractionCorrections(receipt.extractionId, corrected));
        const ms = receipt.latencyMs ?? 0;
        track('scan_succeeded', { latency_bucket: ms < 5000 ? '<5s' : ms <= 15000 ? '5-15s' : '>15s', corrected_fields: corrected.length });
      }
      onSaved(id);
    } catch (err) {
      // Validation / DB errors are never queued (T097): tell the user so they can fix the record.
      Alert.alert(tr('common.error'), reportSaveError('record', err, tr(saveErrorKey(err))));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentAsDraft reads the same state
  }, [vehicleId, recordId, kind, category, date, odometer, isDiy, shopName, shopAddress, subtotalCents, taxCents, totalCents, notes, items, save, tr, onSaved, receipt, draft]);

  const handleSave = useCallback(async () => {
    if (!vehicleId) return;
    if (!amounts.ok) {
      if (amounts.reason === 'tax_exceeds_total') Alert.alert(tr('record.taxExceedsTitle'), tr('record.taxExceedsBody'));
      else Alert.alert(tr('record.noAmountTitle'), tr('record.noAmountBody'));
      return;
    }
    if (receipt) {
      const dup = findLikelyDuplicate(
        { vehicleId, performedOn: date, totalCents, shopName: isDiy ? null : shopName.trim() || null, sha256: null },
        vehicleRecords, [], recordId,
      );
      if (dup) {
        Alert.alert(tr('record.duplicateTitle'), tr('record.duplicateBody'), [
          { text: tr('common.cancel'), style: 'cancel' },
          { text: tr('record.saveAnyway'), onPress: () => void doSave() },
        ]);
        return;
      }
    }
    await doSave();
  }, [vehicleId, amounts, receipt, date, totalCents, isDiy, shopName, vehicleRecords, recordId, doSave, tr]);

  const handleDelete = () => {
    Alert.alert(
      tr('record.deleteTitle'),
      tr('record.deleteBody'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('record.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            if (!recordId || !vehicleId) return;
            await deleteRecord({ id: recordId, vehicleId });
            onDeleted?.();
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen scroll>
        {header}
        {draft ? (
          <Card>
            <View style={{ gap: t.spacing.xs }}>
              <Text variant="callout">{tr('record.aiDraftNote')}</Text>
              {flags.size > 0 ? <Text variant="callout" color="accentText">{tr('record.checkFields', { count: flags.size })}</Text> : null}
              {draft.warnings.filter((w) => w !== 'totals_mismatch' && w !== 'date_ambiguous').map((w) => (
                <Text key={w} variant="footnote" color="textMuted">{tr(`scan.warning.${w}`)}</Text>
              ))}
            </View>
          </Card>
        ) : null}

        {/* Kind toggle */}
        <View>
          <Text variant="footnote" color="textMuted" style={{ marginBottom: t.spacing.xs }}>{tr('record.kindLabel')}</Text>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            {(['service', 'expense'] as const).map((k) => (
              <Button
                key={k}
                title={k === 'service' ? tr('record.kindService') : tr('record.kindExpense')}
                variant={kind === k ? 'primary' : 'secondary'}
                onPress={() => handleSetKind(k)}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </View>

        {/* Category */}
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: t.spacing.xs }}>
            <Text variant="footnote" color="textMuted">{tr('record.categoryLabel')}</Text>
            {flags.has('category') ? <Text variant="caption" color="accentText">{tr('common.pleaseCheck')}</Text> : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -t.spacing.lg }} contentContainerStyle={{ paddingHorizontal: t.spacing.lg, gap: t.spacing.xs }}>
            {categories.map((c) => (
              <Pressable
                key={c}
                onPress={() => { setCategory(c as Category); unflag('category'); }}
                accessibilityRole="button"
                accessibilityState={{ selected: category === c }}
                style={{
                  paddingHorizontal: t.spacing.md,
                  paddingVertical: t.spacing.xs,
                  borderRadius: t.radius.pill,
                  backgroundColor: category === c ? t.colors.primary : t.colors.surfaceAlt,
                }}
              >
                <Text variant="caption" color={category === c ? 'onPrimary' : 'text'}>{tr(categoryLabelKey(c as Category))}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <DateField
          label={tr('record.dateLabel')}
          value={date}
          onChange={(d) => { setDate(d); unflag('performed_on'); }}
          maxDate={today}
          flagged={flags.has('performed_on')}
          accessibilityLabel={tr('record.dateLabel')}
        />

        <TextField
          label={tr('record.odometerOptional', { label: tr('record.odometerLabel'), unit: vehicle?.odometer_unit ?? 'mi' })}
          value={odometer}
          onChangeText={(v) => { setOdometer(v); unflag('odometer'); }}
          flagged={flags.has('odometer')}
          autoFocus={firstTextFlag === 'odometer'}
          keyboardType="number-pad"
          accessibilityLabel={tr('record.odometerLabel')}
        />

        {/* Shop / DIY */}
        <View style={{ gap: t.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
            <TextField
              label={tr('record.shopLabel')}
              hint={tr('record.shopHint')}
              value={isDiy ? '' : shopName}
              onChangeText={(v) => { setShopName(v); unflag('shop_name'); }}
              flagged={flags.has('shop_name') && !isDiy}
              autoFocus={firstTextFlag === 'shop_name' && !isDiy}
              editable={!isDiy}
              style={{ flex: 1, opacity: isDiy ? 0.5 : 1 }}
              accessibilityLabel={tr('record.shopLabel')}
            />
          </View>
          {receipt && !isDiy ? (
            <TextField
              label={tr('record.addressLabel')}
              value={shopAddress}
              onChangeText={(v) => { setShopAddress(v); unflag('shop_address'); }}
              flagged={flags.has('shop_address')}
              autoFocus={firstTextFlag === 'shop_address'}
              accessibilityLabel={tr('record.addressLabel')}
            />
          ) : null}
          <Pressable
            onPress={() => { setIsDiy(!isDiy); unflag('is_diy'); }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isDiy }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}
          >
            <View style={{
              width: 22, height: 22, borderRadius: 4,
              borderWidth: isDiy ? 0 : 1.5,
              borderColor: t.colors.border,
              backgroundColor: isDiy ? t.colors.primary : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {isDiy && <Text variant="caption" color="onPrimary">✓</Text>}
            </View>
            <Text variant="body">{tr('record.diyToggle')}</Text>
            {flags.has('is_diy') ? <Text variant="caption" color="accentText">{tr('common.pleaseCheck')}</Text> : null}
          </Pressable>
        </View>

        {/* Line items */}
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="footnote" color="textMuted">{tr('record.lineItemsLabel')}</Text>
          <Card padded>
            {items.map((item, i) => (
              <View key={item.id}>
                {i > 0 && <Divider />}
                <LineItemRow
                  item={item}
                  onChange={(updated) => { setItems((prev) => prev.map((it) => it.id === updated.id ? updated : it)); unflag(`item:${item.id}`); }}
                  onRemove={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}
                  flagged={flags.has(`item:${item.id}`)}
                  autoFocus={firstTextFlag === `item:${item.id}`}
                />
              </View>
            ))}
            <Button title={tr('record.addLineItem')} variant="ghost" onPress={addItem} style={{ marginTop: t.spacing.sm }} />
          </Card>
        </View>

        {/* Totals */}
        <Card padded>
          <View style={{ gap: t.spacing.sm }}>
            <MoneyField
              label={tr('record.taxLabel')}
              cents={taxCents}
              onChangeCents={(c) => { setTaxCents(c); unflag('tax_cents'); }}
              accessibilityLabel={tr('record.taxLabel')}
              flagged={flags.has('tax_cents')}
              autoFocus={firstTextFlag === 'tax_cents'}
            />
            <Divider />
            {itemized ? (
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text variant="headline">{tr('record.totalLabel')}</Text>
                <Text variant="headline" tabular>{formatCents(totalCents)}</Text>
              </View>
            ) : (
              <MoneyField
                label={tr('record.totalLabel')}
                hint={tr('record.totalHint')}
                cents={enteredTotalCents}
                onChangeCents={setEnteredTotalCents}
                accessibilityLabel={tr('record.totalLabel')}
              />
            )}
            {mismatch && draft?.receiptTotalCents != null ? (
              <Text variant="footnote" color="accentText" accessibilityLiveRegion="polite">
                {tr('record.mismatch', { receipt: formatCents(draft.receiptTotalCents), computed: formatCents(totalCents) })}
              </Text>
            ) : null}
          </View>
        </Card>

        <TextField
          label={tr('record.notesLabel')}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
          style={{ minHeight: 72, textAlignVertical: 'top' }}
          accessibilityLabel={tr('record.notesLabel')}
        />

        <Button title={tr('common.save')} onPress={() => void handleSave()} loading={isPending} />

        {recordId && (
          <>
            <Divider />
            <Button title={tr('record.deleteConfirm')} variant="destructive" onPress={handleDelete} />
          </>
        )}

        <Button title={tr('common.cancel')} variant="ghost" onPress={onCancel} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
