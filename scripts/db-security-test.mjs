// B5B — executable DB/security regression harness (NON-PRODUCTION ONLY).
//
// Runs the SQL suites in supabase/tests/ against a non-production database inside a
// single transaction that is ALWAYS rolled back, and fails the process if any
// assertion fails. These are real DB assertions -- RLS, triggers, grants and
// SECURITY DEFINER functions enforcing against simulated auth contexts -- not mocks
// and not source-text checks. Mocked or regex tests cannot replace this file.
//
// Usage (local, against the linked non-prod project):
//   supabase link --project-ref <non-prod-ref>     # once
//   node scripts/db-security-test.mjs
//
// Usage (CI or explicit target):
//   TEST_SUPABASE_DB_URL='postgresql://...' node scripts/db-security-test.mjs
//
// EXECUTION MODE. The suites are one multi-statement script wrapped in a single
// transaction, so it must be sent over a protocol that accepts multiple commands per
// message:
//   * TEST_SUPABASE_DB_URL set -> psql, which sends a -f script using the SIMPLE query
//     protocol. Multiple commands per message are legal there.
//   * otherwise -> `supabase db query --linked`, which posts the script to the
//     Management API. Also multi-statement safe; used for local convenience.
// What must NOT be used is `supabase db query --db-url`: it issues the script through
// the EXTENDED query protocol (a prepared statement), and PostgreSQL rejects that with
// "cannot insert multiple commands into a prepared statement". That is exactly how this
// harness failed in CI once a real connection string was configured.
//
// The Session pooler (port 5432, session mode) is required rather than the Transaction
// pooler: the harness relies on temp tables, pg_temp functions and a transaction that
// spans the whole script, all of which need a dedicated backend for the session.
//
// Secrets are read from the environment. Nothing is hardcoded and the connection
// string is never printed -- only the project ref, which is not a credential.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PRODUCTION_SUPABASE_REF, refFromTarget } from './prodRef.mjs'
import { psqlEnvFrom, parseReport } from './b5bExec.mjs'

const SUITES = [
  'supabase/tests/_helpers.sql',
  'supabase/tests/_fixtures.sql',
  'supabase/tests/reviews.test.sql',
  'supabase/tests/messaging.test.sql',
  'supabase/tests/_report.sql',
]

const dbUrl = process.env.TEST_SUPABASE_DB_URL || ''
// Only used by the Supabase CLI (linked) path; the psql path takes its target from
// PG* environment variables instead.
let cliTarget
if (dbUrl) {
  const ref = refFromTarget(dbUrl)
  // Refuse anything we cannot positively identify as non-production. An
  // unparseable target is treated as unsafe, not as "probably fine".
  if (!ref) {
    console.error(
      'REFUSING: could not identify the project ref from TEST_SUPABASE_DB_URL.\n' +
        'The harness only runs against a positively identified non-production project.',
    )
    process.exit(1)
  }
  if (ref === PRODUCTION_SUPABASE_REF) {
    console.error(`REFUSING to run against the PRODUCTION project (ref ${ref}).`)
    process.exit(1)
  }
  // The harness needs a backend dedicated to the session (temp tables, pg_temp
  // functions, one transaction spanning the script). The Transaction pooler does not
  // provide that.
  try {
    if (new URL(dbUrl).port === '6543') {
      console.error(
        'REFUSING: port 6543 is the Supabase TRANSACTION pooler. This harness needs the\n' +
          'SESSION pooler (port 5432): it uses temp tables, pg_temp functions and a single\n' +
          'transaction spanning the whole script, which require a dedicated backend.',
      )
      process.exit(1)
    }
  } catch {
    /* refFromTarget already validated the URL; nothing further to do here */
  }
  console.log(`target: non-production project ${ref} (via TEST_SUPABASE_DB_URL)`)
} else {
  // Local convenience: the CLI's linked project. Verify it is not production
  // BEFORE issuing any query against it.
  let linkedRef = null
  try {
    const out = execFileSync('supabase', ['projects', 'list', '--output', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const projects = JSON.parse(out).projects ?? JSON.parse(out)
    linkedRef = (projects.find((p) => p.linked) || {}).ref ?? null
  } catch {
    console.error(
      'No TEST_SUPABASE_DB_URL set and the linked project could not be resolved.\n' +
        'Set TEST_SUPABASE_DB_URL, or run `supabase link --project-ref <non-prod-ref>`.',
    )
    process.exit(1)
  }
  if (!linkedRef) {
    console.error('No linked Supabase project. Run `supabase link --project-ref <non-prod-ref>`.')
    process.exit(1)
  }
  if (linkedRef === PRODUCTION_SUPABASE_REF) {
    console.error(`REFUSING: the linked project is PRODUCTION (ref ${linkedRef}).`)
    process.exit(1)
  }
  console.log(`target: non-production project ${linkedRef} (linked)`)
  cliTarget = ['--linked']
}

// One transaction, always rolled back: the harness leaves zero residue even when an
// assertion fails, and even if a suite raises.
const sql = [
  'begin;',
  ...SUITES.map((f) => readFileSync(f, 'utf8')),
  'rollback;',
].join('\n')

// A suite written but not registered would never run, and CI would stay green.
const onDisk = readdirSync('supabase/tests')
  .filter((f) => f.endsWith('.test.sql'))
  .map((f) => `supabase/tests/${f}`)
// _report.sql aggregates _results and must run LAST: a suite registered after it would
// have its assertions excluded from the totals while the run still reported success.
if (SUITES[SUITES.length - 1] !== 'supabase/tests/_report.sql') {
  console.error('supabase/tests/_report.sql must be the LAST entry in SUITES.')
  process.exit(1)
}

const unregistered = onDisk.filter((f) => !SUITES.includes(f))
if (unregistered.length > 0) {
  console.error(`Unregistered test suite(s): ${unregistered.join(', ')}`)
  console.error('Add them to SUITES in scripts/db-security-test.mjs (before _report.sql).')
  process.exit(1)
}

const file = join(tmpdir(), `b5b-${process.pid}.sql`)
writeFileSync(file, sql)

let raw
try {
  if (dbUrl) {
    // psql -f uses the simple query protocol, so the multi-statement script is legal.
    // -v ON_ERROR_STOP=1 aborts on the first SQL error instead of continuing and
    // reporting a misleading partial result; -t -A strips headers and alignment so the
    // final JSON row prints as one parseable line; -X ignores any local psqlrc.
    raw = execFileSync(
      'psql',
      ['-v', 'ON_ERROR_STOP=1', '-X', '-q', '-t', '-A', '-f', file],
      {
        encoding: 'utf8',
        maxBuffer: 32 * 1024 * 1024,
        env: psqlEnvFrom(dbUrl, process.env),
        // Capture stderr rather than letting Node echo the child's raw output straight
        // to ours: the redaction below is the single choke point, and an inherited
        // stream would bypass it (SEC-SECRET-001).
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    )
  } else {
    raw = execFileSync('supabase', ['db', 'query', ...cliTarget, '--file', file], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  }
} catch (err) {
  if (err && err.code === 'ENOENT' && dbUrl) {
    console.error(
      'psql was not found. The DB-URL path needs a PostgreSQL client (postgresql-client),\n' +
        'which is preinstalled on GitHub ubuntu runners. Install it, or unset\n' +
        'TEST_SUPABASE_DB_URL to use the linked-project path instead.',
    )
    process.exit(1)
  }
  // Scrub: a client error can echo the invocation, which could include the URL.
  const errOut = String(err.stdout || '') + String(err.stderr || err.message || '')
  // Redact unconditionally. The previous exact-substring scrub was a no-op on the
  // --linked path (dbUrl is empty there) and missed re-quoted or component-split
  // forms, so any postgres URL in the output is stripped regardless of origin.
  const msg = (dbUrl ? errOut.split(dbUrl).join('<redacted>') : errOut).replace(
    /postgres(?:ql)?:\/\/[^\s"'<>]+/gi,
    '<redacted>',
  )
  console.error('DB harness failed to execute:')
  console.error(msg)
  process.exit(1)
} finally {
  try {
    unlinkSync(file)
  } catch {}
}

const row = parseReport(raw)
if (!row) {
  console.error('DB harness produced no parseable report row.')
  process.exit(1)
}

console.log(row.report)
console.log(`\n${row.passed}/${row.total} passed, ${row.failed} failed`)

if (row.total === 0) {
  console.error('No assertions ran — treating as failure.')
  process.exit(1)
}
if (row.failed > 0) {
  console.error(`\nB5B FAILED: ${row.failed} DB security assertion(s) failed.`)
  process.exit(1)
}
console.log('B5B passed. Transaction rolled back; no residue.')
