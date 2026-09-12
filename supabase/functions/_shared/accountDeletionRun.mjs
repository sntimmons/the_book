// THE CANONICAL ACCOUNT-ERASURE EXECUTION SEQUENCE — one copy, two runtimes.
//
// ══ WHY THIS FILE EXISTS AT ALL ═══════════════════════════════════════════
//
// The erasure engine is finished and proven; what it lacked was something to
// RUN it. There are now two callers — a scheduled Supabase Edge Function (Deno)
// and `scripts/account-deletion-worker.mjs` (Node, the manual fallback) — and
// two callers is exactly how a deletion engine acquires two slightly different
// meanings of "done". So the sequence lives here, once, and the callers supply
// nothing but I/O.
//
// **This module imports nothing.** Not `@supabase/supabase-js`, not a Deno std
// library, not a polyfill. That is what lets one file be loaded unchanged by
// `node` and by the Supabase Edge runtime, and it is the only reason the parity
// is real rather than aspirational. Keep it that way: an import here is a fork.
//
// ══ THE SEQUENCE, AND WHY EACH STEP IS WHERE IT IS ════════════════════════
//
//   1. sweep  — finalises every request past its grace date and runs every purge
//               whose retention window has expired. This is what ENQUEUES media.
//   2. drain  — SQL cannot delete a storage object (Supabase answers `42501:
//               Direct deletion from storage tables is not allowed`), so the
//               engine queues them and only the Storage API can empty the queue.
//   3. confirm — and ONLY after the API actually removed the object. `remove()`
//               reports `{ error: null, data: [] }` for a path that does not
//               resolve, so confirming on the absence of an error writes a lie
//               the `media_purge` gate would then believe.
//   4. sweep  — again, deliberately. `media_purge` could not pass before the
//               drain, so without a second sweep every erasure would sit one run
//               behind, reporting `failed` until somebody ran the worker twice.
//   5. overdue — the honest answer to "did promised deletion work fail?"
//
// Every database rule stays in the database. This file orchestrates and reports;
// it decides nothing about what may be deleted.

/**
 * @param {object} io  Runtime adapters. Each returns `{ data, error }` in the
 *   supabase-js shape so neither caller has to translate.
 * @param {() => Promise<{data:any,error:any}>} io.sweep
 * @param {(limit:number) => Promise<{data:any[],error:any}>} io.listPendingMedia
 * @param {(bucket:string, path:string) => Promise<{data:any,error:any}>} io.removeObject
 * @param {(bucket:string, path:string) => Promise<{data:any,error:any}>} io.confirmDeleted
 * @param {(row:object, message:string) => Promise<void>} io.recordFailure
 * @param {() => Promise<{data:any[],error:any}>} io.overdue
 * @param {(line:string) => void} [io.log]
 * @param {object} [opts]
 * @param {number} [opts.max=200]   Most objects one run will delete. A run is
 *   BOUNDED on purpose: a scheduled job that tries to empty an unbounded queue
 *   in one invocation is a job that times out halfway and reports nothing.
 * @param {boolean} [opts.dryRun=false]
 */
export async function runAccountDeletionWorker(io, opts = {}) {
  const max = Math.max(1, Math.min(5000, Number(opts.max) || 200))
  const dryRun = opts.dryRun === true
  const log = io.log ?? (() => {})

  const result = {
    startedAt: new Date().toISOString(),
    finishedAt: null,
    dryRun,
    max,
    sweeps: [],
    mediaExamined: 0,
    mediaDeleted: 0,
    mediaFailed: 0,
    overdueCount: 0,
    overdue: [],
    errors: [],
    ok: false,
  }

  const fail = (stage, message) => {
    const text = `${stage}: ${String(message)}`
    result.errors.push(text)
    log(text)
  }

  // ── 1. Sweep ────────────────────────────────────────────────────────────
  if (dryRun) {
    log('sweep 1: skipped (dry run)')
  } else {
    const { data, error } = await io.sweep()
    if (error) fail('sweep 1', error.message ?? error)
    else {
      result.sweeps.push(data)
      log(`sweep 1: ${JSON.stringify(data)}`)
    }
  }

  // ── 2. Drain the media queue through the Storage API ───────────────────
  const { data: rows, error: listError } = await io.listPendingMedia(max)
  if (listError) {
    fail('media', listError.message ?? listError)
  } else {
    const queued = rows ?? []
    result.mediaExamined = queued.length
    if (queued.length === 0) {
      log('media: nothing queued')
    } else if (dryRun) {
      log(`media: ${queued.length} object(s) queued (dry run, nothing deleted)`)
      for (const r of queued) log(`  would delete ${r.bucket_id}/${r.object_path}`)
    } else {
      for (const r of queued) {
        const { data: removed, error: rmError } = await io.removeObject(r.bucket_id, r.object_path)
        // THE PAYLOAD, NOT JUST THE ERROR. A path that does not resolve comes
        // back as `{ error: null, data: [] }`, and treating that as success
        // confirms a deletion that never happened.
        const reallyGone = !rmError && Array.isArray(removed) && removed.length > 0
        if (!reallyGone) {
          const why = rmError
            ? (rmError.message ?? String(rmError))
            : 'the Storage API removed nothing for this path — it may not exist in this bucket'
          result.mediaFailed += 1
          await io.recordFailure(r, why)
          log(`  FAILED ${r.bucket_id}/${r.object_path}: ${why}`)
          continue
        }
        const { data: confirmed, error: confirmError } = await io.confirmDeleted(
          r.bucket_id,
          r.object_path,
        )
        if (confirmError) {
          result.mediaFailed += 1
          log(`  DELETED BUT UNCONFIRMED ${r.bucket_id}/${r.object_path}: ${confirmError.message ?? confirmError}`)
          continue
        }
        if (confirmed) result.mediaDeleted += 1
      }
      log(`media: ${result.mediaDeleted} deleted, ${result.mediaFailed} failed, ${queued.length} examined (cap ${max})`)
    }
  }

  // ── 3. Sweep again, so media_purge can pass in the SAME run ────────────
  if (!dryRun) {
    const { data, error } = await io.sweep()
    if (error) fail('sweep 2', error.message ?? error)
    else {
      result.sweeps.push(data)
      log(`sweep 2: ${JSON.stringify(data)}`)
    }
  }

  // ── 4. What is late ────────────────────────────────────────────────────
  const { data: late, error: overdueError } = await io.overdue()
  if (overdueError) {
    fail('overdue', overdueError.message ?? overdueError)
  } else {
    result.overdue = late ?? []
    result.overdueCount = result.overdue.length
    if (result.overdueCount === 0) {
      log('overdue: nothing')
    } else {
      log(`overdue: ${result.overdueCount} item(s)`)
      for (const r of result.overdue) {
        log(
          `  request ${r.request_id} step ${r.step_key} status ${r.status}` +
            ` due ${r.due_at ?? '-'} attempts ${r.attempts ?? 0}` +
            (r.last_error ? ` last_error ${r.last_error}` : ''),
        )
      }
    }
  }

  // A run is successful only when nothing errored, nothing is late, and no
  // object failed to delete. A failed object leaves `media_purge` unable to
  // pass, so calling the run a success would be claiming an erasure finished
  // with the bytes still in the bucket.
  result.ok =
    result.errors.length === 0 && result.overdueCount === 0 && result.mediaFailed === 0
  result.finishedAt = new Date().toISOString()
  return result
}
