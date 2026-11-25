// T103a — a labelled single-choice selector (e.g. Miles / Kilometers). The selected option is a
// filled navy (`selectedBg`) with `onSelected` text; that pair is in textPairs and contrast-tested.
import * as Haptics from 'expo-haptics';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

interface Props<T extends string> {
  label?: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function SegmentedControl<T extends string>({ label, value, options, onChange }: Props<T>) {
  const t = useTheme();
  return (
    <View>
      {label ? (
        <Text variant="footnote" color="textMuted" style={{ marginBottom: t.spacing.xs }}>{label}</Text>
      ) : null}
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        style={{ flexDirection: 'row', backgroundColor: t.colors.surfaceAlt, borderRadius: t.radius.md, padding: t.spacing.xxs, gap: t.spacing.xxs }}
      >
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityLabel={o.label}
              accessibilityState={{ checked: selected }}
              onPress={() => {
                if (selected) return;
                void Haptics.selectionAsync();
                onChange(o.value);
              }}
              style={{
                flex: 1,
                minHeight: 44,
                borderRadius: t.radius.sm,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: selected ? t.colors.selectedBg : t.colors.surfaceAlt,
              }}
            >
              <Text variant="headline" color={selected ? 'onSelected' : 'text'}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
