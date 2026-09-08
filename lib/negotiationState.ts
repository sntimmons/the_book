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
  ownerDueAt: string
  ownerScheduledAt: string
  responderGives: string
  responderDueAt: string
  responderScheduledAt: string
}

/**
 * The negotiation as the viewer experiences it.
 *
 * `bothAccepted` records that both providers accepted the same current terms. It does not
 * itself mean an agreement exists: finalization creates `agreementId`, which in turn creates
 * the two obligations that delivery and receipt then run against (see `lib/obligationState.ts`).
 * Copy may call a trade confirmed only when `agreementId` exists, and must still not call it
 * booked, complete or fulfilled — no completion model exists at either level.
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
  /**
   * Has either participant cancelled the confirmed trade?
   *
   * REQUIRED, not optional. This module is total over its state vocabulary precisely so a new
   * state cannot fall through silently — and an optional flag defaulting to false would
   * reintroduce exactly that: a caller who forgot to thread it would get "Trade confirmed" on
   * a cancelled trade with no type error. Who cancelled, and what to say about it, belong to
   * `lib/tradeCancellation.ts`; this only decides that the trade is no longer live.
   */
  tradeCancelled: boolean
  /**
   * How far the two obligations have been resolved (PD-070).
   *
   * REQUIRED, and for exactly the reason `tradeCancelled` above is: an optional field defaulting
   * to 'none' would let a caller who forgot to thread it render "Arrange the details in your
   * conversation." over a trade an operator has already closed — which is the defect this field
   * was added to fix, reintroduced silently and with no type error.
   *
   * Callers pass `agreementResolution(...)` from `lib/obligationState.ts`. 'none' IS the
   * fail-closed value: a read that did not land looks exactly like a trade where nothing is
   * resolved, and assuming nothing has been decided is the withholding direction.
   */
  resolution: AgreementResolution
  /**
   * Client-side display fact for the terms currently on screen. The database remains the
   * authority and re-checks this at accept/finalize time; this only prevents a stale screen
   * from inviting an action the server will permanently refuse.
   */
  currentTermsStillValid?: boolean
}

/**
 * How far the trade's two obligations have been resolved, as far as AGREEMENT-level copy needs
 * to care. Derived, never stored (PD-070).
 *
 * THE TYPE LIVES HERE AND THE DERIVATION LIVES IN `lib/obligationState.ts`, and the split is
 * forced rather than stylistic: that module already imports this one, so the outcome vocabulary
 * cannot be imported back without a cycle. This module therefore knows how far along the trade
 * is and stays ignorant of what the outcomes were — which is also the right division, because
 * naming an outcome is the obligation card's job and never the banner's.
 *
 * DELIBERATELY FOUR VALUES, NOT AN OUTCOME PAIR. A banner that switched on all nine combinations
 * would be a second place stating verdicts, and PD-070 exists to stop the product inventing a
 * trade-level verdict at all.
 */
export type AgreementResolution =
  /** Nothing resolved — or not known to be, which is the same thing here. */
  | 'none'
  /** One obligation carries a terminal outcome; the other is still live. */
  | 'partial'
  /** Both resolved, and BOTH fulfilled — the one combination a single sentence cannot distort. */
  | 'allFulfilled'
  /** Both resolved, in any other combination. States that, and names no verdict. */
  | 'allResolved'

export type NegotiationState =
  | 'ended'
  | 'cancelled'
  | 'confirmed'
  | 'agreed'
  | 'awaitingThem'
  | 'awaitingYou'
  | 'awaitingBoth'

export interface NegotiationView {
  state: NegotiationState
  headline: string
  detail: string
  /**
   * What to call the terms card on this screen.
   *
   * IN the total Record, never a ternary beside the JSX. The ternary this replaced was total
   * over only two of the seven states, so `cancelled` fell through to the pre-agreement label
   * and told a provider the terms of a dead trade were "On the table now". A new state is now
   * a compile error here, which is the whole reason this module exists.
   */
  termsTitle: string
  /** May the viewer send new terms? */
  canPropose: boolean
  /** May the viewer accept the terms currently on the table? */
  canAccept: boolean
  /** May the viewer make the agreement official? Only when both accepted the current terms. */
  canConfirm: boolean
  /** The current terms need updated timing before accept/confirm can continue. */
  timingExpired: boolean
}

export interface ConfirmTradeCopy {
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
}

export const CONFIRM_TRADE_COPY: ConfirmTradeCopy = {
  title: 'Confirm this trade?',
  // The last clause used to read "The current beta does not yet include an in-app way to cancel
  // or end a trade after this step." Pre-delivery cancellation now exists, so that sentence had
  // become the opposite of the truth — told to a provider at the moment they take an
  // irreversible action, which is the worst place in the product to be wrong. What replaces it
  // states the rule that IS true, including where the exit stops (PD-046 § 7.2/7.3).
  body:
    'This makes the terms you both accepted official. They can no longer be changed, and the'
    + ' post comes off the board for good. Either of you can still cancel the trade until one'
    + ' of you marks something delivered — after that, cancelling is no longer available.',
  confirmLabel: 'Confirm trade',
  cancelLabel: 'Not yet',
}

export const TERMS_EXPIRED_NOTE =
  'These trade terms have expired. Update the timing before continuing.'

/**
 * TOTAL over the state vocabulary. A sixth state is a compile error rather than a silent
 * fallthrough to whatever the last branch said — the defect class that produced every copy
 * finding on the Trade Activity surface.
 */
/**
 * The confirmed-trade sentence, chosen by how far the obligations have been resolved.
 *
 * TOTAL over `AgreementResolution`, so a fifth value is a compile error rather than a silent
 * fallthrough — the same discipline `STATE_COPY` uses.
 *
 * WHAT EVERY LINE HERE MUST AVOID, because each was a real way to get this wrong:
 *   * INSTRUCTING WHEN NOTHING REMAINS. "Arrange the details in your conversation." over a trade
 *     whose obligations were both resolved `unfulfilled` told two providers to go and arrange a
 *     trade an operator had just concluded did not happen. That is the defect this table fixes.
 *   * INVENTING A VERDICT. No line says Completed, Partially Fulfilled or Not Completed. Those
 *     do not exist (PD-065, PD-070), and `allResolved` deliberately reports THAT both were
 *     reviewed rather than WHAT was found — the outcome belongs to the obligation card, once.
 *   * TURNING A CLOSURE INTO A FINDING. *Closed without resolution* means the information did
 *     not support either answer. `Fulfilled + Closed` must never read as "Partially Fulfilled"
 *     (which asserts the other side was found unfulfilled), and `Closed + Closed` must never
 *     read as "Not Completed" (which asserts performance failed). Both land in `allResolved`,
 *     which asserts neither.
 *   * BLAMING. No sentence has a provider as its subject.
 *
 * `allFulfilled` is the ONE case given its own sentence, because it is the only combination
 * where a summary cannot distort what was found.
 */
const CONFIRMED_DETAIL: Record<AgreementResolution, string> = {
  none:
    'These terms are now the agreed trade and can no longer be changed. Arrange the details'
    + ' in your conversation.',
  partial:
    'These terms are now the agreed trade and can no longer be changed. One side has been'
    + ' reviewed. What is still outstanding is shown below.',
  allFulfilled:
    'These terms are now the agreed trade and can no longer be changed. Both sides were'
    + ' reviewed and fulfilled. Nothing further is needed.',
  allResolved:
    'These terms are now the agreed trade and can no longer be changed. Both sides have been'
    + ' reviewed. The outcome for each is shown below.',
}

const STATE_COPY: Record<
  NegotiationState,
  { headline: string; detail: string; termsTitle: string }
> = {
  ended: {
    headline: 'This negotiation ended',
    termsTitle: 'The last terms proposed',
    // Filled in by negotiationView, because what is true here depends on whether the two of
    // you ever accepted the same terms.
    detail: '',
  },
  cancelled: {
    headline: 'Trade cancelled',
    // NOT 'On the table now'. Nothing is on the table: the terms card on a cancelled trade
    // carries the "Cancelled <time>" stamp three lines below this title, and the pre-agreement
    // label directly contradicted it on the one screen that must be unambiguous about whether
    // a commitment is live. The terms themselves are kept, so they are named as history.
    termsTitle: 'The terms that were agreed',
    // Deliberately EMPTY. Which participant cancelled, and whether both did, is per-viewer copy
    // owned by `lib/tradeCancellation.ts`; duplicating a second version of it here is how the
    // two would drift and start contradicting each other on the same screen.
    detail: '',
  },
  confirmed: {
    headline: 'Trade confirmed',
    termsTitle: 'The agreed terms',
    // Beta-safe: confirmed, not booked / complete / fulfilled / guaranteed. This is the
    // AGREEMENT's state and it stays "Trade confirmed" for the whole life of the trade.
    //
    // Obligations underneath have their own delivery, receipt, no-show, Under Review and
    // terminal-outcome lifecycle. NONE of it rolls up into a stored agreement verdict (PD-070):
    // there is no Completed, no Partially Fulfilled and no Not Completed anywhere in this
    // product. What each side owes, has delivered, has confirmed, has reported and was resolved
    // as is said per obligation, by `lib/obligationState.ts`.
    //
    // EMPTY, like `cancelled` above and for the same reason: the sentence depends on how far the
    // obligations have been resolved, so it is chosen by `CONFIRMED_DETAIL` in `negotiationView`
    // rather than being a constant here that four cases would have to contradict.
    detail: '',
  },
  agreed: {
    termsTitle: 'On the table now',
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
    termsTitle: 'On the table now',
    headline: 'Waiting on the other provider',
    detail: 'You have accepted these terms. They have not yet.',
  },
  awaitingYou: {
    termsTitle: 'On the table now',
    headline: 'Waiting on you',
    detail: 'The other provider has accepted these terms. Accept to agree, or send changes.',
  },
  awaitingBoth: {
    termsTitle: 'On the table now',
    headline: 'These terms are on the table',
    detail: 'Neither of you has accepted them yet.',
  },
}

export function negotiationView(f: NegotiationFacts): NegotiationView {
  const live = f.interestStatus === 'accepted'
  const confirmed = f.agreementId !== null
  const timingExpired = live && !confirmed && f.currentTermsStillValid === false
  const state: NegotiationState = !live
    ? 'ended'
    : confirmed
      ? f.tradeCancelled
        ? 'cancelled'
        : 'confirmed'
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
      : state === 'confirmed'
        // DERIVED, NOT STORED (PD-070). The agreement has no terminal outcome of its own; this
        // reads the resolution state of its two obligations and says only what that supports.
        ? CONFIRMED_DETAIL[f.resolution]
        : STATE_COPY[state].detail

  return {
    state,
    headline: STATE_COPY[state].headline,
    termsTitle: STATE_COPY[state].termsTitle,
    detail: timingExpired
      ? 'The timing on these terms has passed. Send different terms with updated timing to continue.'
      : detail,
    // A dead negotiation accepts nothing. The server refuses both independently; this only
    // decides whether to render a control that would otherwise be refused.
    // A confirmed trade's terms are frozen; the server refuses a counter or acceptance too.
    // A cancelled trade is confirmed too, so `confirmed` already closes all three. Spelled
    // against `confirmed` rather than the state so a future state cannot quietly reopen them.
    canPropose: live && !confirmed,
    canAccept: live && !confirmed && !timingExpired && !f.iAcceptedCurrent,
    canConfirm: live && !confirmed && !timingExpired && f.bothAccepted,
    timingExpired,
  }
}

export function termsTimingStillValid(
  terms: { dueAt: string; scheduledAt: string | null }[],
  now = Date.now(),
): boolean {
  return terms.every((t) => {
    const dueAt = Date.parse(t.dueAt)
    if (!Number.isFinite(dueAt) || dueAt <= now) return false
    if (t.scheduledAt === null) return true
    const scheduledAt = Date.parse(t.scheduledAt)
    return Number.isFinite(scheduledAt) && scheduledAt > now
  })
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

/**
 * Composer field placeholders, exported for the same reason `CANCEL_REASON_PLACEHOLDER` is:
 * a test that selects a field has to name it, and naming it by an inline example DATE means the
 * test breaks — pointing at nothing useful — the day someone refreshes the example.
 */
export const TERMS_PLACEHOLDERS = {
  gives: 'What is provided',
  dueAt: '2026-10-15 5:00 PM',
  scheduledAt: '2026-10-10 2:00 PM',
} as const

export const MAX_DESCRIPTION = 200

function parseDraftTime(value: string): number | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  const time = Date.parse(trimmed)
  return Number.isFinite(time) ? time : null
}

function toIsoOrNull(value: string): string | null {
  const time = parseDraftTime(value)
  return time === null ? null : new Date(time).toISOString()
}

/**
 * Mirror of the server's rules, so the UI can refuse early with a sentence a provider can act
 * on rather than surfacing a database refusal. The server remains the authority.
 * Returns null when the draft is sendable.
 */
export function validateDraft(d: ProposalDraft): string | null {
  const owner = d.ownerGives.trim()
  const responder = d.responderGives.trim()
  const ownerDue = parseDraftTime(d.ownerDueAt)
  const responderDue = parseDraftTime(d.responderDueAt)
  const ownerScheduled = parseDraftTime(d.ownerScheduledAt)
  const responderScheduled = parseDraftTime(d.responderScheduledAt)
  const now = Date.now()
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
  if (ownerDue === null || responderDue === null) {
    return 'Add a due date for each side.'
  }
  if (ownerDue <= now || responderDue <= now) {
    return 'Due dates must be in the future.'
  }
  if (d.ownerScheduledAt.trim() && ownerScheduled === null) {
    return 'Use a valid scheduled time for the provider who posted the offer.'
  }
  if (d.responderScheduledAt.trim() && responderScheduled === null) {
    return 'Use a valid scheduled time for the responding provider.'
  }
  if (
    (ownerScheduled !== null && ownerScheduled <= now)
    || (responderScheduled !== null && responderScheduled <= now)
  ) {
    return 'Scheduled times must be in the future.'
  }
  if (
    (ownerScheduled !== null && ownerScheduled > ownerDue)
    || (responderScheduled !== null && responderScheduled > responderDue)
  ) {
    return 'Scheduled times must be on or before the due date.'
  }
  return null
}

/** Trimmed here so the stored term is what the reader saw. */
export function draftPayload(d: ProposalDraft) {
  return {
    p_owner_gives: d.ownerGives.trim(),
    p_owner_due_at: toIsoOrNull(d.ownerDueAt),
    p_owner_scheduled_at: toIsoOrNull(d.ownerScheduledAt),
    p_responder_gives: d.responderGives.trim(),
    p_responder_due_at: toIsoOrNull(d.responderDueAt),
    p_responder_scheduled_at: toIsoOrNull(d.responderScheduledAt),
  }
}

/** Whose side a term is on, in the viewer's own terms. */
export function sideLabel(side: ProposalSide, myRole: TradeSide): string {
  return side === sideForRole(myRole) ? 'You give' : 'They give'
}
