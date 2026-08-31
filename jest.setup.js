// Global test setup for Batch 5A.
//
// PRODUCTION-SAFETY HARD RULE: no unit test may ever construct or reach the real
// Supabase client. Every test that touches a Supabase-backed module mocks
// `@/lib/supabase` itself; as a belt-and-suspenders backstop we also mock the
// underlying `@supabase/supabase-js` so that if any module ever loaded the real
// client unmocked, `createClient()` throws LOUDLY instead of pointing at the
// production project (kxregomuawwcqvisuhtr).
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => {
    throw new Error(
      'createClient() was called in a unit test. Supabase must be mocked — ' +
        'B5A tests must never connect to a real Supabase project.',
    )
  },
}))

// Native/navigation modules that screen files import at module load. These are
// mocked globally so a screen module can be imported purely to reach its pure
// helper exports, without executing native code or navigation. The pure helpers
// under test never call these; the mocks only satisfy the import graph.
jest.mock('@sentry/react-native', () => ({
  captureException: jest.fn(),
  captureMessage: jest.fn(),
  addBreadcrumb: jest.fn(),
  init: jest.fn(),
  wrap: (component) => component,
  ErrorBoundary: ({ children }) => children,
}))

jest.mock('expo-router', () => ({
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  },
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  }),
  useLocalSearchParams: () => ({}),
  Link: 'Link',
  Stack: { Screen: () => null },
  Tabs: { Screen: () => null },
}))

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    session: null,
    user: null,
    role: null,
    isProvider: false,
    providerId: null,
    roleLoading: false,
    roleError: null,
    retryRole: jest.fn(),
    signOut: jest.fn(),
  }),
  AuthProvider: ({ children }) => children,
}))

jest.mock('@/hooks/useMessaging', () => ({
  getOrCreateConversation: jest.fn(),
  useMessaging: () => ({}),
}))

// The lib data helpers `console.log` their error branches by design. Silence the
// noise so intentional error-path tests don't clutter the reporter; real test
// failures still surface through assertions.
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {})
})
