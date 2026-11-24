// Jest is for React Native component tests only. Domain logic uses node:test (npm run test:domain).
module.exports = {
  preset: 'jest-expo',
  testMatch: ['<rootDir>/__tests__/ui/**/*.test.tsx'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg)',
  ],
};
