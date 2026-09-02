import { supabase } from './supabase'

// ── Blind reveal read layer (DB is authoritative — Phase 0) ──────────────────
//
// The DATABASE owns review reveal and eligibility. The canonical rule lives once
// in SQL (migration 20260902000000): a review is revealed when the booking is
// eligible (status='completed' AND under_review=false) AND (the counterpart
// review exists OR the 7-day window from the server-stamped completed_at has
// closed). One 7-day definition, one `<=` boundary. TypeScript no longer decides
// whether hidden reviews are visible.
//
// provider_reviews: reveal is enforced by a single SECURITY DEFINER-gated SELECT
// policy (public.provider_review_revealed). The DB returns only revealed rows plus
// the reader's own; fetchRevealedProviderReviews trusts that and does NOT
// re-filter. The displayed aggregate derives from REVEALED rows only; the stored
// providers.average_rating/review_count are also recomputed over revealed rows
// only (so a blind review never moves the public number).
//
// client_reviews: the SELECT policy is AUTHOR-ONLY (a provider reads reviews they
// wrote; clients never read this table) — that is the privacy boundary, in the DB.
// public.client_review_revealed() is the DB gate any FUTURE cross-provider
// client-reputation read path MUST use. isRevealed() below is now a PRESENTATION
// helper over the author's own rows only — it is NOT the privacy boundary.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export interface RevealedReview {
  id: string
  bookingId: string
  rating: number
  reviewText: string | null
  tags: string[] | null
  createdAt: string
  reviewerName: string
  // Structured client-reputation dimensions. Present only for client reviews
  // (undefined for provider reviews); null means the reviewer left the
  // dimension unanswered. private_note is deliberately NOT part of this type —
  // it is never fetched into any display path.
  showedUp?: boolean | null
  onTime?: boolean | null
  followedPolicy?: boolean | null
  paymentCompleted?: boolean | null
}

export interface ReviewAggregate {
  average: number
  count: number
}

export function isRevealed(
  bookingId: string,
  counterpart: Set<string>,
  completedAt: Map<string, string | null>,
  now: number,
): boolean {
  if (counterpart.has(bookingId)) return true
  const ca = completedAt.get(bookingId)
  if (ca && new Date(ca).getTime() <= now - SEVEN_DAYS_MS) return true
  return false
}

// Client -> provider reviews shown publicly on a provider profile / see-all page.
export async function fetchRevealedProviderReviews(
  providerId: string,
): Promise<RevealedReview[]> {
  const { data: rows, error } = await supabase
    .from('provider_reviews')
    .select('id, booking_id, reviewer_user_id, rating, review_text, tags, created_at')
    .eq('provider_id', providerId)

  if (error) {
    if (error.code === '42501') {
      console.log('provider_reviews READ RLS gap (42501):', error.message)
    } else {
      console.log('provider_reviews read error:', error.message)
    }
    return []
  }

  const reviews = (rows ?? []) as Array<{
    id: string
    booking_id: string
    reviewer_user_id: string | null
    rating: number
    review_text: string | null
    tags: string[] | null
    created_at: string
  }>
  if (reviews.length === 0) return []

  // The DB SELECT policy on provider_reviews is the single source of truth for
  // reveal (SECURITY DEFINER-gated): every row returned here is already revealed
  // or authored by the reader. No client-side re-filter — doing so previously
  // dropped approved rows for non-participants whose RLS-blocked reads of
  // client_reviews/bookings made the reveal support sets empty.
  const reviewerIds = Array.from(
    new Set(reviews.map((r) => r.reviewer_user_id).filter(Boolean)),
  ) as string[]
  const nameById = new Map<string, string>()
  if (reviewerIds.length > 0) {
    const { data: clientRows } = await supabase
      .from('clients_public')
      .select('id, name')
      .in('id', reviewerIds)
    ;(clientRows ?? []).forEach((c: { id: string; name: string | null }) =>
      nameById.set(c.id, c.name || 'Client'),
    )
  }

  return reviews.map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    rating: r.rating,
    reviewText: r.review_text,
    tags: r.tags,
    createdAt: r.created_at,
    reviewerName: (r.reviewer_user_id && nameById.get(r.reviewer_user_id)) || 'Client',
  }))
}

// Provider -> client reviews. PROVIDER-ONLY (the booking-request reputation view).
// Same reveal rule; reviewer display is the provider who wrote it.
export async function fetchRevealedClientReviews(
  clientUserId: string,
): Promise<{ reviews: RevealedReview[]; rlsBlocked: boolean }> {
  const { data: rows, error } = await supabase
    .from('client_reviews')
    .select(
      'id, booking_id, reviewer_provider_id, rating, review_text, tags, created_at, showed_up, on_time, followed_policy, payment_completed',
    )
    .eq('client_user_id', clientUserId)

  if (error) {
    const rlsBlocked = error.code === '42501'
    if (rlsBlocked) {
      console.log('client_reviews READ RLS gap (42501):', error.message)
    } else {
      console.log('client_reviews read error:', error.message)
    }
    return { reviews: [], rlsBlocked }
  }

  const reviews = (rows ?? []) as Array<{
    id: string
    booking_id: string
    reviewer_provider_id: string | null
    rating: number
    review_text: string | null
    tags: string[] | null
    created_at: string
    showed_up: boolean | null
    on_time: boolean | null
    followed_policy: boolean | null
    payment_completed: boolean | null
  }>
  if (reviews.length === 0) return { reviews: [], rlsBlocked: false }

  const bookingIds = Array.from(new Set(reviews.map((r) => r.booking_id).filter(Boolean)))

  const [{ data: counterRows }, { data: bookingRows }] = await Promise.all([
    supabase.from('provider_reviews').select('booking_id').in('booking_id', bookingIds),
    supabase.from('bookings').select('id, completed_at').in('id', bookingIds),
  ])

  const counterpart = new Set(
    (counterRows ?? []).map((c: { booking_id: string }) => c.booking_id),
  )
  const completedAt = new Map<string, string | null>()
  ;(bookingRows ?? []).forEach((b: { id: string; completed_at: string | null }) =>
    completedAt.set(b.id, b.completed_at),
  )

  const now = Date.now()
  const revealed = reviews.filter((r) =>
    isRevealed(r.booking_id, counterpart, completedAt, now),
  )

  const providerIds = Array.from(
    new Set(revealed.map((r) => r.reviewer_provider_id).filter(Boolean)),
  ) as string[]
  const nameById = new Map<string, string>()
  if (providerIds.length > 0) {
    const { data: providerRows } = await supabase
      .from('providers')
      .select('id, display_name')
      .in('id', providerIds)
    ;(providerRows ?? []).forEach((p: { id: string; display_name: string | null }) =>
      nameById.set(p.id, p.display_name || 'Provider'),
    )
  }

  return {
    reviews: revealed.map((r) => ({
      id: r.id,
      bookingId: r.booking_id,
      rating: r.rating,
      reviewText: r.review_text,
      tags: r.tags,
      createdAt: r.created_at,
      reviewerName:
        (r.reviewer_provider_id && nameById.get(r.reviewer_provider_id)) || 'Provider',
      showedUp: r.showed_up,
      onTime: r.on_time,
      followedPolicy: r.followed_policy,
      paymentCompleted: r.payment_completed,
    })),
    rlsBlocked: false,
  }
}

// ── Structured client-reputation dimensions ───────────────────────────────────

export interface ClientDimensionStat {
  yes: number
  total: number
}

export interface ClientDimensionStats {
  showedUp: ClientDimensionStat
  onTime: ClientDimensionStat
  followedPolicy: ClientDimensionStat
  paymentCompleted: ClientDimensionStat
  hasAny: boolean
}

// Aggregate the four boolean dimensions across a client's revealed reviews.
// `total` counts only answered (true/false) entries, so a client with no
// structured data yet yields hasAny=false rather than fake zeros.
export function aggregateClientDimensions(
  reviews: Array<
    Pick<RevealedReview, 'showedUp' | 'onTime' | 'followedPolicy' | 'paymentCompleted'>
  >,
): ClientDimensionStats {
  const tally = (
    pick: (r: (typeof reviews)[number]) => boolean | null | undefined,
  ): ClientDimensionStat => {
    let yes = 0
    let total = 0
    for (const r of reviews) {
      const v = pick(r)
      if (v === true || v === false) {
        total += 1
        if (v) yes += 1
      }
    }
    return { yes, total }
  }

  const showedUp = tally((r) => r.showedUp)
  const onTime = tally((r) => r.onTime)
  const followedPolicy = tally((r) => r.followedPolicy)
  const paymentCompleted = tally((r) => r.paymentCompleted)
  const hasAny =
    showedUp.total + onTime.total + followedPolicy.total + paymentCompleted.total > 0

  return { showedUp, onTime, followedPolicy, paymentCompleted, hasAny }
}

export function aggregateFromRevealed(reviews: { rating: number }[]): ReviewAggregate {
  if (reviews.length === 0) return { average: 0, count: 0 }
  const sum = reviews.reduce((s, r) => s + (r.rating || 0), 0)
  return { average: sum / reviews.length, count: reviews.length }
}

// Completion rate for a client, from their bookings. Real and exact:
// completed / (completed + no_show + late_cancelled). Returns null if no
// terminal bookings exist yet (so the UI can hide rather than show 0%).
export async function fetchClientCompletionRate(
  clientUserId: string,
): Promise<number | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select('status')
    .eq('user_id', clientUserId)
  if (error) {
    console.log('client completion read error:', error.message)
    return null
  }
  const rows = (data ?? []) as Array<{ status: string }>
  const completed = rows.filter((r) => r.status === 'completed').length
  const missed = rows.filter(
    (r) => r.status === 'no_show' || r.status === 'late_cancelled',
  ).length
  const denom = completed + missed
  if (denom === 0) return null
  return (completed / denom) * 100
}

// Provider trust stats for the profile reviews-section triple, all real:
// rebookedPct = clients with >1 completed booking / clients with >=1; and
// avgResponseMins from provider_first_response_at - created_at.
export async function fetchProviderTrustStats(providerId: string): Promise<{
  rebookedPct: number | null
  avgResponseMins: number | null
}> {
  const { data, error } = await supabase
    .from('bookings')
    .select('user_id, status, created_at, provider_first_response_at')
    .eq('provider_id', providerId)
  if (error) {
    console.log('provider trust stats read error:', error.message)
    return { rebookedPct: null, avgResponseMins: null }
  }
  const rows = (data ?? []) as Array<{
    user_id: string | null
    status: string
    created_at: string | null
    provider_first_response_at: string | null
  }>

  const completedByClient = new Map<string, number>()
  rows
    .filter((r) => r.status === 'completed' && r.user_id)
    .forEach((r) => {
      const id = r.user_id as string
      completedByClient.set(id, (completedByClient.get(id) || 0) + 1)
    })
  const clientsWithCompleted = completedByClient.size
  const repeatClients = Array.from(completedByClient.values()).filter((n) => n > 1).length
  const rebookedPct =
    clientsWithCompleted > 0 ? (repeatClients / clientsWithCompleted) * 100 : null

  const responded = rows.filter((r) => r.provider_first_response_at && r.created_at)
  const avgResponseMins =
    responded.length > 0
      ? responded.reduce((s, r) => {
          const diff =
            new Date(r.provider_first_response_at as string).getTime() -
            new Date(r.created_at as string).getTime()
          return s + diff / (1000 * 60)
        }, 0) / responded.length
      : null

  return { rebookedPct, avgResponseMins }
}

export type ReviewSort = 'top' | 'recent' | '5star' | '4star'

export function sortAndFilter(
  reviews: RevealedReview[],
  mode: ReviewSort,
): RevealedReview[] {
  if (mode === '5star') return reviews.filter((r) => Math.round(r.rating) === 5)
  if (mode === '4star') return reviews.filter((r) => Math.round(r.rating) === 4)
  const copy = [...reviews]
  if (mode === 'recent') {
    return copy.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
  }
  // top rated: rating desc, then most recent
  return copy.sort((a, b) => {
    if (b.rating !== a.rating) return b.rating - a.rating
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

export function formatReviewDate(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
}

// ── Phase 1: review-opportunity state (server-authoritative) ──────────────────
//
// The DB owns eligibility/window/reveal (Phase 0). The UI must accurately REPRESENT
// a review opportunity without duplicating that logic. getReviewOpportunity() reads
// the single server-authoritative predicate (RPC review_opportunity, migration
// 20260903000000); reviewOpportunityCopy() is a pure presentation map. Submitted !=
// revealed: the confirmation copy never claims public visibility.

export type ReviewDirection = 'client_to_provider' | 'provider_to_client'

export type ReviewOpportunity =
  | 'eligible'
  | 'already_submitted'
  | 'window_closed'
  | 'under_review'
  | 'not_completed'
  | 'not_participant'
  | 'unknown'

// Reads the DB's authoritative review-opportunity state for a booking + direction.
// Never computes the 7-day window client-side. Returns 'unknown' only on a read error.
export async function getReviewOpportunity(
  bookingId: string,
  direction: ReviewDirection,
): Promise<ReviewOpportunity> {
  const { data, error } = await supabase.rpc('review_opportunity', {
    p_booking_id: bookingId,
    p_direction: direction,
  })
  // On any read error, fall back to 'unknown' → the UI shows no review entry
  // rather than a wrong one; the DB remains authoritative on the actual submit.
  if (error) return 'unknown'
  return (data as ReviewOpportunity) ?? 'unknown'
}

export interface ReviewOpportunityCopy {
  // true only when a review may be started now (show the actionable CTA).
  actionable: boolean
  // true when this is a settled, truthful end state: render an explanation and a
  // safe exit, and NEVER invite a retry. False for 'eligible' and for 'unknown'
  // (a transient read failure, which must not be presented as a verdict).
  terminal: boolean
  // the entry CTA label when actionable; '' when there is no review entry at all.
  label: string
  // title/body for a terminal state or a rejected submit (empty for 'eligible').
  title: string
  body: string
}

// Pure presentation for each opportunity state. Direction changes only the labels.
export function reviewOpportunityCopy(
  opportunity: ReviewOpportunity,
  direction: ReviewDirection,
): ReviewOpportunityCopy {
  const isProvider = direction === 'provider_to_client'
  switch (opportunity) {
    case 'eligible':
      return {
        actionable: true,
        terminal: false,
        label: isProvider ? 'Review client' : 'Leave review',
        title: '',
        body: '',
      }
    case 'already_submitted':
      return {
        actionable: false,
        terminal: true,
        label: isProvider ? 'Client reviewed' : 'Reviewed',
        title: isProvider ? 'Client reviewed' : 'Reviewed',
        body: isProvider
          ? 'You already reviewed this client for this booking.'
          : 'You already reviewed this booking.',
      }
    case 'window_closed':
      return {
        actionable: false,
        terminal: true,
        label: 'Review period ended',
        title: 'Review period ended',
        body: 'The review period for this booking has ended.',
      }
    case 'under_review':
      return {
        actionable: false,
        terminal: true,
        label: 'Under review',
        title: 'Under review',
        body: 'This booking is currently under review. Review activity is temporarily paused.',
      }
    // not_completed covers any booking that never became a completed service —
    // including no_show. A no-show is a real, recorded booking event, but it is
    // NOT a completed service experience, so there is no service-quality review
    // to leave. (Conduct/reliability reputation is a later phase; see
    // docs/product/REVIEWS_MODEL.md.) Terminal and truthful — never a retry.
    case 'not_completed':
      return {
        actionable: false,
        terminal: true,
        label: '',
        title: 'No review for this booking',
        body: 'This booking isn\u2019t eligible for a review because the appointment wasn\u2019t completed.',
      }
    // The caller is not the client/provider for this booking + direction. Say so
    // without confirming anything about the booking itself.
    case 'not_participant':
      return {
        actionable: false,
        terminal: true,
        label: '',
        title: 'Review unavailable',
        body: 'This review isn\u2019t available for this booking.',
      }
    // unknown: a transient read failure. No entry, but NOT a terminal verdict —
    // the caller keeps its own generic handling rather than asserting a state.
    default:
      return { actionable: false, terminal: false, label: '', title: '', body: '' }
  }
}

// Shared post-submission confirmation copy. submitted != revealed: this text may
// state that a review was RECORDED, and must never claim it is live/public/visible.
// Both directions use the same wording so the two-sided model reads symmetrically.
export const REVIEW_SUBMITTED_TITLE = 'Review submitted'

export const REVIEW_SUBMITTED_BODY =
  'Your review stays private until they submit theirs or the review window closes. ' +
  'This keeps reviews fair for both sides.'

// Maps a failed review INSERT to a truthful terminal message, by re-reading the
// authoritative opportunity state (all RLS WITH CHECK rejections surface as 42501,
// so the error code alone can't distinguish window-closed vs under_review vs
// already-reviewed). Returns null when the state looks eligible/unknown → caller
// shows its generic retry message.
export async function reviewSubmitErrorMessage(
  bookingId: string,
  direction: ReviewDirection,
): Promise<{ title: string; body: string } | null> {
  const opp = await getReviewOpportunity(bookingId, direction)
  const c = reviewOpportunityCopy(opp, direction)
  // Every terminal state (including not_completed / not_participant, reachable via
  // a stale deep link) gets a truthful message and a safe exit. Only 'eligible' and
  // 'unknown' fall through to the caller's generic retry.
  if (c.terminal) return { title: c.title, body: c.body }
  return null
}
