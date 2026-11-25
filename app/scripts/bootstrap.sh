#!/usr/bin/env bash
# Installs every runtime dependency at the exact versions Expo SDK 57 expects.
# `npx expo install` resolves SDK-compatible versions; the resulting
# package-lock.json is committed, which pins them (constitution IV).
set -euo pipefail
cd "$(dirname "$0")/.."

npm install

npx expo install \
  expo-router expo-linking expo-constants expo-status-bar expo-splash-screen expo-font \
  react-native-safe-area-context react-native-screens react-native-gesture-handler \
  react-native-reanimated react-native-svg expo-haptics expo-image \
  expo-secure-store expo-sqlite expo-crypto expo-file-system expo-network \
  expo-image-picker expo-image-manipulator expo-document-picker \
  expo-notifications expo-print expo-sharing expo-apple-authentication expo-localization expo-web-browser \
  @react-native-async-storage/async-storage @react-native-community/netinfo \
  @react-native-community/datetimepicker

npm install \
  @supabase/supabase-js react-native-url-polyfill @tanstack/react-query @tanstack/react-query-persist-client \
  @tanstack/query-async-storage-persister react-hook-form @hookform/resolvers \
  i18next react-i18next \
  react-native-document-scanner-plugin react-native-purchases \
  @sentry/react-native posthog-react-native

# Expo-coupled dev deps must match the SDK (jest-expo/eslint-config-expo track the
# SDK major, @react-native/jest-preset tracks react-native). Installing them with plain
# `npm install` pulls the next SDK's versions and breaks peer resolution.
npx expo install --dev jest-expo eslint-config-expo @react-native/jest-preset

npm install --save-dev jest @testing-library/react-native @types/jest \
  eslint prettier

echo "✅ Dependencies installed. Commit package.json + package-lock.json."
