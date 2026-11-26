// Root layout: providers + auth-gated navigation (T022).
import '@/i18n';
import { QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getFocusedRouteNameFromRoute } from 'expo-router/react-navigation';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/data/auth';
import { queryClient } from '@/data/queryClient';
import { initSync, setSyncUser } from '@/data/sync';
import { SyncBanner } from '@/features/sync/SyncBanner';
import { ReminderNotifications } from '@/features/reminders/ReminderNotifications';
import { STACK_TITLES, tabTitleKey } from '@/navigation/screens';
import { initAnalytics } from '@/services/analytics';
import { initSentry, wrapRoot } from '@/services/sentry';
import { ThemeProvider, useTheme } from '@/ui/theme';

initSentry();
initAnalytics();
void SplashScreen.preventAutoHideAsync();


// Refetch on foreground and pause queries while offline.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)));
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const t = useTheme();
  const { t: tr } = useTranslation();

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);

  const signedIn = !!session;
  const userId = session?.user.id ?? null;
  // Start the outbox flusher once a session exists (RLS needs the user's JWT), and keep
  // the outbox pointed at whoever is signed in (T100).
  useEffect(() => {
    if (userId) initSync();
    setSyncUser(userId);
  }, [userId]);

  if (loading) return null;

  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {signedIn && <SyncBanner />}
      {signedIn && <ReminderNotifications />}
      <Stack
        screenOptions={{
          headerTintColor: t.colors.text,
          headerStyle: { backgroundColor: t.colors.bg },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.colors.bg },
          headerLargeTitle: false,
        }}
      >
        {/* T103b: every screen has a real title; iOS also shows it as the next screen's back label. */}
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="onboarding" options={{ headerShown: false, title: tr(STACK_TITLES.onboarding) }} />
          <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false, title: tr(STACK_TITLES['(auth)/sign-in']) }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen
            name="(tabs)"
            options={({ route }) => ({ headerShown: false, title: tr(tabTitleKey(getFocusedRouteNameFromRoute(route))) })}
          />
          {(['vehicle/new', 'vehicle/[id]/index', 'vehicle/[id]/edit', 'vehicle/[id]/rules', 'record/new', 'record/[id]', 'odometer/new', 'scan/index', 'scan/review'] as const).map((name) => (
            <Stack.Screen key={name} name={name} options={{ title: tr(STACK_TITLES[name]) }} />
          ))}
        </Stack.Protected>
        <Stack.Screen name="legal/[doc]" options={{ title: tr(STACK_TITLES['legal/[doc]']) }} />
      </Stack>
    </>
  );
}

function RootLayout() {
  useEffect(() => {
    const sub = AppState.addEventListener('change', onAppStateChange);
    return () => sub.remove();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapRoot(RootLayout);
