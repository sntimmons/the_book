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

export type TradeActivitySection = 'active' | 'pending' | 'ended' | 'notSelected'

/**
 * Which Trade Activity section a row belongs to. A label, not a status.
 *
 * NOTE the deliberate disagreement with INTEREST_STATUS_IS_LISTED, which excludes `declined`:
 * the owner's RESPONSES list drops declined rows because they are noise while choosing, but
 * Trade Activity is history and must account for every response the user sent or received. Two
 * total Records over one vocabulary, reaching different answers on purpose.
 */
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
 * (barter_interests_zy_accept_open_offer), so this only decides whether to render a control
 * that would otherwise be refused.
 */
export type TradeRowAction = 'none' | 'end' | 'answer'

export interface TradeRowFacts {
  status: BarterInterestStatus
  myRole: TradeRole
  offerIsActive: boolean
  releasedAt: string | null
  releaseReason: BarterReleaseReason | null
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
export const SECTION_COPY: Record<TradeActivitySection, { title: string; caption: string }> = {
  active: {
    title: 'Active negotiations',
    caption: 'You are working out the details of these.',
  },
  pending: {
    title: 'Pending',
    caption: 'Responses that have not been answered yet.',
  },
  ended: {
    title: 'Ended',
    caption: 'Negotiations that ended before a trade was agreed.',
  },
  notSelected: {
    title: 'Not selected',
    caption: 'Responses that were not taken forward.',
  },
}

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
  accepted: (f) => ({
    action: 'end',
    note: f.offerIsActive
      ? ''
      : 'This post is no longer on the board. The negotiation is still open.',
  }),

  pending: (f) => {
    if (f.myRole === 'owner') {
      return f.offerIsActive
        ? { action: 'answer', note: 'Waiting on you to accept or decline.' }
        : {
            action: 'none',
            // Says WHY it cannot be answered. The previous copy instructed an accept/decline
            // the screen did not offer and the server would have refused.
            note: 'You closed this post, so this response can no longer be accepted. Kept as history.',
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
