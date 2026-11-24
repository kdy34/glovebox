// Root layout: providers + auth-gated navigation (T022).
import '@/i18n';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import NetInfo from '@react-native-community/netinfo';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/data/auth';
import { initAnalytics } from '@/services/analytics';
import { initSentry, wrapRoot } from '@/services/sentry';
import { ThemeProvider, useTheme } from '@/ui/theme';

initSentry();
initAnalytics();
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 2, staleTime: 30_000 }, mutations: { retry: 0 } },
});

// Refetch on foreground and pause queries while offline.
onlineManager.setEventListener((setOnline) => NetInfo.addEventListener((s) => setOnline(!!s.isConnected)));
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === 'active');
}

function RootNavigator() {
  const { session, loading } = useAuth();
  const t = useTheme();

  useEffect(() => {
    if (!loading) void SplashScreen.hideAsync();
  }, [loading]);

  if (loading) return null;
  const signedIn = !!session;

  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTintColor: t.colors.text,
          headerStyle: { backgroundColor: t.colors.bg },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: t.colors.bg },
          headerLargeTitle: false,
        }}
      >
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="(auth)/sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* vehicle/*, record/*, scan/*, paywall are added with their stories (US1–US7). */}
        </Stack.Protected>
        <Stack.Screen name="legal/[doc]" options={{ title: '' }} />
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
