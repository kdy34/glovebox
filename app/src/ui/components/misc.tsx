// Small building blocks: Screen, Chip, ListRow, EmptyState, Divider.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View, type ScrollViewProps } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import type { ColorToken } from '../tokens';
import { Button } from './Button';
import { Text } from './Text';

export function Screen({ children, scroll = true, ...rest }: { children: ReactNode; scroll?: boolean } & ScrollViewProps) {
  const t = useTheme();
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={{ padding: t.spacing.lg, gap: t.spacing.lg, paddingBottom: t.spacing.xxxl }}
      keyboardShouldPersistTaps="handled"
      {...rest}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={{ flex: 1, padding: t.spacing.lg, gap: t.spacing.lg }}>{children}</View>
  );
  return <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: t.colors.bg }}>{content}</SafeAreaView>;
}

type ChipTone = 'neutral' | 'accent' | 'success' | 'danger';
export function Chip({ label, tone = 'neutral', onPress, selected }: { label: string; tone?: ChipTone; onPress?: () => void; selected?: boolean }) {
  const t = useTheme();
  const map: Record<ChipTone, { bg: string; fg: ColorToken }> = {
    neutral: { bg: selected ? t.colors.primary : t.colors.surfaceAlt, fg: selected ? 'onPrimary' : 'text' },
    accent: { bg: t.colors.accent, fg: 'onAccent' },
    success: { bg: t.colors.successBg, fg: 'successText' },
    danger: { bg: t.colors.dangerBg, fg: 'dangerText' },
  };
  const s = map[tone];
  const body = (
    <View style={{ backgroundColor: s.bg, borderRadius: t.radius.pill, paddingHorizontal: t.spacing.md, paddingVertical: t.spacing.xs, alignSelf: 'flex-start' }}>
      <Text variant="caption" color={s.fg}>{label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: !!selected }} onPress={onPress} hitSlop={8}>
      {body}
    </Pressable>
  );
}

export function ListRow({ title, subtitle, right, onPress, accessibilityLabel }: {
  title: string; subtitle?: string; right?: ReactNode; onPress?: () => void; accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      disabled={!onPress}
      onPress={onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      style={({ pressed }) => ({
        minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: t.spacing.md,
        paddingVertical: t.spacing.sm, opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body">{title}</Text>
        {subtitle ? <Text variant="footnote" color="textMuted">{subtitle}</Text> : null}
      </View>
      {right}
    </Pressable>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: 1, backgroundColor: t.colors.border }} />;
}

export function EmptyState({ title, body, actionTitle, onAction, illustration }: {
  title: string; body: string; actionTitle?: string; onAction?: () => void; illustration?: ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', gap: t.spacing.md, paddingVertical: t.spacing.xxxl, paddingHorizontal: t.spacing.xl }}>
      {illustration}
      <Text variant="title2" center>{title}</Text>
      <Text variant="callout" color="textMuted" center>{body}</Text>
      {actionTitle && onAction ? <View style={{ alignSelf: 'stretch', marginTop: t.spacing.sm }}><Button title={actionTitle} onPress={onAction} /></View> : null}
    </View>
  );
}
