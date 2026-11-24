// T024 — three value slides, then sign-in. Respects Reduce Motion (no auto-advance).
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, useWindowDimensions, View, type ViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Button, Text } from '@/ui/components';
import { useTheme } from '@/ui/theme';

const slides = ['1', '2', '3'] as const;

function Illustration({ index }: { index: number }) {
  const t = useTheme();
  const ink = t.colors.text;
  const amber = t.colors.accent;
  if (index === 0) // receipt
    return (
      <Svg width={180} height={180} viewBox="0 0 180 180">
        <Rect x={50} y={20} width={80} height={130} rx={6} fill={t.colors.surface} stroke={ink} strokeWidth={3} />
        {[45, 60, 75, 90].map((y) => <Path key={y} d={`M64 ${y}h52`} stroke={t.colors.textMuted} strokeWidth={3} strokeLinecap="round" />)}
        <Path d="M64 115h30" stroke={ink} strokeWidth={4} strokeLinecap="round" />
        <Circle cx={128} cy={140} r={26} fill={amber} />
        <Path d="M116 140l8 8 16-16" stroke={t.colors.onAccent} strokeWidth={5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  if (index === 1) // bell + ring
    return (
      <Svg width={180} height={180} viewBox="0 0 180 180">
        <Circle cx={90} cy={90} r={70} stroke={t.colors.surfaceAlt} strokeWidth={14} fill="none" />
        <Path d="M90 20a70 70 0 0 1 60 106" stroke={amber} strokeWidth={14} fill="none" strokeLinecap="round" />
        <Path d="M90 122a8 8 0 0 0 8-8H82a8 8 0 0 0 8 8zm22-20V86a22 22 0 1 0-44 0v16l-8 8h60z" fill={ink} />
      </Svg>
    );
  return ( // shield + check (proof)
    <Svg width={180} height={180} viewBox="0 0 180 180">
      <Path d="M90 20l55 20v40c0 38-24 64-55 80-31-16-55-42-55-80V40z" fill={t.colors.surface} stroke={ink} strokeWidth={3} />
      <Path d="M65 90l18 18 34-36" stroke={amber} strokeWidth={8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export default function Onboarding() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const listRef = useRef<FlatList<(typeof slides)[number]>>(null);
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems[0]?.index != null) setIndex(viewableItems[0].index);
  }).current;

  const last = index === slides.length - 1;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.colors.bg }}>
      <FlatList
        ref={listRef}
        data={slides}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item, index: i }) => (
          <View style={{ width, padding: t.spacing.xl, justifyContent: 'center', alignItems: 'center', gap: t.spacing.xl }}>
            <Illustration index={i} />
            <Text variant="title" center accessibilityRole="header">{tr(`onboarding.slide${item}Title`)}</Text>
            <Text variant="body" color="textMuted" center>{tr(`onboarding.slide${item}Body`)}</Text>
          </View>
        )}
      />
      <View style={{ padding: t.spacing.xl, gap: t.spacing.lg }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: t.spacing.sm }} accessibilityLabel={`Page ${index + 1} of ${slides.length}`}>
          {slides.map((s, i) => (
            <View key={s} style={{ width: i === index ? 20 : 8, height: 8, borderRadius: 4, backgroundColor: i === index ? t.colors.accent : t.colors.border }} />
          ))}
        </View>
        <Button
          title={last ? tr('onboarding.getStarted') : tr('common.continue')}
          onPress={() => (last ? router.replace('/(auth)/sign-in') : listRef.current?.scrollToIndex({ index: index + 1 }))}
        />
      </View>
    </SafeAreaView>
  );
}
