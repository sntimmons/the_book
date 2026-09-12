// EXPOSED-API-SCHEMA CHECK — a release gate for the one control we actually hold
// over pg_net.
//
// ══ WHY THIS EXISTS ══════════════════════════════════════════════════════
//
// `pg_net` (installed by `20261130000000` for the scheduled account-deletion
// worker) grants PUBLIC `EXECUTE` on `net.http_post` and ALL privileges on
// `net._http_response`. Those grants were made by `supabase_admin`, and
// `postgres` is not a member of it — so **no migration in this repository can
// revoke them**, and `20261132000000` records an attempt that applied cleanly and
// did nothing.
//
// What keeps them out of reach is a single project setting: PostgREST's exposed
// schema list. If `net` were ever added to it, every signed-in account would gain
//
//   * `net.http_post` — the database issuing arbitrary HTTP requests from inside
//     the project's network (server-side request forgery), and
//   * `net._http_response` — the stored response bodies of every pg_net call.
//
// That setting lives in the Supabase dashboard, not in this repository, so the
// guarantee is otherwise one toggle away from somebody who has never read any of
// the above. This script turns it into something a release can FAIL on.
//
// ══ WHAT IT DOES, AND WHAT IT IS SAFE TO POINT AT ═════════════════════════
//
// Strictly READ-ONLY: it asks PostgREST to resolve two objects in a forbidden
// schema and expects to be refused. It writes nothing, needs only the anon key,
// and is therefore **safe to run against production** — which is the point, since
// that is the environment whose configuration matters most. It carries no
// production guard for that reason, deliberately, unlike
// `scripts/account-deletion-worker.mjs`, which deletes things.
//
// ══ USAGE ════════════════════════════════════════════════════════════════
//
//   set -a; . ./.env.tooling.local; set +a
//   node scripts/check-api-schemas.mjs
//
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/check-api-schemas.mjs
//
// Exits non-zero if any forbidden schema is reachable, or if the check could not
// be completed — an inconclusive result is a failure, not a pass, because
// "we could not tell" must never read as "it is fine".
const url = process.env.SUPABASE_URL || process.env.TEST_SUPABASE_URL || ''
const anon = process.env.SUPABASE_ANON_KEY || process.env.TEST_SUPABASE_ANON_KEY || ''

if (!url || !anon) {
  console.error(
    'Missing SUPABASE_URL / SUPABASE_ANON_KEY (or TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY).',
  )
  process.exit(1)
}

const ref = (url.match(/([a-z0-9]{20})\.supabase\./) || [])[1] ?? '(unrecognised host)'

// Each probe names an object that EXISTS in the database but lives in a schema the
// API must not expose. A refusal with PGRST106 is the pass.
const PROBES = [
  { schema: 'net', kind: 'rpc', object: 'http_post', why: 'an SSRF primitive' },
  { schema: 'net', kind: 'table', object: '_http_response', why: 'stored HTTP response bodies' },
  { schema: 'cron', kind: 'table', object: 'job', why: 'the scheduled job list' },
  { schema: 'cron', kind: 'rpc', object: 'schedule', why: 'scheduling arbitrary SQL' },
  { schema: 'vault', kind: 'table', object: 'decrypted_secrets', why: 'every project secret' },
]

// A transient gateway hiccup must not be read as a refusal. Retry, and treat a
// result we never got as inconclusive.
async function probe(p, attempt = 1) {
  const isRpc = p.kind === 'rpc'
  const target = isRpc ? `${url}/rest/v1/rpc/${p.object}` : `${url}/rest/v1/${p.object}?select=*`
  const headers = { apikey: anon, 'Content-Type': 'application/json' }
  headers[isRpc ? 'Content-Profile' : 'Accept-Profile'] = p.schema
  try {
    const res = await fetch(target, {
      method: isRpc ? 'POST' : 'GET',
      headers,
      body: isRpc ? '{}' : undefined,
      signal: AbortSignal.timeout(20000),
    })
    const text = await res.text()
    // PGRST106 is PostgREST saying the schema is not exposed. That is the pass,
    // and it is the ONLY pass: a 404 on the object could mean the schema IS
    // exposed and the object merely renamed.
    if (text.includes('PGRST106')) return { ok: true, detail: 'refused: schema not exposed' }
    return { ok: false, detail: `${res.status} ${text.slice(0, 200)}` }
  } catch (err) {
    if (attempt < 3) return probe(p, attempt + 1)
    return { ok: null, detail: `inconclusive after 3 attempts: ${err?.message ?? err}` }
  }
}

const results = []
for (const p of PROBES) {
  results.push({ p, r: await probe(p) })
}

console.log(`exposed-api-schema check: project ${ref}`)
let failed = 0
let inconclusive = 0
for (const { p, r } of results) {
  const mark = r.ok === true ? 'PASS' : r.ok === false ? 'FAIL' : 'UNKNOWN'
  if (r.ok === false) failed += 1
  if (r.ok === null) inconclusive += 1
  console.log(`  ${mark} ${p.schema}.${p.object} (${p.why}) — ${r.detail}`)
}

console.log('')
if (failed > 0) {
  console.log(
    `FAILED: ${failed} forbidden schema object(s) are reachable through the public API. ` +
      `Remove them from the project's exposed schema list before release.`,
  )
  process.exitCode = 1
} else if (inconclusive > 0) {
  console.log(`FAILED: ${inconclusive} probe(s) were inconclusive. A result nobody got is not a pass.`)
  process.exitCode = 1
} else {
  console.log('OK: no forbidden schema is exposed through the public API.')
}
