import { assertNotProductionSupabase } from './supabaseTarget'

// Preconditions for the __DEV__-only account switcher (app/index.tsx). Extracted
// as a pure helper so the safety rules are unit-testable without mounting the
// landing screen. This is never used by normal-user auth.
export type DevSignInStatus = 'ready' | 'refused-production' | 'not-configured'

// Returns why the dev switcher may or may not run:
//  - 'refused-production' if the configured Supabase project is production
//    (a hard block that does NOT depend on __DEV__),
//  - 'not-configured' if no dev password is set (dev vars absent),
//  - 'ready' otherwise.
export function devSignInStatus(
  supabaseUrl: string | null | undefined,
  devPassword: string | null | undefined,
): DevSignInStatus {
  try {
    assertNotProductionSupabase(supabaseUrl)
  } catch {
    return 'refused-production'
  }
  if (!devPassword) return 'not-configured'
  return 'ready'
}
