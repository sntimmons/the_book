// Barter obligation delivery and receipt state and copy. Pure logic, NO I/O — the same split
// as lib/negotiationState.ts and lib/tradeActivity.ts, and for the same reason: these rules
// decide what a provider is told about an irreversible statement they are about to make, and
// they cannot be unit tested while they live inside a react-native component.
//
// USER LANGUAGE, NOT SCHEMA LANGUAGE. Nothing here says status, enum, row or transition.
//
// TRUTHFUL AND NON-FINAL. Three things now EXIST: the receiver-response window and Needs
// Attention (PD-057, PD-059), and — by Founder ruling, 2026-09-07 — receiver-reported NO-SHOW
// and the derived UNDER REVIEW state. All three are UNRESOLVED OPERATIONAL STATES and nothing
// more. Under Review means a human has to look; it does not mean anyone is at fault.
//
// What still does NOT exist: automatic fulfilment, automatic completion, adjudication, any
// operator decision path, and every terminal outcome — Fulfilled, Unfulfilled, Completed,
// Closed Without Resolution, Partially Fulfilled, Not Completed — plus reputation. **No copy in
// this module may say an obligation is complete, fulfilled, unfulfilled, disputed or resolved,
// may name a fault except to deny one, or may promise an outcome.** Needs Attention and Under
// Review must never be worded as any of the above.
//
// The window is decided by the SERVER. This module receives `receiver_window_state` already
// computed against the server's clock and never re-derives it from `Date.now()`; a device with a
// wrong clock must not be able to put a trade into — or out of — Needs Attention.
//
// Pre-delivery cancellation DOES exist, but it is an AGREEMENT-level act: it is said once, by
// lib/tradeCancellation.ts, above both obligations. This module only takes `tradeCancelled` as
// an input that freezes the controls and drops the what-happens-next notes. "Didn't receive"
// records what the receiver said and nothing more.

import type { ProposalSide, TradeRole } from './negotiationState'
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
 * It is not Fulfilled, Unfulfilled, Completed, Disputed or an adjudication — none of which
 * exist — and no copy below may imply otherwise.
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
   * Review does not close it either: a reported trade still accepts the receiver's answer, and
   * only a later ADJUDICATION slice could close it — which does not exist.
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
   */
  attention: string | null
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
      // unfulfilled or disputed, and it does not say anything is being reviewed — none of
      // that exists.
      state: 'The other provider recorded that they did not receive this.',
      // Stops at what is true. It does not promise a next step, because this slice has none:
      // no review, no adjudication, no outcome. It also does not send the reader to a
      // conversation, which this screen offers no way to open.
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

/**
 * @param tradeCancelled has the AGREEMENT been cancelled by either participant? A cancelled
 * trade freezes both controls: the server refuses a delivery or an answer on one (`PT409`),
 * and rendering a button that can only fail is the capability-contradicts-caption defect this
 * module exists to prevent. The rule lives here, not in the screen, so it is covered by the
 * same exhaustive role × status sweep as the copy.
 *
 * The state sentence is unchanged when cancelled — "You have not marked this delivered yet."
 * stays true — because the cancellation itself is said once, by `lib/tradeCancellation.ts`,
 * above both obligations rather than repeated inside each.
 */
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
  attention: string | null
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
 * @param window the SERVER's `receiver_window_state`. Defaulted to `none` so a caller that has
 * not been given one cannot accidentally assert an attention state — the safe direction is to
 * say nothing about a window, never to invent one.
 * @param confirmationDeadline the server's `confirmation_deadline` for this obligation. Only
 * rendered; never compared against a local clock here.
 */
export function obligationView(
  role: ObligationRole,
  status: ObligationStatus,
  tradeCancelled = false,
  window: ReceiverWindowState = 'none',
  confirmationDeadline: string | null = null,
  /**
   * The SERVER's derived Under Review state for THIS obligation, and its offer of the no-show
   * control. Both default to the silent/withholding value so a caller that has not been given
   * them cannot accidentally assert that a trade needs review or offer a control that can only
   * fail — the same fail-closed direction as `window`.
   */
  underReview = false,
  canReportNoShow = false,
): ObligationView {
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
  const w = WINDOW[role][tradeCancelled || status !== 'delivered' ? 'none' : window]
  // UNDER REVIEW OUTRANKS THE WINDOW, and cancellation outranks both. A trade a human has to
  // resolve is a truer thing to say than "the response window passed" — the window is about a
  // missing answer, and once a report exists the answer is no longer what the trade is waiting
  // on. It is still not a verdict: `UNDER_REVIEW_NOTE` says nothing has been decided, and the
  // receiver's controls stay live beneath it because they genuinely still work.
  const review = underReview && !tradeCancelled
  return {
    title: TITLE[role],
    state: c.state,
    // DROPPED when the trade is cancelled. Every note here is about what happens next —
    // "Waiting for the other provider to mark this delivered" — and on a cancelled trade
    // nothing happens next. Suppressing both controls while leaving the sentence that promises
    // one was the screen telling a receiver to wait for a delivery it had just said could never
    // arrive. The `state` sentence stays: "Not marked delivered yet." is still true.
    // The window's note WINS when it has one: "the window passed and this is unanswered" is
    // strictly truer than "waiting for the other provider to confirm", which stops being
    // accurate the moment the deadline goes by.
    note: tradeCancelled ? null : review ? UNDER_REVIEW_NOTE[role] : (w.note ?? c.note),
    canMarkDelivered: c.canMarkDelivered && !tradeCancelled,
    canRespond: c.canRespond && !tradeCancelled,
    // Offered ONLY to the receiver, and only when the server says the moment has come. The
    // role check is a second, independent refusal: the server already refuses a deliverer, and
    // a button that can only fail must never be drawn.
    canReportNoShow: role === 'receiver' && canReportNoShow && !tradeCancelled,
    attention: review ? UNDER_REVIEW_LABEL : w.attention,
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

/** The one short label for a trade that needs manual resolution. */
export const UNDER_REVIEW_LABEL = 'Under review'

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
 * Values are returned raw; the caller formats them, so ONE formatter is used for every
 * timestamp on the card.
 */
export function obligationTimeline(
  deliveredAt: string | null,
  receiptRespondedAt: string | null,
): { key: string; label: string; at: string }[] {
  const out: { key: string; label: string; at: string }[] = []
  if (deliveredAt) out.push({ key: 'delivered', label: 'Marked delivered', at: deliveredAt })
  if (receiptRespondedAt) {
    out.push({ key: 'answered', label: 'Answered', at: receiptRespondedAt })
  }
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
