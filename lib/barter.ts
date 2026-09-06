import { supabase } from './supabase'
import { fetchProviderInfoMap, CommunityProviderInfo } from './community'
import { interpretWrite } from './barterErrors'
import type { BarterInterestStatus, BarterReleaseReason } from './tradeActivity'

// The status vocabulary and the Trade Activity section mapping live in lib/tradeActivity.ts --
// a PURE module, so they can be unit tested. This module imports the Supabase client, which
// makes anything defined here untestable without live configuration.
//
// Re-exported so a SCREEN can take the row type and its vocabulary from one import. Tests and
// pure modules must import them from './tradeActivity' directly: coming through here pulls in
// the Supabase client and needs live configuration to run.
export { TRADE_ACTIVITY_SECTION } from './tradeActivity'

// Barter data layer. Providers trade services without cash: an owner posts an
// offer (offering X, seeking Y), other providers express interest, and on accept
// both are connected through the existing messaging system. Provider display
// info is batch-fetched by provider_id (same pattern as the community feed).

export interface BarterOffer {
  id: string
  providerId: string
  userId: string
  offeringService: string
  seekingService: string
  offeringValue: number | null
  notes: string | null
  isActive: boolean
  createdAt: string
}

export const INTEREST_STATUS_IS_LISTED: Record<BarterInterestStatus, boolean> = {
  pending: true,
  accepted: true,
  declined: false, // declined responses are removed from the owner's list entirely
  released: true, // shown as ended history, never actionable
}

export interface BarterInterest {
  id: string
  offerId: string
  interestedProviderId: string
  interestedUserId: string
  message: string | null
  status: BarterInterestStatus
  createdAt: string
  releasedAt: string | null
  releaseReason: BarterReleaseReason | null
  /** Set when this response has become a confirmed trade. */
  agreementId: string | null
  /** This viewer recorded their own pre-delivery cancellation of that trade. */
  iCancelled: boolean
  /** The other participant recorded theirs. */
  theyCancelled: boolean
  provider: CommunityProviderInfo
}

export interface BarterOfferWithProvider extends BarterOffer {
  provider: CommunityProviderInfo
  interestCount: number
}

interface RawOfferRow {
  id: string
  provider_id: string
  user_id: string
  offering_service: string
  seeking_service: string
  offering_value: number | null
  notes: string | null
  is_active: boolean
  created_at: string
}

const OFFER_COLUMNS =
  'id, provider_id, user_id, offering_service, seeking_service, offering_value, notes, is_active, created_at'

// Active offers newest-first, each with provider display info and a count of
// how many providers have expressed interest.
export async function fetchBarterFeed(): Promise<BarterOfferWithProvider[]> {
  const { data, error } = await supabase
    .from('barter_offers')
    .select(OFFER_COLUMNS)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) {
    console.log('Barter feed error:', error)
    return []
  }
  const rows = (data as RawOfferRow[] | null) ?? []
  if (rows.length === 0) return []

  const offerIds = rows.map((r) => r.id)
  const [infoMap, countMap] = await Promise.all([
    fetchProviderInfoMap(rows.map((r) => r.provider_id)),
    fetchInterestCounts(offerIds),
  ])

  return rows.map((r) => ({
    id: r.id,
    providerId: r.provider_id,
    userId: r.user_id,
    offeringService: r.offering_service,
    seekingService: r.seeking_service,
    offeringValue: r.offering_value,
    notes: r.notes,
    isActive: r.is_active,
    createdAt: r.created_at,
    provider: infoMap.get(r.provider_id) ?? {
      name: 'Provider',
      photo: null,
      category: '',
      neighborhood: null,
    },
    interestCount: countMap.get(r.id) ?? 0,
  }))
}

// Interest counts keyed by offer_id for the given offers.
async function fetchInterestCounts(offerIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (offerIds.length === 0) return map
  const { data } = await supabase
    .from('barter_interests')
    .select('offer_id')
    .in('offer_id', offerIds)
  for (const r of (data as { offer_id: string }[] | null) ?? []) {
    map.set(r.offer_id, (map.get(r.offer_id) ?? 0) + 1)
  }
  return map
}

// Which offer ids the current user has already expressed interest in.
export interface MyInterest {
  id: string
  status: BarterInterestStatus
  agreementId: string | null
  /** This viewer recorded their own pre-delivery cancellation of the agreement. */
  iCancelled: boolean
  /** The other participant recorded theirs. */
  theyCancelled: boolean
}

/**
 * The caller's own response per offer, keyed by offer id.
 *
 * Returns the STATUS, not merely whether one exists. A bare set could only say "you responded",
 * so a responder whose negotiation had ended still read "Interest sent" forever — a live-sounding
 * claim about a state that had finished, on the only surface they have for that post.
 */
export async function fetchMyInterests(userId: string): Promise<Map<string, MyInterest>> {
  const map = new Map<string, MyInterest>()
  if (!userId) return map
  const { data } = await supabase
    .from('my_trade_activity')
    .select('interest_id, offer_id, status, my_role, agreement_id, i_cancelled, they_cancelled')
    .eq('my_role', 'responder')
  const rows =
    (data as unknown as {
      interest_id: string
      offer_id: string
      status: BarterInterestStatus
      my_role: 'owner' | 'responder'
      agreement_id: string | null
      i_cancelled: boolean
      they_cancelled: boolean
    }[] | null) ?? []
  for (const r of rows) {
    map.set(r.offer_id, {
      id: r.interest_id,
      status: r.status,
      agreementId: r.agreement_id,
      iCancelled: r.i_cancelled,
      theyCancelled: r.they_cancelled,
    })
  }
  return map
}

// Interests on a specific offer with provider info, for the owner's review view.
// Only pending interests are actionable, but all are returned so the owner sees
// history; the screen filters as needed.
export async function fetchOfferInterests(offerId: string): Promise<BarterInterest[]> {
  const { data, error } = await supabase
    .from('barter_interests')
    // One literal, not a concatenation: supabase-js infers the row type FROM the select
    // string, and a computed string degrades it to GenericStringError.
    .select('id, offer_id, interested_provider_id, interested_user_id, message, status, created_at, released_at, release_reason')
    .eq('offer_id', offerId)
    .order('created_at', { ascending: false })
  if (error) {
    console.log('Offer interests error:', error)
    return []
  }
  const rows =
    (data as
      | {
          id: string
          offer_id: string
          interested_provider_id: string
          interested_user_id: string
          message: string | null
          status: BarterInterestStatus
          created_at: string
          released_at: string | null
          release_reason: BarterReleaseReason | null
        }[]
      | null) ?? []
  // The agreement, if one exists. Read from barter_agreements (RLS lets the owner see it)
  // rather than guessed from status: a confirmed trade's interest is still 'accepted', and
  // without this fact the screen would offer End negotiation on a trade the server refuses to
  // release.
  const [infoMap, activityRes] = await Promise.all([
    fetchProviderInfoMap(rows.map((r) => r.interested_provider_id)),
    supabase
      .from('my_trade_activity')
      .select('interest_id, agreement_id, i_cancelled, they_cancelled')
      .eq('offer_id', offerId),
  ])
  if (activityRes.error) {
    console.log('Offer interest agreement state error:', activityRes.error)
    return []
  }
  const agreementByInterest = new Map<string, string>()
  const cancelByInterest = new Map<string, { i: boolean; they: boolean }>()
  for (const a of (activityRes.data as unknown as {
    interest_id: string
    agreement_id: string | null
    i_cancelled: boolean
    they_cancelled: boolean
  }[] | null) ?? []) {
    if (a.agreement_id) agreementByInterest.set(a.interest_id, a.agreement_id)
    cancelByInterest.set(a.interest_id, { i: a.i_cancelled, they: a.they_cancelled })
  }
  return rows.map((r) => ({
    id: r.id,
    offerId: r.offer_id,
    interestedProviderId: r.interested_provider_id,
    interestedUserId: r.interested_user_id,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    // Selected so this screen can attribute a release the same way Trade Activity does.
    // Without them the same row showed an unattributed "Negotiation ended." on one route and
    // "You ended this negotiation. <date>." on the other.
    releasedAt: r.released_at,
    releaseReason: r.release_reason,
    agreementId: agreementByInterest.get(r.id) ?? null,
    iCancelled: cancelByInterest.get(r.id)?.i ?? false,
    theyCancelled: cancelByInterest.get(r.id)?.they ?? false,
    provider: infoMap.get(r.interested_provider_id) ?? {
      name: 'Provider',
      photo: null,
      category: '',
      neighborhood: null,
    },
  }))
}


/**
 * One row of Trade Activity: a barter relationship in whatever state it is actually in.
 *
 * Read from the `my_trade_activity` view rather than assembled here, so lifecycle truth stays
 * server-side. The section a row belongs to is derived from `status` by
 * TRADE_ACTIVITY_SECTION below — a rendering label, deliberately not a new status vocabulary.
 */
export interface TradeActivityRow {
  interestId: string
  offerId: string
  status: BarterInterestStatus
  createdAt: string
  releasedAt: string | null
  releaseReason: BarterReleaseReason | null
  offeringService: string
  seekingService: string
  offerIsActive: boolean
  myRole: 'owner' | 'responder'
  counterpartyProviderId: string
  conversationId: string | null
  /** An official agreement exists: this row is a confirmed trade, not a live negotiation. */
  agreementId: string | null
  /** This viewer recorded their own pre-delivery cancellation of that agreement. */
  iCancelled: boolean
  /** The other participant recorded theirs. Both true is "mutually cancelled". */
  theyCancelled: boolean
  provider: CommunityProviderInfo
}

/**
 * Every barter relationship the caller is part of, in either role.
 *
 * DURABLE BY CONSTRUCTION: it selects nothing on `is_active` and takes no feed window, so an
 * accepted negotiation stays reachable after its post is closed or falls out of the newest-50
 * discovery feed. That coupling — the feed being the only route to an accepted negotiation —
 * is exactly what stranded both parties with no way to end it.
 */
export async function fetchTradeActivity(): Promise<{
  rows: TradeActivityRow[]
  ok: boolean
}> {
  const { data, error } = await supabase
    .from('my_trade_activity')
    .select(
      'interest_id, offer_id, status, created_at, released_at, release_reason, ' +
        'offering_service, seeking_service, offer_is_active, my_role, ' +
        'counterparty_provider_id, conversation_id, agreement_id, ' +
        'i_cancelled, they_cancelled',
    )
    .order('created_at', { ascending: false })
  // A failure is NOT an empty list. Collapsing the two let the screen say "No trade activity
  // yet" when the read had failed -- which, on the surface built to guarantee a negotiation is
  // always findable, is the original stranding with a reassuring sentence attached.
  if (error) return { rows: [], ok: false }
  // `as unknown as` because the generated Supabase types do not know this view; the shape is
  // pinned by the select list above and by the B5B column assertions on the view itself.
  const rows =
    (data as unknown as
      | {
          interest_id: string
          offer_id: string
          status: BarterInterestStatus
          created_at: string
          released_at: string | null
          release_reason: BarterReleaseReason | null
          offering_service: string
          seeking_service: string
          offer_is_active: boolean
          my_role: 'owner' | 'responder'
          counterparty_provider_id: string
          conversation_id: string | null
          agreement_id: string | null
          i_cancelled: boolean
          they_cancelled: boolean
        }[]
      | null) ?? []
  const infoMap = await fetchProviderInfoMap(rows.map((r) => r.counterparty_provider_id))
  return {
    ok: true,
    rows: rows.map((r) => ({
    interestId: r.interest_id,
    offerId: r.offer_id,
    status: r.status,
    createdAt: r.created_at,
    releasedAt: r.released_at,
    releaseReason: r.release_reason,
    offeringService: r.offering_service,
    seekingService: r.seeking_service,
    offerIsActive: r.offer_is_active,
    myRole: r.my_role,
    counterpartyProviderId: r.counterparty_provider_id,
    conversationId: r.conversation_id,
    agreementId: r.agreement_id,
    iCancelled: r.i_cancelled,
    theyCancelled: r.they_cancelled,
      provider: infoMap.get(r.counterparty_provider_id) ?? {
        name: 'Provider',
        photo: null,
        category: '',
        neighborhood: null,
      },
    })),
  }
}

/**
 * Ownership AND liveness for an offer, resolved server-side.
 *
 * Server truth, not a navigation param: the interests screen is a real expo-router route and
 * is reachable by deep link with any offerId, so both must be resolved from the database
 * rather than from anything the caller can supply.
 *
 * `is_active` is returned alongside ownership because PD-050 makes a CLOSED post's pending
 * responses non-actionable, and the screen previously never read it — so a deep link to a
 * closed post rendered a live Accept the server would refuse.
 */
export async function fetchOfferAccess(
  offerId: string,
  userId: string,
): Promise<{ isOwner: boolean; isActive: boolean; ok: boolean }> {
  // Fails CLOSED on both axes: a read error must not present a non-owner as an owner, and must
  // not present a closed post as open, since `isActive` gates the accept control.
  //
  // `ok` is separate BECAUSE of that. Failing closed is right for the CONTROL and wrong for the
  // COPY: without it a transient read failure told the real owner of an open post "This post is
  // closed", which is a confident false statement about their own post. The caller withholds
  // the control on `!isActive` and withholds the explanation on `!ok`.
  if (!offerId || !userId) return { isOwner: false, isActive: false, ok: false }
  const { data, error } = await supabase
    .from('barter_offers')
    .select('user_id, is_active')
    .eq('id', offerId)
    .maybeSingle<{ user_id: string; is_active: boolean }>()
  if (error || !data) return { isOwner: false, isActive: false, ok: false }
  return { isOwner: data.user_id === userId, isActive: data.is_active, ok: true }
}

/**
 * End a pre-agreement negotiation and free the offer's negotiation slot.
 *
 * The reason is NOT a parameter: the server derives it from who is calling, so the owner
 * cannot record "the responder withdrew" and the responder cannot record "the owner ended it".
 * Returns the reason the server recorded.
 */
export async function releaseInterest(
  interestId: string,
): Promise<{ ok: boolean; reason: string | null; error: unknown }> {
  const { data, error } = await supabase.rpc('release_barter_interest', {
    p_interest_id: interestId,
  })
  if (error) return { ok: false, reason: null, error }
  return { ok: true, reason: (data as string | null) ?? null, error: null }
}

/**
 * Accept a response, returning the conversation to open on success.
 *
 * Both entry points -- the offer's responses screen and Trade Activity -- go through this one
 * definition. That was claimed before it was true: barter-interests called the RPC inline and
 * cast the result to `string`, so a null conversation navigated to `/messages/null` while
 * Trade Activity guarded it. Returning a nullable id makes the guard the caller's obligation.
 *
 * The server refuses an accept on a CLOSED post with `object_not_in_prerequisite_state`; the
 * caller must not treat that as "already answered", which would blame the responder for the
 * owner's own closure.
 */
export async function acceptInterest(
  interestId: string,
): Promise<{ ok: boolean; conversationId: string | null; error: unknown }> {
  const { data, error } = await supabase.rpc('accept_barter_interest', {
    p_interest_id: interestId,
  })
  if (error) return { ok: false, conversationId: null, error }
  return { ok: true, conversationId: (data as string | null) ?? null, error: null }
}

/**
 * Decline a response, reporting whether the write actually landed.
 *
 * `update` on a row RLS filters out affects ZERO rows and raises NOTHING, so checking only
 * `error` reports success for a write that never happened. `.select()` returns the affected
 * rows, which is the only reliable signal here.
 */
export async function declineInterest(
  interestId: string,
): Promise<{ ok: boolean; error: unknown }> {
  const { data, error } = await supabase
    .from('barter_interests')
    .update({ status: 'declined' })
    .eq('id', interestId)
    .select('id')
  return interpretWrite(error, data)
}
