import { UserRole } from './resolveUserRole'

// WHERE A SIGNED-IN USER BELONGS — ONE RULE, TWO CALLERS.
//
// This decision used to live inline in app/auth/verify.tsx, reachable only at
// the instant verifyOtp() returned. That was enough while every session was born
// on a screen. A magic-link session is not: it arrives asynchronously through a
// deep link, possibly at a cold start with the user still on Welcome. So the
// rule had to become something app/_layout.tsx can ask too, and it must be the
// same rule — two copies would drift, and the cost of drift here is a user
// landing in the wrong shell.

export type PostAuthDestination = '/(tabs)/' | '/path-selection'

/**
 * Providers and clients share one shell (NAVIGATION.md: one shell, no modes) —
 * a provider reaches the dashboard through the Me tab's My Studio entrance, not
 * through a different post-auth destination.
 *
 * A null role is a user who owns neither a providers nor a clients row, i.e. has
 * not chosen a path yet. They must go to path selection: dropping them into the
 * tab shell is what mints a clients row and locks them in as a client forever.
 */
export function destinationForRole(role: UserRole): PostAuthDestination {
  return role === null ? '/path-selection' : '/(tabs)/'
}

export interface PostAuthRoutingInput {
  hasSession: boolean
  roleLoading: boolean
  roleError: boolean
  role: UserRole
  /** Output of Expo Router's useSegments(). `[]` is the Welcome route. */
  segments: readonly string[]
  /** A magic-link callback opened a session that routing has not acted on yet. */
  magicLinkPending: boolean
}

export interface PostAuthRedirect {
  href: PostAuthDestination
  /** Clear the pending flag after navigating, so it cannot fire twice. */
  clearMagicLink: boolean
}

/**
 * Returns the one navigation a signed-in user still owes, or null.
 *
 * Two situations qualify, and only two:
 *
 *  1. They are sitting on an auth screen with a live session. Covers the magic
 *     link landing on /auth/callback and anyone otherwise stranded there.
 *  2. A magic-link callback just opened a session while they were on Welcome.
 *     This is the cold-start path: tapping the link with the app killed launches
 *     at "/", not at the callback route.
 *
 * Case 2 is gated on `magicLinkPending` rather than on "a session exists",
 * because the __DEV__ account switcher in app/index.tsx signs in from Welcome and
 * is supposed to stay there. Routing on session alone would eject it.
 */
export function postAuthRedirect(input: PostAuthRoutingInput): PostAuthRedirect | null {
  const { hasSession, roleLoading, roleError, role, segments, magicLinkPending } = input

  if (!hasSession) return null
  // Wait for the role rather than guessing. This window is also exactly when
  // app/auth/verify.tsx fires its own replace on the phone path; moving here
  // would race it.
  if (roleLoading) return null
  // Role resolution failed — RootNavigator's retry screen owns that state.
  if (roleError) return null

  const href = destinationForRole(role)

  if (segments[0] === 'auth') return { href, clearMagicLink: false }

  if (magicLinkPending && segments.length === 0) return { href, clearMagicLink: true }

  return null
}
