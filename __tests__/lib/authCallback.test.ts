import {
  AUTH_CALLBACK_PATH,
  describeAuthCallbackError,
  magicLinkRedirectTo,
  parseAuthCallbackUrl,
} from '@/lib/authCallback'

// THE MAGIC-LINK CALLBACK CONTRACT.
//
// Supabase's email template is a MAGIC LINK template: the mail contains a link,
// never a 6-digit code. Tapping it hits GoTrue's /auth/v1/verify, which 302s to
// whatever `emailRedirectTo` we asked for — our app's scheme.
//
// The client in lib/supabase.ts does NOT set `flowType`, so auth-js uses its
// default ('implicit', GoTrueClient.js:24). Implicit flow returns the tokens in
// the URL FRAGMENT, not the query string. expo-linking's own `parse()` only
// surfaces `queryParams`, so the fragment has to be parsed here or it is lost.
// The `code` (PKCE) shape is parsed too so that turning flowType on later is a
// one-line change rather than a re-architecture.
describe('parseAuthCallbackUrl', () => {
  it('reads implicit-flow tokens out of the fragment of a scheme URL', () => {
    const result = parseAuthCallbackUrl(
      'thebook://auth/callback#access_token=aaa.bbb.ccc&expires_in=3600&refresh_token=rrr&token_type=bearer&type=magiclink',
    )
    expect(result).toEqual({
      kind: 'tokens',
      accessToken: 'aaa.bbb.ccc',
      refreshToken: 'rrr',
    })
  })

  it('reads tokens from an Expo Go style exp:// URL with the /--/ separator', () => {
    const result = parseAuthCallbackUrl(
      'exp://192.168.1.20:8081/--/auth/callback#access_token=aaa&refresh_token=rrr',
    )
    expect(result).toEqual({ kind: 'tokens', accessToken: 'aaa', refreshToken: 'rrr' })
  })

  it('reads a PKCE authorization code from the query string', () => {
    expect(
      parseAuthCallbackUrl('thebook://auth/callback?code=abc-123'),
    ).toEqual({ kind: 'code', code: 'abc-123' })
  })

  it('reports an expired link as an error rather than attempting a session', () => {
    expect(
      parseAuthCallbackUrl(
        'thebook://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      ),
    ).toEqual({
      kind: 'error',
      code: 'otp_expired',
      // `+` is a space in these descriptions, not a literal plus.
      description: 'Email link is invalid or has expired',
    })
  })

  it('reports an error delivered on the query string too', () => {
    expect(
      parseAuthCallbackUrl(
        'thebook://auth/callback?error=access_denied&error_description=denied',
      ),
    ).toEqual({ kind: 'error', code: 'access_denied', description: 'denied' })
  })

  it('prefers the error over any tokens present on the same URL', () => {
    const result = parseAuthCallbackUrl(
      'thebook://auth/callback#access_token=aaa&refresh_token=rrr&error=access_denied',
    )
    expect(result.kind).toBe('error')
  })

  it('treats an access token with no refresh token as an invalid callback', () => {
    const result = parseAuthCallbackUrl('thebook://auth/callback#access_token=aaa')
    expect(result).toEqual({
      kind: 'error',
      code: 'invalid_callback',
      description: null,
    })
  })

  it('ignores URLs that are not the auth callback', () => {
    expect(parseAuthCallbackUrl('thebook://bookings/123').kind).toBe('none')
    expect(parseAuthCallbackUrl('thebook://auth/email#access_token=aaa').kind).toBe('none')
    // A near-miss path must not be treated as the callback.
    expect(parseAuthCallbackUrl('thebook://auth/callbackish#access_token=a').kind).toBe('none')
  })

  it('ignores a bare callback URL carrying nothing to exchange', () => {
    expect(parseAuthCallbackUrl('thebook://auth/callback').kind).toBe('none')
    expect(parseAuthCallbackUrl('thebook://auth/callback/').kind).toBe('none')
  })

  it('is safe on null/undefined/empty input', () => {
    expect(parseAuthCallbackUrl(null).kind).toBe('none')
    expect(parseAuthCallbackUrl(undefined).kind).toBe('none')
    expect(parseAuthCallbackUrl('').kind).toBe('none')
  })

  it('exposes the callback path the redirect URL is built from', () => {
    expect(AUTH_CALLBACK_PATH).toBe('/auth/callback')
  })
})

describe('describeAuthCallbackError', () => {
  it('names expiry specifically so the user knows to request a new link', () => {
    expect(
      describeAuthCallbackError({ code: 'otp_expired', description: null }),
    ).toMatch(/expired/i)
  })

  it('treats an expired description as expiry even without the code', () => {
    expect(
      describeAuthCallbackError({
        code: null,
        description: 'Email link is invalid or has expired',
      }),
    ).toMatch(/expired/i)
  })

  it('has a friendly fallback for any other failure', () => {
    const message = describeAuthCallbackError({ code: 'something_else', description: null })
    expect(message.length).toBeGreaterThan(0)
    // Never leak a raw error code at the user.
    expect(message).not.toContain('something_else')
  })
})

describe('magicLinkRedirectTo', () => {
  it('is the bare app scheme plus the callback path, with no host spliced in', () => {
    // Stability is the whole point: this exact string has to be allow-listed in
    // the Supabase dashboard, and `Linking.createURL()` would vary it by machine
    // and network in a development client.
    expect(magicLinkRedirectTo()).toBe('thebook://auth/callback')
  })

  it('produces a URL the parser accepts, so the round trip closes', () => {
    const url = `${magicLinkRedirectTo()}#access_token=aaa&refresh_token=rrr`
    expect(parseAuthCallbackUrl(url)).toEqual({
      kind: 'tokens',
      accessToken: 'aaa',
      refreshToken: 'rrr',
    })
  })
})
