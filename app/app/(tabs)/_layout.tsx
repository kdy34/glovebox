import { Tabs } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';
import { TAB_TITLES } from '@/navigation/screens';
import { useTheme } from '@/ui/theme';

// Simple line icons (SF Symbols-like) so we don't ship an icon font.
const icons = {
  garage: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  reminders: 'M12 22a2 2 0 0 0 2-2h-4a2 2 0 0 0 2 2zm6-6V11a6 6 0 1 0-12 0v5l-2 2h16z',
  insights: 'M4 20V10m6 10V4m6 16v-7m4 7H2',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3a8 8 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a8 8 0 0 0-2-1.2L15 2h-4l-.5 2.6a8 8 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a8 8 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2 1.2L11 22h4l.5-2.6a8 8 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z',
} as const;

function Icon({ d, color }: { d: string; color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d={d} />
    </Svg>
  );
}

export default function TabsLayout() {
  const t = useTheme();
  const { t: tr } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: t.dark ? t.colors.accent : t.colors.primary,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: { backgroundColor: t.colors.surface, borderTopColor: t.colors.border },
        headerStyle: { backgroundColor: t.colors.bg },
        headerTintColor: t.colors.text,
        headerShadowVisible: false,
      }}
    >
      {(['index', 'reminders', 'insights', 'settings'] as const).map((name) => {
        const key = name === 'index' ? 'garage' : name;
        return (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: tr(TAB_TITLES[name]),
              tabBarIcon: ({ color }) => <Icon d={icons[key]} color={color as string} />,
            }}
          />
        );
      })}
    </Tabs>
  );
}
