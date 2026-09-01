// Production-target guard for NON-PRODUCTION tooling (seed scripts, DB/security
// tests, Maestro E2E setup, CI safety checks). This is NOT wired into the app's
// production runtime — a production build must be free to target production. Its
// only job is to make test/dev/seed tooling fail immediately if it is ever
// pointed at the production Supabase project.

// The production project ref. A URL/ref equal to this is rejected by the guard.
export const PRODUCTION_SUPABASE_REF = 'kxregomuawwcqvisuhtr'

// Extract the Supabase project ref from a project URL such as
// https://<ref>.supabase.co (or a bare ref). Returns null if it cannot be found.
export function projectRefFromUrl(urlOrRef: string | null | undefined): string | null {
  if (!urlOrRef) return null
  const s = urlOrRef.trim()
  // https://<ref>.supabase.co / <ref>.supabase.co
  const host = s.match(/^(?:https?:\/\/)?([a-z0-9]+)\.supabase\.(?:co|in|com)/i)
  if (host) return host[1].toLowerCase()
  // A bare project ref (Supabase refs are 20 lowercase alphanumerics).
  if (/^[a-z0-9]{20}$/.test(s)) return s.toLowerCase()
  return null
}

// Throw if the given Supabase URL/ref resolves to the production project. Use at
// the top of any tooling that connects with elevated (service-role) access, or
// that would mutate data, so production can never be the accidental target.
export function assertNotProductionSupabase(urlOrRef: string | null | undefined): void {
  const ref = projectRefFromUrl(urlOrRef)
  if (ref === PRODUCTION_SUPABASE_REF) {
    throw new Error(
      `Refusing to run against the PRODUCTION Supabase project (ref ${PRODUCTION_SUPABASE_REF}). ` +
        'This tooling may only target a non-production project.',
    )
  }
}
