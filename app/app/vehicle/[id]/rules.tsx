// Rules screen (T064, FR-018/019/020): the car's reminders with due status, generic suggestions
// that fit its fuel type (002 FR-004), custom rules, edit, on/off and delete. Generic rules carry
// the "Generic — check your owner's manual" label (Principle II, US3 AS4).
import { useMemo, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useDeleteRule, useOdometerReadings, useRecords, useRules, useSaveRule, useSetRuleActive, useVehicle } from '@/data/queries';
import type { MaintenanceRuleRow } from '@/data/types';
import { buildDueItems } from '@/domain/dueItems';
import { parseFuelType } from '@/domain/fuelType';
import { SERVICE_CATEGORIES, categoryLabelKey, type ServiceCategory } from '@/domain/categories';
import { baselineFromRecords, genericSuggestions, parseRuleForm, ruleFromGeneric, type RuleFormInput, type RuleFormResult } from '@/domain/ruleForm';
import type { Due, DueStatus } from '@/domain/reminders';
import { askForNotifications } from '@/services/notifications';
import { track } from '@/services/analytics';
import { formatDistance, formatDueDate, localToday } from '@/features/reminders/format';
import { Button, Card, Chip, Screen, Text, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

const TONE: Record<DueStatus, 'danger' | 'accent' | 'success' | 'neutral'> = { overdue: 'danger', due_soon: 'accent', ok: 'success', unknown: 'neutral' };

function confirm(title: string, body: string, yes: string, no: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, body, [
      { text: no, style: 'cancel', onPress: () => resolve(false) },
      { text: yes, onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

type Editor = { ruleId?: string; form: RuleFormInput; ownersManual: boolean; errors?: Extract<RuleFormResult, { ok: false }>['errors'] };

const emptyForm = (): RuleFormInput => ({ name: '', serviceCategory: 'other_maintenance', intervalMiles: '', intervalMonths: '', leadDays: '14', leadMiles: '500' });
const formOf = (r: MaintenanceRuleRow): RuleFormInput => ({
  name: r.name, serviceCategory: r.service_category as ServiceCategory,
  intervalMiles: r.interval_miles?.toString() ?? '', intervalMonths: r.interval_months?.toString() ?? '',
  leadDays: String(r.lead_days), leadMiles: String(r.lead_miles),
});

export default function RulesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const vehicleId = id ?? '';
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { data: vehicle } = useVehicle(vehicleId);
  const { data: rules = [] } = useRules(vehicleId);
  const { data: records = [] } = useRecords(vehicleId);
  const { data: readings = [] } = useOdometerReadings(vehicleId);
  const { mutateAsync: saveRule } = useSaveRule();
  const { mutateAsync: setActive } = useSetRuleActive();
  const { mutateAsync: removeRule } = useDeleteRule();
  const [editor, setEditor] = useState<Editor | null>(null);

  const unit = vehicle?.odometer_unit ?? 'mi';
  const dueByRule = useMemo(() => {
    if (!vehicle) return new Map<string, Due>();
    const items = buildDueItems([{ ...vehicle, status: 'active' }], rules, { [vehicleId]: readings }, localToday());
    return new Map(items.map((i) => [i.rule.id, i.due]));
  }, [vehicle, rules, readings, vehicleId]);
  const suggestions = vehicle ? genericSuggestions(parseFuelType(vehicle.fuel_type), rules, (k) => tr(`rules.generic.${k}`)) : [];
  const sorted = [...rules].sort((a, b) => Number(b.is_active) - Number(a.is_active));

  const afterFirstRule = async () => {
    if (rules.length > 0) return;
    await askForNotifications(() => confirm(tr('reminders.permissionTitle'), tr('reminders.permissionBody'), tr('reminders.permissionYes'), tr('reminders.permissionNo')));
  };

  const addGeneric = async (key: string) => {
    const g = suggestions.find((s) => s.key === key);
    if (!g) return;
    const { source, ...fields } = ruleFromGeneric(g, tr(g.nameKey));
    await saveRule({ vehicleId, fields, source, baseline: baselineFromRecords(records, g.serviceCategory) });
    track('reminder_created', { source });
    await afterFirstRule();
  };

  const saveEditor = async () => {
    if (!editor) return;
    const parsed = parseRuleForm(editor.form);
    if (!parsed.ok) { setEditor({ ...editor, errors: parsed.errors }); return; }
    if (editor.ruleId) {
      await saveRule({ id: editor.ruleId, vehicleId, fields: parsed.value });
    } else {
      const source = editor.ownersManual ? 'owners_manual' : 'user';
      await saveRule({ vehicleId, fields: parsed.value, source, baseline: baselineFromRecords(records, parsed.value.service_category) });
      track('reminder_created', { source });
      await afterFirstRule();
    }
    setEditor(null);
  };

  const dueText = (d: Due) => {
    const date = d.dueOn ? formatDueDate(d.dueOn) : null;
    const odo = d.dueOdometer !== null ? formatDistance(d.dueOdometer, unit) : null;
    if (date && odo) return tr('reminders.dueOnOrAt', { date, odo });
    if (date) return tr('reminders.dueOn', { date });
    if (odo) return tr('reminders.dueAt', { odo });
    return null;
  };

  const setField = (k: keyof RuleFormInput, v: string) => editor && setEditor({ ...editor, form: { ...editor.form, [k]: v }, errors: undefined });
  const err = (k: string) => editor?.errors?.[k as keyof NonNullable<Editor['errors']>] ? tr(`reminders.form.error.${k}`) : undefined;

  return (
    <Screen scroll>
      <Text variant="headline">{tr('reminders.yours')}</Text>
      {rules.length === 0 ? <Text variant="callout" color="textMuted">{tr('reminders.none')}</Text> : null}
      {sorted.map((r) => {
        const d = dueByRule.get(r.id);
        return (
          <Card key={r.id}>
            <View style={{ gap: t.spacing.xs }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: t.spacing.sm }}>
                <Text variant="headline" style={{ flex: 1 }}>{r.name}</Text>
                {r.is_active && d ? <Chip label={tr(`reminders.status.${d.status}`)} tone={TONE[d.status]} /> : <Chip label={tr('reminders.off')} />}
              </View>
              {r.source === 'generic' ? <Text variant="footnote" color="textMuted">{tr('rules.genericLabel')}</Text> : null}
              {r.source === 'owners_manual' ? <Text variant="footnote" color="textMuted">{tr('reminders.ownersManual')}</Text> : null}
              {r.is_active && d && dueText(d) ? <Text variant="callout">{dueText(d)}</Text> : null}
              {r.is_active && d?.decidedBy === 'mileage' ? <Text variant="footnote" color="textMuted">{tr('reminders.decidedByMileage')}</Text> : null}
              {r.is_active && d?.needsOdometer ? (
                <View style={{ gap: t.spacing.xs }}>
                  <Text variant="footnote" color="textMuted">{tr('reminders.needsOdometer')}</Text>
                  <Button title={tr('reminders.addReading')} variant="secondary" onPress={() => router.push(`/odometer/new?vehicleId=${vehicleId}`)} />
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: t.spacing.sm, flexWrap: 'wrap' }}>
                <Button title={tr('reminders.edit')} variant="ghost" onPress={() => setEditor({ ruleId: r.id, form: formOf(r), ownersManual: r.source === 'owners_manual' })} />
                <Button title={r.is_active ? tr('reminders.turnOff') : tr('reminders.turnOn')} variant="ghost" onPress={() => void setActive({ id: r.id, isActive: !r.is_active })} />
                <Button
                  title={tr('reminders.delete')}
                  variant="ghost"
                  onPress={() => Alert.alert(tr('reminders.deleteTitle'), tr('reminders.deleteBody'), [
                    { text: tr('common.cancel'), style: 'cancel' },
                    { text: tr('reminders.delete'), style: 'destructive', onPress: () => void removeRule(r.id) },
                  ])}
                />
              </View>
            </View>
          </Card>
        );
      })}

      {suggestions.length > 0 ? (
        <View style={{ gap: t.spacing.sm }}>
          <Text variant="headline">{tr('reminders.suggested')}</Text>
          {suggestions.map((g) => {
            const name = tr(g.nameKey);
            const every = [g.intervalMiles ? formatDistance(g.intervalMiles, unit) : null, g.intervalMonths ? `${g.intervalMonths} mo` : null].filter(Boolean).join(' / ');
            return (
              <Card key={g.key}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
                  <View style={{ flex: 1, gap: t.spacing.xxs }}>
                    <Text variant="body">{name}</Text>
                    <Text variant="footnote" color="textMuted">{every}</Text>
                    <Text variant="footnote" color="textMuted">{tr('rules.genericLabel')}</Text>
                  </View>
                  <Button
                    title={tr('reminders.addSuggestion')}
                    variant="secondary"
                    accessibilityLabel={tr('reminders.addSuggestionA11y', { name })}
                    onPress={() => void addGeneric(g.key)}
                  />
                </View>
              </Card>
            );
          })}
        </View>
      ) : null}

      {editor ? (
        <Card>
          <View style={{ gap: t.spacing.sm }}>
            <TextField label={tr('reminders.form.name')} value={editor.form.name} onChangeText={(v) => setField('name', v)} error={err('name')} maxLength={60} />
            <Text variant="footnote" color="textMuted">{tr('reminders.form.category')}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: t.spacing.xs }}>
              {SERVICE_CATEGORIES.map((c) => (
                <Chip key={c} label={tr(categoryLabelKey(c))} selected={editor.form.serviceCategory === c} onPress={() => setField('serviceCategory', c)} />
              ))}
            </View>
            <TextField label={tr('reminders.form.intervalMiles', { unit })} value={editor.form.intervalMiles} onChangeText={(v) => setField('intervalMiles', v)} keyboardType="number-pad" error={err('intervalMiles') ?? err('interval')} />
            <TextField label={tr('reminders.form.intervalMonths')} value={editor.form.intervalMonths} onChangeText={(v) => setField('intervalMonths', v)} keyboardType="number-pad" error={err('intervalMonths')} />
            <TextField label={tr('reminders.form.leadDays')} value={editor.form.leadDays} onChangeText={(v) => setField('leadDays', v)} keyboardType="number-pad" error={err('leadDays')} />
            <TextField label={tr('reminders.form.leadMiles', { unit })} value={editor.form.leadMiles} onChangeText={(v) => setField('leadMiles', v)} keyboardType="number-pad" error={err('leadMiles')} />
            {!editor.ruleId ? (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: editor.ownersManual }}
                onPress={() => setEditor({ ...editor, ownersManual: !editor.ownersManual })}
                style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 44 }}
              >
                <Text variant="headline" color={editor.ownersManual ? 'accentText' : 'textMuted'}>{editor.ownersManual ? '☑' : '☐'}</Text>
                <Text variant="body" style={{ flex: 1 }}>{tr('reminders.ownersManualToggle')}</Text>
              </Pressable>
            ) : null}
            <Button title={tr('reminders.form.save')} onPress={() => void saveEditor()} />
            <Button title={tr('common.cancel')} variant="ghost" onPress={() => setEditor(null)} />
          </View>
        </Card>
      ) : (
        <Button title={tr('reminders.custom')} variant="secondary" onPress={() => setEditor({ form: emptyForm(), ownersManual: false })} />
      )}
    </Screen>
  );
}
