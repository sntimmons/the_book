import Constants from 'expo-constants'
import * as Linking from 'expo-linking'

// THE MAGIC-LINK CALLBACK CONTRACT, IN ONE PLACE.
//
// Email sign-in is a MAGIC LINK, not a 6-digit code: the Supabase email template
// for this project reads "Follow the link below to sign in". Tapping that link
// hits GoTrue's /auth/v1/verify, which verifies the token server-side and then
// 302s to whatever `emailRedirectTo` we passed on signInWithOtp. This module owns
// both halves of that round trip — the URL we ask Supabase to send the user back
// to, and the reading of whatever lands on it.

/** Route the magic link returns to. Must exist as an Expo Router route. */
export const AUTH_CALLBACK_PATH = '/auth/callback'

/**
 * The redirect URL handed to Supabase, and the one that must be allow-listed in
 * the dashboard under Authentication -> URL Configuration -> Redirect URLs.
 *
 * Deliberately built from the app's own scheme rather than
 * `Linking.createURL()`. In a development client attached to a packager,
 * createURL splices the LAN host in — `thebook://192.168.1.20:8081/auth/callback`
 * — so the URL changes with the machine and the network, and every one of those
 * variants would need allow-listing. The bare `thebook://auth/callback` is stable
 * everywhere the scheme is registered, which is every build of the app.
 *
 * Expo Go does not register the scheme and so cannot receive this callback; that
 * is Expo's own guidance for authorization callbacks (see the createURL docs).
 * Use a development build. The createURL fallback below exists only so a
 * misconfigured app config degrades instead of throwing inside a press handler.
 */
export function magicLinkRedirectTo(): string {
  const configured = Constants.expoConfig?.scheme
  const scheme = Array.isArray(configured) ? configured[0] : configured
  if (!scheme) return Linking.createURL(AUTH_CALLBACK_PATH)
  // AUTH_CALLBACK_PATH already carries its leading slash: `thebook:/` + `/auth/...`.
  return `${scheme}:/${AUTH_CALLBACK_PATH}`
}

export type AuthCallback =
  /** Not an auth callback, or one carrying nothing to exchange. Do nothing. */
  | { kind: 'none' }
  /** Implicit flow: a session can be set directly from these. */
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  /** PKCE flow: must be exchanged for a session. */
  | { kind: 'code'; code: string }
  | { kind: 'error'; code: string | null; description: string | null }

function decodeValue(raw: string): string {
  try {
    // GoTrue form-encodes these, so `+` is a space — `error_description` arrives
    // as `Email+link+is+invalid+or+has+expired`. Applying it to every value is
    // safe: JWTs are base64url (`-`/`_`, never `+`) and refresh tokens are
    // alphanumeric, so no token can contain a literal plus to be mangled.
    return decodeURIComponent(raw.replace(/\+/g, ' '))
  } catch {
    // A malformed percent-escape must not take the whole callback down.
    return raw
  }
}

function readParams(serialized: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const pair of serialized.split('&')) {
    if (!pair) continue
    const eq = pair.indexOf('=')
    const key = eq === -1 ? pair : pair.slice(0, eq)
    if (!key) continue
    out[decodeValue(key)] = eq === -1 ? '' : decodeValue(pair.slice(eq + 1))
  }
  return out
}

/**
 * Reads a deep link and says what, if anything, it authorizes.
 *
 * The fragment matters as much as the query string here. `lib/supabase.ts` does
 * not set `flowType`, so auth-js uses its default of `'implicit'`, and implicit
 * flow returns the tokens after a `#`. expo-linking's own `parse()` exposes only
 * `queryParams`, so a caller relying on it would silently see an empty callback.
 */
export function parseAuthCallbackUrl(url: string | null | undefined): AuthCallback {
  if (!url) return { kind: 'none' }

  const schemeEnd = url.indexOf('://')
  const rest = schemeEnd === -1 ? url : url.slice(schemeEnd + 3)

  const hashAt = rest.indexOf('#')
  const fragment = hashAt === -1 ? '' : rest.slice(hashAt + 1)
  const beforeHash = hashAt === -1 ? rest : rest.slice(0, hashAt)

  const queryAt = beforeHash.indexOf('?')
  const query = queryAt === -1 ? '' : beforeHash.slice(queryAt + 1)
  const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)

  // Matches every shape the callback can legitimately take: `auth/callback`
  // (bare scheme), `/auth/callback` (triple-slashed), `host:port/auth/callback`
  // (dev client with a packager) and `host:port/--/auth/callback` (Expo Go).
  // The `(^|\/)` anchor is what stops `auth/callbackish` matching.
  if (!/(^|\/)auth\/callback\/?$/.test(path)) return { kind: 'none' }

  // Fragment last so implicit-flow values win if a URL somehow carries both.
  const params = { ...readParams(query), ...readParams(fragment) }

  // `error_code` is the specific reason (otp_expired); `error` is the broad one
  // (access_denied). An error always wins — never try to open a session from a
  // callback that also says it failed.
  const errorCode = params.error_code || params.error || null
  const errorDescription = params.error_description || null
  if (errorCode || errorDescription) {
    return { kind: 'error', code: errorCode, description: errorDescription }
  }

  const accessToken = params.access_token
  const refreshToken = params.refresh_token
  if (accessToken && refreshToken) {
    return { kind: 'tokens', accessToken, refreshToken }
  }
  if (accessToken || refreshToken) {
    // Half a token pair cannot open a session. Fail loudly rather than calling
    // setSession with an undefined half and getting an opaque Supabase error.
    return { kind: 'error', code: 'invalid_callback', description: null }
  }

  if (params.code) return { kind: 'code', code: params.code }

  return { kind: 'none' }
}

/** User-facing text for a failed callback. Never leaks a raw code. */
export function describeAuthCallbackError(failure: {
  code: string | null
  description: string | null
}): string {
  const haystack = `${failure.code ?? ''} ${failure.description ?? ''}`.toLowerCase()
  if (haystack.includes('expired')) {
    return 'That sign-in link has expired. Request a new one below.'
  }
  if (haystack.includes('access_denied')) {
    return 'That sign-in link is no longer valid. Request a new one below.'
  }
  return "We couldn't finish signing you in. Request a new link below."
}
