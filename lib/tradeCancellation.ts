// Pre-delivery cancellation state and copy for a confirmed barter trade. Pure logic, NO I/O —
// the same split as lib/obligationState.ts, lib/negotiationState.ts and lib/tradeActivity.ts,
// and for the same reason: these rules decide what a provider is told about an irreversible
// act, and they cannot be unit tested while they live inside a react-native component.
//
// AGREEMENT-LEVEL, NOT OBLIGATION-LEVEL. Cancelling ends the trade; it says nothing about
// whether either side fulfilled anything. No copy here may imply an outcome, a verdict, a
// dispute, a review or an adjudication — none of which exist (PD-046 leaves them to later
// slices).
//
// TWO EXPLICIT ACTS. Mutual cancellation is never inferred — not from silence, not from a
// timeout, not from one participant acting. It is recorded only when BOTH participants have
// each taken their own action, and the second never erases the first.

/**
 * What the server reports about cancellation, from the viewer's side of the trade.
 *
 * Deliberately no actor id: a viewer learns whether THEY acted and whether the other provider
 * did, which is everything the copy needs. Exposing raw participant ids would put an internal
 * identifier on a screen for no gain.
 */
export interface CancellationFacts {
  /** This viewer has recorded their own cancellation. */
  iCancelled: boolean
  /** The other provider has recorded theirs. */
  theyCancelled: boolean
  /** When the FIRST of the two acts was recorded. Null when neither has. */
  cancelledAt: string | null
}

/**
 * TOTAL over what can be true of two independent acts. `mutual` requires both — there is no
 * branch that reaches it from one act plus anything else.
 */
export type CancellationState = 'none' | 'byYou' | 'byThem' | 'mutual'

/**
 * The classification depends on the two acts and nothing else, so it asks for exactly those.
 * Narrower than `CancellationFacts` on purpose: callers that hold only the two booleans (a
 * Trade Activity row, a feed card) can share this predicate instead of re-spelling the truth
 * table, which is how a second, uncheckable copy of it appears.
 */
export function cancellationState(
  f: { iCancelled: boolean; theyCancelled: boolean },
): CancellationState {
  if (f.iCancelled && f.theyCancelled) return 'mutual'
  if (f.iCancelled) return 'byYou'
  if (f.theyCancelled) return 'byThem'
  return 'none'
}

/** Is this trade cancelled at all? One act is enough — see CANCELLED_COPY. */
export function isCancelled(f: { iCancelled: boolean; theyCancelled: boolean }): boolean {
  return cancellationState(f) !== 'none'
}

/**
 * TOTAL over the state vocabulary. A fifth state is a compile error rather than a silent
 * fallthrough to whatever the last branch said.
 *
 * `byThem` and `mutual` are the two that must not be collapsed: "they cancelled" and "you both
 * cancelled" are different facts about who agreed to what, and the second is the one a
 * participant may later be asked to stand behind.
 */
const CANCELLED_COPY: Record<
  CancellationState,
  { headline: string; detail: string; timeLabel: string | null }
> = {
  none: { headline: '', detail: '', timeLabel: null },
  byYou: {
    headline: 'Trade cancelled',
    detail: 'You cancelled this trade. Neither of you can deliver against it now.',
    timeLabel: 'Cancelled',
  },
  byThem: {
    headline: 'Trade cancelled',
    detail:
      'The other provider cancelled this trade. Neither of you can deliver against it now.'
      + ' You can record that you agree, which marks it as cancelled by both of you.',
    timeLabel: 'Cancelled',
  },
  mutual: {
    headline: 'Trade cancelled',
    detail: 'This trade was mutually cancelled. Neither of you can deliver against it now.',
    // Names WHICH act the one timestamp refers to. On a mutual cancellation the stamp is the
    // first of the two, and "Cancelled <t>" would leave a reader guessing whose act it was.
    timeLabel: 'First cancelled',
  },
}

export interface CancellationView {
  state: CancellationState
  /**
   * Empty when nothing is cancelled.
   *
   * The negotiation screen does NOT render this — `negotiationView` owns the page headline for
   * every state, including `cancelled`, so rendering both would print "Trade cancelled" twice.
   * It is kept for surfaces that have no negotiation state to compose with.
   */
  headline: string
  detail: string
  /**
   * When the FIRST act was recorded, and what to call it.
   *
   * `cancelledAt` is `min(created_at)` server-side, so on a mutually cancelled trade it names
   * the act that ENDED the trade, not the later assent. Labelling it "Cancelled" there would be
   * ambiguous about which of the two acts it meant, so the label changes with the state.
   * Both are null when nothing is cancelled.
   */
  cancelledAt: string | null
  timeLabel: string | null
  /**
   * May the viewer start a cancellation? Only before ANY delivery, and only if they have not
   * already acted. The server re-checks both and refuses regardless of what is rendered.
   */
  canCancel: boolean
  /**
   * May the viewer record that they agree with a cancellation the other provider started?
   *
   * A SECOND act, not a re-cancellation and not a reopening. It is the only route to
   * "mutually cancelled", which is why it is offered at all.
   */
  canAgree: boolean
}

/**
 * @param anyDelivered has EITHER obligation been marked delivered? Once one has, PD-046
 * removes the ordinary exit permanently — and a later "didn't receive" does not bring it back,
 * which is why this asks about delivery rather than about the receiver's answer.
 */
export function cancellationView(
  f: CancellationFacts,
  anyDelivered: boolean,
): CancellationView {
  const state = cancellationState(f)
  const copy = CANCELLED_COPY[state]
  return {
    state,
    headline: copy.headline,
    detail: copy.detail,
    // Read from the facts rather than ignored: the field was on the interface, supplied at
    // every call site, and used by nothing — so the screen was reaching around the module for
    // it, which is how the label ended up authored in JSX.
    cancelledAt: state === 'none' ? null : f.cancelledAt,
    timeLabel: copy.timeLabel,
    canCancel: !anyDelivered && state === 'none',
    // Still gated on `anyDelivered`, even though the counterparty's act already proves nothing
    // had been delivered when they took it: this function must not depend on that inference
    // staying true, and a control the server would refuse must never be rendered.
    canAgree: !anyDelivered && state === 'byThem',
  }
}

export interface CancelActionCopy {
  title: string
  body: string
  confirmLabel: string
  cancelLabel: string
}

// Says what is lost and what is not.
//
// The other provider IS told, as of 20261007000000/20261008000000: cancelling writes a durable
// platform notice into the pair's existing conversation, which raises their unread count and
// appears in the in-app notifications list. No push, device notification or email is sent —
// PD-059 is unchanged — and the free-text reason is NOT in that notice.
//
// The copy below still does not PROMISE any of this, deliberately: the notice is best-effort
// by construction (it may be suppressed if the thread cannot take it, and must never veto the
// cancellation), so promising delivery at the moment of an irreversible act would be a
// guarantee the server does not make.
export const CANCEL_TRADE_COPY: CancelActionCopy = {
  title: 'Cancel this trade?',
  body:
    'Once cancelled, neither of you can deliver against this trade, and it cannot be'
    + ' restarted. The agreed terms and this trade’s history are kept. This cannot be'
    + ' undone.',
  confirmLabel: 'Cancel trade',
  cancelLabel: 'Keep trade',
}

export const AGREE_TO_CANCEL_COPY: CancelActionCopy = {
  title: 'Agree to cancel?',
  body:
    'The other provider has already cancelled, so this trade is over either way. Recording'
    + ' that you agree marks it as cancelled by both of you. This cannot be undone.',
  confirmLabel: 'Agree to cancel',
  cancelLabel: 'Not now',
}

/** The longest reason the server will accept. Mirrored so the UI can refuse early. */
export const MAX_CANCEL_REASON = 200

export const CANCEL_REASON_PLACEHOLDER = 'Reason (optional)'

/**
 * What happens to the reason, disclosed BEFORE the writer commits to it.
 *
 * Founder ruling on PR #58: the reason is participant-visible context and IS shared with the
 * other provider. The read policy was always agreement-scoped, so this states the boundary
 * rather than promising against it — an earlier draft said "The other provider is not shown
 * this", which was an assurance the data boundary never kept.
 *
 * Rendered above the input, not after it: a disclosure a provider reads only after submitting
 * an irreversible act is not a disclosure. It does NOT appear in the conversation system
 * message — that surface says only that the trade was cancelled.
 */
export const CANCEL_REASON_NOTE = 'Optional reason — shared with the other provider.'

/**
 * Mirror of the server's only rule about the reason, so the UI can refuse with a sentence a
 * provider can act on rather than surfacing a database refusal. Returns null when sendable.
 *
 * The reason is OPTIONAL and free text. There is deliberately no taxonomy: PD-046 asks for
 * "an optional reason", and a fixed list of codes would be product vocabulary nobody has
 * decided.
 */
export function validateCancelReason(reason: string): string | null {
  if (reason.trim().length > MAX_CANCEL_REASON) {
    return `Keep the reason under ${MAX_CANCEL_REASON} characters.`
  }
  return null
}

/** Trimmed here so what is stored is what the writer saw. Empty means no reason given. */
export function cancelReasonPayload(reason: string): string | null {
  const trimmed = reason.trim()
  return trimmed.length === 0 ? null : trimmed
}


/**
 * The reasons to show on a cancelled trade, in the viewer's terms.
 *
 * TOTAL over what can exist: each participant may have written one, either may have written
 * none, and a reason exists only where its act does. Returned as a list so a screen renders
 * whatever is there without re-deriving whose is whose — the attribution is the part a screen
 * gets wrong, and putting the wrong name on someone's stated reason for abandoning a
 * commitment is the worst version of that mistake.
 *
 * NOT a verdict. These are statements two providers made, not findings about either of them:
 * no fault, no reliability judgment, no no-show determination and no adjudication is implied
 * or exists. The labels say who SAID it, never who was right.
 */
export function cancellationReasons(
  f: { iCancelled: boolean; theyCancelled: boolean },
  myReason: string | null,
  theirReason: string | null,
): { key: 'mine' | 'theirs'; label: string; reason: string }[] {
  const out: { key: 'mine' | 'theirs'; label: string; reason: string }[] = []
  // Gated on the ACT, not on the text alone: a reason without its act would be a row the
  // server should never have produced, and rendering it would attribute a statement to
  // someone who never made one.
  if (f.iCancelled && myReason && myReason.trim().length > 0) {
    out.push({ key: 'mine', label: 'You said', reason: myReason.trim() })
  }
  if (f.theyCancelled && theirReason && theirReason.trim().length > 0) {
    out.push({ key: 'theirs', label: 'The other provider said', reason: theirReason.trim() })
  }
  return out
}
