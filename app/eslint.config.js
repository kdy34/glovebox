// Expo's flat ESLint config + a couple of project rules.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  { ignores: ['dist/*', '.expo/*', 'ios/*', 'android/*'] },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Keep domain logic pure: no React Native in src/domain (plan.md).
      'no-restricted-imports': ['error', { patterns: [] }],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['react', 'react-native', 'expo-*', '@/data/*', '@/services/*'] }],
    },
  },
];
