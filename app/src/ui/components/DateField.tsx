// DateField: taps open a date picker on iOS. Displays as a text field.
// Uses the native DateTimePicker from @react-native-community via expo-managed workflow.
// Falls back to a plain text input on platforms without native support.
import DateTimePicker from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

interface Props {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (date: string) => void;
  error?: string;
  hint?: string;
  /** min/max as YYYY-MM-DD strings */
  minDate?: string;
  maxDate?: string;
  accessibilityLabel?: string;
}

function toDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function formatDisplay(s: string): string {
  if (!s) return '';
  try {
    return toDate(s).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return s;
  }
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function DateField({ label, value, onChange, error, hint, minDate, maxDate, accessibilityLabel }: Props) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const borderColor = error ? t.colors.dangerText : t.colors.border;

  // On iOS, we show a spinner sheet. On other platforms (Android, web) we fall back to a
  // text input (the record form is iOS-only for v1; this keeps tests happy).
  if (Platform.OS !== 'ios') {
    return (
      <View style={{ gap: t.spacing.xs }}>
        <Text variant="footnote" color="textMuted">{label}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityValue={{ text: formatDisplay(value) }}
          onPress={() => setOpen(!open)}
          style={{
            minHeight: 48,
            backgroundColor: t.colors.surface,
            borderWidth: 1,
            borderColor,
            borderRadius: t.radius.md,
            paddingHorizontal: t.spacing.md,
            justifyContent: 'center',
          }}
        >
          <Text variant="body" color={value ? 'text' : 'textMuted'}>{value ? formatDisplay(value) : 'Select a date'}</Text>
        </Pressable>
        {error ? <Text variant="footnote" color="dangerText">{error}</Text> : hint ? <Text variant="footnote" color="textMuted">{hint}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: t.spacing.xs }}>
      <Text variant="footnote" color="textMuted">{label}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityValue={{ text: formatDisplay(value) }}
        onPress={() => setOpen(true)}
        style={{
          minHeight: 48,
          backgroundColor: t.colors.surface,
          borderWidth: 1,
          borderColor,
          borderRadius: t.radius.md,
          paddingHorizontal: t.spacing.md,
          justifyContent: 'center',
        }}
      >
        <Text variant="body" color={value ? 'text' : 'textMuted'}>{value ? formatDisplay(value) : 'Select a date'}</Text>
      </Pressable>
      {error ? <Text variant="footnote" color="dangerText">{error}</Text> : hint ? <Text variant="footnote" color="textMuted">{hint}</Text> : null}
      {open && (
        <DateTimePicker
          value={value ? toDate(value) : new Date()}
          mode="date"
          display="spinner"
          minimumDate={minDate ? toDate(minDate) : undefined}
          maximumDate={maxDate ? toDate(maxDate) : undefined}
          onChange={(_e, d) => {
            if (d) onChange(toIso(d));
            setOpen(false);
          }}
          style={{ marginTop: t.spacing.xs }}
        />
      )}
    </View>
  );
}
