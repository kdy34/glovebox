// Edit vehicle screen (T035). Pre-fills from existing vehicle data.
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { normalizeVin, validateVin } from '@/domain/vin';
import { decodeVin } from '@/services/vinDecoder';
import { useVehicle, useSaveVehicle, useArchiveVehicle, useDeleteVehicle } from '@/data/queries';
import { Button, Divider, Screen, Text, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

export default function EditVehicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { data: vehicle } = useVehicle(id ?? '');
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
        if (result.year) setYear(String(result.year));
        if (result.make) setMake(result.make);
        if (result.model) setModel(result.model);
        if (result.trim) setTrim(result.trim);
      }
    } finally {
      setDecoding(false);
    }
  }, [vin, vehicle?.vin]);

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
        photo_path: vehicle?.photo_path ?? null,
      });
      router.back();
    } catch {
      Alert.alert('Error', tr('vehicle.saveError'));
    }
  }, [id, year, make, model, trim, nickname, vin, unit, vehicle, save, tr]);

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
        <Text variant="title2">{tr('vehicle.editTitle')}</Text>

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

        <View>
          <Text variant="footnote" color="textMuted" style={{ marginBottom: t.spacing.xs }}>{tr('vehicle.unitLabel')}</Text>
          <View style={{ flexDirection: 'row', gap: t.spacing.sm }}>
            {(['mi', 'km'] as const).map((u) => (
              <Button
                key={u}
                title={u === 'mi' ? tr('vehicle.mi') : tr('vehicle.km')}
                variant={unit === u ? 'primary' : 'secondary'}
                onPress={() => setUnit(u)}
                style={{ flex: 1 }}
              />
            ))}
          </View>
        </View>

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
