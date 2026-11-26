// Vehicle health ring (T066): the share of a car's reminders that are on track.
// Colors come from tokens; the label and value make it readable with VoiceOver.
import Svg, { Circle } from 'react-native-svg';
import { View } from 'react-native';
import { useTheme } from '../theme';

interface Props {
  /** 0–1 */
  progress: number;
  tone: 'success' | 'accent' | 'danger';
  size?: number;
  stroke?: number;
  accessibilityLabel: string;
}

export function ProgressRing({ progress, tone, size = 44, stroke = 4, accessibilityLabel }: Props) {
  const t = useTheme();
  const p = Math.min(1, Math.max(0, progress));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const color = { success: t.colors.success, accent: t.colors.accent, danger: t.colors.danger }[tone];
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.colors.surfaceAlt} strokeWidth={stroke} fill="none" />
        <Circle
          testID="progress-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={[c, c]}
          strokeDashoffset={c * (1 - p)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
    </View>
  );
}
