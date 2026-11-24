import type { ExpoConfig } from 'expo/config';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExpoConfig = ExpoConfig & { splash?: any };

// Only EXPO_PUBLIC_* values are embedded in the binary. They are public by design
// (Supabase URL + anon key are protected by RLS). Never put secrets here (constitution IV).
const config: AnyExpoConfig = {
  name: 'Glovebox',
  slug: 'glovebox',
  scheme: 'glovebox',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  splash: { image: './assets/splash.png', resizeMode: 'contain', backgroundColor: '#0F1B2D' },
  ios: {
    bundleIdentifier: 'app.glovebox.ios',
    supportsTablet: true,
    usesAppleSignIn: true,
    config: { usesNonExemptEncryption: false },
    infoPlist: {
      NSCameraUsageDescription: 'Glovebox uses the camera to scan your service receipts.',
      NSPhotoLibraryUsageDescription: 'Glovebox lets you import receipt photos and add a photo of your car.',
      NSPhotoLibraryAddUsageDescription: 'Glovebox can save your service history report to Photos.',
    },
    privacyManifests: {
      NSPrivacyTracking: false,
      NSPrivacyTrackingDomains: [],
      NSPrivacyAccessedAPITypes: [],
      NSPrivacyCollectedDataTypes: [],
    },
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-sqlite',
    'expo-apple-authentication',
    'expo-localization',
    'expo-web-browser',
    ['expo-notifications', { color: '#F2A900' }],
    ['expo-image-picker', { photosPermission: 'Glovebox lets you import receipt photos and add a photo of your car.' }],
    ['react-native-document-scanner-plugin', { cameraPermission: 'Glovebox uses the camera to scan your service receipts.' }],
    ['@sentry/react-native/expo', { organization: process.env.SENTRY_ORG, project: process.env.SENTRY_PROJECT }],
  ],
  experiments: { typedRoutes: true },
  extra: {
    eas: { projectId: process.env.EAS_PROJECT_ID },
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    siteUrl: process.env.EXPO_PUBLIC_SITE_URL,
    revenueCatIosKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    posthogKey: process.env.EXPO_PUBLIC_POSTHOG_KEY,
  },
};

export default config;
