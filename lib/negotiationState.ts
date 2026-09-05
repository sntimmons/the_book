// Barter negotiation state and copy. Pure logic, NO I/O — same split as lib/tradeActivity.ts
// and lib/barterErrors.ts, and for the same reason: these rules decide what a provider is told
// about an irreversible-feeling exchange, and they cannot be unit tested while they live inside
// a react-native component.
//
// USER LANGUAGE, NOT SCHEMA LANGUAGE. Nothing here says version, row, superseded or current
// version pointer. A provider is negotiating a trade, not operating a database: terms were
// "changed", an offer is "waiting on you", history is "what was proposed before".

import type { TradeRole } from './tradeActivity'

/**
 * The viewer's role in a negotiation, as the server reports it. The SAME union as Trade
 * Activity's — one declaration, re-exported here so a screen takes it from either module and a
 * third role value cannot be added to one copy and not the other.
 */
export type { TradeRole } from './tradeActivity'
/** @deprecated Use TradeRole. Kept as an alias so no call site is broken by the rename. */
export type TradeSide = TradeRole

/**
 * Which side of the trade a term belongs to. A FIXED label the server assigns — the client
 * never sends it. A client that could choose the side could swap who gives what, so the
 * authoritative record of the trade would come from the party with most reason to get it
 * wrong.
 */
export type ProposalSide = 'offer_owner' | 'responder'

export function sideForRole(role: TradeSide): ProposalSide {
  return role === 'owner' ? 'offer_owner' : 'responder'
}

/**
 * What the client submits: CONTENT for both sides, nothing about identity. Exactly two directed
 * terms per version — one for what the offer owner gives, one for what the responder gives.
 * Complex packages live inside a side's description. No value field: barter requires no dollar
 * equivalence and an unused authoritative field would imply a meaning it does not have.
 */
export interface ProposalDraft {
  ownerGives: string
  responderGives: string
}

/**
 * The negotiation as the viewer experiences it.
 *
 * `bothAccepted` records that both providers accepted the same current terms. It does not
 * itself mean an agreement exists: finalization creates `agreementId`, while obligation and
 * fulfilment remain later slices. Copy may call a trade confirmed only when `agreementId`
 * exists, and must still not call it booked, complete or fulfilled.
 */
export interface NegotiationFacts {
  /** From the underlying interest: 'accepted' is live, anything else has ended. */
  interestStatus: 'pending' | 'accepted' | 'declined' | 'released'
  iAcceptedCurrent: boolean
  theyAcceptedCurrent: boolean
  bothAccepted: boolean
  /**
   * Did BOTH providers ever accept the same version, at any point in this negotiation?
   *
   * Separate from `bothAccepted`, which is about the terms on the table NOW. An ended
   * negotiation that once reached agreement must not be described as one where nothing was
   * agreed — that is the record most likely to matter in a disagreement, and it would be the
   * one that is wrong.
   */
  everBothAccepted: boolean
  /**
   * An official agreement exists for this negotiation. DISTINCT from `bothAccepted`: both
   * accepting the same current terms is "ready to confirm"; this is "confirmed". No copy may
   * treat the first as the second.
   */
  agreementId: string | null
}

export type NegotiationState =
  | 'ended'
  | 'confirmed'
  | 'agreed'
  | 'awaitingThem'
  | 'awaitingYou'
  | 'awaitingBoth'

export interface NegotiationView {
  state: NegotiationState
  headline: string
  detail: string
  /** May the viewer send new terms? */
  canPropose: boolean
  /** May the viewer accept the terms currently on the table? */
  canAccept: boolean
  /** May the viewer make the agreement official? Only when both accepted the current terms. */
  canConfirm: boolean
}

export interface ConfirmTradeCopy {
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
}

export const CONFIRM_TRADE_COPY: ConfirmTradeCopy = {
  title: 'Confirm this trade?',
  body:
    'This makes the terms you both accepted official. They can no longer be changed, and the'
    + ' post comes off the board for good. The current beta does not yet include an in-app'
    + ' way to cancel or end a trade after this step.',
  confirmLabel: 'Confirm trade',
  cancelLabel: 'Not yet',
}

/**
 * TOTAL over the state vocabulary. A sixth state is a compile error rather than a silent
 * fallthrough to whatever the last branch said — the defect class that produced every copy
 * finding on the Trade Activity surface.
 */
const STATE_COPY: Record<NegotiationState, { headline: string; detail: string }> = {
  ended: {
    headline: 'This negotiation ended',
    // Filled in by negotiationView, because what is true here depends on whether the two of
    // you ever accepted the same terms.
    detail: '',
  },
  confirmed: {
    headline: 'Trade confirmed',
    // Beta-safe: confirmed, not booked / complete / fulfilled / delivered / guaranteed. No
    // obligation, delivery or completion model exists; this records that the agreement is
    // official and that its terms can no longer change.
    detail:
      'These terms are now the agreed trade and can no longer be changed. Arrange the details'
      + ' in your conversation.',
  },
  agreed: {
    headline: 'Ready to confirm trade',
    detail:
      // Deliberately NOT "your trade is booked" or "agreement complete". Both providers
      // accepting is recorded; turning that into an official agreement is not built yet, and
      // saying otherwise would promise something the app cannot do.
      'You both accepted these terms. Either of you can confirm to make the trade official —'
      + ' until then, either of you can still send different terms or end this, which withdraws'
      + ' what you have both accepted.',
  },
  awaitingThem: {
    headline: 'Waiting on the other provider',
    detail: 'You have accepted these terms. They have not yet.',
  },
  awaitingYou: {
    headline: 'Waiting on you',
    detail: 'The other provider has accepted these terms. Accept to agree, or send changes.',
  },
  awaitingBoth: {
    headline: 'These terms are on the table',
    detail: 'Neither of you has accepted them yet.',
  },
}

export function negotiationView(f: NegotiationFacts): NegotiationView {
  const live = f.interestStatus === 'accepted'
  const confirmed = f.agreementId !== null
  const state: NegotiationState = !live
    ? 'ended'
    : confirmed
      ? 'confirmed'
      : f.bothAccepted
      ? 'agreed'
      : f.iAcceptedCurrent
        ? 'awaitingThem'
        : f.theyAcceptedCurrent
          ? 'awaitingYou'
          : 'awaitingBoth'

  const detail =
    state === 'ended'
      ? f.everBothAccepted
        ? 'You had both accepted terms, and the negotiation was then ended. Those terms are '
          + 'kept here as history.'
        : 'No terms were agreed. What was proposed is kept here as history.'
      : STATE_COPY[state].detail

  return {
    state,
    headline: STATE_COPY[state].headline,
    detail,
    // A dead negotiation accepts nothing. The server refuses both independently; this only
    // decides whether to render a control that would otherwise be refused.
    // A confirmed trade's terms are frozen; the server refuses a counter or acceptance too.
    canPropose: live && !confirmed,
    canAccept: live && !confirmed && !f.iAcceptedCurrent,
    canConfirm: live && !confirmed && f.bothAccepted,
  }
}

/**
 * Should this viewer be told their earlier acceptance stopped counting?
 *
 * Keyed on whether THEY accepted an earlier set of terms and have not accepted the current
 * ones. The condition lived inline in the screen and was wrong in both directions: it fired for
 * anyone whenever ANY earlier version had ANY acceptance — so it told the person who had just
 * countered that their acceptance lapsed, when they had never accepted — and it was suppressed
 * whenever the other provider had accepted the new terms, which is exactly the person whose
 * acceptance actually did lapse.
 */
/**
 * Did this viewer accept a version that is no longer the current one?
 *
 * Extracted from the screen so it can be tested: the whole lapsed-acceptance rule rests on it,
 * and while it lived inline in JSX nothing could assert it.
 */
export function acceptedAnEarlierVersion(
  versions: { id: string; acceptedBy: string[] }[],
  currentVersionId: string | null,
  userId: string | null,
): boolean {
  if (!userId) return false
  return versions.some((v) => v.id !== currentVersionId && v.acceptedBy.includes(userId))
}

export function shouldShowTermsChangedNote(f: {
  interestStatus: NegotiationFacts['interestStatus']
  iAcceptedAnEarlierVersion: boolean
  iAcceptedCurrent: boolean
}): boolean {
  if (f.interestStatus !== 'accepted') return false
  return f.iAcceptedAnEarlierVersion && !f.iAcceptedCurrent
}

/** Copy for the moment terms change under someone. */
export const TERMS_CHANGED_NOTE =
  'The terms changed after you accepted, so your acceptance no longer applies. Read the new'
  + ' terms and accept again if you agree.'

export const MAX_DESCRIPTION = 200

/**
 * Mirror of the server's rules, so the UI can refuse early with a sentence a provider can act
 * on rather than surfacing a database refusal. The server remains the authority.
 * Returns null when the draft is sendable.
 */
export function validateDraft(d: ProposalDraft): string | null {
  const owner = d.ownerGives.trim()
  const responder = d.responderGives.trim()
  if (owner.length === 0 && responder.length === 0) {
    return 'Say what each of you is giving.'
  }
  // Named the way the inputs are labelled, so the reader is not asked to translate between
  // "the provider who posted" and "You give" / "They give".
  if (owner.length === 0) return 'Fill in what the provider who posted the offer gives.'
  if (responder.length === 0) return 'Fill in what the responding provider gives.'
  if (owner.length > MAX_DESCRIPTION || responder.length > MAX_DESCRIPTION) {
    return `Keep each side under ${MAX_DESCRIPTION} characters.`
  }
  return null
}

/** Trimmed here so the stored term is what the reader saw. */
export function draftPayload(d: ProposalDraft) {
  return { p_owner_gives: d.ownerGives.trim(), p_responder_gives: d.responderGives.trim() }
}

/** Whose side a term is on, in the viewer's own terms. */
export function sideLabel(side: ProposalSide, myRole: TradeSide): string {
  return side === sideForRole(myRole) ? 'You give' : 'They give'
}
