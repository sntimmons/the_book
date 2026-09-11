import { supabase } from './supabase'

// ── Blind reveal read layer (DB is authoritative — Phase 0) ──────────────────
//
// The DATABASE owns review reveal and eligibility. The canonical rule lives once
// in SQL and TypeScript no longer decides whether hidden reviews are visible.
//
// The rule, as of 20261082000000 (PD-093): a review is revealed when the booking
// has a server-stamped `completed_at` AND (the counterpart review exists OR the
// 7-day window has closed) — with one twist. **Reveal LATCHES.** While a booking
// is `under_review` (a dispute hold), that same rule is evaluated as of
// `bookings.under_review_at`, the instant the hold opened. So a review that was
// already public when someone filed stays public and keeps counting, and a review
// that had not revealed yet stays held. Filing a dispute is not a way to remove a
// review. Phase 0's flat `under_review = false` requirement is GONE; do not
// restore it from this comment's previous wording. One 7-day definition, one `<=`
// boundary, three immutable server-stamped facts and no cached verdict.
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
}

/**
 * A provider's public reputation as the DATABASE computes it. `average` is the
 * mean over distinct clients of each client's review of their most recently
 * completed service (PD-091 + PD-092); `reviewCount` is every revealed review;
 * `clientCount` is how many clients the average rests on. The last two are NOT
 * interchangeable and a surface showing one without the other is misleading in
 * whichever direction it chose — which is why they are one object.
 */
export interface ProviderReputation {
  average: number
  reviewCount: number
  clientCount: number
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

  // THE POLICY ANSWERS A DIFFERENT QUESTION THAN THIS LIST ASKS.
  //
  // `provider_reviews_read` is `auth.uid() = reviewer_user_id OR
  // provider_review_revealed(booking_id)` — correct as a privacy boundary,
  // because a reviewer must be able to read back what they wrote. But this is
  // the PUBLIC list, and "may I read this row" is not "is this row public": the
  // author's own blind review satisfies the first and fails the second. Without
  // this filter a reviewer opened the provider's profile from the screen that
  // had just promised their review stays private, and found it listed.
  //
  // The filter is the DATABASE's answer, not a recomputation of reveal here. An
  // earlier client-side re-filter was removed for good reason: it rebuilt reveal
  // from `bookings`/`client_reviews` reads that RLS blocks for non-participants,
  // so it silently dropped real reviews for exactly the readers the list is for.
  // `revealed_provider_review_ids` is SECURITY DEFINER and uses the same
  // predicate the policy does, so it cannot disagree with it.
  //
  // FAILS CLOSED, and that direction is deliberate: if the call fails we show no
  // reviews rather than a list that might contain an unrevealed one.
  const { data: revealedIds, error: revealedErr } = await supabase.rpc(
    'revealed_provider_review_ids',
    { p_provider_id: providerId },
  )
  if (revealedErr) {
    console.log('revealed_provider_review_ids error:', revealedErr.message)
    return []
  }
  const publicIds = new Set(
    ((revealedIds ?? []) as Array<string | { revealed_provider_review_ids: string }>).map((v) =>
      typeof v === 'string' ? v : v.revealed_provider_review_ids,
    ),
  )
  const publicReviews = reviews.filter((r) => publicIds.has(r.id))
  if (publicReviews.length === 0) return []

  const reviewerIds = Array.from(
    new Set(publicReviews.map((r) => r.reviewer_user_id).filter(Boolean)),
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

  return publicReviews.map((r) => ({
    id: r.id,
    bookingId: r.booking_id,
    rating: r.rating,
    reviewText: r.review_text,
    tags: r.tags,
    createdAt: r.created_at,
    reviewerName: (r.reviewer_user_id && nameById.get(r.reviewer_user_id)) || 'Client',
  }))
}

// ONE revealed client -> provider review, for the review detail screen (item L's
// sibling, Correction 3 item U).
//
// SAME REVEAL BOUNDARY, NOT A NEW ONE. `provider_reviews` has a single SECURITY
// DEFINER-gated SELECT policy: the database returns a row only if it is revealed
// or the reader wrote it. A read by primary key is subject to exactly that
// policy, so this adds no read path — an unrevealed review returns zero rows here
// for the same reason it is absent from the list. `private_note` is not selected,
// as it is not selected anywhere in any display path.
//
// Returns null for "no such review, or not visible to you", which the screen
// renders as one honest not-found state. The two are deliberately NOT
// distinguished: telling a reader that a review exists but is hidden from them
// would leak the existence of a blind review, which is the whole point of the
// blind window.
export interface RevealedReviewDetail extends RevealedReview {
  providerId: string
  providerName: string | null
}

export async function fetchRevealedReviewById(
  reviewId: string,
): Promise<RevealedReviewDetail | null> {
  if (!reviewId) return null
  const { data, error } = await supabase
    .from('provider_reviews')
    .select('id, booking_id, provider_id, reviewer_user_id, rating, review_text, tags, created_at')
    .eq('id', reviewId)
    .maybeSingle()

  if (error) {
    console.log('provider_review detail read error:', error.message)
    // A technical failure is NOT "no such review": the caller distinguishes them
    // so a connection problem offers a retry instead of asserting absence.
    throw error
  }
  if (!data) return null

  const r = data as {
    id: string
    booking_id: string
    provider_id: string
    reviewer_user_id: string | null
    rating: number
    review_text: string | null
    tags: string[] | null
    created_at: string
  }

  // Two small lookups, each allowed to fail quietly: a missing display name
  // degrades to the same generic label the list uses, and neither is worth
  // failing the whole screen over.
  let reviewerName = 'Client'
  if (r.reviewer_user_id) {
    const { data: client } = await supabase
      .from('clients_public')
      .select('name')
      .eq('id', r.reviewer_user_id)
      .maybeSingle()
    reviewerName = (client as { name: string | null } | null)?.name || 'Client'
  }

  const { data: provider } = await supabase
    .from('providers')
    .select('display_name')
    .eq('id', r.provider_id)
    .maybeSingle()

  return {
    id: r.id,
    bookingId: r.booking_id,
    providerId: r.provider_id,
    providerName: (provider as { display_name: string | null } | null)?.display_name ?? null,
    rating: r.rating,
    reviewText: r.review_text,
    tags: r.tags,
    createdAt: r.created_at,
    reviewerName,
  }
}

// Provider -> client reviews. PROVIDER-ONLY (the booking-request reputation view).
// Same reveal rule; reviewer display is the provider who wrote it.
export async function fetchRevealedClientReviews(
  clientUserId: string,
): Promise<{ reviews: RevealedReview[]; rlsBlocked: boolean }> {
  const { data: rows, error } = await supabase
    .from('client_reviews')
    .select(
      'id, booking_id, reviewer_provider_id, rating, review_text, tags, created_at, showed_up, on_time, followed_policy',
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
  hasAny: boolean
}

// Aggregate the boolean accountability dimensions across a client's revealed
// reviews. `total` counts only answered (true/false) entries, so a client with
// no structured data yet yields hasAny=false rather than fake zeros.
//
// PRODUCT TRUTH: this used to aggregate a FOURTH dimension, `paymentCompleted`,
// asked as "Was payment completed?" and fed to a "Payment" statistic on the
// provider's view of a client. The Book processes no payment and holds no
// payment record (PD-042), so a platform-presented payment-completion statistic
// asserted an accountability fact the product cannot establish. Removed on
// Founder instruction (Pre-Beta Correction 1, 2026-09-08).
//
// WHY THIS ONE AND NOT THE OTHER THREE, stated because the distinction is the
// whole justification: `showed_up`, `on_time` and `followed_policy` are also
// provider self-reports, but each is anchored to something the booking record
// actually holds — a scheduled time, a completion event, and a policy the client
// agreed to. Payment is the only one with no counterpart record anywhere in the
// system, on a platform whose own copy now tells both parties it takes no
// payment. It is the one question the product cannot situate at all.
//
// THE READ PATH IS GONE TOO, not just the write. `payment_completed` is no
// longer selected, no longer typed on the row shape and no longer mapped onto
// `RevealedReview` — the PD-069 treatment of `barter_offers.offering_value`,
// whose guard puts it plainly: the surest way for a value never to reach a
// screen is for the read never to ask for it. THE COLUMN IS NOT DROPPED; no
// migration is involved and pre-existing answers are untouched in the database.
// An earlier revision of this comment claimed PD-069 parity while still
// selecting the column, which was the opposite of that precedent.
export function aggregateClientDimensions(
  reviews: Array<Pick<RevealedReview, 'showedUp' | 'onTime' | 'followedPolicy'>>,
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
  const hasAny = showedUp.total + onTime.total + followedPolicy.total > 0

  return { showedUp, onTime, followedPolicy, hasAny }
}

/**
 * The provider's PUBLIC REPUTATION, computed by the database and nowhere else.
 *
 * THIS REPLACES `aggregateFromRevealed`, which averaged the fetched review rows
 * in TypeScript. That was a second definition of the rating, and after PD-091 it
 * was a DIFFERENT rating: the rule is the mean of each distinct client's review
 * of their most recently completed service (PD-092), not the mean of every
 * receipt. The two agree only until someone books the same provider twice — the
 * exact case the rule exists to govern — so the provider profile was rendering
 * the canonical value in its header and the receipts mean, larger and in 40pt,
 * a few rows below it. Both labelled "Rating".
 *
 * `provider_reputation_canonical()` says "DO NOT restate this query anywhere",
 * and `reviews_phase2.test.sql` § 6b asserts exactly one function in the schema
 * contains it. This is the TypeScript side of that same rule:
 * `__tests__/guards/oneRatingDefinition.test.ts` fails if any module averages
 * review ratings again.
 *
 * Returns null when the reputation cannot be read — callers must render "New" or
 * nothing, never 0, which would be a false one-star-shaped claim.
 */
export async function fetchProviderReputation(
  providerId: string,
): Promise<ProviderReputation | null> {
  const { data, error } = await supabase.rpc('provider_reputation', {
    p_provider_id: providerId,
  })
  if (error) {
    console.log('provider_reputation error:', error.message)
    return null
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    average: Number(row.average_rating ?? 0),
    reviewCount: Number(row.review_count ?? 0),
    clientCount: Number(row.rating_client_count ?? 0),
  }
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
    // Drafts do not change the ratio — see the note below — but excluding them
    // keeps every client-facing booking read saying the same thing about what a
    // booking is, rather than relying on each reader to re-derive it.
    .not('submitted_at', 'is', null)
  if (error) {
    console.log('client completion read error:', error.message)
    return null
  }
  // DRAFTS DO NOT AFFECT THIS, and it was worth checking. Since Correction 3 an
  // abandoned booking flow leaves a row in this result set, but the denominator
  // is `completed + no_show + late_cancelled` — a live draft is `pending` and a
  // discarded one is `cancelled_by_client`, so neither is counted, and a client
  // is never penalised for changing their mind inside the flow. Stated here so
  // the next reader does not have to re-derive it from the status vocabulary.
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
// avgResponseMins from provider_first_response_at - submitted_at.
export async function fetchProviderTrustStats(providerId: string): Promise<{
  rebookedPct: number | null
  avgResponseMins: number | null
}> {
  const { data, error } = await supabase
    .from('bookings')
    .select('user_id, status, created_at, submitted_at, provider_first_response_at')
    .eq('provider_id', providerId)
    // Unsent drafts are not bookings. They would otherwise count toward the
    // rebooked ratio's denominator and, before the fix below, distort the
    // response-time average as well.
    .not('submitted_at', 'is', null)
  if (error) {
    console.log('provider trust stats read error:', error.message)
    return { rebookedPct: null, avgResponseMins: null }
  }
  const rows = (data ?? []) as Array<{
    user_id: string | null
    status: string
    created_at: string | null
    submitted_at: string | null
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

  // MEASURED FROM `submitted_at`, NOT `created_at`.
  //
  // Since Correction 3, `created_at` is stamped when the client's DRAFT is
  // created at the contract step, which can precede the actual request by
  // minutes or days — all of it time the CLIENT spent deciding, none of it the
  // provider's. Measuring from it charged a client's hesitation to a provider's
  // public responsiveness number, in a marketplace where that number is a trust
  // signal. `created_at` remains the fallback for rows predating the column,
  // where the two are the same instant.
  const responded = rows.filter(
    (r) => r.provider_first_response_at && (r.submitted_at || r.created_at),
  )
  const avgResponseMins =
    responded.length > 0
      ? responded.reduce((s, r) => {
          const diff =
            new Date(r.provider_first_response_at as string).getTime() -
            new Date((r.submitted_at ?? r.created_at) as string).getTime()
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

// Batch form of getReviewOpportunity, for list surfaces that would otherwise do an
// N+1 of RPC calls (or, worse, fall back to a local `status === 'completed'` guess).
// Delegates to the SAME server predicate per booking — no separate eligibility path.
// Bookings the caller may not review resolve to 'not_participant' like anywhere else.
// On a read error the map is empty, and callers treat a missing entry as 'unknown'.
export async function getReviewOpportunities(
  bookingIds: string[],
  direction: ReviewDirection,
): Promise<Map<string, ReviewOpportunity>> {
  const out = new Map<string, ReviewOpportunity>()
  const ids = Array.from(new Set(bookingIds.filter(Boolean)))
  if (ids.length === 0) return out
  const { data, error } = await supabase.rpc('review_opportunities', {
    p_booking_ids: ids,
    p_direction: direction,
  })
  if (error) return out
  for (const row of (data ?? []) as { booking_id: string; opportunity: string }[]) {
    out.set(row.booking_id, (row.opportunity as ReviewOpportunity) ?? 'unknown')
  }
  return out
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
        // PD-093 + PD-068. Two words were wrong here. "temporarily" promised an
        // end the product does not back — a hold clears only when an operator
        // acts, with no timeout and no notification, and this repo already
        // stripped "within 48 hours"-class copy elsewhere for the same reason.
        // And "review activity is paused" was wrong for the common case: a
        // review that had already revealed stays public and keeps counting.
        // Filing changes nothing about it. Only SUBMISSION is blocked, so that
        // is the only thing this says.
        body: 'A new review can\u2019t be added to this booking while it is under review.',
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

// The review-ENTRY decision, in one place.
//
// Both the bookings list and the booking detail need the same answer: given the
// server's opportunity and whether it has been read yet, do we offer a review action,
// show a truthful non-actionable note, or render nothing? Keeping this inline in JSX
// is what forced tests to re-implement it and let the list and the detail drift apart
// (CODE-ARCH-020 / CODE-TEST-021). It takes NO booking status: presentation grouping
// is not eligibility.
export type ReviewEntryKind = 'action' | 'note' | 'none'

export interface ReviewEntry {
  kind: ReviewEntryKind
  // CTA label for 'action', state label for 'note', '' for 'none'.
  label: string
  // Explanatory body for 'note' (surfaces where there is room for it); '' otherwise.
  body: string
}

export function reviewEntryFor(
  opportunity: ReviewOpportunity,
  direction: ReviewDirection,
  loading = false,
): ReviewEntry {
  // Nothing is offered or asserted until the server has answered.
  if (loading) return { kind: 'none', label: '', body: '' }
  const c = reviewOpportunityCopy(opportunity, direction)
  if (c.actionable) return { kind: 'action', label: c.label, body: '' }
  // A terminal state worth naming (already reviewed / window closed / under review).
  // not_completed, not_participant and unknown carry no label and render nothing.
  if (c.terminal && c.label !== '') return { kind: 'note', label: c.label, body: c.body }
  return { kind: 'none', label: '', body: '' }
}

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
