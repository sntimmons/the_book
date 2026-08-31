// Minimal Jest config for the Batch 5A unit / business-rule foundation.
// Uses the jest-expo preset (RN 0.81 / Expo 54 / React 19 transforms) and layers
// on the repo's `@/` path alias plus asset stubs so screen modules that only
// expose pure helpers can be imported in a Node test environment.
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
