// ACCOUNT DELETION WORKER — the MANUAL FALLBACK for PD-102's erasure engine.
//
// ══ WHAT THIS IS, AND WHAT IT IS NOT ══════════════════════════════════════
//
// Deletion finalisation is AUTOMATIC (PD-108, closing OQ-088): `pg_cron` calls
// `public.invoke_account_deletion_worker()`, which invokes the
// `account-deletion-worker` Edge Function daily. **This script is not the
// primary mechanism and must not be described as one.**
//
// It exists for the cases automation cannot cover:
//   * the scheduler or the Edge Function is failing and work is piling up
//   * an operator needs to drain a specific backlog now rather than tonight
//   * somebody is diagnosing why a run did not come out clean
//
// It runs the SAME sequence, from the same file — `supabase/functions/_shared/
// accountDeletionRun.mjs` — so the fallback and the scheduled path cannot drift
// into two meanings of "done". The only things this file owns are the production
// guard, the environment, and the exit code.
//
// ══ USAGE ════════════════════════════════════════════════════════════════
//
//   set -a; . ./.env.tooling.local; set +a; node scripts/account-deletion-worker.mjs
//
//   --max=<n>   most storage objects to delete in one run (default 200)
//   --dry-run   report what WOULD be done; deletes nothing, confirms nothing
//
// Required env: TEST_SUPABASE_URL, TEST_SUPABASE_SERVICE_ROLE_KEY.
//
// EXIT CODE. Non-zero whenever the run is not clean — anything late, any object
// that failed to delete, any step that errored. A clean run exits 0 and says so.
import { createClient } from '@supabase/supabase-js'

import { runAccountDeletionWorker } from '../supabase/functions/_shared/accountDeletionRun.mjs'
import { PRODUCTION_SUPABASE_REF, refFromTarget } from './prodRef.mjs'

function required(value, name) {
  if (!value) throw new Error(`Missing required tooling env: ${name} (see .env.tooling.example)`)
  return value
}

const url = required(process.env.TEST_SUPABASE_URL, 'TEST_SUPABASE_URL')
const serviceRoleKey = required(
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY,
  'TEST_SUPABASE_SERVICE_ROLE_KEY',
)

// HARD GUARD, BEFORE ANY CONNECTION. This script deletes storage objects and
// finalises account erasures; both are irreversible. `refFromTarget` parses the
// URL rather than scanning it, and a ref it cannot positively identify is
// refused rather than assumed safe.
const ref = refFromTarget(url)
if (ref === null) {
  throw new Error(`Refusing to run: cannot identify the Supabase project ref in TEST_SUPABASE_URL.`)
}
if (ref === PRODUCTION_SUPABASE_REF) {
  throw new Error(`Refusing to run against the PRODUCTION Supabase project (ref ${ref}).`)
}

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const maxArg = args.find((a) => a.startsWith('--max='))
const max = Number(maxArg?.split('=')[1] ?? 200) || 200

const db = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const lines = []
const io = {
  sweep: () => db.rpc('sweep_account_deletions'),
  listPendingMedia: (limit) =>
    db
      .from('pending_media_deletions')
      .select('id, bucket_id, object_path, attempts')
      .is('deleted_at', null)
      .order('enqueued_at', { ascending: true })
      .limit(limit),
  claimPendingMedia: (limit) => db.rpc('claim_pending_media_deletions', { p_limit: limit }),
  // RAW LISTING ONLY — see `objectIsAbsent` in the shared module for why.
  listObjects: (bucket, folder, name) => db.storage.from(bucket).list(folder, { search: name }),
  removeObject: (bucket, path) => db.storage.from(bucket).remove([path]),
  confirmDeleted: (bucket, path) =>
    db.rpc('confirm_media_deleted', { p_bucket: bucket, p_path: path }),
  recordFailure: async (row, message) => {
    await db.rpc('record_media_deletion_failure', { p_id: row.id, p_error: String(message) })
  },
  overdue: () => db.rpc('overdue_account_deletion_work'),
  log: (line) => {
    lines.push(line)
    process.stdout.write(`${line}\n`)
  },
}

async function main() {
  io.log(`account-deletion-worker: project ${ref}${dryRun ? ' (dry run)' : ''} (manual fallback)`)

  const result = await runAccountDeletionWorker(io, { max, dryRun })

  // The same durable record the scheduled path writes, marked `manual` — so the
  // run log answers "what ran, and was it the scheduler or a person?" rather
  // than only "did something run". A dry run records nothing: it changed nothing.
  if (!dryRun) {
    const { error } = await db.from('account_deletion_worker_runs').insert({
      source: 'manual',
      ok: result.ok,
      media_examined: result.mediaExamined,
      media_deleted: result.mediaDeleted,
      media_failed: result.mediaFailed,
      overdue_count: result.overdueCount,
      result,
      log: lines.join('\n').slice(0, 20000),
    })
    if (error) io.log(`WARNING: the run itself is not recorded — ${error.message}`)
  }

  io.log('')
  if (result.ok) {
    io.log('OK: no deletion work is late.')
  } else {
    io.log(
      `FAILED: ${result.overdueCount} late item(s), ${result.mediaFailed} media failure(s)` +
        `${result.errors.length ? `, ${result.errors.length} error(s)` : ''}. See above.`,
    )
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err?.message ?? err)
  process.exitCode = 1
})
