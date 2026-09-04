// Barter write-error interpretation. Pure logic, NO I/O — deliberately separate from
// lib/barter.ts, which imports the Supabase client and therefore cannot be imported by a unit
// test. Same split as lib/messageRequests.ts: the server is the authority, this only decides
// what the UI says about a refusal, so it stays consistent and testable.
// ── Write-error interpretation ──────────────────────────────────────────────
//
// Barter writes fail in ways that are TERMINAL (retrying can never succeed) and ways that
// are TRANSIENT (retrying is the right advice). Getting that distinction wrong in either
// direction is a product-truth defect: telling a rate-limited user to "try again" sends them
// into a loop for a day, and telling someone their offer has responses when the request
// simply timed out is a confident falsehood.
//
// The DB signals these with SQLSTATE, but SQLSTATE ALONE IS NOT ENOUGH. `23514`
// (check_violation) is the class code for at least nine distinct barter rules — the daily
// limit, self-response, an illegal status transition, the delete guard, a message-length
// CHECK. Reading it as one meaning is only correct by coincidence of which rules the UI can
// currently reach, and that coincidence breaks the moment a rule is added. So the mapping is
// keyed on (operation, code): the same code means different things for different writes, and
// each operation declares only the outcomes it can actually produce.
//
// Kept pure and out of the screens so it is testable without rendering anything — the seam
// where the previous copy defects lived.

export type BarterWriteOp =
  | 'respond'
  | 'accept'
  | 'decline'
  | 'closeOffer'
  | 'deleteOffer'

export interface BarterWriteFailure {
  /** Terminal means retrying cannot succeed; the UI must not offer a retry. */
  terminal: boolean
  title: string
  body: string
}

// Postgres class codes we map. Anything else is treated as transient, which is the safe
// default: presenting an unknown failure as permanent would be a stronger claim than we can
// support.
const CHECK_VIOLATION = '23514'
const UNIQUE_VIOLATION = '23505'
// Raised by accept_barter_interest when the caller does not own the offer. A distinct code
// exists precisely so this cannot be reported as "already answered", which would be a false
// statement about the counterparty's response.
const INSUFFICIENT_PRIVILEGE = '42501'
// Raised when an accepted response has no conversation — only reachable for a row accepted
// before the atomic handoff existed. Retrying cannot fix it, so it must not say "try again".
const INTERNAL_ERROR = 'XX000'

const RETRY: Record<BarterWriteOp, BarterWriteFailure> = {
  respond: { terminal: false, title: 'Could not send', body: 'Please try again.' },
  accept: { terminal: false, title: 'Could not accept', body: 'Please try again.' },
  decline: { terminal: false, title: 'Could not decline', body: 'Please try again.' },
  closeOffer: { terminal: false, title: 'Could not close', body: 'Please try again.' },
  deleteOffer: { terminal: false, title: 'Could not delete', body: 'Please try again.' },
}

// Per-operation terminal outcomes. Only the codes an operation can genuinely produce are
// listed; an unlisted code falls through to the retryable default rather than being
// force-fitted to the nearest terminal message.
const TERMINAL: Partial<Record<BarterWriteOp, Record<string, BarterWriteFailure>>> = {
  respond: {
    [CHECK_VIOLATION]: {
      terminal: true,
      title: 'Daily limit reached',
      body: 'You have sent the maximum number of barter responses for today. You can send more tomorrow.',
    },
    [UNIQUE_VIOLATION]: {
      terminal: true,
      title: 'Already sent',
      body: 'You have already responded to this offer.',
    },
  },
  accept: {
    [UNIQUE_VIOLATION]: {
      terminal: true,
      title: 'Already matched',
      body: 'This offer has already been matched with another provider. Only one response per offer can be accepted.',
    },
    [CHECK_VIOLATION]: {
      terminal: true,
      title: 'Already answered',
      // Does NOT tell the user to refresh: the screen reloads itself on a terminal outcome,
      // and there is no pull-to-refresh control on that list, so the instruction would name
      // an action the UI does not offer.
      body: 'This response has already been accepted or declined. The list has been updated.',
    },
    [INSUFFICIENT_PRIVILEGE]: {
      terminal: true,
      title: 'Not your offer',
      body: 'Only the provider who posted an offer can accept responses to it.',
    },
    [INTERNAL_ERROR]: {
      terminal: true,
      title: 'This match needs attention',
      body: 'This response was accepted but its conversation is missing. Please contact support so it can be reconnected.',
    },
  },
  decline: {
    [CHECK_VIOLATION]: {
      terminal: true,
      title: 'Already answered',
      body: 'This response has already been accepted or declined. The list has been updated.',
    },
    [INSUFFICIENT_PRIVILEGE]: {
      terminal: true,
      title: 'Not your offer',
      body: 'Only the provider who posted an offer can decline responses to it.',
    },
  },
  deleteOffer: {
    [CHECK_VIOLATION]: {
      terminal: true,
      title: 'This offer has responses',
      body: 'Another provider has responded, so this offer can no longer be deleted — their response would go with it. Close it instead to take it off the board.',
    },
  },
}

/**
 * Interpret a barter write failure for a given operation.
 *
 * Never surfaces the raw database error: those carry table and constraint names, and the
 * wording is written for an engineer reading a log, not a provider reading an alert.
 */
export function barterWriteFailure(
  op: BarterWriteOp,
  error: unknown,
): BarterWriteFailure {
  const code = (error as { code?: unknown } | null | undefined)?.code
  if (typeof code === 'string') {
    const forOp = TERMINAL[op]
    const hit = forOp?.[code]
    if (hit) return hit
  }
  return RETRY[op]
}
