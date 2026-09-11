import { useCallback, useMemo, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { cacheBustedPhoto } from '@/lib/image'
import {
  CLIENT_INTENTS,
  PROVIDER_INTENTS,
  SERVICE_TAGS,
  CommunityIntent,
  CommunityPostView,
  fetchCommunityFeed,
  fetchBookmarkedPostIds,
  fetchLikedPostIds,
  setPostLiked,
  setPostBookmarked,
  deleteOwnPost,
  intentLabel,
  timeAgo,
  initials,
} from '@/lib/community'
import {
  submitReport,
  REPORT_SUBMITTED_COPY,
  REPORT_FAILED_COPY,
  REPORT_LIMITED_COPY,
  ReportReason,
} from '@/lib/safety'
import ReportSheet from '@/components/ReportSheet'

// ── COMMUNITY ─────────────────────────────────────────────────────────────
//
// A service community, not a social network. It exists so people can find
// providers, ask service questions, recommend someone they trust, and so
// providers can say something useful about their business.
//
// THREE THINGS THIS SCREEN DELIBERATELY DOES NOT DO:
//
//   * It does not open with a blank composer. A client sees four things they
//     might actually want; "what's on your mind" is how a service community
//     becomes a status feed.
//   * It does not rank by engagement. The order is chronological, full stop. A
//     provider who never posts is not worse off for it, here or anywhere else.
//   * It does not replace Discover. Discover is the marketplace; this is a
//     doorway onto it, reached FROM it.

const PAGE = 20

const POST_REPORT_REASONS: { label: string; value: ReportReason }[] = [
  { label: 'Inappropriate content', value: 'profile_or_content' },
  { label: 'Harassment', value: 'harassment' },
  { label: 'Scam or fraud', value: 'scam_or_fraud' },
  { label: 'Safety concern', value: 'safety_concern' },
  { label: 'Something else', value: 'other' },
]

type FeedPost = CommunityPostView & { isLiked: boolean; isBookmarked: boolean }

const INTENT_FILTERS: { key: CommunityIntent | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'looking_for', label: 'Looking for' },
  { key: 'who_does_this', label: 'Styles' },
  { key: 'need_advice', label: 'Advice' },
  { key: 'shoutout', label: 'Recommendations' },
  { key: 'open_today', label: 'Open today' },
  { key: 'update', label: 'Updates' },
]

export default function CommunityHub() {
  const insets = useSafeAreaInsets()
  const { user, isProvider, roleLoading } = useAuth()
  const currentUserId = user?.id ?? null
  // Discover's modules deep-link into the matching filter, so "Open today →"
  // lands on Open Today rather than on the top of an unfiltered feed.
  const params = useLocalSearchParams<{ intent?: string }>()
  const initialIntent = INTENT_FILTERS.some((f) => f.key === params.intent)
    ? (params.intent as CommunityIntent)
    : null

  const [posts, setPosts] = useState<FeedPost[]>([])
  const [intent, setIntent] = useState<CommunityIntent | null>(initialIntent)
  const [serviceTag, setServiceTag] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reportTarget, setReportTarget] = useState<CommunityPostView | null>(null)
  const [reporting, setReporting] = useState(false)

  const stampFlags = useCallback(
    async (list: CommunityPostView[]): Promise<FeedPost[]> => {
      if (!user) return list.map((p) => ({ ...p, isLiked: false, isBookmarked: false }))
      const ids = list.map((p) => p.id)
      const [liked, saved] = await Promise.all([
        fetchLikedPostIds(user.id, ids),
        fetchBookmarkedPostIds(user.id, ids),
      ])
      return list.map((p) => ({
        ...p,
        isLiked: liked.has(p.id),
        isBookmarked: saved.has(p.id),
      }))
    },
    [user],
  )

  const load = useCallback(
    async (refresh = false) => {
      if (refresh) setRefreshing(true)
      const feed = await fetchCommunityFeed({ intent, serviceTag }, 0, PAGE)
      setPosts(await stampFlags(feed))
      setHasMore(feed.length === PAGE)
      setLoading(false)
      setRefreshing(false)
    },
    [intent, serviceTag, stampFlags],
  )

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || !hasMore) return
    setLoadingMore(true)
    const feed = await fetchCommunityFeed({ intent, serviceTag }, posts.length, PAGE)
    const stamped = await stampFlags(feed)
    setPosts((prev) => [...prev, ...stamped])
    setHasMore(feed.length === PAGE)
    setLoadingMore(false)
  }, [loading, loadingMore, hasMore, intent, serviceTag, posts.length, stampFlags])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  // Optimistic, then RECONCILED against the server's answer rather than a local
  // guess — the write helpers in lib/community.ts are the single copy of each of
  // these, because the two screens that used to spell them inline had already
  // drifted apart.
  async function toggleLike(postId: string) {
    const post = posts.find((p) => p.id === postId)
    if (!post || !user) return
    const was = post.isLiked
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, isLiked: !was, likeCount: Math.max(0, p.likeCount + (was ? -1 : 1)) }
          : p,
      ),
    )
    const res = await setPostLiked(user.id, postId, !was)
    if (!res.ok) {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, isLiked: was, likeCount: Math.max(0, p.likeCount + (was ? 1 : -1)) }
            : p,
        ),
      )
    }
  }

  async function toggleSave(postId: string) {
    const post = posts.find((p) => p.id === postId)
    if (!post || !user) return
    const was = post.isBookmarked
    setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, isBookmarked: !was } : p)))
    const res = await setPostBookmarked(user.id, postId, !was)
    if (!res.ok) {
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, isBookmarked: was } : p)))
    }
  }

  async function removePost(postId: string) {
    const idx = posts.findIndex((p) => p.id === postId)
    if (idx < 0) return
    const removed = posts[idx]
    setPosts((prev) => prev.filter((p) => p.id !== postId))
    const res = await deleteOwnPost(postId)
    if (!res.ok) {
      setPosts((prev) => {
        const next = [...prev]
        next.splice(Math.min(idx, next.length), 0, removed)
        return next
      })
      Alert.alert('Could not remove', res.message ?? 'Please try again.', [{ text: 'OK' }])
    }
  }

  async function reportPost(post: CommunityPostView, reason: ReportReason, notes: string | null) {
    if (!user) return
    // The post's AUTHOR is the target, and the post id rides in the notes so an
    // operator can find the content — `reports` has no post column, and adding
    // one would be a schema change the note already substitutes for. This is the
    // SAME intake every other report uses, which is the point: a second
    // reporting system is a second place to forget to look.
    const res = await submitReport({
      reporterUserId: user.id,
      type: 'content',
      reason,
      reportedUserId: post.userId,
      notes: notes ? `community post ${post.id}\n\n${notes}` : `community post ${post.id}`,
    })
    if (res.limited) {
      Alert.alert(REPORT_LIMITED_COPY.title, REPORT_LIMITED_COPY.body, [{ text: 'OK' }])
      return
    }
    const copy = res.ok ? REPORT_SUBMITTED_COPY : REPORT_FAILED_COPY
    Alert.alert(copy.title, copy.body, [{ text: 'OK' }])
  }

  function openMenu(post: FeedPost) {
    if (post.userId === currentUserId) {
      Alert.alert('Remove post', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removePost(post.id) },
      ])
      return
    }
    // A sheet, not an Alert: Android's Alert.alert renders at most THREE buttons
    // and silently drops the rest, which would have removed two reasons AND
    // Cancel. See components/ReportSheet.tsx.
    setReportTarget(post)
  }

  const entryIntents = useMemo(
    () => (isProvider ? [...CLIENT_INTENTS, ...PROVIDER_INTENTS] : CLIENT_INTENTS),
    [isProvider],
  )

  const listHeader = (
    <View>
      {/* WHAT DO YOU WANT TO DO — the composer entry, as intents rather than a
          blank box. This is also the empty state's answer: a sparse feed still
          shows a person four useful things to do. */}
      <Text style={s.sectionLabel}>Ask the community</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.entryRow}
      >
        {entryIntents.map((i) => (
          <TouchableOpacity
            key={i.key}
            style={s.entryCard}
            activeOpacity={0.85}
            onPress={() =>
              router.push({ pathname: '/community/compose', params: { intent: i.key } } as never)
            }
          >
            <Feather name={i.icon as never} size={16} color="#C8922A" />
            <Text style={s.entryTitle}>{i.label}</Text>
            <Text style={s.entryBlurb} numberOfLines={2}>
              {i.blurb}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isProvider ? (
        <TouchableOpacity
          style={s.businessRow}
          activeOpacity={0.8}
          onPress={() => router.push('/(tabs)/business/community' as never)}
        >
          <Feather name="briefcase" size={14} color="rgba(240,232,213,0.6)" />
          <Text style={s.businessRowText}>Manage your posts and trades in Business</Text>
          <Feather name="chevron-right" size={16} color="rgba(240,232,213,0.35)" />
        </TouchableOpacity>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.pillScroll}
        contentContainerStyle={s.pillRow}
      >
        {INTENT_FILTERS.map((f) => (
          <Pill
            key={f.label}
            label={f.label}
            active={intent === f.key}
            onPress={() => setIntent(f.key)}
          />
        ))}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.pillScroll}
        contentContainerStyle={s.pillRow}
      >
        <Pill
          label="All services"
          active={serviceTag === null}
          onPress={() => setServiceTag(null)}
        />
        {SERVICE_TAGS.map((t) => (
          <Pill
            key={t}
            label={t}
            active={serviceTag === t}
            onPress={() => setServiceTag((prev) => (prev === t ? null : t))}
          />
        ))}
      </ScrollView>
    </View>
  )

  if (roleLoading) {
    return (
      <View style={s.root}>
        <Header />
        <View style={s.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <Header />
      {loading ? (
        <View style={s.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          ListHeaderComponent={listHeader}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={{ paddingVertical: 20 }}>
                <ActivityIndicator color="rgba(240,232,213,0.4)" />
              </View>
            ) : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="rgba(240,232,213,0.4)"
            />
          }
          ListEmptyComponent={
            // HONEST, AND NOT A DEAD FEED. In a 25-30 person beta this is the
            // state most people will see, so it says what is true — nothing here
            // yet — and the entry cards above it are the thing to do about it.
            // It does not manufacture activity to look busy.
            <View style={s.centerBody}>
              <Feather name="message-circle" size={34} color="rgba(240,232,213,0.12)" />
              <Text style={s.emptyTitle}>
                {intent || serviceTag ? 'Nothing here yet' : 'No posts yet'}
              </Text>
              <Text style={s.emptySub}>
                {intent || serviceTag
                  ? 'Try a different filter, or ask the community yourself.'
                  : 'Ask for a recommendation, or tell people about someone good.'}
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onOpen={() => router.push(`/community/${item.id}` as never)}
              onLike={() => toggleLike(item.id)}
              onSave={() => toggleSave(item.id)}
              onMenu={() => openMenu(item)}
            />
          )}
        />
      )}

      <ReportSheet
        visible={reportTarget !== null}
        title="Report this post"
        options={POST_REPORT_REASONS}
        submitting={reporting}
        onCancel={() => setReportTarget(null)}
        onSubmit={async (reason, notes) => {
          const target = reportTarget
          if (!target) return
          setReporting(true)
          await reportPost(target, reason, notes)
          setReporting(false)
          setReportTarget(null)
        }}
      />
    </View>
  )
}

function Header() {
  const insets = useSafeAreaInsets()
  return (
    <View style={[s.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={s.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Feather name="chevron-left" size={20} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Community</Text>
      <View style={s.iconBtn} />
    </View>
  )
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[s.pill, active && s.pillActive]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text style={active ? s.pillTextActive : s.pillText}>{label}</Text>
    </TouchableOpacity>
  )
}

export function PostCard({
  post,
  onOpen,
  onLike,
  onSave,
  onMenu,
}: {
  post: CommunityPostView & { isLiked?: boolean; isBookmarked?: boolean }
  onOpen: () => void
  onLike?: () => void
  onSave?: () => void
  onMenu?: () => void
}) {
  const a = post.author
  const meta = [post.serviceTag, post.area, post.timing].filter(Boolean).join(' · ')
  return (
    <TouchableOpacity style={s.card} activeOpacity={0.9} onPress={onOpen}>
      <View style={s.cardHead}>
        {a.photo ? (
          <Image source={{ uri: cacheBustedPhoto(a.photo) }} style={s.avatar} />
        ) : (
          <View style={[s.avatar, s.avatarFallback]}>
            <Text style={s.avatarText}>{initials(a.name)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <View style={s.nameRow}>
            <Text style={s.name} numberOfLines={1}>
              {a.name}
            </Text>
            {a.kind === 'provider' ? (
              <View style={s.bizChip}>
                <Text style={s.bizChipText}>Provider</Text>
              </View>
            ) : null}
          </View>
          <Text style={s.sub} numberOfLines={1}>
            {intentLabel(post.intent)} · {timeAgo(post.createdAt)}
          </Text>
        </View>
        {onMenu ? (
          <TouchableOpacity
            onPress={onMenu}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="more-horizontal" size={18} color="rgba(240,232,213,0.4)" />
          </TouchableOpacity>
        ) : null}
      </View>

      {post.intent === 'open_today' ? (
        // The badge states only what the server verified: this provider is
        // published as open today, and this note ends when their day does. It
        // does NOT claim a free slot — booked time is not subtracted anywhere in
        // this product, and saying otherwise would be the same overclaim the
        // "Open today" discovery filter deliberately avoids.
        <View style={s.openTodayChip}>
          <Feather name="sun" size={12} color="#C8922A" />
          <Text style={s.openTodayText}>Open today · ends tonight</Text>
        </View>
      ) : null}

      <Text style={s.body}>{post.content}</Text>

      {meta ? <Text style={s.meta}>{meta}</Text> : null}

      {post.intent === 'shoutout' && post.taggedProviderId ? (
        <TouchableOpacity
          style={s.taggedRow}
          activeOpacity={0.8}
          onPress={() =>
            router.push({
              pathname: '/providers/[id]',
              params: { id: post.taggedProviderId as string },
            })
          }
        >
          <Feather name="award" size={13} color="#C8922A" />
          <Text style={s.taggedName} numberOfLines={1}>
            {post.taggedProvider?.name ?? 'A provider'}
          </Text>
          {post.bookingBacked ? (
            // Shown ONLY because the server verified a completed booking between
            // this author and this provider. It is not a rating and it never
            // becomes one — a recommendation is not a review.
            <View style={s.verifiedChip}>
              <Text style={s.verifiedText}>Worked together</Text>
            </View>
          ) : null}
          <Feather name="chevron-right" size={14} color="rgba(240,232,213,0.35)" />
        </TouchableOpacity>
      ) : null}

      <View style={s.actions}>
        <TouchableOpacity style={s.action} activeOpacity={0.7} onPress={onOpen}>
          <Feather name="message-circle" size={15} color="rgba(240,232,213,0.5)" />
          <Text style={s.actionText}>{post.replyCount}</Text>
        </TouchableOpacity>
        {onLike ? (
          <TouchableOpacity style={s.action} activeOpacity={0.7} onPress={onLike}>
            <Feather
              name="heart"
              size={15}
              color={post.isLiked ? '#C8922A' : 'rgba(240,232,213,0.5)'}
            />
            <Text style={s.actionText}>{post.likeCount}</Text>
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1 }} />
        {onSave ? (
          <TouchableOpacity
            onPress={onSave}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather
              name="bookmark"
              size={15}
              color={post.isBookmarked ? '#C8922A' : 'rgba(240,232,213,0.5)'}
            />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#F0E8D5', fontSize: 17, fontWeight: '600' },
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyTitle: { color: 'rgba(240,232,213,0.75)', fontSize: 15, fontWeight: '600' },
  emptySub: {
    color: 'rgba(240,232,213,0.4)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  sectionLabel: {
    color: 'rgba(240,232,213,0.45)',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  entryRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 14 },
  entryCard: {
    width: 150,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    gap: 6,
  },
  entryTitle: { color: '#F0E8D5', fontSize: 13, fontWeight: '600' },
  entryBlurb: { color: 'rgba(240,232,213,0.45)', fontSize: 11, lineHeight: 15 },
  businessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
  businessRowText: { flex: 1, color: 'rgba(240,232,213,0.6)', fontSize: 12 },
  pillScroll: { flexGrow: 0 },
  pillRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 10 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  pillActive: { backgroundColor: '#C8922A' },
  pillText: { color: 'rgba(240,232,213,0.55)', fontSize: 12 },
  pillTextActive: { color: '#080808', fontSize: 12, fontWeight: '600' },
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.06)',
    gap: 8,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: 'rgba(240,232,213,0.6)', fontSize: 12, fontWeight: '600' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { color: '#F0E8D5', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  bizChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(200,146,42,0.15)',
  },
  bizChipText: { color: '#C8922A', fontSize: 9, fontWeight: '700', letterSpacing: 0.4 },
  sub: { color: 'rgba(240,232,213,0.35)', fontSize: 11, marginTop: 1 },
  openTodayChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(200,146,42,0.12)',
  },
  openTodayText: { color: '#C8922A', fontSize: 11, fontWeight: '600' },
  body: { color: 'rgba(240,232,213,0.88)', fontSize: 14, lineHeight: 20 },
  meta: { color: 'rgba(240,232,213,0.4)', fontSize: 11 },
  taggedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
  taggedName: { color: '#F0E8D5', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  verifiedChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  verifiedText: { color: 'rgba(240,232,213,0.55)', fontSize: 9, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 2 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  actionText: { color: 'rgba(240,232,213,0.5)', fontSize: 12 },
})
