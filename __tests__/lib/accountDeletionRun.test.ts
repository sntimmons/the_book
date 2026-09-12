// THE CANONICAL ERASURE SEQUENCE, driven with fakes.
//
// The sequence has two callers — the scheduled Edge Function (Deno) and
// `scripts/account-deletion-worker.mjs` (Node) — and it is the one thing in this
// workstream that no database test can reach: B5B proves what the ENGINE does
// when called, and this proves the CALLER calls it correctly, in order, and
// stops when it should.
//
// Every assertion here is about a property somebody could plausibly refactor
// away: the second sweep, confirming only after a real removal, and the
// definition of a clean run.
import {
  runAccountDeletionWorker,
  summarizeRun,
} from '@/supabase/functions/_shared/accountDeletionRun.mjs'

type Row = { id: string; bucket_id: string; object_path: string; attempts: number | null }

// Data-driven on purpose. An earlier version let a test pass a replacement
// function, which silently bypassed the call tracking and made the ORDER
// assertions vacuous — the harness reported a passing sequence that the module
// had never produced. Tests describe the world; the harness always records.
function makeIo(
  cfg: {
    pending?: Row[]
    remove?: (bucket: string, path: string) => { data: unknown; error: unknown }
    confirm?: (bucket: string, path: string) => { data: unknown; error: unknown }
    sweep?: () => { data: unknown; error: unknown }
    overdue?: () => { data: unknown; error: unknown }
  } = {},
) {
  const calls: string[] = []
  const confirmed: string[] = []
  const failures: { id: string; message: string }[] = []
  const io = {
    sweep: jest.fn(async () => {
      calls.push('sweep')
      return cfg.sweep ? cfg.sweep() : { data: { finalized: 0, purged: 0 }, error: null }
    }),
    listPendingMedia: jest.fn(async (_limit: number) => {
      calls.push('list')
      return { data: cfg.pending ?? [], error: null }
    }),
    removeObject: jest.fn(async (bucket: string, path: string) => {
      calls.push(`remove:${path}`)
      return cfg.remove ? cfg.remove(bucket, path) : { data: [{ name: path }], error: null }
    }),
    confirmDeleted: jest.fn(async (bucket: string, path: string) => {
      calls.push(`confirm:${path}`)
      const r = cfg.confirm ? cfg.confirm(bucket, path) : { data: true, error: null }
      if (!r.error) confirmed.push(path)
      return r
    }),
    recordFailure: jest.fn(async (row: Row, message: string) => {
      failures.push({ id: row.id, message })
    }),
    overdue: jest.fn(async () => {
      calls.push('overdue')
      return cfg.overdue ? cfg.overdue() : { data: [], error: null }
    }),
    log: () => {},
  }
  return { io, calls, confirmed, failures }
}

const row = (n: number): Row => ({
  id: `id-${n}`,
  bucket_id: 'booking-photos',
  object_path: `subject/${n}.jpg`,
  attempts: 0,
})

describe('runAccountDeletionWorker — the order is the architecture', () => {
  it('sweeps, drains, then sweeps AGAIN before reporting', async () => {
    const { io, calls } = makeIo({ pending: [row(1)] })
    const result = await runAccountDeletionWorker(io as never)

    // The second sweep is what lets `media_purge` pass in the SAME run. Without
    // it every erasure sits one run behind, reporting `failed` until somebody
    // runs the worker a second time — which is precisely the human-memory
    // dependency this workstream exists to remove.
    expect(calls).toEqual([
      'sweep',
      'list',
      'remove:subject/1.jpg',
      'confirm:subject/1.jpg',
      'sweep',
      'overdue',
    ])
    expect(result.sweeps).toHaveLength(2)
    expect(result.ok).toBe(true)
  })

  it('does not sweep or delete at all in a dry run', async () => {
    const { io, calls } = makeIo({ pending: [row(1)] })
    const result = await runAccountDeletionWorker(io as never, { dryRun: true })
    expect(calls).toEqual(['list', 'overdue'])
    expect(result.mediaDeleted).toBe(0)
    expect(io.removeObject as jest.Mock).not.toHaveBeenCalled()
  })
})

describe('runAccountDeletionWorker — a confirmation is a claim about bytes', () => {
  it('does NOT confirm when the Storage API removed nothing', async () => {
    // `remove()` answers `{ error: null, data: [] }` for a path that does not
    // resolve. Confirming on the absence of an error writes a lie that the
    // media_purge gate then believes, and the request reports `completed` with
    // the object still in the bucket.
    const { io, confirmed, failures } = makeIo({
      pending: [row(1)],
      remove: () => ({ data: [], error: null }),
    })
    const result = await runAccountDeletionWorker(io as never)

    expect(io.confirmDeleted as jest.Mock).not.toHaveBeenCalled()
    expect(confirmed).toEqual([])
    expect(result.mediaDeleted).toBe(0)
    expect(result.mediaFailed).toBe(1)
    expect(failures[0].message).toMatch(/removed nothing/i)
    expect(result.ok).toBe(false)
  })

  it('does NOT confirm when the Storage API errored, and records why', async () => {
    const { io, failures } = makeIo({
      pending: [row(1)],
      remove: () => ({ data: null, error: { message: 'bucket gone' } }),
    })
    const result = await runAccountDeletionWorker(io as never)
    expect(io.confirmDeleted as jest.Mock).not.toHaveBeenCalled()
    expect(failures[0].message).toBe('bucket gone')
    expect(result.ok).toBe(false)
  })

  it('one bad object does not stop the others', async () => {
    const { io, confirmed } = makeIo({
      pending: [row(1), row(2), row(3)],
      remove: (_b, p) =>
        p.endsWith('2.jpg') ? { data: [], error: null } : { data: [{ name: p }], error: null },
    })
    const result = await runAccountDeletionWorker(io as never)
    expect(confirmed).toEqual(['subject/1.jpg', 'subject/3.jpg'])
    expect(result.mediaDeleted).toBe(2)
    expect(result.mediaFailed).toBe(1)
    // A partial drain is NOT a success: the unconfirmed object keeps
    // media_purge from passing, so calling the run clean would claim an erasure
    // finished with bytes still in the bucket.
    expect(result.ok).toBe(false)
  })
})

describe('runAccountDeletionWorker — a clean run is a narrow claim', () => {
  it('is not ok while anything is overdue, even with nothing to delete', async () => {
    const { io } = makeIo({
      overdue: () => ({
        data: [{ request_id: 'r1', step_key: 'messages_purge', status: 'failed' }],
        error: null,
      }),
    })
    const result = await runAccountDeletionWorker(io as never)
    expect(result.overdueCount).toBe(1)
    expect(result.ok).toBe(false)
  })

  it('is not ok when a sweep itself errored', async () => {
    const { io } = makeIo({
      sweep: () => ({ data: null, error: { message: 'permission denied' } }),
    })
    const result = await runAccountDeletionWorker(io as never)
    expect(result.ok).toBe(false)
    expect(result.errors.join(' ')).toMatch(/permission denied/)
  })

  it('is ok only when nothing is late, nothing failed and nothing errored', async () => {
    const { io } = makeIo()
    const result = await runAccountDeletionWorker(io as never)
    expect(result).toMatchObject({ ok: true, overdueCount: 0, mediaFailed: 0, errors: [] })
  })
})

describe('runAccountDeletionWorker — repeatable, bounded, overlap-safe', () => {
  it('a second run over an empty queue changes nothing (idempotent)', async () => {
    const { io } = makeIo()
    const first = await runAccountDeletionWorker(io as never)
    const second = await runAccountDeletionWorker(io as never)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    expect(second.mediaDeleted).toBe(0)
  })

  it('honours the per-run cap, so one invocation cannot run forever', async () => {
    // A scheduled job that tries to empty an unbounded queue in one invocation
    // is a job that times out halfway and reports nothing.
    const { io } = makeIo()
    await runAccountDeletionWorker(io as never, { max: 25 })
    expect(io.listPendingMedia as jest.Mock).toHaveBeenCalledWith(25)
  })

  it('clamps an absurd cap rather than trusting the caller', async () => {
    const { io } = makeIo()
    await runAccountDeletionWorker(io as never, { max: 10_000_000 })
    expect(io.listPendingMedia as jest.Mock).toHaveBeenCalledWith(5000)
  })

  it('two overlapping runs both behave, because the ordering is the same', async () => {
    // Real concurrency safety lives in the database — the purge loop locks each
    // step FOR UPDATE SKIP LOCKED, and `confirm_media_deleted` only updates rows
    // that are still unconfirmed. What this proves is the narrower thing the
    // orchestrator owns: overlapping invocations issue the same calls in the
    // same order and neither is left half-run.
    const { io: ioA, calls: callsA } = makeIo({ pending: [row(1)] })
    // The second run finds the queue already drained, which is what the
    // database guarantees after the first confirmed it.
    const { io: ioB, calls: callsB } = makeIo({ pending: [] })
    const [a, b] = await Promise.all([
      runAccountDeletionWorker(ioA as never),
      runAccountDeletionWorker(ioB as never),
    ])
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    expect(callsA).toContain('confirm:subject/1.jpg')
    expect(callsB).not.toContain('confirm:subject/1.jpg')
    expect(b.mediaDeleted).toBe(0)
  })
})

describe('parity — one engine, two runtimes', () => {
  // A STRUCTURAL assertion, and deliberately so. This repo's rule is that mocked
  // or source-text tests cannot substitute for real enforcement — that rule is
  // about BEHAVIOUR, and behaviour is covered above and in B5B. What no
  // behavioural test can catch is somebody re-implementing the sequence inside
  // one caller, because both would still pass their own tests while meaning
  // different things by "done". The only way to pin "there is one engine" is to
  // look at who imports it.
  const read = (p: string) =>
    (require('fs') as typeof import('fs')).readFileSync(
      (require('path') as typeof import('path')).join(__dirname, '..', '..', p),
      'utf8',
    )

  const CALLERS = [
    'scripts/account-deletion-worker.mjs',
    'supabase/functions/account-deletion-worker/index.ts',
  ]

  it.each(CALLERS)('%s imports the canonical sequence', (file) => {
    const src = read(file)
    expect(src).toMatch(/runAccountDeletionWorker/)
    expect(src).toMatch(/_shared\/accountDeletionRun\.mjs/)
  })

  it.each(CALLERS)('%s does not re-implement the sequence', (file) => {
    const src = read(file)
    // The three moves that ARE the sequence. A caller that calls the shared
    // module should name none of them itself: it supplies adapters and nothing
    // more. If one of these appears, somebody has started a second engine.
    expect(src).not.toMatch(/sweep 2|second sweep/i)
    // The confirm-after-removal rule must exist in exactly one place.
    const confirmGuards = src.match(/Array\.isArray\(removed\)/g) ?? []
    expect(confirmGuards).toHaveLength(0)
  })

  it('the shared module imports nothing, which is what makes it loadable in both runtimes', () => {
    const src = read('supabase/functions/_shared/accountDeletionRun.mjs')
    // Node and the Supabase Edge runtime resolve specifiers differently — bare
    // npm names, `node:` builtins and `https://` URLs are each fine in exactly
    // one of them. A dependency-free module is the only kind both can load
    // unchanged, so an import here is a fork with extra steps.
    expect(src).not.toMatch(/^\s*import\s/m)
    expect(src).not.toMatch(/require\(/)
  })
})

describe('summarizeRun — a run result is not a response body', () => {
  // The worker's HTTP response is stored by pg_net in `net._http_response`, and
  // that table is granted to PUBLIC by the extension itself — a grant `postgres`
  // cannot revoke, because `supabase_admin` made it. It is unreachable only
  // because PostgREST exposes `public` and `graphql_public`, which is a project
  // setting that lives nowhere in this repo. So the body must not carry
  // identities, and this is the assertion that keeps it that way.
  const full = {
    ok: false,
    startedAt: 'a',
    finishedAt: 'b',
    dryRun: false,
    max: 200,
    sweeps: [{ finalized: 1 }],
    mediaExamined: 2,
    mediaDeleted: 1,
    mediaFailed: 1,
    overdueCount: 1,
    overdue: [
      {
        request_id: '11111111-1111-1111-1111-111111111111',
        subject_id: '22222222-2222-2222-2222-222222222222',
        step_key: 'messages_purge',
        last_error: 'boom',
      },
    ],
    errors: ['sweep 1: permission denied'],
  }

  it('carries no subject id, no overdue rows and no error text', () => {
    const body = JSON.stringify(summarizeRun(full))
    expect(body).not.toContain('22222222-2222-2222-2222-222222222222')
    expect(body).not.toContain('11111111-1111-1111-1111-111111111111')
    expect(body).not.toContain('subject_id')
    expect(body).not.toContain('overdue"')
    expect(body).not.toContain('permission denied')
  })

  it('still carries everything a caller needs to decide whether to wake somebody', () => {
    expect(summarizeRun(full)).toMatchObject({
      ok: false,
      mediaExamined: 2,
      mediaDeleted: 1,
      mediaFailed: 1,
      overdueCount: 1,
      errorCount: 1,
    })
  })
})
