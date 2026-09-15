import { supabase } from './supabase'
import { timeAgo } from './community'

// DISCOVER'S SOCIAL / CONTENT ENTRY POINTS — A SEPARATE PATH, ON PURPOSE.
//
// ── THE RULE THIS FILE EXISTS TO KEEP ─────────────────────────────────────
//
// "The algorithm should rank content, not secretly rank the worth of the
// provider." Following someone is a relationship. Posting is optional activity.
// Neither is a marketplace fact, and neither may move a provider up or down in
// Discover's lanes, its complete grid, or search.
//
// So this module is deliberately NOT part of `lib/discovery.ts`. It does not
// import it, does not extend `DiscoveryProvider`, and returns its own types that
// no ranking module can consume. The separation is structural rather than
// remembered: a social field cannot leak into placement because the type that
// decides placement has nowhere to put one.
//
// PD-120 is the governing decision. What it requires of the followed-activity
// lane, and what is implemented here:
//
//   * a separate relationship/activity data path  — `provider_follows` → `posts_visible`
//   * recent eligible activity only               — `FOLLOWED_ACTIVITY_DAYS`
//   * hidden completely when empty                — the caller renders nothing on []
//   * no placeholder, no unrelated filler         — there is no fallback query here
//   * every card states its source                — `activitySource()`
//   * no effect on general provider ranking       — nothing here is exported to it

/** How far back an item counts as recent activity. One number, stated once. */
export const FOLLOWED_ACTIVITY_DAYS = 30

/** Ceiling on a horizontal row. Not a quota — the row simply has to end. */
export const FOLLOWED_ACTIVITY_LIMIT = 12

/** How many reels the Discover entry row shows before "see the rest in Reels". */
export const REELS_ENTRY_LIMIT = 8

export interface FollowedActivityItem {
  postId: string
  providerId: string
  providerName: string
  /** Thumbnail for a video, the image itself otherwise. Null renders a blank tile. */
  media: string | null
  isVideo: boolean
  createdAt: string
}

export interface DiscoverReelItem {
  postId: string
  media: string | null
}

/** Recent enough to be worth showing. Server ISO in, boolean out — pure. */
export function isRecentActivity(
  createdAt: string | null | undefined,
  now: number = Date.now(),
  days: number = FOLLOWED_ACTIVITY_DAYS,
): boolean {
  if (!createdAt) return false
  const at = new Date(createdAt).getTime()
  if (Number.isNaN(at)) return false
  if (at > now) return false
  return now - at <= days * 24 * 60 * 60 * 1000
}

/**
 * The line under a followed-activity card: WHO it came from and WHEN.
 *
 * PD-120 requires the source be stated on the card, and this is that. It is not
 * decoration: a row of media with no attribution is indistinguishable from a
 * recommendation, which is the one thing this lane must never look like.
 */
export function activitySource(providerName: string, createdAt: string): string {
  return `${providerName} · ${timeAgo(createdAt)}`
}

interface RawPostRow {
  id: string
  provider_id: string
  media_url: string | null
  media_type: string | null
  thumbnail_url: string | null
  created_at: string | null
}

function mediaFor(r: RawPostRow): string | null {
  // A video needs its still; rendering a player in a horizontal row would be
  // heavy and would start playing things nobody asked to play.
  return r.media_type === 'video' ? r.thumbnail_url : (r.media_url ?? r.thumbnail_url)
}

/**
 * Recent work from providers THIS viewer follows.
 *
 * Two queries, in this order, and the order is the point: the follow set comes
 * first and bounds everything after it. There is no path through this function
 * that returns a provider the viewer does not follow.
 *
 * Returns `[]` for a signed-out viewer, a viewer who follows nobody, a viewer
 * whose followed providers have posted nothing recent, and any failure. The
 * caller renders nothing for all of them — there is deliberately NO fallback to
 * popular or nearby providers, because a row titled "From people you follow"
 * that quietly shows strangers is a lie about a relationship.
 */
export async function fetchFollowedActivity(
  userId: string | null | undefined,
  now: number = Date.now(),
): Promise<FollowedActivityItem[]> {
  if (!userId) return []

  const { data: follows, error: followErr } = await supabase
    .from('provider_follows')
    .select('provider_id')
    .eq('follower_user_id', userId)
  if (followErr || !follows) return []

  const providerIds = Array.from(
    new Set((follows as { provider_id: string }[]).map((f) => f.provider_id).filter(Boolean)),
  )
  if (providerIds.length === 0) return []

  // `posts_visible`, not `posts` (PD-089): active only, the block filter in both
  // directions, and nothing from a provider with an open deletion request.
  const { data: posts, error: postErr } = await supabase
    .from('posts_visible')
    .select('id, provider_id, media_url, media_type, thumbnail_url, created_at')
    .in('provider_id', providerIds)
    .eq('is_demo', false)
    .order('created_at', { ascending: false })
    .limit(FOLLOWED_ACTIVITY_LIMIT * 3)
  if (postErr || !posts) return []

  const recent = (posts as RawPostRow[]).filter((r) => isRecentActivity(r.created_at, now))
  if (recent.length === 0) return []

  const { data: providers } = await supabase
    .from('providers')
    .select('id, display_name, business_name')
    .in('id', Array.from(new Set(recent.map((r) => r.provider_id))))
  const nameById = new Map(
    ((providers as { id: string; display_name: string; business_name: string | null }[] | null) ?? [])
      .map((p) => [p.id, p.business_name?.trim() || p.display_name]),
  )

  return recent
    .map((r) => ({
      postId: r.id,
      providerId: r.provider_id,
      providerName: nameById.get(r.provider_id) ?? '',
      media: mediaFor(r),
      isVideo: r.media_type === 'video',
      createdAt: r.created_at ?? '',
    }))
    // A card with no attribution cannot state its source, so it is not shown.
    .filter((i) => i.providerName.length > 0)
    .slice(0, FOLLOWED_ACTIVITY_LIMIT)
}

/**
 * Real reels, newest first, for the Discover entry row.
 *
 * "See the work" — not "these are the best providers". The row is ordered by
 * RECENCY and nothing else: no like count, no view count, no engagement, and no
 * provider signal of any kind reaches this ordering. It is a doorway into the
 * existing Reels experience, not a second ranking of people.
 */
export async function fetchDiscoverReels(
  limit: number = REELS_ENTRY_LIMIT,
): Promise<DiscoverReelItem[]> {
  const { data, error } = await supabase
    .from('posts_visible')
    .select('id, provider_id, media_url, media_type, thumbnail_url, created_at')
    .eq('media_type', 'video')
    .eq('is_demo', false)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error || !data) return []
  return (data as RawPostRow[])
    .map((r) => ({ postId: r.id, media: mediaFor(r) }))
    // No placeholder tiles: a reel with no still is simply not in the row.
    .filter((r) => !!r.media)
}
