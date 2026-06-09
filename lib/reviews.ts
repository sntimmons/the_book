import { supabase } from './supabase'

// ── Blind reveal read layer ───────────────────────────────────────────────────
//
// A review is REVEALED only if the counterpart review exists for that booking_id
// OR bookings.completed_at <= now() - interval '7 days'. We enforce this in the
// READ PATH here (client side) so unrevealed rows never reach the UI, and we
// derive the displayed aggregate from REVEALED rows only (never the stored
// providers.average_rating, which a recompute trigger may bump pre-reveal and
// would leak a hidden review).
//
// NOTE (reported to the team, not changed here): provider_reviews has a
// using(true) SELECT RLS policy, so unrevealed rows are technically on the wire
// even though this layer hides them. A server-side VIEW/RPC (or reveal-gated
// RLS) would enforce this at the DB. See the report for the proposed policy.

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export interface RevealedReview {
  id: string
  bookingId: string
  rating: number
  reviewText: string | null
  tags: string[] | null
  createdAt: string
  reviewerName: string
}

export interface ReviewAggregate {
  average: number
  count: number
}

function isRevealed(
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

  const bookingIds = Array.from(new Set(reviews.map((r) => r.booking_id).filter(Boolean)))

  const [{ data: counterRows }, { data: bookingRows }] = await Promise.all([
    supabase.from('client_reviews').select('booking_id').in('booking_id', bookingIds),
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

  const reviewerIds = Array.from(
    new Set(revealed.map((r) => r.reviewer_user_id).filter(Boolean)),
  ) as string[]
  const nameById = new Map<string, string>()
  if (reviewerIds.length > 0) {
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id, name')
      .in('id', reviewerIds)
    ;(clientRows ?? []).forEach((c: { id: string; name: string | null }) =>
      nameById.set(c.id, c.name || 'Client'),
    )
  }

  return revealed.map((r) => ({
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
      'id, booking_id, reviewer_provider_id, rating, review_text, tags, created_at',
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
    })),
    rlsBlocked: false,
  }
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
