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

/**
 * The one interpretation of a PostgREST mutation outcome.
 *
 * Authorization on these tables is an RLS `USING` clause, which FILTERS the rows a caller may
 * not touch rather than rejecting the statement — so a blocked write returns **no error and no
 * rows**. Checking `error` alone reports success for a write that never happened, which has
 * shipped here once already.
 *
 * The rule was correct but hand-written at three call sites, which is how a fourth barter write
 * gets added without it: it would look like every other Supabase call in the app. Pure and
 * testable, in the module that already owns what a refusal MEANS.
 *
 * Zero rows does NOT borrow a server SQLSTATE. At least three causes produce it — RLS filtered
 * the caller, the row was deleted concurrently, it never existed — and the client cannot tell
 * them apart, so it carries its own discriminator and the copy stays true under all three.
 */
export interface BarterWriteResult {
  ok: boolean
  /** null on success; the server's error, or the zero-row discriminator, on failure. */
  error: unknown
}

export function interpretWrite(error: unknown, rows: unknown[] | null): BarterWriteResult {
  if (error) return { ok: false, error }
  if (!rows || rows.length === 0) return { ok: false, error: { barterClientCode: 'no_rows' } }
  return { ok: true, error: null }
}

export type BarterWriteOp =
  | 'respond'
  | 'accept'
  | 'decline'
  | 'release'
  | 'closeOffer'
  | 'deleteOffer'
  | 'proposeTerms'
  | 'acceptTerms'
  | 'confirmTrade'

export interface BarterWriteFailure {
  /** Terminal means retrying cannot succeed; the UI must not offer a retry. */
  terminal: boolean
  /**
   * The caller's view is out of date and must be re-read, even though the failure is NOT
   * terminal.
   *
   * These are different questions and conflating them produced a real defect: "the other
   * provider proposed first" is recoverable — you counter — but the screen behind the alert
   * still said "No terms yet", so the alert told the user to look at terms that were not on
   * screen, above a button that could only fail again. Screens reload on `terminal || stale`.
   */
  stale?: boolean
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
// Raised by accept_barter_version when the named terms are no longer the ones on the table --
// an acceptance that lost a race with a counter. NOT terminal: reading the new terms and
// accepting again is exactly the right thing to do, which is what this class already means.
const STALE_TERMS = '40001'
// Raised by assert_barter_version_budget. Distinct from check_violation because a spent daily
// budget and a malformed proposal are reachable from the same button and need opposite advice.
const VERSION_BUDGET = '54000'
// Raised by write_barter_proposal_terms for malformed terms. Distinct from check_violation
// because the two propose RPCs also raise 23514 for "not authenticated", "that response no
// longer exists", "that post no longer exists" and "that negotiation no longer exists" —
// mapping all five to "Check these terms" told a user with an expired session to edit terms
// that were already valid, and (being non-terminal) never refreshed the screen to show why.
const MALFORMED_TERMS = '22023'
// Raised by barter_interests_zy_answer_open_offer when the owner tries to ACCEPT OR DECLINE a
// response to a post they have closed, and by barter_offers_zy_active_one_way when anyone tries
// to reopen one. A distinct code exists because check_violation maps, for accept and decline, to
// "already answered" -- which blames the responder for something the owner did.
const NOT_IN_PREREQUISITE_STATE = '55000'
// Raised only by the post-agreement barter guards. Distinct from 55000, which still means a
// pre-agreement negotiation is not in the required state.
const CONFIRMED_TRADE = 'PT409'
// Raised when a proposal version's due/scheduled timing was valid when authored but is no
// longer future-valid at acceptance or finalization time. Not terminal: the negotiation can
// continue by sending a new version with updated timing, but retrying the same accept/confirm
// cannot work.
const EXPIRED_TERMS = 'PT410'

const RETRY: Record<BarterWriteOp, BarterWriteFailure> = {
  respond: { terminal: false, title: 'Could not send', body: 'Please try again.' },
  accept: { terminal: false, title: 'Could not accept', body: 'Please try again.' },
  decline: { terminal: false, title: 'Could not decline', body: 'Please try again.' },
  release: { terminal: false, title: 'Could not end the negotiation', body: 'Please try again.' },
  closeOffer: { terminal: false, title: 'Could not close', body: 'Please try again.' },
  proposeTerms: { terminal: false, title: 'Could not send these terms', body: 'Please try again.' },
  acceptTerms: { terminal: false, title: 'Could not accept', body: 'Please try again.' },
  confirmTrade: { terminal: false, title: 'Could not confirm', body: 'Please try again.' },
  deleteOffer: { terminal: false, title: 'Could not delete', body: 'Please try again.' },
}

// A write that affected ZERO rows. Authorization on these tables is expressed as an RLS
// USING clause, which FILTERS rows the caller may not touch rather than rejecting the
// statement -- so a blocked write returns no error and no rows. At least three causes produce
// it (filtered by permission, deleted concurrently, never existed) and the client cannot tell
// them apart, so the copy must be true under all three: it says the thing is gone, which is
// what the user needs to know, and never asserts WHY.
const NO_ROWS: Record<BarterWriteOp, BarterWriteFailure> = {
  respond: {
    terminal: true,
    title: 'That offer is no longer available',
    body: 'It may have been closed or withdrawn. The board has been updated.',
  },
  release: {
    terminal: true,
    title: 'That negotiation is no longer active',
    body: 'It may have already ended. The list has been updated.',
  },
  accept: {
    terminal: true,
    title: 'That response is no longer available',
    body: 'It may have been withdrawn or already answered. The list has been updated.',
  },
  decline: {
    terminal: true,
    title: 'That response is no longer available',
    body: 'It may have been withdrawn or already answered. The list has been updated.',
  },
  closeOffer: {
    terminal: true,
    title: 'That offer is no longer available',
    body: 'It may have already been closed or removed.',
  },
  deleteOffer: {
    terminal: true,
    title: 'That offer is no longer available',
    body: 'It may have already been closed or removed.',
  },
  proposeTerms: {
    terminal: true,
    title: 'That negotiation is no longer available',
    body: 'It may have ended. The details have been updated.',
  },
  acceptTerms: {
    terminal: true,
    title: 'Those terms are no longer available',
    body: 'They may have been replaced. The details have been updated.',
  },
  confirmTrade: {
    terminal: true,
    title: 'That negotiation is no longer available',
    body: 'It may have ended. The details have been updated.',
  },
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
    [NOT_IN_PREREQUISITE_STATE]: {
      terminal: true,
      title: 'This post is closed',
      body: 'Responses to a closed post can no longer be accepted. The list has been updated.',
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
    // PD-052: a closed post's responses cannot be answered at all, decline included. Must not
    // reuse "Already answered", which blames the responder for the owner's own closure.
    [NOT_IN_PREREQUISITE_STATE]: {
      terminal: true,
      title: 'This post is closed',
      body: 'Its responses are kept as history and can no longer be answered. The list has been updated.',
    },
    [INSUFFICIENT_PRIVILEGE]: {
      terminal: true,
      title: 'Not your offer',
      body: 'Only the provider who posted an offer can decline responses to it.',
    },
  },
  release: {
    // The RPC raises check_violation for "no longer exists" and "not in negotiation", and
    // insufficient_privilege for a non-participant. Both are terminal: retrying cannot make a
    // negotiation active again, and cannot make you a participant.
    [CHECK_VIOLATION]: {
      terminal: true,
      title: 'That negotiation is no longer active',
      body: 'It may have already ended. The list has been updated.',
    },
    [INSUFFICIENT_PRIVILEGE]: {
      terminal: true,
      title: 'Not your negotiation',
      body: 'Only the two providers in a negotiation can end it.',
    },
    [CONFIRMED_TRADE]: {
      terminal: true,
      title: 'This trade is already confirmed',
      body: 'Confirmed trade terms can no longer be ended from this negotiation screen. The details have been updated.',
    },
  },
  closeOffer: {
    // PD-051: closing is one-way. No reopen control exists today, so this is latent -- but a
    // terminal refusal reported as "try again" would loop a user on an impossible action, and
    // the next contributor to add any is_active write inherits the mapping.
    [NOT_IN_PREREQUISITE_STATE]: {
      terminal: true,
      title: 'That post is closed for good',
      body: 'A closed post cannot be reopened. Post a new offer to trade this again.',
    },
  },
  proposeTerms: {
    [INSUFFICIENT_PRIVILEGE]: {
      terminal: true,
      title: 'Not your negotiation',
      body: 'Only the two providers in a trade can propose terms for it.',
    },
    [NOT_IN_PREREQUISITE_STATE]: {
      terminal: true,
      title: 'This negotiation has ended',
      body: 'Terms can no longer be proposed. What was proposed stays on record.',
    },
    [CONFIRMED_TRADE]: {
      terminal: true,
      title: 'This trade is already confirmed',
      body: 'Confirmed trade terms can no longer be changed. The details have been updated.',
    },
    [VERSION_BUDGET]: {
      terminal: true,
      title: 'Daily limit reached',
      // Terminal for TODAY, and says so, rather than "try again" -- which would send someone
      // into a loop for a day.
      body: 'You have sent the maximum number of proposals for this trade today. You can send more tomorrow.',
    },
    [MALFORMED_TERMS]: {
      terminal: false,
      title: 'Check these terms',
      body: 'Say what each of you is giving, with a future due date and valid scheduled time.',
    },
    [UNIQUE_VIOLATION]: {
      // The other provider opened the negotiation first. NOT terminal, and emphatically not
      // "this negotiation has ended": it is alive and now has terms on it. The right next
      // action is to read theirs and counter.
      terminal: false,
      stale: true,
      title: 'They proposed first',
      body: 'The other provider sent terms while you were writing. Take a look — you can send changes back.',
    },
    [CHECK_VIOLATION]: {
      // What is left once malformed terms have their own code: the negotiation, the response or
      // the post is gone, or the session is not valid. Terminal, and the screen re-reads.
      terminal: true,
      title: 'That negotiation is no longer available',
      body: 'It may have ended or been removed. The details have been updated.',
    },
  },
  acceptTerms: {
    [INSUFFICIENT_PRIVILEGE]: {
      terminal: true,
      title: 'Not your negotiation',
      body: 'Only the two providers in a trade can accept its terms.',
    },
    [NOT_IN_PREREQUISITE_STATE]: {
      terminal: true,
      title: 'This negotiation has ended',
      body: 'These terms can no longer be accepted. What was proposed stays on record.',
    },
    [CONFIRMED_TRADE]: {
      terminal: true,
      title: 'This trade is already confirmed',
      body: 'Confirmed trade terms can no longer be changed. The details have been updated.',
    },
    [STALE_TERMS]: {
      // NOT terminal, and deliberately so: the other provider changed the terms, and reading
      // the new ones and accepting again is the correct next action. Calling this permanent
      // would strand someone on a live negotiation.
      terminal: false,
      stale: true,
      title: 'The terms changed',
      body: 'The other provider sent new terms while you were reading. Take a look and accept again if you agree.',
    },
    [EXPIRED_TERMS]: {
      terminal: false,
      stale: true,
      title: 'The timing expired',
      body: 'These trade terms have expired. Update the timing before continuing.',
    },
  },
  confirmTrade: {
    [INSUFFICIENT_PRIVILEGE]: {
      terminal: true,
      title: 'Not your negotiation',
      body: 'Only the two providers in a trade can confirm it.',
    },
    [NOT_IN_PREREQUISITE_STATE]: {
      terminal: true,
      title: 'This negotiation has ended',
      body: 'It can no longer be confirmed. What was proposed stays on record.',
    },
    [STALE_TERMS]: {
      // Not terminal: the acceptances or the terms moved under the button. Re-read.
      terminal: false,
      stale: true,
      title: 'The terms changed',
      body: 'Both providers need to accept the current terms before the trade can be confirmed. Take a look at what is on the table now.',
    },
    [EXPIRED_TERMS]: {
      terminal: false,
      stale: true,
      title: 'The timing expired',
      body: 'These trade terms have expired. Update the timing before continuing.',
    },
    [CHECK_VIOLATION]: {
      terminal: true,
      title: 'That negotiation is no longer available',
      body: 'It may have been removed. The details have been updated.',
    },
    [INTERNAL_ERROR]: {
      terminal: true,
      title: 'This trade needs support',
      body: 'The app could not safely confirm this trade. Please contact support so the record can be checked.',
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
  // Client-detected conditions carry their own discriminator rather than borrowing a
  // SQLSTATE, so a locally-observed outcome can never be reported as a specific server rule.
  const clientCode = (error as { barterClientCode?: unknown } | null | undefined)
    ?.barterClientCode
  if (clientCode === 'no_rows') return NO_ROWS[op]
  const code = (error as { code?: unknown } | null | undefined)?.code
  if (typeof code === 'string') {
    const forOp = TERMINAL[op]
    const hit = forOp?.[code]
    if (hit) return hit
  }
  return RETRY[op]
}
