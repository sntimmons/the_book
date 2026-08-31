// Flat config for the Expo app. ESLint 9/10 uses flat config (eslint.config.*)
// and no longer reads .eslintrc.*; eslint.config.js takes precedence over the
// repo's Next.js eslint.config.mjs (which lints the separate src/ project).
const expoConfig = require('eslint-config-expo/flat')

module.exports = [
  ...expoConfig,
  {
    ignores: [
      'node_modules/',
      '.expo/',
      'dist/',
      'src/**', // separate Next.js project, not part of the Expo app
      '.next/**',
      'supabase/functions/', // Deno runtime, not linted here
      'babel.config.js',
      'metro.config.js',
      'eslint.config.mjs',
    ],
  },
  {
    // Core-rule overrides only. eslint-config-expo/flat already registers and
    // configures typescript-eslint (including no-explicit-any handling); adding
    // a @typescript-eslint/* override here would require re-declaring that
    // plugin in this object, so we keep just the plugin-free core rules.
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'warn',
      // Cosmetic (apostrophes in JSX render fine either way). Downgrade from the
      // preset's 'error' to a warning rather than churn escapes across the app.
      'react/no-unescaped-entities': 'warn',
    },
  },
  {
    // Test tooling (Batch 5A): Jest globals for the plain-JS setup/config files,
    // and allowance for the jest.mock()-before-import pattern (mocks are hoisted
    // and must precede imports). Scoped to the test suite so app rules are
    // unchanged.
    files: ['__tests__/**/*.{ts,tsx}', 'jest.setup.js', 'jest.config.js', 'test/**/*.js'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
      },
    },
    rules: {
      'import/first': 'off',
    },
  },
]
