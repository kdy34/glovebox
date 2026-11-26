// Edit vehicle screen (T035). Pre-fills from existing vehicle data. A VIN decode only suggests
// changes; the user confirms each field (002 FR-007).
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { normalizeVin, validateVin } from '@/domain/vin';
import { decodeVin } from '@/services/vinDecoder';
import { FUEL_TYPES, DEFAULT_FUEL_TYPE, parseFuelType, showsElectricNotice, type FuelType } from '@/domain/fuelType';
import { applyVinSuggestions, vinSuggestions, type SuggestionField, type VinSuggestion } from '@/domain/vinSuggestion';
import { useVehicle, useSaveVehicle, useArchiveVehicle, useDeleteVehicle, useRules } from '@/data/queries';
import { Button, Card, Divider, Screen, TextField, SegmentedControl, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';
import { reportSaveError } from '@/services/saveError';

export default function EditVehicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { data: vehicle } = useVehicle(id ?? '');
  const { data: rules = [] } = useRules(id ?? '');
  const { mutateAsync: save, isPending } = useSaveVehicle();
  const { mutateAsync: archive } = useArchiveVehicle();
  const { mutateAsync: deleteVehicle } = useDeleteVehicle();

  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [nickname, setNickname] = useState('');
  const [unit, setUnit] = useState<'mi' | 'km'>('mi');
  const [fuel, setFuel] = useState<FuelType>(DEFAULT_FUEL_TYPE);
  const [suggestions, setSuggestions] = useState<VinSuggestion[]>([]);
  const [accepted, setAccepted] = useState<ReadonlySet<SuggestionField>>(new Set());
  const [decoding, setDecoding] = useState(false);
  const [vinError, setVinError] = useState('');

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!vehicle) return;
    setVin(vehicle.vin ?? '');
    setYear(String(vehicle.year));
    setMake(vehicle.make);
    setModel(vehicle.model);
    setTrim(vehicle.trim ?? '');
    setNickname(vehicle.nickname ?? '');
    setUnit(vehicle.odometer_unit as 'mi' | 'km');
    setFuel(parseFuelType(vehicle.fuel_type));
  }, [vehicle]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleVinBlur = useCallback(async () => {
    if (!vin || vin === vehicle?.vin) return;
    const normalized = normalizeVin(vin);
    if (normalized.length !== 17) return;
    const { valid } = validateVin(normalized);
    if (!valid) { setVinError('Invalid VIN.'); return; }
    setVinError('');
    setDecoding(true);
    try {
      const result = await decodeVin(normalized);
      if (result) {
        // FR-007: never overwrite silently; list what differs and let the user confirm.
        const next = vinSuggestions({ year, make, model, trim, fuelType: fuel }, result);
        setSuggestions(next);
        setAccepted(new Set(next.map((s) => s.field)));
      }
    } finally {
      setDecoding(false);
    }
  }, [vin, vehicle?.vin, year, make, model, trim, fuel]);

  const applySuggestions = useCallback(() => {
    const next = applyVinSuggestions({ year, make, model, trim, fuelType: fuel }, suggestions, accepted);
    setYear(next.year); setMake(next.make); setModel(next.model); setTrim(next.trim); setFuel(next.fuelType);
    setSuggestions([]);
  }, [year, make, model, trim, fuel, suggestions, accepted]);

  const toggleAccepted = (field: SuggestionField) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field); else next.add(field);
      return next;
    });
  };

  const showValue = (field: SuggestionField, value: string) =>
    !value ? tr('vehicle.suggest.none') : field === 'fuelType' ? tr(`vehicle.fuel.${value}`) : value;

  const handleSave = useCallback(async () => {
    if (!year || !make || !model || !id) return;
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum)) return;
    try {
      await save({
        id,
        year: yearNum,
        make: make.trim(),
        model: model.trim(),
        trim: trim.trim() || null,
        nickname: nickname.trim() || null,
        vin: vin ? normalizeVin(vin) : null,
        status: vehicle?.status ?? 'active',
        odometer_unit: unit,
        fuel_type: fuel,
        photo_path: vehicle?.photo_path ?? null,
      });
      router.back();
    } catch (err) {
      Alert.alert(tr('common.error'), reportSaveError('vehicle.update', err, tr('vehicle.saveError')));
    }
  }, [id, year, make, model, trim, nickname, vin, unit, fuel, vehicle, save, tr]);

  const handleArchive = () => {
    Alert.alert(
      tr('vehicle.archiveTitle'),
      tr('vehicle.archiveBody'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('vehicle.archiveConfirm'),
          onPress: async () => {
            if (!id) return;
            await archive(id);
            router.replace('/');
          },
        },
      ],
    );
  };

  const handleDelete = () => {
    Alert.alert(
      tr('vehicle.deleteTitle'),
      tr('vehicle.deleteBody'),
      [
        { text: tr('common.cancel'), style: 'cancel' },
        {
          text: tr('vehicle.deleteConfirm'),
          style: 'destructive',
          onPress: async () => {
            if (!id) return;
            await deleteVehicle(id);
            router.replace('/');
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen scroll>
        <TextField
          label={tr('vehicle.vinLabel')}
          value={vin}
          onChangeText={(v) => { setVin(v.toUpperCase()); setVinError(''); }}
          onBlur={() => void handleVinBlur()}
          error={vinError || undefined}
          autoCapitalize="characters"
          maxLength={17}
          accessibilityLabel={tr('vehicle.vinLabel')}
        />

        {suggestions.length > 0 ? (
          <Card>
            <View style={{ gap: t.spacing.sm }}>
              <Text variant="headline">{tr('vehicle.suggest.title')}</Text>
              {suggestions.map((s) => {
                const on = accepted.has(s.field);
                const line = tr('vehicle.suggest.line', {
                  field: tr(`vehicle.suggest.field.${s.field}`),
                  current: showValue(s.field, s.current),
                  suggested: showValue(s.field, s.suggested),
                });
                return (
                  <Pressable
                    key={s.field}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={line}
                    onPress={() => toggleAccepted(s.field)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm, minHeight: 44 }}
                  >
                    <Text variant="headline" color={on ? 'accentText' : 'textMuted'}>{on ? '☑' : '☐'}</Text>
                    <Text variant="callout" style={{ flex: 1 }}>{line}</Text>
                  </Pressable>
                );
              })}
              <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
                <Button title={tr('vehicle.suggest.dismiss')} variant="ghost" style={{ flex: 1 }} onPress={() => setSuggestions([])} />
                <Button title={tr('vehicle.suggest.apply')} style={{ flex: 1 }} disabled={accepted.size === 0} onPress={applySuggestions} />
              </View>
            </View>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <TextField
              label={tr('vehicle.yearLabel')}
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              maxLength={4}
              accessibilityLabel={tr('vehicle.yearLabel')}
            />
          </View>
          <View style={{ flex: 2 }}>
            <TextField
              label={tr('vehicle.makeLabel')}
              value={make}
              onChangeText={setMake}
              autoCapitalize="words"
              accessibilityLabel={tr('vehicle.makeLabel')}
            />
          </View>
        </View>

        <TextField
          label={tr('vehicle.modelLabel')}
          value={model}
          onChangeText={setModel}
          autoCapitalize="words"
          accessibilityLabel={tr('vehicle.modelLabel')}
        />

        <TextField
          label={tr('vehicle.trimLabel')}
          value={trim}
          onChangeText={setTrim}
          autoCapitalize="words"
          accessibilityLabel={tr('vehicle.trimLabel')}
        />

        <TextField
          label={tr('vehicle.nicknameLabel')}
          hint={tr('vehicle.nicknameHint')}
          value={nickname}
          onChangeText={setNickname}
          accessibilityLabel={tr('vehicle.nicknameLabel')}
        />

        <SegmentedControl
          label={tr('vehicle.unitLabel')}
          value={unit}
          onChange={setUnit}
          options={[{ value: 'mi', label: tr('vehicle.mi') }, { value: 'km', label: tr('vehicle.km') }]}
        />

        <SegmentedControl
          label={tr('vehicle.fuelTypeLabel')}
          layout="wrap"
          value={fuel}
          onChange={setFuel}
          options={FUEL_TYPES.map((f) => ({ value: f, label: tr(`vehicle.fuel.${f}`) }))}
        />

        {/* 002 FR-006: only for a car that has reminders (001 T064) */}
        {vehicle && rules.length > 0 && showsElectricNotice(parseFuelType(vehicle.fuel_type), fuel) ? (
          <Text variant="footnote" color="textMuted" accessibilityLiveRegion="polite">{tr('vehicle.electricNotice')}</Text>
        ) : null}

        <Button
          title={tr('common.save')}
          onPress={() => void handleSave()}
          loading={isPending || decoding}
        />

        <Divider />

        <Button
          title={tr('vehicle.archiveTitle')}
          variant="ghost"
          onPress={handleArchive}
        />

        <Button
          title={tr('vehicle.deleteTitle')}
          variant="destructive"
          onPress={handleDelete}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
