// Barter obligation delivery and receipt state and copy. Pure logic, NO I/O — the same split
// as lib/negotiationState.ts and lib/tradeActivity.ts, and for the same reason: these rules
// decide what a provider is told about an irreversible statement they are about to make, and
// they cannot be unit tested while they live inside a react-native component.
//
// USER LANGUAGE, NOT SCHEMA LANGUAGE. Nothing here says status, enum, row or transition.
//
// TRUTHFUL. Four things EXIST. Three are UNRESOLVED OPERATIONAL STATES and nothing more — the
// receiver-response window and Needs Attention (PD-057, PD-059), and receiver-reported NO-SHOW
// with the derived UNDER REVIEW state (PD-062). Under Review means a human has to look; it does
// not mean anyone is at fault. **None of those three may ever be worded as an outcome.**
//
// The fourth is an outcome, and it is the ONLY one: a TERMINAL OBLIGATION OUTCOME recorded by an
// operator — Fulfilled, Unfulfilled, or Closed without resolution (PD-064, PD-065). It is
// obligation-level, it is decided by a person rather than by a clock, and this module reports it
// rather than deriving it: `terminalOutcome` arrives from the server and is never inferred from
// a status, a window or a review.
//
// What still does NOT exist, and no copy here may claim: automatic fulfilment, automatic
// completion, any AGREEMENT-level outcome — Completed, Partially Fulfilled, Not Completed — and
// reputation, ratings, penalties or refunds. **No copy in this module may name a fault except to
// deny one, may promise an outcome, or may say a TRADE is complete or resolved.** An obligation
// may be described as fulfilled, unfulfilled or closed without resolution ONLY when the server
// says an operator decided so, and never as a consequence of silence.
//
// The window is decided by the SERVER. This module receives `receiver_window_state` already
// computed against the server's clock and never re-derives it from `Date.now()`; a device with a
// wrong clock must not be able to put a trade into — or out of — Needs Attention.
//
// Pre-delivery cancellation DOES exist, but it is an AGREEMENT-level act: it is said once, by
// lib/tradeCancellation.ts, above both obligations. This module only takes `tradeCancelled` as
// an input that freezes the controls and drops the what-happens-next notes. "Didn't receive"
// records what the receiver said and nothing more.

import type { AgreementResolution, ProposalSide, TradeRole } from './negotiationState'
import { sideForRole } from './negotiationState'

/**
 * What has happened to one obligation, as the server reports it. A record of EVENTS, never a
 * verdict — see the migration comment in 20261004000000 for why the vocabulary stops here.
 */
export type ObligationStatus = 'pending' | 'delivered' | 'received' | 'not_received'

/**
 * Where a delivered-but-unanswered obligation sits relative to its PD-057 response window,
 * **as the server computed it**.
 *
 *   none               nothing is waiting on the receiver — not delivered, already answered,
 *                      or the trade was cancelled
 *   awaiting_receiver  delivered, unanswered, still inside the window
 *   needs_attention    delivered, unanswered, and the window has passed
 *
 * Read from `my_barter_obligations.receiver_window_state`. NEVER derived here: the deadline
 * comparison happens once, in `public.barter_receiver_window`, against the server's clock. A
 * client that recomputed it from `Date.now()` would let a wrong device clock invent — or hide —
 * Needs Attention, and the state is the same for both participants only because one clock
 * decides it.
 *
 * `needs_attention` is an UNRESOLVED OPERATIONAL STATE: the window passed and nobody answered.
 * It is not Fulfilled, Unfulfilled or an adjudication, and no copy below may imply otherwise.
 * Terminal outcomes DO now exist (PD-064 … PD-067) and are carried separately by
 * `terminalOutcome`, which outranks this — an elapsed window is silence, and silence is not a
 * finding. `Completed` and `Disputed` still do not exist at any level.
 *
 * It is also NOT Under Review, which is a DIFFERENT state with a different cause: a window
 * elapses on its own, while a review begins only because someone explicitly reported something.
 * Under Review outranks this when both are true.
 */
export type ReceiverWindowState = 'none' | 'awaiting_receiver' | 'needs_attention'

/** The viewer's relationship to one obligation. Derived from the SERVER's role and side. */
export type ObligationRole = 'deliverer' | 'receiver'

/**
 * Which end of this obligation the viewer is on.
 *
 * Both inputs are server-derived — `myRole` from the negotiation view, `side` from the
 * obligation row — so no route param or local guess can put the delivery control in front of
 * the wrong provider. The server re-derives this independently and refuses either action from
 * the wrong participant regardless of what the client renders.
 */
export function obligationRole(side: ProposalSide, myRole: TradeRole): ObligationRole {
  return side === sideForRole(myRole) ? 'deliverer' : 'receiver'
}

export interface ObligationView {
  /** Whose side of the trade this is, in the viewer's own terms. */
  title: string
  /** One sentence of what is true right now. */
  state: string
  /** A second sentence when there is something honest to add. */
  note: string | null
  /** May the viewer mark this delivered? Only the deliverer, only before delivery. */
  canMarkDelivered: boolean
  /**
   * May the viewer answer for it? Only the receiver, only after delivery, only once.
   *
   * DELIBERATELY UNAFFECTED BY THE DEADLINE. An elapsed window means "this needs attention", not
   * "you lost your right to answer" — and the server agrees: neither receiver RPC consults a
   * deadline, so withdrawing the control here would hide an action that still works. Under
   * Review does not close it either: a reported trade still accepts the receiver's answer. What
   * DOES close it is a terminal ADJUDICATION, which now exists — see `terminalOutcome` below and
   * the `&& !resolved` conjunct this field is built with.
   */
  canRespond: boolean
  /**
   * The short label for this obligation's response window, or null when it has none.
   *
   * THREE possible values, not one. `ACTION_NEEDED_LABEL` means the window is LIVE and waiting
   * on this viewer — the controls beside it are live, so the label is an available action, never
   * a verdict. `NEEDS_ATTENTION_LABEL` means it has passed unanswered. `UNDER_REVIEW_LABEL`
   * means a no-show or `not_received` put it in front of a human (PD-062); it OUTRANKS both of
   * the others. A screen may style them differently but must not assume a fixed count, and must
   * not treat any of them as an outcome — a FOURTH would need every mapping updated.
   *
   * Decided PER OBLIGATION: `obligationView` is never told about the counterparty's obligation,
   * so an agreement-level headline elsewhere may differ from this without either being wrong
   * (Founder ruling 2026-09-07).
   *
   * A separate field rather than words spliced into `state`, so a screen can render it as a
   * badge and so the forbidden-vocabulary sweep has one string to check.
   *
   * Typed as the LABEL UNION, not `string`: that is what makes `ATTENTION_TONE` total, so a
   * fourth attention state cannot reach a screen without a tone.
   */
  attention: AttentionLabel | null
  /**
   * The operator's terminal resolution, or null. When set, `attention` is null, every `can*`
   * flag is false and `note` is the outcome's own sentence — the card is reporting a conclusion,
   * not a pending request.
   */
  terminalOutcome: TerminalOutcome | null
  /**
   * Whether the receiver may report a no-show right now.
   *
   * Decided by the SERVER (`my_barter_obligations.can_report_no_show`) and passed straight
   * through — this module never compares `scheduled_at` to a clock, for the same reason it
   * never compares the PD-057 deadline to one. Only the receiver ever sees it: the deliverer
   * cannot report themselves as a no-show.
   */
  canReportNoShow: boolean
  /**
   * May the viewer ask The Book to look at this obligation? **Deliverer only** (item X).
   *
   * PD-057 gives the receiver a window; PD-062 made Under Review the entry to adjudication, but
   * only through two RECEIVER acts. So when a receiver simply stopped opening the app, the
   * DELIVERER had no move at all and the trade sat in Needs Attention forever. This is the
   * third route, and it is deliberately the narrow one OQ-071 left room for: a person asks. No
   * timer, no automatic escalation, no second deadline.
   *
   * Offered only while the obligation is genuinely in Needs Attention and NOT already under
   * review — a second ask changes nothing, and the server treats a repeat as the same ask. The
   * server enforces every one of these conditions independently; drawing the control on any
   * other state would be a button that can only fail.
   *
   * ASKING IS NOT BEING ANSWERED. It records a request and produces no outcome. See
   * `REQUEST_REVIEW_COPY` for what the deliverer is told before they send it.
   */
  canRequestReview: boolean
  /**
   * The response deadline worth showing, with the label that makes it true for THIS viewer, or
   * null when there is no live window. The timestamp is returned raw and the caller formats it,
   * so one formatter renders every time on the card.
   */
  deadline: { label: string; at: string } | null
}

interface StateCopy {
  state: string
  note: string | null
  canMarkDelivered: boolean
  canRespond: boolean
}

/**
 * TOTAL over role × status. A fifth status or a third role is a compile error rather than a
 * silent fallthrough to whatever the last branch said — the defect class that produced every
 * copy finding on the Trade Activity surface.
 */
const COPY: Record<ObligationRole, Record<ObligationStatus, StateCopy>> = {
  deliverer: {
    pending: {
      state: 'You have not marked this delivered yet.',
      note: null,
      canMarkDelivered: true,
      canRespond: false,
    },
    delivered: {
      state: 'You marked this delivered.',
      // Says what is actually pending. NOT "delivery complete" — the receiver confirms, and
      // they have not yet.
      note: 'Waiting for the other provider to confirm they received it.',
      canMarkDelivered: false,
      canRespond: false,
    },
    received: {
      state: 'The other provider confirmed they received this.',
      note: null,
      canMarkDelivered: false,
      canRespond: false,
    },
    not_received: {
      // Reports THEIR statement as theirs, and stops. It does not call the obligation failed,
      // unfulfilled or disputed.
      state: 'The other provider recorded that they did not receive this.',
      // A FAIL-CLOSED FALLBACK, not what a provider normally reads. `not_received` always puts
      // the obligation Under Review server-side, so `obligationUnderReview` is true for every
      // healthy row and `UNDER_REVIEW_NOTE` supersedes this string. It survives for the case
      // where that column is absent from the read, where saying less is the right failure.
      // Still accurate either way: nothing HAS been decided until an operator decides it.
      note: 'Nothing has been decided.',
      canMarkDelivered: false,
      canRespond: false,
    },
  },
  receiver: {
    pending: {
      state: 'Not marked delivered yet.',
      note: 'Waiting for the other provider to mark this delivered.',
      canMarkDelivered: false,
      canRespond: false,
    },
    delivered: {
      state: 'The other provider marked this delivered.',
      note: 'Only you can say whether you received it.',
      canMarkDelivered: false,
      canRespond: true,
    },
    received: {
      state: 'You confirmed you received this.',
      note: null,
      canMarkDelivered: false,
      canRespond: false,
    },
    not_received: {
      // The brief's wording, kept verbatim: it states what was recorded and claims nothing
      // about what follows.
      state: "We've recorded that you didn't receive this.",
      note: 'Nothing has been decided.',
      canMarkDelivered: false,
      canRespond: false,
    },
  },
}

const TITLE: Record<ObligationRole, string> = {
  deliverer: 'You agreed to provide',
  receiver: 'You will receive',
}

/** The one short label for an elapsed, unanswered response window. */
export const NEEDS_ATTENTION_LABEL = 'Needs attention'

/**
 * The one short label for "this provider owes an answer, and is still in time".
 *
 * Lives HERE, beside `NEEDS_ATTENTION_LABEL`, even though the list surface uses it too. It was
 * previously spelled only in lib/tradeActivity.ts, which imports from this module — so putting
 * the shared spelling here is the direction that does not create an import cycle, and it keeps
 * ONE spelling of a label that must read identically on the list and on the trade's own screen.
 * `lib/tradeActivity.ts` re-exports it, so existing importers are unaffected.
 */
export const ACTION_NEEDED_LABEL = 'Action needed'

interface WindowCopy {
  /** Replaces the status note when there is something truer to say about the window. */
  note: string | null
  attention: AttentionLabel | null
  deadlineLabel: string | null
}

/**
 * What the response window adds, per role.
 *
 * TOTAL over role × window state, for the same reason `COPY` is total over role × status: a
 * fourth window state must be a compile error, not a silent fallthrough to whichever branch a
 * ternary happened to end on. That defect class produced every copy finding on this surface.
 *
 * Only reachable for a DELIVERED, unanswered obligation — the server returns `none` for every
 * other row — so these never need to describe a pending, received or not_received obligation.
 *
 * NOTHING HERE BLAMES ANYONE. An elapsed window is not a receiver who failed, a provider who
 * failed, a dispute, or an admin review: no such finding exists, and the copy stops at the two
 * facts on record — the window passed, and nobody has answered. "Nothing has been decided" is
 * the same sentence PD-058 already requires after an explicit `not_received`, for the same
 * reason.
 */
const WINDOW: Record<ObligationRole, Record<ReceiverWindowState, WindowCopy>> = {
  deliverer: {
    none: { note: null, attention: null, deadlineLabel: null },
    awaiting_receiver: {
      // Keeps the status note — it is still exactly what is pending — and adds when.
      note: null,
      attention: null,
      deadlineLabel: 'They have until',
    },
    needs_attention: {
      note: 'The confirmation window has passed and this is still unanswered, so the trade is '
        + 'unresolved. Nothing has been decided.',
      attention: NEEDS_ATTENTION_LABEL,
      deadlineLabel: 'A response was due by',
    },
  },
  receiver: {
    none: { note: null, attention: null, deadlineLabel: null },
    awaiting_receiver: {
      note: null,
      // FOUNDER RULING 2026-09-07. The receiver's own unanswered obligation is labelled for the
      // action it is asking for. This is decided PER OBLIGATION — `obligationView` never sees
      // the counterparty's obligation, so an escalation over there cannot reach in and silence
      // it. The agreement-level headline may read "Needs attention" at the same moment; the two
      // are different SCOPES and both are true. An actionable deadline is never hidden merely
      // because the other obligation escalated.
      attention: ACTION_NEEDED_LABEL,
      deadlineLabel: 'Please respond by',
    },
    needs_attention: {
      // Says the window passed and that the action is STILL available, because it is. Copy that
      // announced a closed window beside two working buttons would be the
      // caption-contradicts-capability defect this module exists to prevent.
      note: 'The response window has passed and this is still unanswered. You can still say '
        + 'whether you received it.',
      attention: NEEDS_ATTENTION_LABEL,
      deadlineLabel: 'A response was due by',
    },
  },
}

/**
 * Everything `obligationView` needs to describe ONE obligation, as named fields.
 *
 * WHY AN OBJECT AND NOT PARAMETERS. This grew to seven positional arguments ending in two
 * adjacent, same-typed, same-defaulted booleans (`underReview`, `canReportNoShow`). Transposing
 * those two type-checked cleanly and produced two opposite defects at once: an unreported
 * obligation labelled "Under review", and the no-show control offered on a trade the server
 * would refuse. Named fields make that transposition impossible to write, and they make every
 * call site say which fact it is supplying.
 *
 * EVERY OPTIONAL FIELD DEFAULTS TO THE WITHHOLDING VALUE. A caller that has not been given a
 * fact must not be able to assert one: no window, no review, no control. That direction is the
 * same one the server takes and the same one `TradeRowFacts` takes, and it is why these are
 * optional rather than required — a missing fact is a real state, not a caller error.
 */
export interface ObligationViewFacts {
  /** Which end of this obligation the viewer is on. */
  role: ObligationRole
  /** What has happened to it. Server-owned. */
  status: ObligationStatus
  /** Has the AGREEMENT been cancelled by either participant? Outranks everything below. */
  tradeCancelled?: boolean
  /** The SERVER's PD-057 window state for this obligation. Never recomputed here. */
  window?: ReceiverWindowState
  /** The server's `confirmation_deadline`. Only rendered; never compared to a local clock. */
  confirmationDeadline?: string | null
  /**
   * The SERVER's derived Under Review state for **THIS ONE OBLIGATION** (PD-062).
   *
   * OBLIGATION-LEVEL, and the name says so. Two other predicates are nearby and are NOT this one:
   * `TradeRowFacts.agreementUnderReview` is the agreement-level DISPLAY roll-up, and
   * `CancellationViewFacts.noShowReported` gates the ordinary exit (PD-063) on the report alone,
   * which is the same predicate `PT423` evaluates. All three were once called `underReview`; the
   * pre-adjudication cleanup split the names and aligned the PD-063 gate with its server rule, so
   * they can no longer be mistaken for one another.
   */
  obligationUnderReview?: boolean
  /** The SERVER's answer to "may this receiver report a no-show right now?" (PD-062). */
  canReportNoShow?: boolean
  /**
   * The operator's TERMINAL resolution of this obligation, or null while there is none.
   *
   * DOMINATES EVERYTHING BELOW CANCELLATION. Once set, this obligation is no longer Action
   * needed, Waiting for confirmation, Needs Attention or Under Review, and no participant
   * control is offered — the server refuses those writes with `PT424`, and a control that can
   * only fail must never be drawn.
   *
   * `PT424`, NOT `PT412`, and the distinction is the whole point of `20261022000000`. `PT412`
   * means "you already recorded your receiver answer"; a resolved obligation's receiver may
   * never have answered at all. This comment said `PT412` until the sweep that found it, in the
   * one module whose job is keeping SQLSTATE meanings from drifting.
   *
   * Defaulted to null like every other optional fact: absent means "not resolved", which is the
   * withholding direction. Manufacturing an outcome from a missing field would tell two
   * providers their trade was decided when nobody decided it.
   */
  terminalOutcome?: TerminalOutcome | null
}

export function obligationView(f: ObligationViewFacts): ObligationView {
  const {
    role,
    status,
    tradeCancelled = false,
    window = 'none',
    confirmationDeadline = null,
    obligationUnderReview = false,
    canReportNoShow = false,
    terminalOutcome = null,
  } = f
  const c = COPY[role][status]
  // A window belongs ONLY to a delivered, unanswered obligation, and only to an uncancelled
  // trade. The server already guarantees both — `barter_receiver_window` returns `none` for any
  // other status and for a cancelled agreement — so these are SECOND, independent refusals
  // rather than the only ones.
  //
  // The status half is load-bearing now that the live window carries a label. Without it,
  // `('receiver', 'received', 'awaiting_receiver')` would render "Action needed" beside a card
  // with NO controls, because `canRespond` is already false for an answered obligation: the
  // caption-contradicts-capability defect this module exists to prevent, and the one shape that
  // became reachable when the live window stopped being unlabelled. It must not depend on one
  // query being right.
  // PRECEDENCE, top to bottom: cancellation, then the terminal outcome, then Under Review, then
  // the window. Each silences everything below it, so the card carries exactly ONE answer.
  //
  // TERMINAL OUTCOME DOMINATES all but cancellation. A resolved obligation is not waiting on
  // anybody, so the window, the review state and every control go together — a resolution
  // rendered beside a stale request would be the caption-contradicts-capability defect in its
  // worst form. Cancellation still outranks it because a cancelled trade cannot be adjudicated
  // at all (the server refuses it), so the two can never both be true, and preferring
  // cancellation keeps the client from asserting a resolution the database would not have
  // allowed.
  //
  // UNDER REVIEW OUTRANKS THE WINDOW for the reason it always did: once a report exists, a
  // missing answer is no longer what the trade is waiting on.
  const resolved = terminalOutcome && !tradeCancelled ? terminalOutcome : null
  const review = obligationUnderReview && !tradeCancelled && !resolved
  const w = WINDOW[role][
    tradeCancelled || resolved || status !== 'delivered' ? 'none' : window
  ]
  return {
    title: TITLE[role],
    // THE STATE SENTENCE IS SOFTENED ONCE RESOLVED, and only for `pending`. A no-show can be
    // reported on a scheduled obligation that was never delivered, so `pending` + a terminal
    // outcome is reachable — and the pending copy is the only one phrased as an action still
    // awaited: "You have not marked this delivered YET." / "Not marked delivered yet." Left
    // alone it points at a control that has been permanently withdrawn (the server refuses with
    // `PT424`), which is the caption-contradicts-capability defect this module exists to
    // prevent. The FACT is preserved — it was never delivered, and that is exactly what the
    // record should say — only the implication that someone may still act is dropped.
    //
    // Deliberately NOT applied to cancellation, where "Not marked delivered yet." stays as-is:
    // a cancelled trade ended without a finding, and the sentence carries no verdict either way.
    state: resolved && status === 'pending' ? NOT_DELIVERED_RESOLVED[role] : c.state,
    // DROPPED when the trade is cancelled. Every note here is about what happens next —
    // "Waiting for the other provider to mark this delivered" — and on a cancelled trade
    // nothing happens next. Suppressing both controls while leaving the sentence that promises
    // one was the screen telling a receiver to wait for a delivery it had just said could never
    // arrive. The `state` sentence stays: "Not marked delivered yet." is still true.
    // The window's note WINS when it has one: "the window passed and this is unanswered" is
    // strictly truer than "waiting for the other provider to confirm", which stops being
    // accurate the moment the deadline goes by.
    note: tradeCancelled
      ? null
      : resolved
        ? terminalOutcomeNote(resolved, role)
        : review
          ? UNDER_REVIEW_NOTE[role]
          : (w.note ?? c.note),
    canMarkDelivered: c.canMarkDelivered && !tradeCancelled && !resolved,
    canRespond: c.canRespond && !tradeCancelled && !resolved,
    // Offered ONLY to the receiver, and only when the server says the moment has come. The
    // role check is a second, independent refusal: the server already refuses a deliverer, and
    // a button that can only fail must never be drawn.
    canReportNoShow: role === 'receiver' && canReportNoShow && !tradeCancelled && !resolved,
    // ITEM X. Every conjunct is one the server also checks:
    //   deliverer only          — the receiver has two routes in already and does not need a third
    //   delivered + needs_attention — the window has genuinely passed unanswered
    //   not already under review    — a second ask changes nothing, and the label would be a lie
    //   not cancelled, not resolved — nothing left to look at
    canRequestReview:
      role === 'deliverer'
      && status === 'delivered'
      && window === 'needs_attention'
      && !review
      && !tradeCancelled
      && !resolved,
    attention: review ? UNDER_REVIEW_LABEL : w.attention,
    // The RESOLUTION, reported separately from `attention` on purpose: attention states are
    // things still waiting on somebody, and this is the opposite of that. A screen renders one
    // or the other, never both — `attention` is null whenever this is set.
    terminalOutcome: resolved,
    // Shown only when the server gave both a live window state and a deadline. Guarding on both
    // means a missing deadline degrades to no line, never to a label with nothing after it.
    deadline:
      w.deadlineLabel && confirmationDeadline
        ? { label: w.deadlineLabel, at: confirmationDeadline }
        : null,
  }
}

export interface ObligationActionCopy {
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
}

// Both actions are one-way and both are statements about the other provider's performance, so
// each is confirmed before it is sent. The bodies say what is recorded and what is not.
export const MARK_DELIVERED_COPY: ObligationActionCopy = {
  title: 'Mark this delivered?',
  // Does NOT say the other provider is told. Nothing in the app notifies them — there is no
  // push, no email and no message written into their conversation — so they see this the next
  // time they open the trade. Claiming otherwise would be the deliverer's whole reason to stop
  // following up.
  body:
    'This records that you have delivered what you agreed to provide, and stamps the time. It'
    + ' cannot be undone, and only the other provider can confirm they received it.',
  confirmLabel: 'Mark delivered',
  cancelLabel: 'Not yet',
}

export const CONFIRM_RECEIVED_COPY: ObligationActionCopy = {
  title: 'Confirm you received this?',
  body: 'This records that you received what they agreed to provide. It cannot be changed.',
  confirmLabel: 'Confirm received',
  cancelLabel: 'Not yet',
}

export const NOT_RECEIVED_COPY: ObligationActionCopy = {
  title: "Say you didn't receive this?",
  body:
    'This records that you did not receive what they agreed to provide. It cannot be changed,'
    + ' and it does not end or cancel the trade.',
  confirmLabel: "Didn't receive",
  cancelLabel: 'Go back',
}

/**
 * ITEM X — what the deliverer is told before they ask.
 *
 * Every sentence is a limit. It does NOT claim the delivery happened, does not fault the
 * receiver, does not contradict their silence, and promises no answer by any particular time:
 * PD-068 is explicit that there is no SLA. Saying "someone will look" and stopping is the most
 * this can honestly say — and it is still strictly more than the deliverer had, which was
 * nothing.
 *
 * **The copy does not change now that Session 8 has built the queue behind it.** A request does
 * reach `operator_cases` (`20261050000000`), so it now lands somewhere a person can find it —
 * but there is still NO OPERATOR UI, the operator RPCs are `service_role`-only, and there is
 * still no SLA. Nothing about what a deliverer may be PROMISED has changed, and a queue existing
 * is not a reason to start promising.
 */
export const REQUEST_REVIEW_COPY: ObligationActionCopy = {
  title: 'Ask The Book to review this?',
  body:
    'This asks The Book to look at this part of the trade because the other provider has not'
    + ' answered. It does not decide anything, does not say they were at fault, and does not'
    + ' record that your delivery was received. There is no set response time.',
  confirmLabel: 'Ask The Book to review',
  cancelLabel: 'Not yet',
}

/** The control's own label, so the screen and the confirmation cannot drift apart. */
export const REQUEST_REVIEW_LABEL = 'Ask The Book to review'

/**
 * What the deliverer is told once they have asked. Deliberately the same destination as the
 * other two routes — the trade reads "Under review" and waits — because a requested review is
 * not a better or faster kind of review, and the copy must not imply it is.
 */
export const REVIEW_REQUESTED_NOTE =
  'You asked The Book to look at this. Nothing has been decided.'

/** The same 200-character bound the server enforces, and the same one cancellation uses. */
export const MAX_NO_SHOW_REASON = 200

export const NO_SHOW_REASON_PLACEHOLDER = 'What happened? (optional)'

/**
 * The disclosure, ABOVE the input and before the writer commits.
 *
 * Same discipline PD-060/PD-062 required for the cancellation reason: a participant writing
 * about a counterparty must be told who will read it BEFORE they write, not afterwards. It also
 * says what the text is NOT, because a box that appears the moment someone is reporting a missed
 * appointment is exactly where a person assumes they are filing a case.
 */
export const NO_SHOW_REASON_NOTE =
  'Optional — shared with the other provider. It is your account of what happened, not a'
  + ' decision about it.'

/** Refuses only what the server refuses, so the copy and the boundary cannot drift. */
export function validateNoShowReason(reason: string): string | null {
  if (reason.trim().length > MAX_NO_SHOW_REASON) {
    return `Keep it under ${MAX_NO_SHOW_REASON} characters.`
  }
  return null
}

/** Empty means NO reason, not an empty one — the column is null-or-content, never blank. */
export function noShowReasonPayload(reason: string): string | null {
  const trimmed = reason.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * Reporting that a SCHEDULED service did not happen.
 *
 * The body says three true things and no more: what is being recorded, that it decides nothing,
 * and what happens next. It deliberately does NOT say the provider failed, that the reporter
 * has won, that anything is unfulfilled or resolved, or that a refund or penalty follows — none
 * of those exist, and a confirmation dialog is exactly where a product accidentally promises
 * an outcome it cannot deliver.
 *
 * IT ALSO DISCLOSES WHAT IT TAKES AWAY (PD-063). Reporting permanently removes the ordinary exit
 * for BOTH providers, not just the reporter. An earlier draft said the report "does not end or
 * cancel the trade" — true in the narrow sense and misleading in the way that matters, because
 * it read as reassurance that cancelling was still available when the report was about to
 * foreclose it for the counterparty too. A consequence this irreversible is disclosed before the
 * writer commits, the same rule the cancellation copy already follows.
 */
export const REPORT_NO_SHOW_COPY: ObligationActionCopy = {
  title: 'Report that this did not happen?',
  body:
    'This records that the scheduled service did not take place. It does not decide who was at'
    + ' fault. The trade will need review, and after this neither of you can cancel it.',
  confirmLabel: 'Report no-show',
  cancelLabel: 'Go back',
}

/**
 * The reporting participant's own words about a no-show, labelled for THIS viewer.
 *
 * The attribution is derived here rather than by a ternary in JSX, for the same reason
 * `cancellationReasons` derives its own: putting the wrong name on a provider's statement about
 * a missed appointment is the one mistake this must not make. Only the RECEIVER can report, so
 * the role decides the label — there is no second field to disagree with.
 *
 * NOT A VERDICT. The label says who SAID it, never who was right. No fault, reliability
 * judgment, adjudication or reputation effect is implied or exists.
 *
 * Returns null when there is no report or the reporter left the box empty, so a screen never
 * renders a label with nothing after it.
 */
export function noShowStatement(
  role: ObligationRole,
  reason: string | null,
): { label: string; reason: string } | null {
  const text = (reason ?? '').trim()
  if (!text) return null
  return {
    label: role === 'receiver' ? 'You said' : 'The other provider said',
    reason: text,
  }
}

/**
 * The three TERMINAL obligation outcomes, decided by an operator and by nobody else.
 *
 * OBLIGATION-LEVEL. One side of a trade can be resolved while the other is still Under Review,
 * and there is deliberately no agreement-level outcome — no Completed, no Partially Fulfilled,
 * no Not Completed exists in this product.
 */
export type TerminalOutcome = 'fulfilled' | 'unfulfilled' | 'closed_without_resolution'

/**
 * What each outcome is CALLED to a participant, and what none of them may imply.
 *
 * TOTAL over the three, so a fourth outcome is a compile error rather than an unlabelled state.
 *
 * NO BLAME LANGUAGE. None of these says a provider lied, was at fault, was penalised, or that a
 * reliability score moved — none of which exist. `closed_without_resolution` in particular is
 * NOT a softer `unfulfilled`: it records that the information did not support either finding,
 * which is the honest answer when there is no honest answer.
 */
export const TERMINAL_OUTCOME_LABEL: Record<TerminalOutcome, string> = {
  fulfilled: 'Fulfilled',
  unfulfilled: 'Unfulfilled',
  closed_without_resolution: 'Closed without resolution',
}

/**
 * The sentence beneath the label, per outcome and per role.
 *
 * TOTAL over outcome x role. Written so neither provider reads a verdict about a PERSON: the
 * subject of every sentence is the obligation, never the other provider.
 *
 * THE TWO ROLES DELIBERATELY SHARE WORDING TODAY — all six strings collapse to three. The role
 * axis is kept because the sentence is about the obligation rather than about either provider,
 * so there is nothing to vary yet, and because a future divergence must then be DECIDED per
 * outcome rather than defaulted into by whoever adds the first role-specific line. An earlier
 * version of this comment claimed the two "differ only in whose side it was", which a reader
 * could check and find false.
 */
export const TERMINAL_OUTCOME_NOTE: Record<TerminalOutcome, Record<ObligationRole, string>> = {
  fulfilled: {
    deliverer: 'This was reviewed and resolved as fulfilled.',
    receiver: 'This was reviewed and resolved as fulfilled.',
  },
  unfulfilled: {
    deliverer: 'This was reviewed and resolved as not fulfilled.',
    receiver: 'This was reviewed and resolved as not fulfilled.',
  },
  closed_without_resolution: {
    deliverer:
      'This was reviewed and closed without a resolution — the available information did not'
      + ' support deciding either way.',
    receiver:
      'This was reviewed and closed without a resolution — the available information did not'
      + ' support deciding either way.',
  },
}

/** The one short label for a trade that needs manual resolution. */
export const UNDER_REVIEW_LABEL = 'Under review'

/**
 * The ONE mapping from an attention label to its presentation tone.
 *
 * WHY THIS EXISTS. The label → chip-style ternary was hand-copied into both
 * `app/community/negotiation/[id].tsx` and `app/community/trade-activity.tsx`, along with six
 * rgba literals, and each file carried a comment asserting the invariant that two independent
 * copies structurally cannot enforce — that one product state does not change meaning when the
 * viewer moves between surfaces. This slice's own third state was added to both by hand.
 *
 * GENUINELY TOTAL over the labels, and the typing is the point rather than decoration. Keyed by
 * `AttentionLabel` — a union of the three exported constants — so adding a fourth label without
 * a tone is a COMPILE error here. A `Record<string, …>` would have accepted any key and required
 * none, which is the silent fallthrough this table exists to prevent; the first draft of this
 * comment claimed the guarantee while the type did not provide it.
 *
 * TONE, NOT COLOUR. This names the MEANING; each screen owns its own palette and maps the tone
 * to its own StyleSheet. That keeps one authoritative mapping without dragging a theme system
 * into a behaviour-preserving cleanup, and without a lib module importing React Native styles.
 *
 *   `live`     — your turn, still in time
 *   `elapsed`  — the window has passed
 *   `review`   — with someone else now
 *
 * Deliberately NO alarm tone in the set: nothing here is a failure, a dispute or a review of a
 * person, and an alarm colour would state something the product cannot support.
 */
export type AttentionTone = 'live' | 'elapsed' | 'review'

/** Every label `obligationView` or `tradeRowState` can put in an `attention` field. */
export type AttentionLabel =
  | typeof ACTION_NEEDED_LABEL
  | typeof NEEDS_ATTENTION_LABEL
  | typeof UNDER_REVIEW_LABEL

export const ATTENTION_TONE: Record<AttentionLabel, AttentionTone> = {
  [ACTION_NEEDED_LABEL]: 'live',
  [NEEDS_ATTENTION_LABEL]: 'elapsed',
  [UNDER_REVIEW_LABEL]: 'review',
}

/**
 * One obligation's contribution to the agreement-level picture.
 *
 * BOTH FIELDS ARE NEEDED, and a first cut of this that took only the outcome was wrong in a way
 * worth recording: an obligation the receiver has CONFIRMED RECEIVED is finished — nobody owes
 * anything, no control is drawn — but it carries no terminal outcome, because no operator was
 * ever involved. Reading outcomes alone made a fully performed trade indistinguishable from one
 * confirmed five minutes ago, so the ordinary happy path still told both providers to go and
 * arrange something they had already done. PD-070 says the derivation reads "the two obligation
 * STATES, obligation adjudication outcomes, cancellation acts …" — the state is not optional.
 */
export interface ObligationResolutionFact {
  status: ObligationStatus
  terminalOutcome?: TerminalOutcome | null
}

/** Nothing is owed on this obligation by anyone. */
function concluded(o: ObligationResolutionFact): boolean {
  // An operator's decision ends it whatever the participants did; short of that, the receiver
  // confirming they got it ends it. `not_received` does NOT: that is the receiver saying
  // something went wrong, which routes to Under Review and waits for a human.
  return o.terminalOutcome != null || o.status === 'received'
}

/** Concluded AND concluded well — nothing adverse was found or reported. */
function concludedWell(o: ObligationResolutionFact): boolean {
  // An adjudication OUTRANKS the participants' own record: an obligation the receiver confirmed
  // and an operator then resolved `unfulfilled` is not a good ending. Compared against the
  // vocabulary rather than `!== 'unfulfilled'`, so an outcome this build does not recognise is
  // never reported as a good one.
  if (o.terminalOutcome != null) return o.terminalOutcome === 'fulfilled'
  return o.status === 'received'
}

/**
 * How far a trade's two obligations have been settled — the AGREEMENT-level fact, derived.
 *
 * PD-070: agreement-level resolution is DERIVED from the immutable underlying facts and never
 * persisted as a second terminal state. The inputs cannot drift — an adjudication is append-only
 * and immutable (PD-066) and a cancellation is append-only — so a value computed from them is
 * stable, and storing a roll-up beside them would only create something able to disagree.
 *
 * WHY THIS RETURNS A COARSE STATE AND NOT A VERDICT. The tempting shape is a map from
 * (outcome, outcome) to a single word. It cannot be written honestly:
 *
 *   * `fulfilled + closed_without_resolution` is NOT "partially fulfilled". That label asserts
 *     the other side was found UNFULFILLED, and *closed without resolution* is the opposite of a
 *     finding — it records that the information did not support either answer (PD-065).
 *   * `closed + closed` is NOT "not completed", which asserts performance failed. Nothing was
 *     found to have failed.
 *
 * So where a roll-up would overstate what was found, this reports only that both sides are
 * settled and lets each obligation state its own outcome. **No value here names an outcome**,
 * which is also why `allSettled` covers both "both confirmed received" and "both adjudicated
 * fulfilled": the two are the same fact at this altitude — nothing is owed and nothing adverse
 * was found — and a banner that said "reviewed" over a trade nobody reviewed would be false.
 *
 * FAIL-CLOSED ON A SHORT LIST. A trade has exactly two obligations by database construction, so
 * any other length means the read did not land — reported as 'none', because assuming nothing is
 * settled is the withholding direction, the rule every optional fact in this module follows.
 */
export function agreementResolution(
  obligations: readonly ObligationResolutionFact[],
): AgreementResolution {
  if (obligations.length !== 2) return 'none'
  const done = obligations.filter(concluded)
  if (done.length === 0) return 'none'
  if (done.length < obligations.length) return 'partial'
  return obligations.every(concludedWell) ? 'allSettled' : 'allSettledMixed'
}

/**
 * What a never-delivered obligation's state sentence becomes once it has been resolved.
 *
 * States the same fact as the `pending` copy without the word "yet", which promises an action
 * that no longer exists. Names no outcome — the chip and the note carry that, once — and blames
 * nobody: the subject is the obligation, never the provider.
 */
const NOT_DELIVERED_RESOLVED: Record<ObligationRole, string> = {
  deliverer: 'This was never marked delivered.',
  receiver: 'This was never marked delivered.',
}

/**
 * The note for a resolved obligation, with a fallback for an outcome this build does not know.
 *
 * BELT AND BRACES for the same reason `attentionTone` below is, and against a strictly worse
 * failure. `attention` is computed in this module; `terminalOutcome` arrives straight off a
 * server column (`lib/negotiation.ts`, `terminal_outcome`), and the app ships on its own cadence
 * while the database migrates on another. A migration widening
 * `barter_obligation_adjudications_outcome_check` reaches installed clients before the matching
 * build does, and an unguarded `TERMINAL_OUTCOME_NOTE[x][role]` would then throw INSIDE a render
 * — a hard crash on the trade card and the Trade Activity list, not degraded copy.
 *
 * The fallback says only that it was reviewed and resolved. It names no outcome it cannot
 * describe, assigns no fault, and is the withholding direction — the same rule every optional
 * fact in this module follows. Unreachable today: `TERMINAL_OUTCOME_NOTE` is a total `Record`
 * over the union, so a fourth outcome is a compile error first.
 */
export function terminalOutcomeNote(outcome: string, role: ObligationRole): string {
  const byRole = (TERMINAL_OUTCOME_NOTE as Record<string, Record<ObligationRole, string>>)[outcome]
  return byRole?.[role] ?? 'This was reviewed and resolved.'
}

/**
 * The outcome as a label, with the same fallback and for the same reason as
 * `terminalOutcomeNote`. Returns null for an unknown value so a caller can omit the chip rather
 * than draw one reading `undefined`.
 */
export function terminalOutcomeLabel(outcome: string): string | null {
  return (TERMINAL_OUTCOME_LABEL as Record<string, string>)[outcome] ?? null
}

/**
 * The tone for a rendered attention label, or null when there is no label.
 *
 * Takes `string | null` rather than `AttentionLabel | null` as BELT AND BRACES, not because the
 * callers need the widening — both view models now type `attention` as the union, so every real
 * call is already narrow. The looser parameter plus the `?? 'live'` fallback means a label
 * arriving from somewhere the type system does not cover (a persisted value, a future server
 * field) still renders in the least-alarming tone instead of crashing a screen. That path is
 * unreachable today, which the union-keyed `ATTENTION_TONE` enforces at compile time and
 * `obligationViewShape.test.ts` re-checks over every label BOTH view models can emit.
 */
export function attentionTone(label: string | null): AttentionTone | null {
  if (!label) return null
  return (ATTENTION_TONE as Record<string, AttentionTone>)[label] ?? 'live'
}

/**
 * What an obligation under review says.
 *
 * ONE sentence per role, and neither accuses anybody. The receiver is told their report was
 * recorded; the deliverer is told the trade needs review WITHOUT being told they did anything
 * wrong, because nothing has been decided and saying otherwise would be a verdict this product
 * cannot support. "Nothing has been decided" is the same sentence PD-058 already requires after
 * a `not_received`, for the same reason.
 */
export const UNDER_REVIEW_NOTE: Record<ObligationRole, string> = {
  receiver:
    'This trade needs review. What you reported has been recorded. Nothing has been decided'
    + ' yet, and the trade can no longer be cancelled.',
  deliverer:
    'This trade needs review. The other provider reported a problem with this. Nothing has been'
    + ' decided yet, and the trade can no longer be cancelled.',
}

/**
 * The button labels, DERIVED from the confirmation copy rather than restated.
 *
 * Spelled twice, they can diverge — and then a button says one thing while the dialog it opens
 * says another, on an action that cannot be undone. Same reason `lib/tradeActivity.ts` owns its
 * confirmation copy centrally instead of letting each screen author it.
 */
export const RESPOND_LABELS = {
  received: CONFIRM_RECEIVED_COPY.confirmLabel,
  notReceived: NOT_RECEIVED_COPY.confirmLabel,
  noShow: REPORT_NO_SHOW_COPY.confirmLabel,
} as const

/**
 * The timestamps worth showing on an obligation, in the order they happen.
 *
 * Here rather than in the screen so the labels are covered by the same forbidden-vocabulary
 * sweep as every other string on the card, and so the answer time is shown at all — it is the
 * fact most likely to matter if the two providers later disagree about what happened.
 *
 * The three entries are the three things that HAPPENED, kept even when a later one contradicts
 * an earlier one: a delivery, an answer and a resolution all stand together, because an
 * adjudication does not rewrite history (PD-066).
 *
 * Values are returned raw; the caller formats them, so ONE formatter is used for every
 * timestamp on the card.
 */
export function obligationTimeline(
  deliveredAt: string | null,
  receiptRespondedAt: string | null,
  adjudicatedAt: string | null = null,
): { key: string; label: string; at: string }[] {
  const out: { key: string; label: string; at: string }[] = []
  if (deliveredAt) out.push({ key: 'delivered', label: 'Marked delivered', at: deliveredAt })
  if (receiptRespondedAt) {
    out.push({ key: 'answered', label: 'Answered', at: receiptRespondedAt })
  }
  // WHEN it was resolved, which PD-067 makes participant-visible along with the outcome itself.
  // Last, because it is last: it is the only entry that ends the obligation. The label says
  // "Reviewed" and not the outcome — the outcome is stated once, by the chip, and repeating it
  // in a timestamp row would be two places to keep in agreement.
  //
  // Defaulted to null so the parameter WITHHOLDS when a caller has not been updated, in the same
  // direction as every other optional fact in this module.
  if (adjudicatedAt) out.push({ key: 'resolved', label: 'Reviewed', at: adjudicatedAt })
  return out
}

/**
 * Has EITHER obligation of an agreement been marked delivered?
 *
 * The PD-046 precondition that decides whether the ordinary exit is still offered. It lives
 * here, not in the negotiation screen, for the reason this module exists: computed in JSX it
 * was the one link in the cancellation chain no unit test could reach, while
 * `cancellationView` — which consumes it — was exhaustively tested for every value of it.
 *
 * Asks about `deliveredAt`, not about `status`, deliberately: PD-058 makes a receiver's answer
 * move the status off `delivered` while the delivery itself remains a fact, and cancellation is
 * closed by the DELIVERY, not by the answer. `mark_barter_obligation_delivered` sets both in
 * one statement, so the timestamp is the narrower and more durable of the two.
 *
 * An EMPTY list returns false, which reads as "nothing delivered" and is indistinguishable
 * from the truth. That is why callers must check the rows actually loaded — the database
 * guarantees exactly two per agreement — before trusting this to gate an irreversible control.
 */
export function anyDelivered(obligations: { deliveredAt: string | null }[]): boolean {
  return obligations.some((o) => o.deliveredAt !== null)
}
