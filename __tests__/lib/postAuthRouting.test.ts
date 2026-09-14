import { destinationForRole, postAuthRedirect } from '@/lib/postAuthRouting'

// WHERE A SIGNED-IN USER BELONGS, AS ONE RULE.
//
// Before the magic-link change this decision existed only inline in
// app/auth/verify.tsx, reachable solely at the moment verifyOtp() returned. A
// magic-link session arrives asynchronously through a deep link, with no such
// moment, so the rule had to become something the root navigator can also ask.
describe('destinationForRole', () => {
  it('sends providers and clients to the one shared tab shell', () => {
    // NAVIGATION.md: one shell, no modes. Providers reach the dashboard via the
    // Me tab's My Studio entrance, not a separate post-auth destination.
    expect(destinationForRole('provider')).toBe('/(tabs)/')
    expect(destinationForRole('client')).toBe('/(tabs)/')
  })

  it('sends a user with no role yet to path selection, never into the tabs', () => {
    // Landing a role-less user in the tab shell is what mints a phantom clients
    // row and locks them in as a client forever.
    expect(destinationForRole(null)).toBe('/path-selection')
  })
})

const BASE = {
  hasSession: true,
  roleLoading: false,
  roleError: false,
  role: 'client' as const,
  segments: ['auth', 'check-email'],
  magicLinkPending: false,
}

describe('postAuthRedirect', () => {
  it('never strands a signed-in user on an auth screen', () => {
    expect(postAuthRedirect(BASE)).toEqual({ href: '/(tabs)/', clearMagicLink: false })
  })

  it('sends a signed-in user with no role from auth to path selection', () => {
    expect(postAuthRedirect({ ...BASE, role: null })).toEqual({
      href: '/path-selection',
      clearMagicLink: false,
    })
  })

  it('does nothing while the role is still resolving', () => {
    // Bouncing mid-resolve would fight app/auth/verify.tsx's own replace on the
    // phone path, which fires in exactly this window.
    expect(postAuthRedirect({ ...BASE, roleLoading: true })).toBeNull()
  })

  it('does nothing when role resolution failed — the retry screen owns that', () => {
    expect(postAuthRedirect({ ...BASE, roleError: true })).toBeNull()
  })

  it('does nothing without a session', () => {
    expect(postAuthRedirect({ ...BASE, hasSession: false })).toBeNull()
  })

  it('carries a cold-start magic-link arrival off welcome and into the app', () => {
    // Tapping the link with the app killed launches at "/" (welcome), not at the
    // callback route, so the session lands with the user still on welcome.
    expect(
      postAuthRedirect({ ...BASE, segments: [], magicLinkPending: true }),
    ).toEqual({ href: '/(tabs)/', clearMagicLink: true })
  })

  it('leaves a signed-in user on welcome alone when no magic link is pending', () => {
    // The __DEV__ account switcher signs in from welcome and expects to stay
    // there; auto-routing on "session exists" alone would break it.
    expect(postAuthRedirect({ ...BASE, segments: [] })).toBeNull()
  })

  it('leaves signed-in users elsewhere in the app alone', () => {
    expect(postAuthRedirect({ ...BASE, segments: ['(tabs)'] })).toBeNull()
    expect(postAuthRedirect({ ...BASE, segments: ['bookings', '[id]'] })).toBeNull()
    expect(
      postAuthRedirect({ ...BASE, segments: ['(tabs)'], magicLinkPending: true }),
    ).toBeNull()
  })

  it('is idempotent: asking twice from the destination yields no further move', () => {
    const first = postAuthRedirect({ ...BASE, segments: [], magicLinkPending: true })
    expect(first).not.toBeNull()
    // After the replace the user is in the tabs and the flag is cleared, so a
    // second (duplicate) callback cannot produce another navigation.
    expect(
      postAuthRedirect({ ...BASE, segments: ['(tabs)'], magicLinkPending: false }),
    ).toBeNull()
  })
})
