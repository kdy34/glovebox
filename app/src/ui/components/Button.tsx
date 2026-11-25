import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Pressable, View, type PressableProps } from 'react-native';
import { useTheme } from '../theme';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

interface Props extends Omit<PressableProps, 'children'> {
  title: string;
  variant?: Variant;
  loading?: boolean;
  icon?: React.ReactNode;
  haptic?: boolean;
}

export function Button({ title, variant = 'primary', loading, disabled, icon, haptic = true, onPress, style, ...rest }: Props) {
  const t = useTheme();
  const bg = { primary: t.colors.primary, secondary: t.colors.surfaceAlt, ghost: 'transparent', destructive: t.colors.danger }[variant];
  const fg = ({ primary: 'onPrimary', secondary: 'text', ghost: 'accentText', destructive: 'onPrimary' } as const)[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      onPress={(e) => {
        if (haptic) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      // The caller's style is merged after ours, never instead of it (T103a: a `style` prop used
      // to replace the whole function style, dropping the fill and leaving white text on nothing).
      style={(state) => [{
        minHeight: 50, // ≥ 44pt touch target
        borderRadius: t.radius.md,
        backgroundColor: variant === 'destructive' ? t.colors.dangerText : bg,
        opacity: isDisabled ? 0.5 : state.pressed ? 0.85 : 1,
        paddingHorizontal: t.spacing.lg,
        alignItems: 'center',
        justifyContent: 'center',
      }, typeof style === 'function' ? style(state) : style]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={t.colors[fg]} />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.spacing.sm }}>
          {icon}
          <Text variant="headline" color={fg}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
