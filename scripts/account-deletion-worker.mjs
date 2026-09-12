// ACCOUNT DELETION WORKER — the execution half of PD-102's erasure engine.
//
// ══ WHAT THIS IS, AND WHAT IT IS NOT ══════════════════════════════════════
//
// The engine in `supabase/migrations/202611*` can do everything except two
// things, and both need a process outside the database:
//
//   1. **Run the clock.** `sweep_account_deletions()` finalises requests whose
//      grace period has ended and executes the two SCHEDULED purges when their
//      retention window runs out. Nothing calls it.
//   2. **Delete the bytes.** Supabase refuses direct writes to `storage.objects`
//      (`42501: Direct deletion from storage tables is not allowed`), so the
//      engine QUEUES objects in `pending_media_deletions` and `media_purge`
//      raises while any remain unconfirmed. Only the Storage API can empty them.
//
// This script does both, once, bounded, and reports what is still late. It is a
// WORKER, not a SCHEDULER: **nothing in this repository invokes it on a clock,
// and that gap is a PRE-EXTERNAL-BETA BLOCKER recorded in OQ-088 and in
// docs/operations/ACCOUNT_ERASURE_OPERATIONS.md.** Until that decision is made,
// an operator runs this — which is a repeatable, auditable command instead of a
// sequence of dashboard clicks, and that is the whole improvement it claims.
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
// EXIT CODE. Non-zero when `overdue_account_deletion_work()` returns anything, so
// a caller that does have a scheduler can treat a late erasure as a failure
// rather than as log noise. A clean run exits 0 and says so.
import { createClient } from '@supabase/supabase-js'

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
const max = Math.max(1, Math.min(5000, Number(maxArg?.split('=')[1] ?? 200) || 200))

const db = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function line(s) {
  process.stdout.write(`${s}\n`)
}

// One sweep. Finalises every request past its grace date and runs every purge
// whose retention window has expired. Idempotent: a completed step is never
// re-run, and the purge loop locks each step with SKIP LOCKED so two overlapping
// runs cannot both execute one purge.
async function sweep(label) {
  const { data, error } = await db.rpc('sweep_account_deletions')
  if (error) throw new Error(`${label}: sweep_account_deletions failed — ${error.message}`)
  line(`${label}: ${JSON.stringify(data)}`)
  return data
}

// Drain the media queue through the Storage API, one object at a time, and
// CONFIRM each delete in the database only after it actually succeeded. Never
// the other way round: `confirm_media_deleted` is the record that the bytes are
// gone, and a confirmation written before the delete is a lie the `media_purge`
// gate would then believe.
async function drainMedia() {
  const { data: rows, error } = await db
    .from('pending_media_deletions')
    .select('id, bucket_id, object_path, attempts')
    .is('deleted_at', null)
    .order('enqueued_at', { ascending: true })
    .limit(max)
  if (error) throw new Error(`reading pending_media_deletions failed — ${error.message}`)

  if (!rows.length) {
    line('media: nothing queued')
    return { deleted: 0, failed: 0, queued: 0 }
  }
  if (dryRun) {
    line(`media: ${rows.length} object(s) queued (dry run, nothing deleted)`)
    for (const r of rows) line(`  would delete ${r.bucket_id}/${r.object_path}`)
    return { deleted: 0, failed: 0, queued: rows.length }
  }

  let deleted = 0
  let failed = 0
  for (const r of rows) {
    // `remove()` returns the objects it ACTUALLY removed. A path that does not
    // resolve — bucket renamed, a leading slash, an object already moved — comes
    // back as `{ error: null, data: [] }`, and confirming on the absence of an
    // error would write exactly the lie this function's contract forbids: the
    // media_purge gate would then pass with the bytes still in the bucket.
    // Inspect the payload, not just the error.
    const { data: removed, error: rmError } = await db.storage
      .from(r.bucket_id)
      .remove([r.object_path])
    const reallyGone = !rmError && Array.isArray(removed) && removed.length > 0
    if (!reallyGone) {
      const why = rmError
        ? rmError.message
        : 'the Storage API removed nothing for this path — it may not exist in this bucket'
      failed += 1
      // The attempt and the reason are recorded on the row, so a repeatedly
      // failing object is visible in overdue_account_deletion_work() rather than
      // only in whatever terminal happened to be open.
      await db
        .from('pending_media_deletions')
        .update({ attempts: (r.attempts ?? 0) + 1, last_error: String(why).slice(0, 4000) })
        .eq('id', r.id)
      line(`  FAILED ${r.bucket_id}/${r.object_path}: ${why}`)
      continue
    }
    const { data: confirmed, error: confirmError } = await db.rpc('confirm_media_deleted', {
      p_bucket: r.bucket_id,
      p_path: r.object_path,
    })
    if (confirmError) {
      failed += 1
      line(`  DELETED BUT UNCONFIRMED ${r.bucket_id}/${r.object_path}: ${confirmError.message}`)
      continue
    }
    if (confirmed) deleted += 1
  }
  line(`media: ${deleted} deleted, ${failed} failed, ${rows.length} examined (cap ${max})`)
  return { deleted, failed, queued: rows.length }
}

// Everything that is late: a request past its grace date nothing finalised, and
// any step that is failed, held or past due. This is the report, and it is also
// the exit code.
async function reportOverdue() {
  const { data, error } = await db.rpc('overdue_account_deletion_work')
  if (error) throw new Error(`overdue_account_deletion_work failed — ${error.message}`)
  if (!data.length) {
    line('overdue: nothing')
    return 0
  }
  line(`overdue: ${data.length} item(s)`)
  for (const r of data) {
    line(
      `  request ${r.request_id} step ${r.step_key} status ${r.status}` +
        ` due ${r.due_at ?? '-'} attempts ${r.attempts ?? 0}` +
        (r.last_error ? ` last_error ${r.last_error}` : ''),
    )
  }
  return data.length
}

async function main() {
  line(`account-deletion-worker: project ${ref}${dryRun ? ' (dry run)' : ''}`)

  // ORDER MATTERS, AND IT IS TWO SWEEPS DELIBERATELY. The first finalises what
  // is due, which is what ENQUEUES media. The drain then empties the queue. The
  // second sweep is what lets `media_purge` pass and the request reach
  // `completed` — without it every erasure would sit one run behind, reporting
  // `failed` until somebody ran the worker again.
  if (dryRun) {
    line('sweep: skipped (dry run)')
  } else {
    await sweep('sweep 1')
  }
  await drainMedia()
  if (!dryRun) await sweep('sweep 2')

  const late = await reportOverdue()
  if (late > 0) {
    line('')
    line(`FAILED: ${late} item(s) of deletion work are late. See the rows above.`)
    process.exitCode = 1
  } else {
    line('')
    line('OK: no deletion work is late.')
  }
}

main().catch((err) => {
  console.error(err?.message ?? err)
  process.exitCode = 1
})
