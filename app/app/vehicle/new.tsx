// Add vehicle screen (T035). VIN decode + manual year/make/model.
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { normalizeVin, validateVin } from '@/domain/vin';
import { decodeVin } from '@/services/vinDecoder';
import { useSaveVehicle } from '@/data/queries';
import { Button, Screen, Text, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';

type UnitOption = 'mi' | 'km';

export default function NewVehicle() {
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { mutateAsync: save, isPending } = useSaveVehicle();

  const [vin, setVin] = useState('');
  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [trim, setTrim] = useState('');
  const [nickname, setNickname] = useState('');
  const [unit, setUnit] = useState<UnitOption>('mi');
  const [decoding, setDecoding] = useState(false);
  const [vinError, setVinError] = useState('');

  const handleVinBlur = useCallback(async () => {
    if (!vin) return;
    const normalized = normalizeVin(vin);
    if (normalized.length !== 17) {
      setVinError('VIN must be 17 characters.');
      return;
    }
    const vinResult = validateVin(normalized);
    const { valid } = vinResult;
    const checkDigitOk = valid ? vinResult.checkDigitOk : false;
    if (!valid) { setVinError('Invalid VIN (contains I, O or Q, or wrong length).'); return; }
    if (!checkDigitOk) { setVinError('VIN check digit may be wrong — continuing with manual entry.'); }
    else { setVinError(''); }

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
  }, [vin]);

  const handleSave = useCallback(async () => {
    if (!year || !make || !model) {
      Alert.alert('Required fields', 'Please enter year, make and model.');
      return;
    }
    const yearNum = parseInt(year, 10);
    if (isNaN(yearNum) || yearNum < 1900 || yearNum > new Date().getFullYear() + 1) {
      Alert.alert('Invalid year', 'Please enter a valid year.');
      return;
    }
    try {
      const id = await save({
        year: yearNum,
        make: make.trim(),
        model: model.trim(),
        trim: trim.trim() || null,
        nickname: nickname.trim() || null,
        vin: vin ? normalizeVin(vin) : null,
        status: 'active',
        odometer_unit: unit,
        photo_path: null,
      });
      router.replace(`/vehicle/${id}`);
    } catch {
      Alert.alert('Error', tr('vehicle.saveError'));
    }
  }, [year, make, model, trim, nickname, vin, unit, save, tr]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen scroll>
        <Text variant="title2">{tr('vehicle.addTitle')}</Text>

        <TextField
          label={tr('vehicle.vinLabel')}
          hint={decoding ? tr('vehicle.vinDecoding') : tr('vehicle.vinHint')}
          value={vin}
          onChangeText={(v) => { setVin(v.toUpperCase()); setVinError(''); }}
          onBlur={() => void handleVinBlur()}
          error={vinError || undefined}
          autoCapitalize="characters"
          maxLength={17}
          keyboardType="default"
          returnKeyType="done"
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
      </Screen>
    </KeyboardAvoidingView>
  );
}
