// Barter obligation delivery and receipt state and copy. Pure logic, NO I/O — the same split
// as lib/negotiationState.ts and lib/tradeActivity.ts, and for the same reason: these rules
// decide what a provider is told about an irreversible statement they are about to make, and
// they cannot be unit tested while they live inside a react-native component.
//
// USER LANGUAGE, NOT SCHEMA LANGUAGE. Nothing here says status, enum, row or transition.
//
// TRUTHFUL AND NON-FINAL. There is no timeout, no automatic fulfilment, no-show, Needs
// Attention, Under Review or adjudication in the product yet, so no copy in this module may say
// an obligation is complete, fulfilled, unfulfilled, disputed, resolved or under review.
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
  /** May the viewer answer for it? Only the receiver, only after delivery, only once. */
  canRespond: boolean
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
export function obligationView(
  role: ObligationRole,
  status: ObligationStatus,
  tradeCancelled = false,
): ObligationView {
  const c = COPY[role][status]
  return {
    title: TITLE[role],
    state: c.state,
    // DROPPED when the trade is cancelled. Every note here is about what happens next —
    // "Waiting for the other provider to mark this delivered" — and on a cancelled trade
    // nothing happens next. Suppressing both controls while leaving the sentence that promises
    // one was the screen telling a receiver to wait for a delivery it had just said could never
    // arrive. The `state` sentence stays: "Not marked delivered yet." is still true.
    note: tradeCancelled ? null : c.note,
    canMarkDelivered: c.canMarkDelivered && !tradeCancelled,
    canRespond: c.canRespond && !tradeCancelled,
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
