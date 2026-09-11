import { supabase } from './supabase'

// ── THE SERVICE COMMUNITY DATA LAYER ──────────────────────────────────────
//
// Community exists so people can FIND providers, ask service questions,
// recommend providers they trust, and so providers can say something useful
// about their business. It is not a status feed and nothing here counts
// attention: `likeCount` is a number on a card, and no function in this module
// or any other orders providers by anything a person posted.
//
// The DATABASE owns every rule that matters. `author_kind` and `intent` are
// CHECK-constrained and paired with each other (20261088000000); a provider post
// is rewritten server-side to the caller's own approved provider; an Open Today
// note is refused unless the provider is already published as open and expires
// at the end of their day. This module renders those answers — it does not
// re-derive them, and a refusal here is read from the server's error code rather
// than predicted from local state.

// ── The intent vocabulary ─────────────────────────────────────────────────
//
// A UNION, not `string`. The old `category` field was typed `{ key: string }[]`
// with no DB constraint and a lookup that mapped anything unrecognised to
// "Other", so a typo wrote a value that rendered as Other forever and filtered
// into nothing, with no error at any layer. These names are the same names the
// CHECK constraint uses, and `tsc` now objects to a fifth.

export type ClientIntent = 'looking_for' | 'need_advice' | 'who_does_this' | 'shoutout'
export type ProviderIntent = 'open_today' | 'update' | 'announcement'
export type CommunityIntent = ClientIntent | ProviderIntent

export interface IntentSpec {
  key: CommunityIntent
  /** The button a person taps. Written as the thing they want, not as a category. */
  label: string
  /** One line under the button: what this is for, in the user's words. */
  blurb: string
  /** The composer's prompt. Never "what's on your mind". */
  prompt: string
  icon: string
}

export const CLIENT_INTENTS: IntentSpec[] = [
  {
    key: 'looking_for',
    label: 'Looking for someone',
    blurb: 'Ask the community to point you to a provider',
    prompt: 'What do you need, and when?',
    icon: 'search',
  },
  {
    key: 'need_advice',
    label: 'Need advice',
    blurb: 'A question about a service, before you book',
    prompt: 'What would you like to know?',
    icon: 'help-circle',
  },
  {
    key: 'who_does_this',
    label: 'Who does this style?',
    blurb: 'Describe the look and ask who can do it',
    prompt: 'Describe the style you are after.',
    icon: 'scissors',
  },
  {
    key: 'shoutout',
    label: 'Recommend a provider',
    blurb: 'Name someone who did good work',
    prompt: 'What did they do, and why would you send a friend?',
    icon: 'award',
  },
]

export const PROVIDER_INTENTS: IntentSpec[] = [
  {
    key: 'open_today',
    label: 'Open today',
    blurb: 'Say what you have free — only on days you are published as open',
    prompt: 'What do you have available today?',
    icon: 'sun',
  },
  {
    key: 'update',
    label: 'Update',
    blurb: 'Something that changed',
    prompt: 'What changed?',
    icon: 'refresh-cw',
  },
  {
    key: 'announcement',
    label: 'Announcement',
    blurb: 'Something new worth knowing',
    prompt: 'What would you like people to know?',
    icon: 'volume-2',
  },
]

const INTENT_BY_KEY = new Map<CommunityIntent, IntentSpec>(
  [...CLIENT_INTENTS, ...PROVIDER_INTENTS].map((i) => [i.key, i]),
)

export function intentLabel(key: string): string {
  return INTENT_BY_KEY.get(key as CommunityIntent)?.label ?? 'Post'
}

export function intentSpec(key: string): IntentSpec | null {
  return INTENT_BY_KEY.get(key as CommunityIntent) ?? null
}

export function isClientIntent(key: string): key is ClientIntent {
  return CLIENT_INTENTS.some((i) => i.key === key)
}

/**
 * The service types a post may be tagged with. Mirrors the DB CHECK on
 * `community_posts.service_tag`; `null` means "not specified" rather than a
 * catch-all "Other" value, so an unspecified post is not filed under a category
 * nobody chose.
 */
export const SERVICE_TAGS = [
  'Hair',
  'Lashes',
  'Barber',
  'Braider',
  'Trainer',
  'Nails',
  'Makeup',
  'Esthetics',
] as const
export type ServiceTag = (typeof SERVICE_TAGS)[number]

// Retained for the legacy `category` column, which the reshape leaves in place
// on existing rows and no longer writes. Nothing new should use these.
export const COMMUNITY_CATEGORIES: { key: string; label: string }[] = [
  { key: 'advice', label: 'Advice' },
  { key: 'questions', label: 'Questions' },
  { key: 'general', label: 'Other' },
]
export const DEFAULT_CATEGORY = 'general'
export function categoryLabel(key: string): string {
  return COMMUNITY_CATEGORIES.find((c) => c.key === key)?.label ?? 'Other'
}

export interface CommunityProviderInfo {
  name: string
  photo: string | null
  category: string
  neighborhood: string | null
}

/**
 * Who is speaking. A provider post shows the BUSINESS; a client post shows the
 * PERSON. Before the reshape there was no person path at all — the fallback
 * rendered the literal word "Provider" — so a client author would have appeared
 * as a nameless business.
 */
export interface CommunityAuthor {
  kind: 'client' | 'provider'
  name: string
  photo: string | null
  /** Present only for a provider author: the profile their name links to. */
  providerId: string | null
  category: string
  neighborhood: string | null
}

export interface CommunityPostView {
  id: string
  providerId: string | null
  userId: string
  authorKind: 'client' | 'provider'
  intent: CommunityIntent
  content: string
  serviceTag: string | null
  area: string | null
  timing: string | null
  taggedProviderId: string | null
  /** True only when the SERVER verified a completed booking behind a shoutout. */
  bookingBacked: boolean
  expiresAt: string | null
  likeCount: number
  replyCount: number
  createdAt: string
  author: CommunityAuthor
  /** The provider a shoutout names, when it could be resolved. */
  taggedProvider: CommunityProviderInfo | null
}

export interface CommunityReplyView {
  id: string
  providerId: string | null
  userId: string
  authorKind: 'client' | 'provider'
  kind: 'reply' | 'can_help'
  content: string
  createdAt: string
  author: CommunityAuthor
}

interface RawPostRow {
  id: string
  provider_id: string | null
  user_id: string
  author_kind: 'client' | 'provider'
  intent: CommunityIntent
  content: string
  service_tag: string | null
  area: string | null
  timing: string | null
  tagged_provider_id: string | null
  tagged_booking_id: string | null
  expires_at: string | null
  like_count: number | null
  reply_count: number | null
  created_at: string
}

const UNKNOWN_PERSON: CommunityAuthor = {
  kind: 'client',
  name: 'Someone',
  photo: null,
  providerId: null,
  category: '',
  neighborhood: null,
}

/**
 * Display names for CLIENT authors, from `clients_public` — the same narrow view
 * the review list uses. A client author whose row cannot be read renders as
 * "Someone" rather than as a business, which is the failure the old
 * provider-only assembly could not express.
 */
async function fetchClientInfoMap(
  userIds: string[],
): Promise<Map<string, { name: string; photo: string | null }>> {
  const map = new Map<string, { name: string; photo: string | null }>()
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (ids.length === 0) return map
  const { data } = await supabase
    .from('clients_public')
    .select('id, name, avatar_url')
    .in('id', ids)
  for (const c of (data as { id: string; name: string | null; avatar_url: string | null }[] | null) ??
    []) {
    map.set(c.id, { name: c.name || 'Someone', photo: c.avatar_url ?? null })
  }
  return map
}

async function buildAuthorMaps(
  rows: { provider_id: string | null; user_id: string; author_kind: 'client' | 'provider' }[],
  extraProviderIds: (string | null)[] = [],
) {
  const providerIds = [
    ...rows.filter((r) => r.author_kind === 'provider').map((r) => r.provider_id),
    ...extraProviderIds,
  ].filter((x): x is string => !!x)
  const clientIds = rows.filter((r) => r.author_kind === 'client').map((r) => r.user_id)
  const [providers, clients] = await Promise.all([
    fetchProviderInfoMap(providerIds),
    fetchClientInfoMap(clientIds),
  ])
  return { providers, clients }
}

function authorFor(
  row: { provider_id: string | null; user_id: string; author_kind: 'client' | 'provider' },
  providers: Map<string, CommunityProviderInfo>,
  clients: Map<string, { name: string; photo: string | null }>,
): CommunityAuthor {
  if (row.author_kind === 'provider' && row.provider_id) {
    const p = providers.get(row.provider_id)
    if (!p) return { ...UNKNOWN_PERSON, kind: 'provider', name: 'A provider' }
    return {
      kind: 'provider',
      name: p.name,
      photo: p.photo,
      providerId: row.provider_id,
      category: p.category,
      neighborhood: p.neighborhood,
    }
  }
  const c = clients.get(row.user_id)
  return c ? { ...UNKNOWN_PERSON, name: c.name, photo: c.photo } : UNKNOWN_PERSON
}

// Attach author (business or person) and any tagged provider to raw post rows.
async function assemblePosts(rows: RawPostRow[]): Promise<CommunityPostView[]> {
  if (rows.length === 0) return []
  const { providers, clients } = await buildAuthorMaps(
    rows,
    rows.map((r) => r.tagged_provider_id),
  )
  return rows.map((r) => ({
    id: r.id,
    providerId: r.provider_id,
    userId: r.user_id,
    authorKind: r.author_kind,
    intent: r.intent,
    content: r.content,
    serviceTag: r.service_tag,
    area: r.area,
    timing: r.timing,
    taggedProviderId: r.tagged_provider_id,
    bookingBacked: r.tagged_booking_id != null,
    expiresAt: r.expires_at,
    likeCount: r.like_count ?? 0,
    replyCount: r.reply_count ?? 0,
    createdAt: r.created_at,
    author: authorFor(r, providers, clients),
    taggedProvider: r.tagged_provider_id
      ? providers.get(r.tagged_provider_id) ?? null
      : null,
  }))
}

// ── PD-089 ────────────────────────────────────────────────────────────────
//
// Every ordinary content read here goes through a `_visible` view, which returns
// the same columns MINUS anyone the caller is blocked with in either direction.
// The filter lives in the view, not in a predicate a client could call, so there
// is no "is X hidden from me" to ask — only "show me what I can see", and an
// absent post is indistinguishable from one deleted, deactivated or filtered.
//
// Replies get their own view: hiding a post while leaving its author's replies
// under someone else's post would deliver half the rule and read as a bug.

const POST_COLUMNS =
  'id, provider_id, user_id, author_kind, intent, content, service_tag, area, timing, ' +
  'tagged_provider_id, tagged_booking_id, expires_at, like_count, reply_count, created_at'


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
/**
 * PD-089 — WHICH TABLE THIS READS IS A PRODUCT DECISION, NOT A DETAIL.
 *
 * `scope: 'feed'` filters blocked parties out; `scope: 'transaction'` does not.
 * The helper is shared by the community feed AND by barter Trade Activity, and
 * pointing all of it at the filtered view broke the live-transaction exception:
 * a counterparty on a CONFIRMED agreement with an unresolved obligation rendered
 * as "Provider" with no photo, because the view returned no row for them.
 *
 * PD-089 preserves exactly that access — two people inside a live obligation
 * must still see each other's names, terms and controls, or the block strands
 * the trade. It is also the same failure in miniature as the block oracle: a
 * counterparty who is nameless ONLY when blocked is itself a signal.
 *
 * Default is `'feed'`, so a new caller is filtered unless it says otherwise.
 */
export async function fetchProviderInfoMap(
  providerIds: string[],
  scope: 'feed' | 'transaction' = 'feed',
): Promise<Map<string, CommunityProviderInfo>> {
  const map = new Map<string, CommunityProviderInfo>()
  const ids = Array.from(new Set(providerIds.filter(Boolean)))
  if (ids.length === 0) return map

  const { data: provs } = await supabase
    .from(scope === 'feed' ? 'providers_visible' : 'providers')
    .select('id, display_name, profile_photo_url, category_id, neighborhood')
    .in('id', ids)

  const rows =
    (provs as
      | {
          id: string
          display_name: string | null
          profile_photo_url: string | null
          category_id: number | null
          neighborhood: string | null
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
      neighborhood: r.neighborhood ?? null,
    })
  }
  return map
}

/**
 * The feed, newest-first, optionally narrowed to one intent or one service tag.
 *
 * ORDER IS CHRONOLOGICAL AND NOTHING ELSE. There is no engagement ranking here
 * and there must not be one: a service community where the loudest post wins is
 * a competition, and a provider who does not post must not be worse off for it.
 *
 * Reads go through `community_posts_visible`, which carries the block filter,
 * the Open Today time bound and the requirement that an Open Today note's
 * provider is STILL published as open — none of which is re-derived here.
 */
export async function fetchCommunityFeed(
  opts: { intent?: CommunityIntent | null; serviceTag?: string | null } = {},
  offset = 0,
  limit = 20,
): Promise<CommunityPostView[]> {
  let query = supabase
    .from('community_posts_visible')
    .select(POST_COLUMNS)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (opts.intent) query = query.eq('intent', opts.intent)
  if (opts.serviceTag) query = query.eq('service_tag', opts.serviceTag)

  const { data, error } = await query
  if (error) {
    console.log('Community feed error:', error)
    return []
  }
  return assemblePosts((data as unknown as RawPostRow[] | null) ?? [])
}

/**
 * The Discover modules. Each is a SMALL, capped read of one intent group — the
 * marketplace stays the primary surface and Community is a doorway onto it, not
 * a feed that takes the page over.
 *
 * `openToday` needs no expiry filter of its own: the view already requires both
 * a live expiry and current membership of `providers_open_today()`, so a stale
 * note cannot reach this call in the first place.
 */
export async function fetchDiscoverCommunity(limit = 3): Promise<{
  openToday: CommunityPostView[]
  updates: CommunityPostView[]
  shoutouts: CommunityPostView[]
  asks: CommunityPostView[]
}> {
  const pull = async (intents: CommunityIntent[]) => {
    const { data, error } = await supabase
      .from('community_posts_visible')
      .select(POST_COLUMNS)
      .in('intent', intents)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) {
      console.log('Discover community module error:', error.message)
      return [] as RawPostRow[]
    }
    return (data as unknown as RawPostRow[] | null) ?? []
  }
  const [openToday, updates, shoutouts, asks] = await Promise.all([
    pull(['open_today']),
    pull(['update', 'announcement']),
    pull(['shoutout']),
    pull(['looking_for', 'need_advice', 'who_does_this']),
  ])
  const [a, b, c, d] = await Promise.all([
    assemblePosts(openToday),
    assemblePosts(updates),
    assemblePosts(shoutouts),
    assemblePosts(asks),
  ])
  return { openToday: a, updates: b, shoutouts: c, asks: d }
}

/** Shoutouts naming one provider, for their profile. Never a rating. */
export async function fetchShoutoutsForProvider(
  providerId: string,
  limit = 5,
): Promise<CommunityPostView[]> {
  const { data, error } = await supabase
    .from('community_posts_visible')
    .select(POST_COLUMNS)
    .eq('tagged_provider_id', providerId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) {
    console.log('Provider shoutouts error:', error.message)
    return []
  }
  return assemblePosts((data as unknown as RawPostRow[] | null) ?? [])
}

// Bookmarked posts for the "Saved" filter: the user's bookmarks joined to the
// active posts, newest-first.
export async function fetchBookmarkedFeed(
  userId: string,
): Promise<CommunityPostView[]> {
  const { data: bm } = await supabase
    .from('community_bookmarks')
    .select('post_id')
    .eq('user_id', userId)
  const postIds = ((bm as { post_id: string }[] | null) ?? []).map((b) => b.post_id)
  if (postIds.length === 0) return []

  const { data, error } = await supabase
    .from('community_posts_visible')
    .select(POST_COLUMNS)
    .in('id', postIds)
    .order('created_at', { ascending: false })
  if (error) {
    console.log('Bookmarked feed error:', error)
    return []
  }
  return assemblePosts((data as unknown as RawPostRow[] | null) ?? [])
}

// Which of the given post ids the current user has bookmarked.
export async function fetchBookmarkedPostIds(
  userId: string,
  postIds: string[],
): Promise<Set<string>> {
  if (postIds.length === 0) return new Set()
  const { data } = await supabase
    .from('community_bookmarks')
    .select('post_id')
    .eq('user_id', userId)
    .in('post_id', postIds)
  return new Set(((data as { post_id: string }[] | null) ?? []).map((r) => r.post_id))
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
    .from('community_posts_visible')
    .select(POST_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error || !data) {
    if (error) console.log('Community post error:', error)
    return null
  }
  const [post] = await assemblePosts([data as unknown as RawPostRow])
  return post ?? null
}

export async function fetchCommunityReplies(
  postId: string,
): Promise<CommunityReplyView[]> {
  const { data, error } = await supabase
    .from('community_replies_visible')
    .select('id, provider_id, user_id, author_kind, kind, content, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (error) {
    console.log('Community replies error:', error)
    return []
  }
  const rows =
    (data as
      | {
          id: string
          provider_id: string | null
          user_id: string
          author_kind: 'client' | 'provider'
          kind: 'reply' | 'can_help'
          content: string
          created_at: string
        }[]
      | null) ?? []
  if (rows.length === 0) return []
  const { providers, clients } = await buildAuthorMaps(rows)
  return rows.map((r) => ({
    id: r.id,
    providerId: r.provider_id,
    userId: r.user_id,
    authorKind: r.author_kind,
    kind: r.kind,
    content: r.content,
    createdAt: r.created_at,
    author: authorFor(r, providers, clients),
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


// ══ WRITES ════════════════════════════════════════════════════════════════
//
// Every community write lives HERE, beside the reads. Before the reshape the
// like / bookmark / delete writes were spelled inline in two screens, in two
// shapes that had already diverged — the same pattern `lib/negotiationWrite.ts`
// was extracted to end after six hand-written copies drifted apart. A rule that
// exists in two places is a rule with two versions.

export interface CommunityWriteResult {
  ok: boolean
  /** A message written for the person who hit it, or null when it succeeded. */
  message: string | null
}

const OK: CommunityWriteResult = { ok: true, message: null }

/**
 * Turn a server refusal into something true. The DATABASE decides all of these;
 * this maps its codes rather than predicting them, so a rule that changes in SQL
 * changes here by producing a different code — not by silently disagreeing.
 */
export function communityWriteError(err: { code?: string; message?: string } | null): string {
  const code = err?.code ?? ''
  switch (code) {
    case 'PT430':
      return 'Publish your hours for today in Business → Availability before posting an Open Today note.'
    case 'PT431':
      return 'This account can’t post as a provider right now.'
    case 'PT432':
      return 'That provider can’t be recommended.'
    case 'PT433':
      return 'That booking doesn’t support this recommendation.'
    case 'PT427':
      return 'This post isn’t available.'
    case '42501':
      return 'Sign in to post.'
    case '23514':
      return 'That isn’t something this account can post.'
    default:
      return 'That didn’t go through. Try again.'
  }
}

export interface NewCommunityPost {
  intent: CommunityIntent
  content: string
  serviceTag?: string | null
  area?: string | null
  timing?: string | null
  taggedProviderId?: string | null
  /** Optional, and VERIFIED by the server when supplied. */
  taggedBookingId?: string | null
}

/**
 * Create a post. `author_kind` is derived from the intent, not passed in — the
 * two are paired by a CHECK constraint anyway, and letting a caller supply both
 * is how they come to disagree.
 *
 * `provider_id` is deliberately NOT sent. The server rewrites it to the caller's
 * own approved provider, so there is no id worth guessing and nothing here has
 * to know which business the caller owns.
 */
export async function createCommunityPost(
  userId: string,
  post: NewCommunityPost,
): Promise<CommunityWriteResult> {
  const authorKind: 'client' | 'provider' = isClientIntent(post.intent)
    ? 'client'
    : 'provider'
  const { error } = await supabase.from('community_posts').insert({
    user_id: userId,
    author_kind: authorKind,
    intent: post.intent,
    content: post.content.trim(),
    service_tag: post.serviceTag || null,
    area: post.area || null,
    timing: post.timing || null,
    tagged_provider_id: post.taggedProviderId || null,
    tagged_booking_id: post.taggedBookingId || null,
  })
  if (error) return { ok: false, message: communityWriteError(error) }
  return OK
}

/**
 * Reply in a thread. `can_help` is a provider offering to do the work — the
 * structured answer a "looking for someone" post actually needs, so the surface
 * can offer profile / message / book instead of a comment thread.
 */
export async function createCommunityReply(
  userId: string,
  postId: string,
  content: string,
  opts: { asProvider: boolean; kind?: 'reply' | 'can_help' } = { asProvider: false },
): Promise<CommunityWriteResult> {
  const { error } = await supabase.from('community_replies').insert({
    post_id: postId,
    user_id: userId,
    author_kind: opts.asProvider ? 'provider' : 'client',
    kind: opts.kind ?? 'reply',
    content: content.trim(),
  })
  if (error) return { ok: false, message: communityWriteError(error) }
  return OK
}

/** Add or remove a like. Returns the server's answer, not an optimistic guess. */
export async function setPostLiked(
  userId: string,
  postId: string,
  liked: boolean,
): Promise<CommunityWriteResult> {
  const { error } = liked
    ? await supabase.from('community_post_likes').insert({ user_id: userId, post_id: postId })
    : await supabase
        .from('community_post_likes')
        .delete()
        .eq('user_id', userId)
        .eq('post_id', postId)
  // A duplicate like is not a failure — the desired state is already the state.
  if (error && error.code !== '23505') {
    return { ok: false, message: communityWriteError(error) }
  }
  return OK
}

export async function setPostBookmarked(
  userId: string,
  postId: string,
  saved: boolean,
): Promise<CommunityWriteResult> {
  const { error } = saved
    ? await supabase.from('community_bookmarks').insert({ user_id: userId, post_id: postId })
    : await supabase
        .from('community_bookmarks')
        .delete()
        .eq('user_id', userId)
        .eq('post_id', postId)
  if (error && error.code !== '23505') {
    return { ok: false, message: communityWriteError(error) }
  }
  return OK
}

/**
 * Remove your own post.
 *
 * ASSERTED ON THE ROW COUNT, not on the absence of an error. RLS FILTERS a post
 * the caller does not own out of their DELETE scope, so the statement affects
 * zero rows and raises nothing at all — a code path that only checks `error`
 * reports someone else's post as successfully deleted.
 */
export async function deleteOwnPost(postId: string): Promise<CommunityWriteResult> {
  const { data, error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', postId)
    .select('id')
  if (error) return { ok: false, message: communityWriteError(error) }
  if (!data || data.length === 0) {
    return { ok: false, message: 'That post is no longer yours to remove.' }
  }
  return OK
}

export async function deleteOwnReply(replyId: string): Promise<CommunityWriteResult> {
  const { data, error } = await supabase
    .from('community_replies')
    .delete()
    .eq('id', replyId)
    .select('id')
  if (error) return { ok: false, message: communityWriteError(error) }
  if (!data || data.length === 0) {
    return { ok: false, message: 'That reply is no longer yours to remove.' }
  }
  return OK
}

/**
 * Completed bookings the caller could cite behind a shoutout for one provider.
 * Empty is the ordinary case in a small beta, and the composer must treat it as
 * ordinary — the linkage is optional evidence, not a requirement (OQ-081).
 */
export async function fetchShoutoutBookingOptions(
  userId: string,
  providerId: string,
): Promise<{ id: string; serviceName: string; completedAt: string }[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, service_name, submitted_at, completed_at')
    .eq('user_id', userId)
    .eq('provider_id', providerId)
    // DRAFTS ARE EXCLUDED EXPLICITLY, even though `completed_at is not null`
    // already implies it — a client's own SELECT policy deliberately returns
    // their unsent drafts so they can be resumed, and "implied" is exactly how
    // a draft came to be presented as a real request once before.
    .not('submitted_at', 'is', null)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(10)
  if (error) {
    console.log('Shoutout booking options error:', error.message)
    return []
  }
  return ((data as { id: string; service_name: string | null; completed_at: string }[] | null) ??
    []).map((b) => ({
    id: b.id,
    serviceName: b.service_name || 'a service',
    completedAt: b.completed_at,
  }))
}
