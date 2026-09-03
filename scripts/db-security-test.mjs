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
// Secrets are read from the environment. Nothing is hardcoded and the connection
// string is never printed -- only the project ref, which is not a credential.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { PRODUCTION_SUPABASE_REF, refFromTarget } from './prodRef.mjs'

const SUITES = [
  'supabase/tests/_helpers.sql',
  'supabase/tests/_fixtures.sql',
  'supabase/tests/reviews.test.sql',
  'supabase/tests/messaging.test.sql',
  'supabase/tests/_report.sql',
]

const dbUrl = process.env.TEST_SUPABASE_DB_URL || ''
let target
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
  console.log(`target: non-production project ${ref} (via TEST_SUPABASE_DB_URL)`)
  target = ['--db-url', dbUrl]
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
  target = ['--linked']
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
  raw = execFileSync('supabase', ['db', 'query', ...target, '--file', file], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
} catch (err) {
  // Scrub: a CLI error can echo the invocation, which would include the URL.
  const raw = String(err.stdout || '') + String(err.stderr || err.message || '')
  // Redact unconditionally. The previous exact-substring scrub was a no-op on the
  // --linked path (dbUrl is empty there) and missed re-quoted or component-split
  // forms, so any postgres URL in the output is stripped regardless of origin.
  const msg = (dbUrl ? raw.split(dbUrl).join('<redacted>') : raw).replace(
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

const start = raw.indexOf('{')
const end = raw.lastIndexOf('}') + 1
if (start === -1) {
  console.error('DB harness produced no parseable result.')
  process.exit(1)
}
const row = (JSON.parse(raw.slice(start, end)).rows ?? [])[0]
if (!row) {
  console.error('DB harness returned no report row.')
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
