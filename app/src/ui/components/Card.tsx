import { Pressable, View, type ViewProps } from 'react-native';
import { useTheme } from '../theme';

interface Props extends ViewProps {
  onPress?: () => void;
  accessibilityLabel?: string;
  padded?: boolean;
}

export function Card({ onPress, padded = true, style, children, accessibilityLabel, ...rest }: Props) {
  const t = useTheme();
  const base = {
    backgroundColor: t.colors.surface,
    borderRadius: t.radius.lg,
    padding: padded ? t.spacing.lg : 0,
    borderWidth: t.dark ? 1 : 0,
    borderColor: t.colors.border,
    shadowColor: '#0F1B2D',
    shadowOpacity: t.dark ? 0 : 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  } as const;
  if (!onPress) return <View style={[base, style]} {...rest}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] }, style]}
    >
      {children}
    </Pressable>
  );
}
