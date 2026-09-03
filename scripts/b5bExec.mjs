// Pure helpers for the B5B runner's two execution modes. Kept separate so they can be
// exercised directly (`node --input-type=module`), because the Jest setup in this repo
// cannot import .mjs from a .ts test.

// Split a connection string into PG* environment variables.
//
// The connection string is NEVER passed on psql's command line: process argv is visible
// via `ps` to anything else on the runner, and the string contains the password. libpq
// reads these variables instead.
// libpq connection variables that could redirect or reshape the session AFTER the
// production-target guard has approved a URL. PGHOSTADDR in particular overrides the
// address actually dialled while PGHOST is used only for SNI/auth, so an inherited
// value could point a guard-approved run at a different database. They are blanked so
// the connection is built solely from the URL the guard parsed (SEC-ENV-003).
const OVERRIDABLE_PG_VARS = [
  'PGHOSTADDR',
  'PGSERVICE',
  'PGSERVICEFILE',
  'PGOPTIONS',
  'PGREQUIRESSL',
  'PGSSLROOTCERT',
  'PGSSLCERT',
  'PGSSLKEY',
  'PGPASSFILE',
  'PGCHANNELBINDING',
]

// TLS modes that would transmit credentials in the clear, or allow it. Supabase
// requires TLS, so an explicitly configured downgrade is a misconfiguration we refuse
// rather than obey (SEC-SECRET-002).
const INSECURE_SSLMODES = new Set(['disable', 'allow', 'prefer'])

export function psqlEnvFrom(connectionString, baseEnv = {}) {
  const u = new URL(connectionString)
  const database =
    decodeURIComponent((u.pathname || '/postgres').replace(/^\//, '')) || 'postgres'
  const sslmode = (u.searchParams.get('sslmode') || '').toLowerCase()
  if (sslmode && INSECURE_SSLMODES.has(sslmode)) {
    throw new Error(
      `REFUSING: TEST_SUPABASE_DB_URL specifies sslmode=${sslmode}, which would send ` +
        'the database password over an unencrypted or unauthenticated connection. ' +
        'Use sslmode=require or verify-full.',
    )
  }
  const env = { ...baseEnv }
  for (const v of OVERRIDABLE_PG_VARS) delete env[v]
  return {
    ...env,
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username || ''),
    PGPASSWORD: decodeURIComponent(u.password || ''),
    PGDATABASE: database,
    // Supabase requires TLS. Honour an explicit (secure) sslmode from the URL; when one
    // is absent substitute `require` rather than inheriting libpq's default `prefer`,
    // which silently falls back to plaintext.
    PGSSLMODE: sslmode || 'require',
    // A hung connection must fail the job rather than stall it.
    PGCONNECT_TIMEOUT: '30',
  }
}

// Extract the report object from either execution mode's output.
//
// _report.sql returns ONE json column, but the modes wrap it differently: psql `-t -A`
// prints the bare object on its own line (preceded by blank lines from the
// void-returning assertion selects), while the Management API returns
// {"rows":[{"b5b": {...}}]}, pretty-printed across lines.
export function parseReport(output) {
  const lines = String(output)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!lines[i].startsWith('{')) continue
    let parsed
    try {
      parsed = JSON.parse(lines[i])
    } catch {
      continue
    }
    if (parsed && typeof parsed.total === 'number') return parsed
    const wrapped = (parsed?.rows ?? [])[0]?.b5b
    if (wrapped && typeof wrapped.total === 'number') return wrapped
  }
  // Whole-output fallback for pretty-printed JSON spanning several lines.
  const start = String(output).indexOf('{')
  const end = String(output).lastIndexOf('}') + 1
  if (start !== -1) {
    try {
      const wrapped = (JSON.parse(String(output).slice(start, end)).rows ?? [])[0]?.b5b
      if (wrapped && typeof wrapped.total === 'number') return wrapped
    } catch {
      /* fall through */
    }
  }
  return null
}
