// Barter obligation delivery and receipt state and copy. Pure logic, NO I/O — the same split
// as lib/negotiationState.ts and lib/tradeActivity.ts, and for the same reason: these rules
// decide what a provider is told about an irreversible statement they are about to make, and
// they cannot be unit tested while they live inside a react-native component.
//
// USER LANGUAGE, NOT SCHEMA LANGUAGE. Nothing here says status, enum, row or transition.
//
// TRUTHFUL AND NON-FINAL. The receiver-response window and Needs Attention now EXIST (PD-057,
// PD-059). Nothing else does: there is still no automatic fulfilment, no automatic completion,
// no no-show, no Under Review and no adjudication, so no copy in this module may say an
// obligation is complete, fulfilled, unfulfilled, disputed, resolved or under review — and
// Needs Attention itself must never be worded as any of them. It is an UNRESOLVED OPERATIONAL
// STATE and nothing more: the window passed and nobody has answered.
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
 * `needs_attention` is an UNRESOLVED OPERATIONAL STATE. It is not Fulfilled, Unfulfilled,
 * Completed, Under Review, Disputed, a no-show or an adjudication; none of those exist, and no
 * copy below may imply otherwise.
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
   * deadline, so withdrawing the control here would hide an action that still works. Only a
   * later Under Review / adjudication slice may close it, and it does not exist.
   */
  canRespond: boolean
  /**
   * The short label for an obligation whose response window has passed unanswered, or null.
   *
   * A separate field rather than words spliced into `state`, so a screen can render it as a
   * badge and so the forbidden-vocabulary sweep has one string to check.
   */
  attention: string | null
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
): ObligationView {
  const c = COPY[role][status]
  // A cancelled trade has no live window. The server already returns `none` for one, so this is
  // a second, independent refusal rather than the only one: Needs Attention on a trade the
  // screen is simultaneously reporting as cancelled would be the worst contradiction available
  // on this card, and it must not depend on one query being right.
  const w = WINDOW[role][tradeCancelled ? 'none' : window]
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
    note: tradeCancelled ? null : (w.note ?? c.note),
    canMarkDelivered: c.canMarkDelivered && !tradeCancelled,
    canRespond: c.canRespond && !tradeCancelled,
    attention: w.attention,
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
 * The button labels, DERIVED from the confirmation copy rather than restated.
 *
 * Spelled twice, they can diverge — and then a button says one thing while the dialog it opens
 * says another, on an action that cannot be undone. Same reason `lib/tradeActivity.ts` owns its
 * confirmation copy centrally instead of letting each screen author it.
 */
export const RESPOND_LABELS = {
  received: CONFIRM_RECEIVED_COPY.confirmLabel,
  notReceived: NOT_RECEIVED_COPY.confirmLabel,
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
