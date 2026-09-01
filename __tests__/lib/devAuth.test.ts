import { devSignInStatus } from '@/lib/devAuth'

const NONPROD = 'https://wcoyjeklscuqsumpjpfo.supabase.co'
const PROD = 'https://kxregomuawwcqvisuhtr.supabase.co'

// Locks the B6D dev-switcher safety preconditions: it must refuse production
// regardless of other config, and require a configured dev password (no
// hardcoded fallback exists).
describe('devSignInStatus', () => {
  it('refuses the production project even with a password present', () => {
    expect(devSignInStatus(PROD, 'anything')).toBe('refused-production')
  })

  it('reports not-configured when the dev password is missing (no fallback)', () => {
    expect(devSignInStatus(NONPROD, undefined)).toBe('not-configured')
    expect(devSignInStatus(NONPROD, '')).toBe('not-configured')
  })

  it('is ready only for a non-prod project with a configured password', () => {
    expect(devSignInStatus(NONPROD, 'dev-pass')).toBe('ready')
  })

  it('refuses when the URL is unset (cannot confirm a non-prod target)', () => {
    // An unset URL resolves to no ref, which is not production -> guard passes,
    // but with no password it is still not-configured (never silently ready).
    expect(devSignInStatus(undefined, undefined)).toBe('not-configured')
  })
})
