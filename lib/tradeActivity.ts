// Trade Activity vocabulary, copy and per-row capability. Pure logic, NO I/O — same split as
// lib/barterErrors.ts and lib/messageAuthorship.ts, and for the same reason: every defect this
// screen has produced was a COPY defect (a caption that contradicted the row beneath it, a note
// that instructed an action the screen could not perform, a claim that another provider had been
// chosen when nobody had been). Those rules cannot be unit-tested while they live inside a
// react-native component, so they live here instead.

import { cancellationState, isCancelled } from './tradeCancellation'
import type { CancellationState } from './tradeCancellation'

/**
 * The complete response vocabulary. Defined HERE, not in lib/barter.ts, so it and the rules
 * derived from it can be imported by a unit test: lib/barter.ts imports the Supabase client,
 * which makes every value in it untestable without live configuration. Re-exported from
 * lib/barter.ts, so existing import sites are unchanged.
 *
 * `released` — the pre-agreement negotiation ended (either party). History, never actionable.
 */
import type { ReceiverWindowState } from './obligationState'
import { NEEDS_ATTENTION_LABEL } from './obligationState'

export type BarterInterestStatus = 'pending' | 'accepted' | 'declined' | 'released'

export type TradeActivitySection = 'confirmed' | 'active' | 'pending' | 'ended' | 'notSelected'

/**
 * Which Trade Activity section a row belongs to. A label, not a status.
 *
 * NOTE the deliberate disagreement with INTEREST_STATUS_IS_LISTED, which excludes `declined`:
 * the owner's RESPONSES list drops declined rows because they are noise while choosing, but
 * Trade Activity is history and must account for every response the user sent or received. Two
 * total Records over one vocabulary, reaching different answers on purpose.
 */
/**
 * Section for a row. A confirmed trade's interest is still `accepted`, so the status alone
 * cannot place it; the agreement fact is what distinguishes negotiating from confirmed.
 */
export function tradeActivitySection(
  status: BarterInterestStatus,
  agreementId: string | null,
): TradeActivitySection {
  return agreementId !== null && status === 'accepted' ? 'confirmed' : TRADE_ACTIVITY_SECTION[status]
}

export const TRADE_ACTIVITY_SECTION: Record<BarterInterestStatus, TradeActivitySection> = {
  accepted: 'active',
  pending: 'pending',
  released: 'ended',
  declined: 'notSelected',
}

/** Who ended a negotiation. Mirrors the reasons release_barter_interest may record. */
export type BarterReleaseReason = 'responder_withdrew' | 'owner_ended_negotiation' | 'mutual_end'

export type TradeRole = 'owner' | 'responder'

/**
 * What the row lets the viewer DO.
 *
 * `answer` is the owner's accept/decline pair. It is granted from the OFFER's live state, not
 * from the status alone: a pending response on a still-active post that has merely fallen out
 * of the newest-50 feed must stay answerable, while a post the owner deliberately closed must
 * not be re-opened by answering one. The server holds the same rule
 * (barter_interests_zy_answer_open_offer), so this only decides whether to render a control
 * that would otherwise be refused.
 */
export type TradeRowAction = 'none' | 'end' | 'answer' | 'declineOnly'

export interface TradeRowFacts {
  status: BarterInterestStatus
  myRole: TradeRole
  offerIsActive: boolean
  releasedAt: string | null
  releaseReason: BarterReleaseReason | null
  /**
   * Does ANOTHER response to the same post already hold the negotiation slot?
   *
   * PD-049 allows exactly one accepted response per post, so while one is held every other
   * pending response is unanswerable — accepting it can only fail with "Already matched".
   * Without this fact the row said "Waiting on you to accept or decline." and offered Accept,
   * which is the caption-contradicts-capability defect this module exists to end. Derived from
   * the caller's own rows (the owner sees every response to their post), not from a new query.
   */
  offerHasAcceptedResponse: boolean
  /** An official agreement exists. The negotiation is a confirmed trade, not a live one. */
  agreementId: string | null
  /**
   * This viewer recorded their own pre-delivery cancellation of that agreement.
   *
   * REQUIRED, not optional. Optional here would mean a caller who forgets to thread it reports
   * a cancelled trade as "Trade confirmed" with no type error — in the one module whose stated
   * premise is that a missing case must be a compile error rather than a silent fallthrough.
   */
  iCancelled: boolean
  /** The other participant recorded theirs. Both true is "mutually cancelled". */
  theyCancelled: boolean
  /**
   * The window state of the obligation this viewer RECEIVES — i.e. their own action.
   *
   * Server-computed (`my_trade_activity.my_response_state`, itself derived from
   * `my_barter_obligations`). Each agreement has exactly two obligations and each participant
   * receives exactly one, so this is a single state, not a roll-up.
   *
   * Defaulted rather than required, unlike `iCancelled`/`theyCancelled`: a caller that has not
   * selected the column reports NO attention state, which is the fail-closed direction. Claiming
   * "Action needed" from a missing field would put a demand in front of a provider with nothing
   * behind it.
   */
  myResponseState?: ReceiverWindowState
  /** The window state of the obligation this viewer DELIVERS — i.e. waiting on the other side. */
  theirResponseState?: ReceiverWindowState
}

export interface TradeRowState {
  action: TradeRowAction
  /** The state of the row in the viewer's own terms. Never empty except on an active row. */
  note: string
  /**
   * A short badge for a row that needs someone's attention, or null.
   *
   * Separate from `note` so a screen can highlight the row without parsing prose, and so the
   * forbidden-vocabulary sweep has one string per state to check. Never set on a cancelled,
   * pending, released or declined row — only on a confirmed trade with a live or elapsed
   * response window.
   */
  attention: string | null
}

/**
 * Section captions, ROLE-NEUTRAL by construction.
 *
 * The previous version picked a caption from the MAJORITY role in the section, which made a
 * false statement about every minority row and contradicted the note printed directly beneath
 * it — a provider who both posts and responds produces mixed-role sections routinely, and a tie
 * resolved to 'responder', so a single response waiting on the owner was captioned as waiting on
 * someone else. Role is a property of a ROW, so role-specific truth is carried only by the row.
 */
export const SECTION_COPY: Record<
  TradeActivitySection,
  { title: string; caption: string; rank: number }
> = {
  confirmed: {
    // 'Confirmed trades' was the heading over a MIXED group: a cancelled trade stays here as
    // durable history, and the row's own note says so, but the section title above it said the
    // opposite. A heading is read before the rows under it, so the group is named for what its
    // members have in common — they were all made official — and the per-row state label is
    // left to say which of them is still live.
    title: 'Trades',
    caption: 'Trades you both made official.',
    rank: 0,
  },
  active: {
    title: 'Active negotiations',
    caption: 'You are working out the details of these.',
    rank: 1,
  },
  pending: {
    title: 'Pending',
    caption: 'Responses that have not been answered yet.',
    rank: 2,
  },
  ended: {
    title: 'Ended',
    caption: 'Negotiations that ended before a trade was agreed.',
    rank: 3,
  },
  notSelected: {
    title: 'Not selected',
    caption: 'Responses that were not taken forward.',
    rank: 4,
  },
}

/**
 * Render order, DERIVED from the total Record rather than hand-listed.
 *
 * A hand-written `TradeActivitySection[]` accepts a SUBSET, so a fifth section would compile
 * while its rows silently vanished from the list — reintroducing, on the screen built to stop
 * negotiations becoming unfindable, exactly that. Deriving it means a new section cannot be
 * added without a rank, and it is rendered the moment it exists.
 */
export const SECTION_ORDER: TradeActivitySection[] = (
  Object.keys(SECTION_COPY) as TradeActivitySection[]
).sort((a, b) => SECTION_COPY[a].rank - SECTION_COPY[b].rank)

/**
 * Who ended it, in the viewer's terms. TOTAL over the reason vocabulary, so a reason added
 * server-side is a compile error here rather than an unattributed "Negotiation ended".
 */
const RELEASE_ACTOR: Record<BarterReleaseReason, (role: TradeRole) => string> = {
  responder_withdrew: (role) =>
    role === 'responder' ? 'You ended this negotiation.' : 'The other provider ended this negotiation.',
  owner_ended_negotiation: (role) =>
    role === 'owner' ? 'You ended this negotiation.' : 'The other provider ended this negotiation.',
  mutual_end: () => 'This negotiation ended.',
}

/**
 * A date the reader can place, or '' when the server recorded none.
 *
 * Deliberately not a relative time: this is a history surface, and "2 months ago" gets less
 * true every time it is read while the row itself never changes.
 */
export function formatTradeDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * What a confirmed trade's row says. A cancelled trade must NOT keep reading as "Trade
 * confirmed": that row is the entry point to the trade, and describing a dead trade as a live
 * one is the same product-truth defect the rest of this module exists to prevent.
 *
 * Deliberately says nothing about fulfilment, no-show, dispute or review — cancelling ends the
 * trade and decides none of those, and none of them exist.
 */
const CONFIRMED_TRADE_NOTE: Record<CancellationState, string> = {
  none: 'Trade confirmed. The agreed terms can no longer change.',
  byYou: 'Trade cancelled. You cancelled this trade.',
  byThem: 'Trade cancelled. The other provider cancelled this trade.',
  mutual: 'Trade cancelled by both of you.',
}

/**
 * What a confirmed, UNCANCELLED trade's row says about the receiver-response windows (PD-059).
 *
 * TOTAL over mine × theirs — nine explicit cells, no ternary chain. Every combination is
 * reachable: an obligation the viewer receives can be past its deadline while the one they
 * deliver has not been delivered at all, and each participant receives exactly one obligation
 * and delivers exactly one, so there is no roll-up to resolve.
 *
 * PRIORITY, read down the rows and across: **Needs Attention outranks Action needed, and the
 * viewer's OWN state outranks the counterparty's within the same rank.** So
 * `mine: needs_attention` always speaks, and `theirs: needs_attention` speaks only when the
 * viewer's own side is not itself past its deadline. That ordering is the brief's: a state
 * requiring this provider's action wins, and one truthful agreement-level label is enough even
 * when both sides need attention.
 *
 * VOCABULARY. No cell says failed, dispute, review, no-show, fulfilled, unfulfilled, complete or
 * resolved — none of those exist, and an elapsed window is a fact about a missing answer, not a
 * finding about a person. `Needs attention` is the only new label, and it is stated as an
 * unresolved condition with the action that is still available.
 */
/**
 * The row badge for "the counterparty delivered and this viewer owes an answer, still in time".
 *
 * Lives here rather than in lib/obligationState.ts because it is a LIST label about an
 * agreement, not a sentence about one obligation. `NEEDS_ATTENTION_LABEL` is imported from that
 * module instead of respelled, because the elapsed-window state is the same product state on
 * both surfaces and two spellings of it would drift.
 */
export const ACTION_NEEDED_LABEL = 'Action needed'

const ACTION_NEEDED_NOTE =
  'Action needed. The other provider marked their side delivered — open this to say whether you '
  + 'received it.'
const MY_ATTENTION_NOTE =
  'Needs attention. The response window has passed and you have not yet said whether you '
  + 'received the other provider’s delivery. You still can.'
const THEIR_ATTENTION_NOTE =
  'Needs attention. The response window has passed and the other provider has not said whether '
  + 'they received your delivery. Nothing has been decided.'
const WAITING_NOTE =
  'Waiting for confirmation. The other provider has not yet said whether they received your '
  + 'delivery.'
const CONFIRMED_NOTE = CONFIRMED_TRADE_NOTE.none

const WINDOW_NOTE: Record<ReceiverWindowState, Record<ReceiverWindowState, string>> = {
  //                       theirs: none          awaiting_receiver     needs_attention
  none: {
    none: CONFIRMED_NOTE,
    awaiting_receiver: WAITING_NOTE,
    needs_attention: THEIR_ATTENTION_NOTE,
  },
  awaiting_receiver: {
    none: ACTION_NEEDED_NOTE,
    awaiting_receiver: ACTION_NEEDED_NOTE,
    // The viewer's own answer is still inside its window, but the counterparty's is not. The
    // trade is unresolved, which outranks a request that is not yet late.
    needs_attention: THEIR_ATTENTION_NOTE,
  },
  needs_attention: {
    none: MY_ATTENTION_NOTE,
    awaiting_receiver: MY_ATTENTION_NOTE,
    // Both past their deadlines. ONE truthful label, and it is the one naming what this provider
    // can still do — telling them about the other side's silence first would bury their own
    // available action.
    needs_attention: MY_ATTENTION_NOTE,
  },
}

/** The row's short badge, or null. Derived from the same two states as the note. */
function windowAttention(
  mine: ReceiverWindowState,
  theirs: ReceiverWindowState,
): string | null {
  return mine === 'needs_attention' || theirs === 'needs_attention'
    ? NEEDS_ATTENTION_LABEL
    : mine === 'awaiting_receiver'
      ? ACTION_NEEDED_LABEL
      : null
}

function confirmedTradeNote(f: TradeRowFacts): string {
  // The CLASSIFICATION comes from lib/tradeCancellation.ts, which owns it and is total over the
  // vocabulary; only the wording is local, because a list row and a detail banner are different
  // products. An if-chain here would have been a second, uncheckable copy of the truth table in
  // the module that documents total Records as its defence against exactly that.
  const cancelled = cancellationState(f)
  // CANCELLATION STAYS DOMINANT. A cancelled trade has no live response window — the server
  // returns `none` for both sides — but the rule is spelled here as well, because a row reading
  // "Needs attention: say whether you received it" on a trade that was cancelled before anything
  // could be delivered would be the worst sentence this list could produce.
  if (cancelled !== 'none') return CONFIRMED_TRADE_NOTE[cancelled]
  return WINDOW_NOTE[f.myResponseState ?? 'none'][f.theirResponseState ?? 'none']
}

/**
 * TOTAL over the status vocabulary — a fifth status is a compile error, not a silent fallthrough
 * to whatever the last ternary branch happened to say.
 */
const ROW_STATE: Record<BarterInterestStatus, (f: TradeRowFacts) => TradeRowState> = {
  // The negotiation outlives its post by design (PD-049), so a closed post does not end it.
  // Once CONFIRMED, release is no longer available (the server refuses it). What ends a
  // confirmed trade before either side has delivered is pre-delivery cancellation, which is
  // taken on the trade's own screen — this list reports it rather than offering it, so the
  // one place that can check the delivery precondition is the one place that can act.
  accepted: (f) =>
    f.agreementId !== null
      ? {
          action: 'none',
          note: confirmedTradeNote(f),
          // Only a confirmed trade can have a response window at all, and a cancelled one has
          // none — the same dominance `confirmedTradeNote` applies to the sentence.
          attention:
            cancellationState(f) !== 'none'
              ? null
              : windowAttention(f.myResponseState ?? 'none', f.theirResponseState ?? 'none'),
        }
      : {
          action: 'end',
          note: f.offerIsActive
            ? ''
            : 'This post is no longer on the board. The negotiation is still open.',
          // No agreement means no obligations, so nothing can be awaiting a receiver.
          attention: null,
        },

  pending: (f) => {
    if (f.myRole === 'owner') {
      // The slot is already taken: accepting can only fail, so it is not offered. Decline
      // stays legal (pending -> declined is permitted on an active post) and is the only
      // thing the owner can still usefully do with this row.
      if (f.offerIsActive && f.offerHasAcceptedResponse) {
        return {
          action: 'declineOnly',
          note: 'You are already in negotiation on this post, so this response cannot be accepted.',
          attention: null,
        }
      }
      return f.offerIsActive
        ? { action: 'answer', note: 'Waiting on you to accept or decline.', attention: null }
        : {
            action: 'none',
            attention: null,
            // Says WHY it cannot be answered, and names BOTH refusals: PD-052 withdraws
            // decline as well as accept, so copy mentioning only accept explains half the rule
            // and makes the missing Decline control read as a bug.
            note: 'This post is closed, so this response can no longer be accepted or '
              + 'declined. Kept as history.',
          }
    }
    return f.offerIsActive
      ? { action: 'none', note: 'Waiting on the other provider.', attention: null }
      : {
          action: 'none',
          attention: null,
          // The responder is otherwise left waiting forever on a post that is gone.
          note: 'This post has been closed without your response being accepted.',
        }
  },

  released: (f) => {
    const who = f.releaseReason
      ? RELEASE_ACTOR[f.releaseReason](f.myRole)
      : 'This negotiation ended.'
    const when = formatTradeDate(f.releasedAt)
    return { action: 'none', note: when ? `${who} ${when}.` : who, attention: null }
  },

  declined: (f) => ({
    action: 'none',
    attention: null,
    note:
      f.myRole === 'owner'
        ? 'You declined this response. Kept as history.'
        : // NOT "the provider chose someone else": declining requires no acceptance, so that
          // asserted a competition that may never have happened, to the party least able to
          // check it.
          'Your response was not selected. Kept as history.',
  }),
}

export function tradeRowState(f: TradeRowFacts): TradeRowState {
  return ROW_STATE[f.status](f)
}

/**
 * Destructive-confirmation copy, owned HERE rather than authored per screen.
 *
 * Accept, decline and end-negotiation are all irreversible (`pending -> accepted | declined` is
 * the only participant transition, and `accepted -> released` permanently bars that responder),
 * and each was reachable from two or three screens with a DIFFERENT disclosure on each — one
 * route omitted "This cannot be undone", and accept had no confirmation at all on the screen
 * where it is the primary action. The disclosure a provider gets before an irreversible act
 * must not depend on the route they took to it.
 *
 * TOTAL over the action vocabulary, and takes the role, so a new destructive action cannot be
 * added without deciding what both sides are told.
 */
export type DestructiveAction = 'endNegotiation' | 'decline' | 'accept' | 'closeOffer'

export interface ConfirmCopy {
  title: string
  body: string
  /** Label for the destructive button, so it names the act rather than saying "OK". */
  confirmLabel: string
  cancelLabel: string
}

const CONFIRM_COPY: Record<
  DestructiveAction,
  (role: TradeRole, counterparty: string) => ConfirmCopy
> = {
  endNegotiation: (role) => ({
    title: 'End this negotiation?',
    body:
      role === 'owner'
        ? 'This cannot be undone. The other provider will be told, and they will not be able '
          + 'to respond to this post again — you will not be able to re-accept them. Their '
          + 'response stays on record. If your post is still on the board, you can accept '
          + 'another response.'
        : 'This cannot be undone. The other provider will be told, and you will not be able to '
          + 'respond to this post again. Your response stays on record.',
    confirmLabel: 'End negotiation',
    cancelLabel: 'Keep negotiating',
  }),
  decline: (_role, counterparty) => ({
    title: 'Decline this response?',
    body:
      `${counterparty} will not be matched with you for this post. This cannot be undone. `
      + 'Their response stays on record.',
    confirmLabel: 'Decline',
    cancelLabel: 'Cancel',
  }),
  // Closing was the ONLY destructive barter act still authored inline, and it is the one
  // PD-051 made irreversible. Its inline copy had already fallen behind the rulings shipped
  // alongside it: it said the owner could not reopen "from here", scoping a permanent loss to
  // one screen, and disclosed losing Accept but not Decline.
  closeOffer: () => ({
    title: 'Close this offer?',
    body:
      'This cannot be undone. A closed post cannot be reopened — to offer this again you '
      + 'would post a new one. Any responses stay on record and remain in Trade Activity, but '
      + 'they can no longer be accepted or declined. A negotiation you have already accepted '
      + 'is not ended by closing.',
    confirmLabel: 'Close offer',
    cancelLabel: 'Cancel',
  }),
  accept: (_role, counterparty) => ({
    title: 'Accept this response?',
    body:
      `You will be connected with ${counterparty} to work out the details. Only one response `
      + 'per post can be accepted, and this cannot be undone.',
    confirmLabel: 'Accept',
    cancelLabel: 'Cancel',
  }),
}

export function confirmCopy(
  action: DestructiveAction,
  role: TradeRole,
  counterparty: string,
): ConfirmCopy {
  return CONFIRM_COPY[action](role, counterparty)
}

/**
 * What the barter FEED shows a responder about their own response to a post.
 *
 * A total Record for the same reason as everything else here: the feed previously used a
 * ternary chain whose final branch was "Interest sent", so a status added later would have been
 * labelled as an outstanding response — a live-sounding claim about a finished state, on the
 * responder's only surface for that post. `status === 'x'` comparisons do not fail when the
 * union widens; an incomplete Record does.
 */
export interface ResponderFeedState {
  label: string
  /** `end` renders the End-negotiation control; `none` is a static label. */
  action: 'none' | 'end'
  /**
   * Feather icon name. IN the Record, not chosen by a ternary beside it: an icon picked by
   * `status === 'pending' ? 'check' : 'minus-circle'` silently gives every future status a
   * finished-looking glyph, which is the same defect class the Record exists to prevent.
   */
  icon: 'check' | 'minus-circle' | 'x-circle'
}

export const RESPONDER_FEED_STATE: Record<BarterInterestStatus, ResponderFeedState> = {
  pending: { label: 'Interest sent', action: 'none', icon: 'check' },
  accepted: { label: 'End negotiation', action: 'end', icon: 'x-circle' },
  declined: { label: 'Not selected', action: 'none', icon: 'minus-circle' },
  released: { label: 'Negotiation ended', action: 'none', icon: 'minus-circle' },
}

export function responderFeedState(
  status: BarterInterestStatus,
  agreementId: string | null,
  // REQUIRED, for the same reason the row facts are: a default of "not cancelled" is a silent
  // wrong answer, and this label is rendered verbatim on the discovery feed.
  cancellation: { iCancelled: boolean; theyCancelled: boolean },
): ResponderFeedState {
  if (agreementId !== null && status === 'accepted') {
    const row = tradeRowState({
      status,
      myRole: 'responder',
      offerIsActive: true,
      releasedAt: null,
      releaseReason: null,
      offerHasAcceptedResponse: true,
      agreementId,
      // Threaded so the feed cannot label a cancelled trade "Trade confirmed". It renders
      // `row.note` verbatim, so any note this module gets wrong is shown to a provider on the
      // surface where they first see the post again.
      iCancelled: cancellation.iCancelled,
      theyCancelled: cancellation.theyCancelled,
    })
    // The icon is DERIVED, not hardcoded beside the label. A cancelled trade carried the
    // affirmative 'check' glyph next to "Trade cancelled…" — and on a feed card the glyph is
    // read before the sentence. This module's own rule: the icon belongs with the state, never
    // chosen by a ternary beside it.
    const cancelled = isCancelled(cancellation)
    return {
      label: row.note,
      action: row.action === 'end' ? 'end' : 'none',
      icon: cancelled ? 'x-circle' : 'check',
    }
  }
  return RESPONDER_FEED_STATE[status]
}
