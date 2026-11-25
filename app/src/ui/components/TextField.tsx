import { forwardRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme';
import { Text } from './Text';

export interface TextFieldProps extends TextInputProps {
  label: string;
  error?: string;
  hint?: string;
  /** AI draft field with low confidence — highlighted for review (FR-013). */
  flagged?: boolean;
}

export const TextField = forwardRef<TextInput, TextFieldProps>(function TextField(
  { label, error, hint, flagged, style, ...rest },
  ref,
) {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const borderColor = error ? t.colors.dangerText : flagged ? t.colors.accent : t.colors.border;
  return (
    <View style={{ gap: t.spacing.xs }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text variant="footnote" color="textMuted">{label}</Text>
        {flagged && !error ? <Text variant="caption" color="accentText">{tr('common.pleaseCheck')}</Text> : null}
      </View>
      <TextInput
        ref={ref}
        accessibilityLabel={label}
        accessibilityHint={error ?? (flagged ? tr('common.pleaseCheckHint') : hint)}
        placeholderTextColor={t.colors.textMuted}
        maxFontSizeMultiplier={2}
        style={[
          t.type.body,
          {
            minHeight: 48,
            color: t.colors.text,
            backgroundColor: flagged ? (t.dark ? '#2A2410' : '#FFF8E6') : t.colors.surface,
            borderWidth: flagged || error ? 2 : 1,
            borderColor,
            borderRadius: t.radius.md,
            paddingHorizontal: t.spacing.md,
          },
          style,
        ]}
        {...rest}
      />
      {error ? <Text variant="footnote" color="dangerText">{error}</Text> : hint ? <Text variant="footnote" color="textMuted">{hint}</Text> : null}
    </View>
  );
});
