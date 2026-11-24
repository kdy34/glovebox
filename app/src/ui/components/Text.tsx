import { Text as RNText, type TextProps } from 'react-native';
import { useTheme } from '../theme';
import type { ColorToken, TypeVariant } from '../tokens';

interface Props extends TextProps {
  variant?: TypeVariant;
  color?: ColorToken;
  tabular?: boolean;
  center?: boolean;
}

/** Dynamic Type is on by default (allowFontScaling); capped so layouts don't break at AX5. */
export function Text({ variant = 'body', color = 'text', tabular, center, style, ...rest }: Props) {
  const t = useTheme();
  return (
    <RNText
      maxFontSizeMultiplier={2}
      {...rest}
      style={[
        t.type[variant],
        { color: t.colors[color] },
        tabular && { fontVariant: ['tabular-nums'] },
        center && { textAlign: 'center' },
        style,
      ]}
    />
  );
}
