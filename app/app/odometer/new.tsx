// Odometer entry screen (T038). Rollback warning and override.
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { checkNewReading, type Reading } from '@/domain/odometer';
import { useOdometerReadings, useSaveOdometerReading, useVehicle } from '@/data/queries';
import type { OdometerRow } from '@/data/types';
import { Button, DateField, Screen, Text, TextField } from '@/ui/components';
import { useTheme } from '@/ui/theme';
import { reportSaveError } from '@/services/saveError';

export default function NewOdometer() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId: string }>();
  const { t: tr } = useTranslation();
  const t = useTheme();
  const { data: vehicle } = useVehicle(vehicleId ?? '');
  const { data: readings = [] } = useOdometerReadings(vehicleId ?? '');
  const { mutateAsync: saveReading, isPending } = useSaveOdometerReading();

  const today = new Date().toISOString().slice(0, 10);
  const [value, setValue] = useState('');
  const [date, setDate] = useState(today);
  const [warning, setWarning] = useState<string | null>(null);

  const unit = vehicle?.odometer_unit ?? 'mi';

  const handleSave = useCallback(async (override = false) => {
    if (!vehicleId || !value) return;
    const numeric = parseInt(value.replace(/,/g, ''), 10);
    if (isNaN(numeric) || numeric <= 0) {
      Alert.alert('Invalid value', 'Please enter a valid odometer reading.');
      return;
    }

    // Map DB rows to domain Reading shape
    const domainReadings: Reading[] = (readings as OdometerRow[]).map((r) => ({
      value: r.value,
      unit: r.unit as 'mi' | 'km',
      readOn: r.read_on,
      isExcluded: r.is_excluded,
    }));
    const check = checkNewReading(domainReadings, { value: numeric, unit: unit as 'mi' | 'km', readOn: date });
    if (!check.ok && !override) {
      const isRollback = check.warning === 'rollback';
      const msg = isRollback ? tr('odometer.rollbackWarning') : tr('odometer.jumpWarning');
      setWarning(msg);
      return;
    }

    try {
      await saveReading({ vehicle_id: vehicleId, value: numeric, unit: unit as 'mi' | 'km', read_on: date, source: 'manual' });
      router.back();
    } catch (err) {
      Alert.alert(tr('common.error'), reportSaveError('odometer', err, tr('odometer.saveError')));
    }
  }, [vehicleId, value, date, unit, readings, saveReading, tr]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <Screen scroll>
        <TextField
          label={`${tr('odometer.valueLabel')} (${unit})`}
          value={value}
          onChangeText={(v) => { setValue(v); setWarning(null); }}
          keyboardType="number-pad"
          accessibilityLabel={tr('odometer.valueLabel')}
          autoFocus
        />

        <DateField
          label={tr('odometer.dateLabel')}
          value={date}
          onChange={(d) => { setDate(d); setWarning(null); }}
          maxDate={today}
          accessibilityLabel={tr('odometer.dateLabel')}
        />

        {warning && (
          <View style={{ backgroundColor: t.dark ? '#3A2E10' : '#FFF3CD', borderRadius: t.radius.md, padding: t.spacing.md, gap: t.spacing.sm }}>
            <Text variant="callout" color="warningText">{warning}</Text>
            <Button
              title={tr('odometer.rollbackOverride')}
              variant="ghost"
              onPress={() => void handleSave(true)}
            />
          </View>
        )}

        {!warning && (
          <Button
            title={tr('common.save')}
            onPress={() => void handleSave()}
            loading={isPending}
          />
        )}

        <Button title={tr('common.cancel')} variant="ghost" onPress={() => router.back()} />
      </Screen>
    </KeyboardAvoidingView>
  );
}
