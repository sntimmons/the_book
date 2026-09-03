// The production Supabase project ref, for plain-JS tooling.
//
// Mirrors lib/supabaseTarget.ts (the canonical guard) as a literal so a node script
// can refuse production without a TypeScript build step — a build failure must never
// be able to disable the guard. Shared by every .mjs runner so the constant lives in
// ONE place for them rather than being copied per script; a missed copy would be a
// runner that happily executes against a new production project.
export const PRODUCTION_SUPABASE_REF = 'kxregomuawwcqvisuhtr'

// Resolve a Supabase project ref from a connection string or API URL.
//
// Parsed with the URL parser, never by scanning the raw string: a free-text regex can
// match a decoy inside the userinfo (user:password) section and report a benign ref
// while the driver connects to the host after it. Returns null when the ref cannot be
// positively identified — callers must treat null as unsafe.
export function refFromTarget(value) {
  if (!value) return null
  let url
  try {
    url = new URL(String(value).trim())
  } catch {
    // Not a URL: accept only a bare 20-char ref.
    const bare = String(value).trim()
    return /^[a-z0-9]{20}$/i.test(bare) ? bare.toLowerCase() : null
  }
  // Host forms: db.<ref>.supabase.co (direct) or <ref>.supabase.co (API).
  // End-anchored: without it, db.<ref>.supabase.co.attacker.tld would parse as a
  // Supabase host and, if the ref were not the production one, be accepted.
  const host = url.hostname.match(/^(?:db\.)?([a-z0-9]{20})\.supabase\.(?:co|com|in)$/i)
  if (host) return host[1].toLowerCase()
  // Pooler form: the ref travels in the USERNAME, e.g. postgres.<ref>@...pooler...
  const user = decodeURIComponent(url.username || '').match(/^postgres\.([a-z0-9]{20})$/i)
  if (user) return user[1].toLowerCase()
  return null
}
