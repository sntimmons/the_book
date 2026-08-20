import { supabase } from './supabase'

// Provider-only community hub data layer. Provider display info is batch-fetched
// by provider_id (same pattern as the reels feed) and attached to posts/replies.

export const COMMUNITY_CATEGORIES: { key: string; label: string }[] = [
  { key: 'advice', label: 'Advice' },
  { key: 'questions', label: 'Questions' },
  { key: 'wins', label: 'Wins' },
  { key: 'general', label: 'Other' },
]

// Default category for a new post (labeled "Other").
export const DEFAULT_CATEGORY = 'general'

export function categoryLabel(key: string): string {
  return COMMUNITY_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other'
}

export interface CommunityProviderInfo {
  name: string
  photo: string | null
  category: string
}

export interface CommunityPostView {
  id: string
  providerId: string
  content: string
  category: string
  likeCount: number
  replyCount: number
  createdAt: string
  provider: CommunityProviderInfo
}

export interface CommunityReplyView {
  id: string
  providerId: string
  content: string
  createdAt: string
  provider: CommunityProviderInfo
}

const UNKNOWN_PROVIDER: CommunityProviderInfo = {
  name: 'Provider',
  photo: null,
  category: '',
}

// Short relative timestamp (now / 5m / 3h / 2d / 1w).
export function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return 'now'
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

// Batch-fetch provider display info (name, photo, category name) keyed by
// providers.id, resolving category_id -> category name in a second query.
export async function fetchProviderInfoMap(
  providerIds: string[],
): Promise<Map<string, CommunityProviderInfo>> {
  const map = new Map<string, CommunityProviderInfo>()
  const ids = Array.from(new Set(providerIds.filter(Boolean)))
  if (ids.length === 0) return map

  const { data: provs } = await supabase
    .from('providers')
    .select('id, display_name, profile_photo_url, category_id')
    .in('id', ids)

  const rows =
    (provs as
      | {
          id: string
          display_name: string | null
          profile_photo_url: string | null
          category_id: number | null
        }[]
      | null) ?? []

  const catIds = Array.from(
    new Set(rows.map((r) => r.category_id).filter((x): x is number => x != null)),
  )
  const catNames = new Map<number, string>()
  if (catIds.length > 0) {
    const { data: cats } = await supabase
      .from('categories')
      .select('id, name')
      .in('id', catIds)
    for (const c of (cats as { id: number; name: string }[] | null) ?? []) {
      catNames.set(c.id, c.name)
    }
  }

  for (const r of rows) {
    map.set(r.id, {
      name: r.display_name || 'Provider',
      photo: r.profile_photo_url ?? null,
      category: r.category_id != null ? catNames.get(r.category_id) ?? '' : '',
    })
  }
  return map
}

// Feed: active posts newest-first, optionally filtered by category.
export async function fetchCommunityFeed(
  category: string | null,
): Promise<CommunityPostView[]> {
  let query = supabase
    .from('community_posts')
    .select('id, provider_id, content, category, like_count, reply_count, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(50)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) {
    console.log('Community feed error:', error)
    return []
  }
  const rows =
    (data as
      | {
          id: string
          provider_id: string
          content: string
          category: string
          like_count: number | null
          reply_count: number | null
          created_at: string
        }[]
      | null) ?? []

  const infoMap = await fetchProviderInfoMap(rows.map((r) => r.provider_id))
  return rows.map((r) => ({
    id: r.id,
    providerId: r.provider_id,
    content: r.content,
    category: r.category,
    likeCount: r.like_count ?? 0,
    replyCount: r.reply_count ?? 0,
    createdAt: r.created_at,
    provider: infoMap.get(r.provider_id) ?? UNKNOWN_PROVIDER,
  }))
}

// Which of the given post ids the current user has liked.
export async function fetchLikedPostIds(
  userId: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set()
  const { data } = await supabase
    .from('community_post_likes')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds)
  return new Set(
    ((data as { post_id: string }[] | null) ?? []).map((r) => r.post_id),
  )
}

export async function fetchCommunityPost(
  id: string,
): Promise<CommunityPostView | null> {
  const { data, error } = await supabase
    .from('community_posts')
    .select('id, provider_id, content, category, like_count, reply_count, created_at')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) {
    if (error) console.log('Community post error:', error)
    return null
  }
  const r = data as {
    id: string
    provider_id: string
    content: string
    category: string
    like_count: number | null
    reply_count: number | null
    created_at: string
  }
  const infoMap = await fetchProviderInfoMap([r.provider_id])
  return {
    id: r.id,
    providerId: r.provider_id,
    content: r.content,
    category: r.category,
    likeCount: r.like_count ?? 0,
    replyCount: r.reply_count ?? 0,
    createdAt: r.created_at,
    provider: infoMap.get(r.provider_id) ?? UNKNOWN_PROVIDER,
  }
}

export async function fetchCommunityReplies(
  postId: string,
): Promise<CommunityReplyView[]> {
  const { data, error } = await supabase
    .from('community_replies')
    .select('id, provider_id, content, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (error) {
    console.log('Community replies error:', error)
    return []
  }
  const rows =
    (data as
      | { id: string; provider_id: string; content: string; created_at: string }[]
      | null) ?? []
  const infoMap = await fetchProviderInfoMap(rows.map((r) => r.provider_id))
  return rows.map((r) => ({
    id: r.id,
    providerId: r.provider_id,
    content: r.content,
    createdAt: r.created_at,
    provider: infoMap.get(r.provider_id) ?? UNKNOWN_PROVIDER,
  }))
}

// Initials for an avatar fallback.
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
}
