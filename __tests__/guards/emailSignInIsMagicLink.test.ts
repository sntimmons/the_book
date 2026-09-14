import { readFileSync } from 'fs'
import { join } from 'path'

// EMAIL SIGN-IN IS A MAGIC LINK, NOT A 6-DIGIT CODE.
//
// The Supabase email template for this project is a MAGIC LINK template
// ("Follow the link below to sign in"). The app used to call signInWithOtp with
// no options and then push /auth/verify unconditionally, asking for six digits
// that the email never contained. This guard locks the two halves of the fix:
// the request must carry a redirect back into the app, and the email path must
// not lead to the code-entry screen.
//
// It is source-text based on purpose. The defect was never a wrong value at
// runtime — it was a screen wired to the wrong destination, which only a read of
// the wiring can catch.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8')

/** The code-entry route as it appears when something actually navigates to it. */
const VERIFY_ROUTE = "'/auth/verify'"


describe('email sign-in path', () => {
  const email = read('app/auth/email.tsx')

  it('asks Supabase to send the link back to the app', () => {
    expect(email).toContain('emailRedirectTo')
    expect(email).toContain('magicLinkRedirectTo')
  })

  it('does not route to the 6-digit code-entry screen', () => {
    // Matches the quoted route literal, which is the only way a screen is
    // actually navigated to. A bare substring check would also fire on the
    // comment in email.tsx explaining why it no longer goes there — the record
    // of the fix would then fail the guard that locks the fix in.
    expect(email).not.toContain(VERIFY_ROUTE)
  })

  it('routes to the check-your-email holding screen instead', () => {
    expect(email).toContain("'/auth/check-email'")
  })

  it('still uses signInWithOtp — no second auth transport was invented', () => {
    expect(email).toContain('signInWithOtp')
    expect(email).not.toContain('signInWithPassword')
  })
})

describe('check-email screen', () => {
  const checkEmail = read('app/auth/check-email.tsx')

  it('does not collect a code', () => {
    expect(checkEmail).not.toContain('verifyOtp')
    expect(checkEmail).not.toMatch(/6-digit/i)
  })

  it('resends by asking for another link, with the redirect intact', () => {
    expect(checkEmail).toContain('signInWithOtp')
    expect(checkEmail).toContain('emailRedirectTo')
  })
})

describe('phone sign-in path (must stay intact)', () => {
  const phone = read('app/auth/phone.tsx')
  const verify = read('app/auth/verify.tsx')

  it('still sends an SMS OTP and still routes to the code-entry screen', () => {
    expect(phone).toContain('signInWithOtp')
    expect(phone).toContain(VERIFY_ROUTE)
  })

  it('verify.tsx still verifies an SMS token', () => {
    expect(verify).toContain('verifyOtp')
    expect(verify).toContain("type: 'sms'")
  })
})

describe('deep-link callback wiring', () => {
  it('the app declares the scheme the redirect URL is built on', () => {
    const appJson = JSON.parse(read('app.json'))
    expect(appJson.expo.scheme).toBe('thebook')
  })

  it('a route exists at the callback path so the link never lands on not-found', () => {
    expect(() => read('app/auth/callback.tsx')).not.toThrow()
  })

  it('the session is established by the app, since detectSessionInUrl is off', () => {
    // lib/supabase.ts sets detectSessionInUrl: false (correct on native — there
    // is no browser URL), which makes the exchange the app's job.
    expect(read('lib/supabase.ts')).toContain('detectSessionInUrl: false')
    expect(read('hooks/useMagicLinkSession.ts')).toContain('setSession')
  })

  it('the root layout consults the shared post-auth routing rule', () => {
    expect(read('app/_layout.tsx')).toContain('postAuthRedirect')
  })
})
