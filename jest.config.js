// Jest config for the Batch 5A unit / business-rule foundation.
// Uses the jest-expo preset (RN 0.81 / Expo 54 / React 19 transforms) and layers
// on the repo's `@/` path alias plus asset stubs so screen modules that only
// expose pure helpers can be imported in a Node test environment.
//
// Most suites here are pure-helper tests. A screen may also be RENDERED with
// @testing-library/react-native — installed in Batch 5A for exactly this — when the
// behavior under test is the wiring between a control and a write, which no pure
// helper can reach. `__tests__/app/negotiationWriteHandlers.test.tsx` is the first.
// Such a test still mocks the data layer at the lib boundary, so the no-real-Supabase
// rule in jest.setup.js is never approached.
const expoPreset = require('jest-expo/jest-preset')

module.exports = {
  ...expoPreset,
  setupFilesAfterEnv: [
    ...(expoPreset.setupFilesAfterEnv || []),
    '<rootDir>/jest.setup.js',
  ],
  moduleNameMapper: {
    // Keep jest-expo's own mappings (vector-icons, `@/` default, etc.) and pin
    // the repo alias to the project root to match tsconfig `@/* -> ./*`.
    ...expoPreset.moduleNameMapper,
    '^@/(.*)$': '<rootDir>/$1',
    // Static assets a screen may import must not be parsed as JS.
    '\\.(png|jpg|jpeg|gif|webp|svg|ttf|otf|mp4|mov)$':
      '<rootDir>/test/fileMock.js',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  clearMocks: true,
}
