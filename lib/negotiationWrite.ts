// Barter write-operation plumbing for the negotiation screen. Pure logic, NO I/O and no React —
// deliberately separate from the screen for the same reason lib/barterErrors.ts is separate from
// lib/barter.ts: the sequence below is the part that must not vary between operations, and a
// sequence spelled inside a component cannot be tested without rendering one.
//
// WHY THIS EXISTS. Six handlers on app/community/negotiation/[id].tsx each spelled the same
// seven steps by hand — set busy, write, clear busy, interpret the refusal, say it once, decide
// whether the screen is now stale, re-read authoritative state — and they had already drifted:
// two re-read on any refusal while four re-read only on `terminal || stale`, and two re-read
// without the blocking loading state while four show it. Those four differences are REAL and
// each one is preserved here as an explicit option rather than averaged away. What is shared is
// the ordering, which nothing may vary.
//
// WHAT THIS IS NOT. It does not decide what a refusal means (lib/barterErrors.ts owns that), it
// does not know which RPC any operation calls, and it holds no state. It cannot invent a write:
// the caller supplies the thunk, so this module can never call a server boundary the screen did
// not ask for.

import { barterWriteFailure, BarterWriteOp, BarterWriteResult } from './barterErrors'

/**
 * What a write reports back. `BarterWriteResult` is reused rather than re-declared: a second
 * interface with the same two fields would leave a reader unable to tell whether the difference
 * was deliberate.
 *
 * Only `ok` and `error` are read here. Each wrapper in lib/negotiation.ts also returns an
 * operation-specific payload (`agreementId`, `status`, `versionNo`, `state`, `bothAccepted`) and
 * that belongs to the caller — reading it here would make this module know what each write
 * means. No caller reads one today, which is why `onSuccess` takes no argument.
 */

/**
 * When a refusal forces a re-read of authoritative server state.
 *
 * `whenStaleOrTerminal` is the general rule stated by `BarterWriteFailure.stale`. `always` is
 * for the two writes where ANY refusal means the screen is out of date regardless of what the
 * refusal was — accepting terms and confirming the trade, where the plausible non-terminal
 * failures are all "the other provider moved first" and leaving the old terms on screen invites
 * a second acceptance of something already replaced.
 */
export type RefusalRefresh = 'always' | 'whenStaleOrTerminal'

/**
 * The screen's effects, injected. Named rather than imported so this module needs neither React
 * nor react-native, which is what makes the sequence testable.
 */
export interface BarterWriteEffects {
  setBusy: (busy: boolean) => void
  /** The blocking full-screen load state, set only when a request asks for it. */
  setLoading: (loading: boolean) => void
  /** Say the refusal once. The caller owns the alert's buttons and copy conventions. */
  reportFailure: (title: string, body: string) => void
  /** Re-read authoritative negotiation/trade state. The server is the authority, not us. */
  reload: () => void
}

export interface BarterWriteRequest {
  /** Which operation this is, for `barterWriteFailure`. Not used to pick an RPC. */
  op: BarterWriteOp
  /** The write itself, already bound to its payload by the caller. */
  write: () => Promise<BarterWriteResult>
  /** Defaults to the general rule. */
  refusalRefresh?: RefusalRefresh
  /**
   * Whether a refresh this request triggers shows the blocking loading state. Defaults to
   * `true`; `false` is a quiet re-read that leaves the current content on screen.
   */
  refreshShowsLoading?: boolean
  /** Operation-specific state to settle before a refusal-triggered refresh. */
  onRefusalRefresh?: () => void
  /** Operation-specific state to settle before the success refresh. */
  onSuccess?: () => void
}

/**
 * Run one barter write: the whole sequence, in one order, for every operation.
 *
 * FAIL-CLOSED. A refusal is never treated as a success, `ok === false` always produces a
 * user-facing message, and the decision about staleness is delegated to `barterWriteFailure`
 * rather than inferred from anything here. `setBusy(false)` is in a `finally` so a write that
 * throws cannot wedge the control it disabled — the throw still propagates.
 */
export async function runBarterWrite(
  effects: BarterWriteEffects,
  request: BarterWriteRequest,
): Promise<void> {
  const {
    op,
    write,
    refusalRefresh = 'whenStaleOrTerminal',
    refreshShowsLoading = true,
    onRefusalRefresh,
    onSuccess,
  } = request

  effects.setBusy(true)
  let outcome: BarterWriteResult
  try {
    outcome = await write()
  } finally {
    effects.setBusy(false)
  }

  if (!outcome.ok) {
    const failure = barterWriteFailure(op, outcome.error)
    effects.reportFailure(failure.title, failure.body)
    if (refusalRefresh === 'always' || failure.terminal || failure.stale) {
      onRefusalRefresh?.()
      if (refreshShowsLoading) effects.setLoading(true)
      effects.reload()
    }
    return
  }

  onSuccess?.()
  if (refreshShowsLoading) effects.setLoading(true)
  effects.reload()
}
