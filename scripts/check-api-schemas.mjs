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
// `net.http_post` (the database issuing arbitrary HTTP requests from inside the
// project's network) and `net._http_response` (the stored response bodies of every
// pg_net call). That setting lives in the Supabase dashboard, not in this
// repository, so the guarantee is otherwise one toggle away from somebody who has
// never read any of the above. This script is how a release fails on it.
//
// ══ HOW IT DECIDES, AND WHY IT IS FUSSY ══════════════════════════════════
//
// A gate that passes for the wrong reason is worse than no gate, and the first
// version of this file had three ways to do exactly that. Each is now closed:
//
//   * **The pass is a PARSED FIELD, not a substring.** It was
//     `text.includes('PGRST106')` over the whole body. `net._http_response`
//     *stores HTTP response bodies*, `cron.job` stores SQL, and
//     `vault.decrypted_secrets` stores secrets — so if the schema WERE exposed and
//     any returned row merely contained that token, the probe reported PASS. It
//     now requires HTTP **406** and a parsed `code === 'PGRST106'`.
//
//   * **The exposed list is ASSERTED, not inferred from a refusal.** `PGRST106`
//     comes back for any profile not in the list — including a misspelled one, so
//     a typo in a schema name here would have passed while `net` was wide open.
//     PostgREST names the exposed schemas in that very message, so the list is
//     parsed out and checked directly. That makes the gate self-validating.
//
//   * **The project is IDENTIFIED, not guessed.** It used a hand-rolled regex of
//     exactly the shape `scripts/prodRef.mjs` warns against, and fell back to
//     `TEST_SUPABASE_URL` — so an operator following this file's own usage block
//     probed non-production and printed OK. It now resolves the ref through
//     `refFromTarget`, refuses a ref it cannot positively identify, says
//     PRODUCTION or NON-PRODUCTION in as many words, and requires
//     `--allow-non-prod` before accepting the non-production fallback.
//
// Probes are **GET only**. `PGRST106` is a schema-level refusal, so reading one
// object per schema answers the whole question; POSTing to `net.http_post` was an
// unnecessary risk that happened to be harmless.
//
// ══ WHAT IT IS SAFE TO POINT AT ══════════════════════════════════════════
//
// Strictly READ-ONLY, and it prints no row content even on failure — in the
// failure state that content is the privileged material it just detected. It is
// therefore safe to run against production, which is the environment whose
// configuration matters most, and it carries no production guard for that reason.
//
// ══ USAGE ════════════════════════════════════════════════════════════════
//
//   # production, which is what the release gate means
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon key> \
//     node scripts/check-api-schemas.mjs
//
//   # non-production, which must be asked for explicitly
//   set -a; . ./.env.tooling.local; set +a
//   node scripts/check-api-schemas.mjs --allow-non-prod
//
// Exits non-zero if any forbidden schema is reachable, if the exposed list is not
// exactly what it should be, or if any probe was inconclusive — "we could not
// tell" must never read as "it is fine".
import { PRODUCTION_SUPABASE_REF, refFromTarget } from './prodRef.mjs'

export const FORBIDDEN_SCHEMAS = ['net', 'cron', 'vault']
export const EXPECTED_EXPOSED = ['public', 'graphql_public']

// Parses `Only the following schemas are exposed: public, graphql_public` out of
// PostgREST's `hint`.
export function exposedFrom(message) {
  const m = /exposed:\s*([^"]+)/i.exec(message ?? '')
  if (!m) return null
  return m[1]
    .split(',')
    .map((x) => x.trim().replace(/[.\s]+$/, ''))
    .filter(Boolean)
}

// THE PASS PREDICATE, isolated so it can be tested without a project.
//
// A gate that passes for the wrong reason is worse than no gate, and the first
// version of this decided on `text.includes('PGRST106')` over the raw body. The
// probed objects STORE arbitrary text — `net._http_response` holds HTTP response
// bodies, `cron.job` holds SQL, `vault.decrypted_secrets` holds secrets — so a
// single row containing that token would have reported PASS while the schema was
// wide open. It now requires the status AND the parsed code.
export function classify(status, body) {
  if (status === 406 && body?.code === 'PGRST106') {
    return {
      state: 'refused',
      exposed: exposedFrom(body.hint) ?? exposedFrom(body.message),
      detail: 'schema not exposed',
    }
  }
  if (status >= 200 && status < 300) {
    // NO ROW CONTENT. In this state the body IS the privileged material this
    // check exists to detect.
    const rows = Array.isArray(body) ? body.length : 'unknown'
    return { state: 'reachable', detail: `HTTP ${status}, ${rows} row(s) returned` }
  }
  return {
    state: 'inconclusive',
    detail: `HTTP ${status} ${body?.code ?? '(no code)'}: ${String(body?.message ?? '').slice(0, 120)}`,
  }
}

// Judges the exposed list itself. A refusal proves only that the name we asked
// for is not exposed — a typo would be refused too — so the real list is checked.
export function judgeExposedList(lists) {
  const found = lists.filter(Boolean)
  if (found.length === 0) {
    return 'no probe returned an exposed-schema list, so the refusals prove nothing about the real configuration'
  }
  const exposed = found[0]
  const leaked = FORBIDDEN_SCHEMAS.filter((x) => exposed.includes(x))
  if (leaked.length) return `forbidden schema(s) in the exposed list: ${leaked.join(', ')}`
  if (exposed.slice().sort().join(',') !== EXPECTED_EXPOSED.slice().sort().join(','))
    return `exposed list is [${exposed.join(', ')}], expected [${EXPECTED_EXPOSED.join(', ')}]`
  return null
}

// The CLI runs only when this file IS the entry point, so a test can import the
// predicates above without probing anything.
//
// `process.argv[1]` rather than `import.meta.url`: this file is also loaded by
// Jest through babel-preset-expo, which targets Hermes and rejects `import.meta`
// outright. And `main()` is called without top-level await for the same reason —
// a transformed CJS module cannot carry one even on a branch it never takes.
if (/check-api-schemas\.mjs$/.test(process.argv[1] ?? '')) {
  main().catch((err) => {
    console.error(err?.message ?? err)
    process.exitCode = 1
  })
}

async function main() {

const allowNonProd = process.argv.includes('--allow-non-prod')

// No silent fallback: an explicit SUPABASE_URL is the production shape, and the
// tooling env is accepted only when the caller says they meant it.
const explicitUrl = process.env.SUPABASE_URL || ''
const explicitKey = process.env.SUPABASE_ANON_KEY || ''
const url = explicitUrl || (allowNonProd ? process.env.TEST_SUPABASE_URL || '' : '')
const anon = explicitKey || (allowNonProd ? process.env.TEST_SUPABASE_ANON_KEY || '' : '')

if (!url || !anon) {
  console.error(
    'Set SUPABASE_URL and SUPABASE_ANON_KEY for the project you mean to check.\n' +
      'To check the non-production project from .env.tooling.local, pass --allow-non-prod.',
  )
  process.exit(1)
}

// THE CANONICAL RESOLVER, not a local regex. `prodRef.mjs` is end-anchored and
// parses with the URL parser, because a free-text scan can match a decoy inside
// the userinfo section and report a benign ref while the request goes to the host
// after it.
const ref = refFromTarget(url)
if (ref === null) {
  console.error(
    'Refusing to run: cannot positively identify the Supabase project ref in the URL.\n' +
      'A gate that cannot say which project it checked is worse than no gate.',
  )
  process.exit(1)
}
const isProduction = ref === PRODUCTION_SUPABASE_REF
if (!isProduction && !allowNonProd) {
  console.error(
    `Refusing to run: ${ref} is NOT the production project and --allow-non-prod was not passed.\n` +
      'This is the release gate; passing it against non-production and recording "production checked" is the failure it exists to prevent.',
  )
  process.exit(1)
}

// One readable object per forbidden schema. GET only.
const PROBES = [
  { schema: 'net', object: '_http_response', why: 'stored HTTP response bodies + an SSRF primitive' },
  { schema: 'cron', object: 'job', why: 'the scheduled job list' },
  { schema: 'vault', object: 'decrypted_secrets', why: 'every project secret' },
]

// Three outcomes, not two. Reporting a 502 or a bad key as "reachable" is
// fail-safe in direction and wrong in diagnosis, and the likely result of a wrong
// diagnosis is the gate being dismissed as flaky.
async function probe(p, attempt = 1) {
  try {
    const res = await fetch(`${url}/rest/v1/${p.object}?select=*`, {
      method: 'GET',
      headers: { apikey: anon, 'Accept-Profile': p.schema },
      signal: AbortSignal.timeout(20000),
    })
    const text = await res.text()
    let body = null
    try {
      body = JSON.parse(text)
    } catch {
      body = null
    }
    // PostgREST puts the list in `hint`, not `message` — `message` is
    // "Invalid schema: net". Reading the wrong field is why the first run of this
    // gate reported that its refusals proved nothing, which is the gate being
    // right about itself.
    const verdict = classify(res.status, body)
    if (verdict.state === 'inconclusive' && res.status >= 500 && attempt < 3) {
      return probe(p, attempt + 1)
    }
    return verdict
  } catch (err) {
    if (attempt < 3) return probe(p, attempt + 1)
    return { state: 'inconclusive', detail: `no response after 3 attempts: ${err?.message ?? err}` }
  }
}

const results = []
for (const p of PROBES) results.push({ p, r: await probe(p) })

console.log(
  `exposed-api-schema check: project ${ref} — ${isProduction ? 'PRODUCTION' : 'NON-PRODUCTION'}`,
)

let reachable = 0
let inconclusive = 0
for (const { p, r } of results) {
  const mark =
    r.state === 'refused' ? 'PASS' : r.state === 'reachable' ? 'FAIL' : 'INCONCLUSIVE'
  if (r.state === 'reachable') reachable += 1
  if (r.state === 'inconclusive') inconclusive += 1
  console.log(`  ${mark} ${p.schema}.${p.object} (${p.why}) — ${r.detail}`)
}

// THE SELF-VALIDATING HALF.
const lists = results.map((x) => x.r.exposed)
const listProblem = judgeExposedList(lists)
if (listProblem) console.log(`  FAIL exposed schema list — ${listProblem}`)
else console.log(`  PASS exposed schema list is exactly [${lists.filter(Boolean)[0].join(', ')}]`)

console.log('')
if (reachable > 0 || listProblem) {
  console.log(
    'FAILED: the public API exposes a schema it must not. Remove it from the ' +
      "project's exposed schema list before release.",
  )
  process.exitCode = 1
} else if (inconclusive > 0) {
  console.log(
    `FAILED: ${inconclusive} probe(s) inconclusive. A result nobody got is not a pass.`,
  )
  process.exitCode = 1
} else {
  console.log(
    `OK: no forbidden schema is exposed through the ${isProduction ? 'PRODUCTION' : 'non-production'} public API.`,
  )
}
}
