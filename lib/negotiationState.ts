// Barter negotiation state and copy. Pure logic, NO I/O — same split as lib/tradeActivity.ts
// and lib/barterErrors.ts, and for the same reason: these rules decide what a provider is told
// about an irreversible-feeling exchange, and they cannot be unit tested while they live inside
// a react-native component.
//
// USER LANGUAGE, NOT SCHEMA LANGUAGE. Nothing here says version, row, superseded or current
// version pointer. A provider is negotiating a trade, not operating a database: terms were
// "changed", an offer is "waiting on you", history is "what was proposed before".

/** Which side of the trade provides a term. */
export type TradeSide = 'owner' | 'responder'

export interface TermInput {
  providedBy: TradeSide
  serviceDescription: string
  /** Optional rough value, in whole dollars. Never a price — barter takes no cash. */
  estimatedValue: number | null
}

/**
 * The negotiation as the viewer experiences it.
 *
 * `bothAccepted` is the SEAM to the next slice: it records that both providers accepted the
 * same terms. It does not mean an agreement exists — no agreement, obligation or fulfilment
 * model is built yet — so no copy here may call a trade final, booked, or owed.
 */
export interface NegotiationFacts {
  /** From the underlying interest: 'accepted' is live, anything else has ended. */
  interestStatus: 'pending' | 'accepted' | 'declined' | 'released'
  iAcceptedCurrent: boolean
  theyAcceptedCurrent: boolean
  bothAccepted: boolean
  /** True when the newest terms are the viewer's own. */
  iAuthoredCurrent: boolean
}

export type NegotiationState =
  | 'ended'
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
}

/**
 * TOTAL over the state vocabulary. A sixth state is a compile error rather than a silent
 * fallthrough to whatever the last branch said — the defect class that produced every copy
 * finding on the Trade Activity surface.
 */
const STATE_COPY: Record<NegotiationState, { headline: string; detail: string }> = {
  ended: {
    headline: 'This negotiation ended',
    detail:
      'No terms were agreed. What was proposed is kept here as history.',
  },
  agreed: {
    headline: 'You both accepted these terms',
    detail:
      // Deliberately NOT "your trade is booked" or "agreement complete". Both providers
      // accepting is recorded; turning that into an official agreement is not built yet, and
      // saying otherwise would promise something the app cannot do.
      'Neither of you has anything to confirm here yet. Work out the details in your'
      + ' conversation — the trade itself is arranged between you.',
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
  const state: NegotiationState = !live
    ? 'ended'
    : f.bothAccepted
      ? 'agreed'
      : f.iAcceptedCurrent
        ? 'awaitingThem'
        : f.theyAcceptedCurrent
          ? 'awaitingYou'
          : 'awaitingBoth'

  return {
    state,
    ...STATE_COPY[state],
    // A dead negotiation accepts nothing. The server refuses both independently; this only
    // decides whether to render a control that would otherwise be refused.
    canPropose: live,
    canAccept: live && !f.iAcceptedCurrent,
  }
}

/** Copy for the moment terms change under someone. */
export const TERMS_CHANGED_NOTE =
  'The terms changed after you accepted, so your acceptance no longer applies. Read the new'
  + ' terms and accept again if you agree.'

export const MIN_TERMS = 2
export const MAX_TERMS = 6
export const MAX_DESCRIPTION = 200

/**
 * Mirror of the server's term rules, so the UI can refuse early with a sentence a provider can
 * act on rather than surfacing a database refusal.
 *
 * The server remains the authority — `write_barter_proposal_terms` raises on every one of
 * these independently. Returns null when the terms are sendable.
 */
export function validateTerms(terms: TermInput[]): string | null {
  const filled = terms.filter((t) => t.serviceDescription.trim().length > 0)
  if (filled.length < MIN_TERMS) {
    return 'Say what each of you is giving — at least one thing from each side.'
  }
  if (filled.length > MAX_TERMS) {
    return `A proposal can have at most ${MAX_TERMS} items.`
  }
  if (!filled.some((t) => t.providedBy === 'owner')) {
    return 'Add what the provider who posted is giving.'
  }
  if (!filled.some((t) => t.providedBy === 'responder')) {
    return 'Add what the responding provider is giving.'
  }
  const tooLong = filled.find((t) => t.serviceDescription.trim().length > MAX_DESCRIPTION)
  if (tooLong) {
    return `Keep each item under ${MAX_DESCRIPTION} characters.`
  }
  const badValue = filled.find(
    (t) =>
      t.estimatedValue !== null
      && (!Number.isInteger(t.estimatedValue)
        || t.estimatedValue < 0
        || t.estimatedValue > 1000000),
  )
  if (badValue) {
    return 'An estimated value must be a whole number of dollars.'
  }
  return null
}

/** Shape the server expects. Trimmed here so the stored term is what the reader saw. */
export function termsPayload(terms: TermInput[]) {
  return terms
    .filter((t) => t.serviceDescription.trim().length > 0)
    .map((t) => ({
      provided_by: t.providedBy,
      service_description: t.serviceDescription.trim(),
      estimated_value: t.estimatedValue,
    }))
}

/** Whose side a term is on, in the viewer's own terms. */
export function sideLabel(side: TradeSide, myRole: TradeSide): string {
  return side === myRole ? 'You give' : 'They give'
}
