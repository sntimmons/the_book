// Locks the B6A fail-loud, no-fallback behavior of lib/supabase.ts. This file
// loads the REAL module (unlike other suites, which mock @/lib/supabase), so it
// overrides the createClient mock locally to observe the call without any network.
// jest.resetModules() re-runs the module's top-level code per test, so createClient
// is required FRESH inside each test (the post-reset registry has a new mock fn).
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({ __mockClient: true })),
}))

describe('lib/supabase environment configuration', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    jest.resetModules()
    process.env = { ...OLD_ENV }
  })

  afterAll(() => {
    process.env = OLD_ENV
  })

  it('throws a clear error naming the missing public vars (no production fallback)', () => {
    delete process.env.EXPO_PUBLIC_SUPABASE_URL
    delete process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    const { createClient } = require('@supabase/supabase-js')
    expect(() => require('@/lib/supabase')).toThrow(
      /Missing required public Supabase configuration/,
    )
    expect(createClient).not.toHaveBeenCalled()
  })

  it('initializes the client from EXPO_PUBLIC env when both are present', () => {
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://wcoyjeklscuqsumpjpfo.supabase.co'
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'
    const { createClient } = require('@supabase/supabase-js')
    const mod = require('@/lib/supabase')
    expect(mod.supabase).toBeTruthy()
    // Built from the provided env values — not a hardcoded/default project.
    expect(createClient).toHaveBeenCalledWith(
      'https://wcoyjeklscuqsumpjpfo.supabase.co',
      'test-anon-key',
      expect.objectContaining({ auth: expect.objectContaining({ persistSession: true }) }),
    )
  })
})
