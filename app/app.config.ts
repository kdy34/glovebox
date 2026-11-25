import type { ExpoConfig } from 'expo/config';
import { withEntitlementsPlist, type ConfigPlugin } from 'expo/config-plugins';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyExpoConfig = ExpoConfig & { splash?: any };

// Only EXPO_PUBLIC_* values are embedded in the binary. They are public by design
// (Supabase URL + anon key are protected by RLS). Never put secrets here (constitution IV).
// Sign in with Apple needs a signed build, even on the simulator. Set GLOVEBOX_APPLE_SIGN_IN=false
// in app/.env to build an unsigned simulator dev client without an Apple Developer team; the
// sign-in screen then only offers email codes. EAS builds don't read app/.env, so they keep it on.
const appleSignIn = process.env.GLOVEBOX_APPLE_SIGN_IN !== 'false';
// expo-apple-authentication is auto-applied when installed and always adds the entitlement,
// so leaving it out of `plugins` isn't enough; strip it explicitly.
const withoutAppleSignIn: ConfigPlugin = (c) =>
  withEntitlementsPlist(c, (m) => {
    delete m.modResults['com.apple.developer.applesignin'];
    return m;
  });

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
    usesAppleSignIn: appleSignIn,
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
    ...(appleSignIn ? ['expo-apple-authentication'] : []),
    'expo-localization',
    'expo-web-browser',
    'expo-status-bar',
    'expo-splash-screen',
    'expo-font',
    'expo-image',
    'expo-sharing',
    '@react-native-community/datetimepicker',
    ['expo-notifications', { color: '#F2A900' }],
    ['expo-image-picker', { photosPermission: 'Glovebox lets you import receipt photos and add a photo of your car.' }],
    ['react-native-document-scanner-plugin', { cameraPermission: 'Glovebox uses the camera to scan your service receipts.' }],
    './plugins/withSceneLifecycle',
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

export default appleSignIn ? config : withoutAppleSignIn(config);
