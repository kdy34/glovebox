// Shared record form (T037): kind, category, date, odometer, shop/DIY, line items, tax, total, notes.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { v4 as uuid } from 'uuid';
import { formatCents, lineAmountCents } from '@/domain/money';
import { SERVICE_CATEGORIES, EXPENSE_CATEGORIES, categoryLabelKey, type Category, type RecordKind } from '@/domain/categories';
import { useSaveRecord, useRecord, useLineItems, useDeleteRecord, useVehicle } from '@/data/queries';
import type { LineItemInput, RecordInput } from '@/data/repositories/records';
import { Button, Card, DateField, Divider, MoneyField, Screen, Text, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

interface Props {
  vehicleId?: string;
  recordId?: string;
  onSaved: (id: string) => void;
  onDeleted?: () => void;
  onCancel: () => void;
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

function LineItemRow({ item, onChange, onRemove }: {
  item: LineItemDraft;
  onChange: (updated: LineItemDraft) => void;
  onRemove: () => void;
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
          />
        </View>
        <Pressable
          onPress={onRemove}
          accessibilityRole="button"
          accessibilityLabel="Remove item"
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
            label="Amount"
            cents={item.amount_cents}
            onChangeCents={(c) => onChange({ ...item, amount_cents: c })}
            allowNegative={item.item_type === 'discount'}
            accessibilityLabel="Amount"
          />
        </View>
      </View>
    </View>
  );
}

export default function RecordForm({ vehicleId: propVehicleId, recordId, onSaved, onDeleted, onCancel }: Props) {
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { mutateAsync: save, isPending } = useSaveRecord();
  const { mutateAsync: deleteRecord } = useDeleteRecord();
  const { data: existing } = useRecord(recordId ?? '');
  const { data: existingItems = [] } = useLineItems(recordId ?? '');

  const vehicleId = propVehicleId ?? existing?.vehicle_id ?? '';
  const { data: vehicle } = useVehicle(vehicleId);

  const today = new Date().toISOString().slice(0, 10);

  // Form state
  const [kind, setKind] = useState<RecordKind>('service');
  const [category, setCategory] = useState<Category>('oil_change');
  const [date, setDate] = useState(today);
  const [odometer, setOdometer] = useState('');
  const [shopName, setShopName] = useState('');
  const [isDiy, setIsDiy] = useState(false);
  const [taxCents, setTaxCents] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItemDraft[]>([]);

  // Prefill from existing record — multiple setState calls per effect is intentional here
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!existing) return;
    setKind(existing.kind as RecordKind);
    setCategory(existing.category as Category);
    setDate(existing.performed_on);
    setOdometer(existing.odometer ? String(existing.odometer) : '');
    setShopName(existing.shop_name ?? '');
    setIsDiy(existing.is_diy);
    setTaxCents(existing.tax_cents);
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

  const subtotalCents = useMemo(() =>
    items.reduce((s, it) => s + (it.amount_cents ?? 0), 0),
    [items],
  );
  const totalCents = subtotalCents + (taxCents ?? 0);

  const addItem = () => {
    setItems((prev) => [...prev, {
      id: uuid(),
      item_type: 'labor',
      description: '',
      quantity: 1,
      unit_price_cents: null,
      amount_cents: null,
    }]);
  };

  const handleSave = useCallback(async () => {
    if (!vehicleId) return;
    if (items.length === 0) {
      Alert.alert('No items', 'Please add at least one line item.');
      return;
    }
    const id = recordId ?? uuid();
    const odomNum = odometer ? parseInt(odometer.replace(/,/g, ''), 10) : null;

    const record: RecordInput = {
      id,
      vehicle_id: vehicleId,
      kind,
      category,
      title: tr(categoryLabelKey(category)),
      performed_on: date,
      odometer: odomNum ?? null,
      shop_name: isDiy ? null : (shopName.trim() || null),
      shop_address: null,
      is_diy: isDiy,
      currency: 'USD',
      subtotal_cents: subtotalCents,
      tax_cents: taxCents ?? 0,
      total_cents: totalCents,
      notes: notes.trim() || null,
      source: 'manual',
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

    const odomEntry = odomNum
      ? {
          id: uuid(),
          vehicle_id: vehicleId,
          value: odomNum,
          unit: (vehicle?.odometer_unit ?? 'mi') as 'mi' | 'km',
          read_on: date,
          source: 'record' as const,
          record_id: id,
        }
      : null;

    try {
      await save({ record, items: lineItems, odometer: odomEntry });
      onSaved(id);
    } catch {
      Alert.alert('Error', tr('record.saveError'));
    }
  }, [vehicleId, recordId, kind, category, date, odometer, isDiy, shopName, subtotalCents, taxCents, totalCents, notes, items, vehicle, save, tr, onSaved]);

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
        <Text variant="title2">{recordId ? tr('record.editTitle') : tr('record.newTitle')}</Text>

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
          <Text variant="footnote" color="textMuted" style={{ marginBottom: t.spacing.xs }}>{tr('record.categoryLabel')}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -t.spacing.lg }} contentContainerStyle={{ paddingHorizontal: t.spacing.lg, gap: t.spacing.xs }}>
            {categories.map((c) => (
              <Pressable
                key={c}
                onPress={() => setCategory(c as Category)}
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
          onChange={setDate}
          maxDate={today}
          accessibilityLabel={tr('record.dateLabel')}
        />

        <TextField
          label={`${tr('record.odometerLabel')} (${vehicle?.odometer_unit ?? 'mi'}, optional)`}
          value={odometer}
          onChangeText={setOdometer}
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
              onChangeText={setShopName}
              editable={!isDiy}
              style={{ flex: 1, opacity: isDiy ? 0.5 : 1 }}
              accessibilityLabel={tr('record.shopLabel')}
            />
          </View>
          <Pressable
            onPress={() => setIsDiy(!isDiy)}
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
                  onChange={(updated) => setItems((prev) => prev.map((it) => it.id === updated.id ? updated : it))}
                  onRemove={() => setItems((prev) => prev.filter((it) => it.id !== item.id))}
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
              onChangeCents={setTaxCents}
              accessibilityLabel={tr('record.taxLabel')}
            />
            <Divider />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text variant="headline">{tr('record.totalLabel')}</Text>
              <Text variant="headline" tabular>{formatCents(totalCents)}</Text>
            </View>
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
