// Trade Activity vocabulary, copy and per-row capability. Pure logic, NO I/O — same split as
// lib/barterErrors.ts and lib/messageAuthorship.ts, and for the same reason: every defect this
// screen has produced was a COPY defect (a caption that contradicted the row beneath it, a note
// that instructed an action the screen could not perform, a claim that another provider had been
// chosen when nobody had been). Those rules cannot be unit-tested while they live inside a
// react-native component, so they live here instead.

/**
 * The complete response vocabulary. Defined HERE, not in lib/barter.ts, so it and the rules
 * derived from it can be imported by a unit test: lib/barter.ts imports the Supabase client,
 * which makes every value in it untestable without live configuration. Re-exported from
 * lib/barter.ts, so existing import sites are unchanged.
 *
 * `released` — the pre-agreement negotiation ended (either party). History, never actionable.
 */
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
}

export interface TradeRowState {
  action: TradeRowAction
  /** The state of the row in the viewer's own terms. Never empty except on an active row. */
  note: string
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
    title: 'Confirmed trades',
    caption: 'Terms both of you agreed to and confirmed.',
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
 * TOTAL over the status vocabulary — a fifth status is a compile error, not a silent fallthrough
 * to whatever the last ternary branch happened to say.
 */
const ROW_STATE: Record<BarterInterestStatus, (f: TradeRowFacts) => TradeRowState> = {
  // The negotiation outlives its post by design (PD-049), so a closed post does not end it.
  // Once CONFIRMED, release is no longer available (the server refuses it): what ends a
  // confirmed trade is a later slice.
  accepted: (f) =>
    f.agreementId !== null
      ? { action: 'none', note: 'Trade confirmed. The agreed terms can no longer change.' }
      : {
          action: 'end',
          note: f.offerIsActive
            ? ''
            : 'This post is no longer on the board. The negotiation is still open.',
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
        }
      }
      return f.offerIsActive
        ? { action: 'answer', note: 'Waiting on you to accept or decline.' }
        : {
            action: 'none',
            // Says WHY it cannot be answered, and names BOTH refusals: PD-052 withdraws
            // decline as well as accept, so copy mentioning only accept explains half the rule
            // and makes the missing Decline control read as a bug.
            note: 'This post is closed, so this response can no longer be accepted or '
              + 'declined. Kept as history.',
          }
    }
    return f.offerIsActive
      ? { action: 'none', note: 'Waiting on the other provider.' }
      : {
          action: 'none',
          // The responder is otherwise left waiting forever on a post that is gone.
          note: 'This post has been closed without your response being accepted.',
        }
  },

  released: (f) => {
    const who = f.releaseReason
      ? RELEASE_ACTOR[f.releaseReason](f.myRole)
      : 'This negotiation ended.'
    const when = formatTradeDate(f.releasedAt)
    return { action: 'none', note: when ? `${who} ${when}.` : who }
  },

  declined: (f) => ({
    action: 'none',
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
    })
    return { label: row.note, action: row.action === 'end' ? 'end' : 'none', icon: 'check' }
  }
  return RESPONDER_FEED_STATE[status]
}
