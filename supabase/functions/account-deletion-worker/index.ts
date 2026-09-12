// Supabase Edge Function: account-deletion-worker
// -----------------------------------------------------------------------------
// The SCHEDULED half of PD-102's erasure engine. `pg_cron` calls
// `public.invoke_account_deletion_worker()`, which POSTs here through `pg_net`,
// and this function runs the canonical sequence in
// `../_shared/accountDeletionRun.mjs` — the same file
// `scripts/account-deletion-worker.mjs` runs, so the manual fallback and the
// scheduled path cannot drift into two meanings of "done".
//
// Runs on Deno (NOT Node) and is intentionally excluded from the app's tsconfig,
// exactly like `rate-limit`.
//
// ══ WHY THIS IS NOT AN ORDINARY EDGE FUNCTION ═════════════════════════════
//
// It holds `service_role`, so being callable is a privilege in itself. Two gates,
// and neither is decorative:
//
//   1. **The platform gateway** verifies a project JWT before this code runs
//      (`verify_jwt` is left at its default, true). That alone proves nothing —
//      the anon key is public, it ships in the app bundle — which is why there
//      is a second gate.
//   2. **A dedicated worker secret**, compared in constant time. It is the real
//      boundary. It is a SEPARATE secret from the service-role key on purpose:
//      if it leaks, the worst an attacker can do is make the deletion engine do
//      work it was already going to do, idempotently. It grants no read of
//      anything.
//
// There are **no CORS headers**, deliberately. Nothing in a browser should ever
// call this, and a permissive `Access-Control-Allow-Origin` would say otherwise
// to the next person reading it.
//
// The secret is never logged, never echoed, and never included in an error body.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

import { runAccountDeletionWorker } from '../_shared/accountDeletionRun.mjs'

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Length-independent comparison. A `===` on a secret leaks its prefix through
// timing to anyone willing to measure, and the cost of doing it properly is four
// lines.
function secretsMatch(a: string, b: string): boolean {
  const enc = new TextEncoder()
  const x = enc.encode(a)
  const y = enc.encode(b)
  // Compare a fixed number of bytes so the loop count does not reveal the length.
  const len = Math.max(x.length, y.length)
  let diff = x.length ^ y.length
  for (let i = 0; i < len; i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  }
  return diff === 0
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const WORKER_SECRET = Deno.env.get('ACCOUNT_DELETION_WORKER_SECRET')

  // FAIL CLOSED. A missing worker secret must never mean "no check required" —
  // that is how a misconfigured deploy silently becomes an open privileged
  // endpoint.
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !WORKER_SECRET) {
    return json({ error: 'Worker is not configured' }, 500)
  }

  const presented = req.headers.get('x-worker-secret') ?? ''
  if (!secretsMatch(presented, WORKER_SECRET)) {
    // No detail, no echo, no hint about which gate refused.
    return json({ error: 'Unauthorized' }, 401)
  }

  const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }
  const max = Number(body.max ?? 0) || 200
  const dryRun = body.dryRun === true

  const lines: string[] = []
  const io = {
    sweep: () => db.rpc('sweep_account_deletions'),
    listPendingMedia: (limit: number) =>
      db
        .from('pending_media_deletions')
        .select('id, bucket_id, object_path, attempts')
        .is('deleted_at', null)
        .order('enqueued_at', { ascending: true })
        .limit(limit),
    removeObject: (bucket: string, path: string) => db.storage.from(bucket).remove([path]),
    confirmDeleted: (bucket: string, path: string) =>
      db.rpc('confirm_media_deleted', { p_bucket: bucket, p_path: path }),
    recordFailure: async (row: { id: string; attempts: number | null }, message: string) => {
      await db
        .from('pending_media_deletions')
        .update({ attempts: (row.attempts ?? 0) + 1, last_error: String(message).slice(0, 4000) })
        .eq('id', row.id)
    },
    overdue: () => db.rpc('overdue_account_deletion_work'),
    log: (line: string) => {
      lines.push(line)
      console.log(line)
    },
  }

  let result
  try {
    result = await runAccountDeletionWorker(io, { max, dryRun })
  } catch (err) {
    const message = (err as Error)?.message ?? String(err)
    // Recorded even when the run threw, because a run that vanished without a
    // trace is indistinguishable from a run that never fired.
    await db.from('account_deletion_worker_runs').insert({
      source: 'scheduled',
      ok: false,
      result: { error: message },
      log: lines.join('\n').slice(0, 20000),
    })
    return json({ ok: false, error: message }, 500)
  }

  await db.from('account_deletion_worker_runs').insert({
    source: 'scheduled',
    ok: result.ok,
    media_examined: result.mediaExamined,
    media_deleted: result.mediaDeleted,
    media_failed: result.mediaFailed,
    overdue_count: result.overdueCount,
    result,
    log: lines.join('\n').slice(0, 20000),
  })

  // A NON-2xx WHEN WORK IS LATE. pg_net records the status, so "some promised
  // deletion did not happen" is visible in the database without anyone reading
  // a log. The body says which of the two it was.
  return json(result, result.ok ? 200 : 500)
})
