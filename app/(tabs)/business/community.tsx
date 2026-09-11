import { useCallback, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  PROVIDER_INTENTS,
  CommunityPostView,
  deleteOwnPost,
  intentLabel,
  timeAgo,
} from '@/lib/community'

// ── BUSINESS → COMMUNITY ──────────────────────────────────────────────────
//
// The provider's side of Community: what their business has said, and the three
// things it can say. It lives in BUSINESS and not in Me, because Business is
// where a provider manages their business — the previous placement put the only
// entry to the whole surface two scrolls into a personal profile tab.
//
// Community itself is NOT here. It is open to everyone and reached from
// Discover; this screen is creation and management, which is provider work.

export default function BusinessCommunity() {
  const insets = useSafeAreaInsets()
  const { user, providerId, isProvider } = useAuth()
  const [posts, setPosts] = useState<CommunityPostView[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [openToday, setOpenToday] = useState<boolean | null>(null)

  const load = useCallback(
    async (refresh = false) => {
      if (!user || !providerId) {
        setLoading(false)
        return
      }
      if (refresh) setRefreshing(true)
      // Own posts only, read from the base table rather than the feed view:
      // this is the author looking at their own history, including an Open Today
      // note that has expired and therefore no longer surfaces publicly.
      const { data, error } = await supabase
        .from('community_posts')
        .select(
          'id, provider_id, user_id, author_kind, intent, content, service_tag, area, timing, ' +
            'tagged_provider_id, tagged_booking_id, expires_at, like_count, reply_count, created_at, is_active',
        )
        .eq('provider_id', providerId)
        .eq('author_kind', 'provider')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) console.log('Business community posts error:', error.message)
      setPosts(
        ((data as unknown as Record<string, unknown>[] | null) ?? []).map((r) => ({
          id: r.id as string,
          providerId: r.provider_id as string,
          userId: r.user_id as string,
          authorKind: 'provider' as const,
          intent: r.intent as CommunityPostView['intent'],
          content: r.content as string,
          serviceTag: (r.service_tag as string) ?? null,
          area: (r.area as string) ?? null,
          timing: (r.timing as string) ?? null,
          taggedProviderId: (r.tagged_provider_id as string) ?? null,
          bookingBacked: r.tagged_booking_id != null,
          expiresAt: (r.expires_at as string) ?? null,
          likeCount: (r.like_count as number) ?? 0,
          replyCount: (r.reply_count as number) ?? 0,
          createdAt: r.created_at as string,
          isActive: r.is_active !== false,
          author: {
            kind: 'provider',
            name: '',
            photo: null,
            providerId: r.provider_id as string,
            category: '',
            neighborhood: null,
          },
          taggedProvider: null,
        })),
      )

      // Are they published as open today? This is the SAME answer the server
      // uses to accept or refuse an Open Today note, so the button and the write
      // cannot disagree.
      const { data: openIds, error: openErr } = await supabase.rpc('providers_open_today')
      if (openErr) {
        setOpenToday(null)
      } else {
        const ids = new Set(
          ((openIds ?? []) as (string | { providers_open_today: string })[]).map((v) =>
            typeof v === 'string' ? v : v.providers_open_today,
          ),
        )
        setOpenToday(ids.has(providerId))
      }
      setLoading(false)
      setRefreshing(false)
    },
    [user, providerId],
  )

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  async function remove(id: string) {
    const idx = posts.findIndex((p) => p.id === id)
    if (idx < 0) return
    const removed = posts[idx]
    setPosts((prev) => prev.filter((p) => p.id !== id))
    const res = await deleteOwnPost(id)
    if (!res.ok) {
      setPosts((prev) => {
        const next = [...prev]
        next.splice(Math.min(idx, next.length), 0, removed)
        return next
      })
      Alert.alert('Could not remove', res.message ?? 'Please try again.', [{ text: 'OK' }])
    }
  }

  if (!isProvider) {
    return (
      <View style={s.root}>
        <Header />
        <View style={s.center}>
          <Text style={s.emptyTitle}>This is the provider side of Community</Text>
          <TouchableOpacity onPress={() => router.push('/community' as never)}>
            <Text style={s.link}>Open Community</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={s.root}>
      <Header />
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="rgba(240,232,213,0.4)"
            />
          }
          ListHeaderComponent={
            <View>
              <Text style={s.sectionLabel}>Post as your business</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.entryRow}
              >
                {PROVIDER_INTENTS.map((i) => {
                  // OPEN TODAY IS DISABLED WHEN IT WOULD ONLY FAIL. The server
                  // refuses a note from a provider who is not published as open,
                  // so offering the button would be offering a tap that cannot
                  // succeed — and the fix is one screen away, so say which.
                  const blocked = i.key === 'open_today' && openToday === false
                  return (
                    <TouchableOpacity
                      key={i.key}
                      style={[s.entryCard, blocked && s.entryCardDisabled]}
                      activeOpacity={0.85}
                      onPress={() =>
                        blocked
                          ? router.push('/(tabs)/business/availability' as never)
                          : router.push({
                              pathname: '/community/compose',
                              params: { intent: i.key },
                            } as never)
                      }
                    >
                      <Feather name={i.icon as never} size={16} color="#C8922A" />
                      <Text style={s.entryTitle}>{i.label}</Text>
                      <Text style={s.entryBlurb} numberOfLines={3}>
                        {blocked
                          ? 'Your hours do not show you open today. Set them first.'
                          : i.blurb}
                      </Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              <TouchableOpacity
                style={s.linkRow}
                activeOpacity={0.8}
                onPress={() => router.push('/community' as never)}
              >
                <Feather name="users" size={14} color="rgba(240,232,213,0.6)" />
                <Text style={s.linkRowText}>Open Community</Text>
                <Feather name="chevron-right" size={16} color="rgba(240,232,213,0.35)" />
              </TouchableOpacity>
              <TouchableOpacity
                style={s.linkRow}
                activeOpacity={0.8}
                onPress={() => router.push('/community/barter' as never)}
              >
                <Feather name="repeat" size={14} color="rgba(240,232,213,0.6)" />
                <Text style={s.linkRowText}>Trades</Text>
                <Feather name="chevron-right" size={16} color="rgba(240,232,213,0.35)" />
              </TouchableOpacity>

              <Text style={s.sectionLabel}>Your posts</Text>
            </View>
          }
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.emptyTitle}>Nothing posted yet</Text>
              <Text style={s.emptySub}>
                An update or an announcement is a good place to start. Community does not
                rank you on how often you post — and your place in search never depends on it.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const expired =
              item.intent === 'open_today' &&
              item.expiresAt != null &&
              new Date(item.expiresAt).getTime() <= Date.now()
            // THE AUTHOR IS TOLD. This screen reads the base table, so a hidden
            // post would otherwise sit here looking ordinary while being absent
            // from every public surface — the provider would conclude the
            // product had eaten it. Saying so is not a notification channel and
            // promises nothing; it is the difference between a state and a bug.
            const hidden = item.isActive === false
            return (
              <View style={s.row}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.rowMeta}>
                    {intentLabel(item.intent)} · {timeAgo(item.createdAt)}
                    {expired ? ' · ended' : ''}
                  </Text>
                  {hidden ? (
                    <Text style={s.hiddenBadge}>
                      Hidden by The Book — not shown in Community
                    </Text>
                  ) : null}
                  <Text style={s.rowText} numberOfLines={3}>
                    {item.content}
                  </Text>
                  <Text style={s.rowStats}>
                    {item.replyCount} {item.replyCount === 1 ? 'reply' : 'replies'}
                  </Text>
                </View>
                <TouchableOpacity
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() =>
                    Alert.alert('Remove post', 'This cannot be undone.', [
                      { text: 'Cancel', style: 'cancel' },
                      { text: 'Remove', style: 'destructive', onPress: () => remove(item.id) },
                    ])
                  }
                >
                  <Feather name="trash-2" size={16} color="rgba(240,232,213,0.35)" />
                </TouchableOpacity>
              </View>
            )
          }}
        />
      )}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { color: 'rgba(240,232,213,0.75)', fontSize: 15, fontWeight: '600' },
  emptySub: {
    color: 'rgba(240,232,213,0.4)',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  link: { color: '#C8922A', fontSize: 13, fontWeight: '600' },
  sectionLabel: {
    color: 'rgba(240,232,213,0.45)',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  entryRow: { paddingHorizontal: 16, gap: 10, paddingBottom: 12 },
  entryCard: {
    width: 160,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    gap: 6,
  },
  entryCardDisabled: { opacity: 0.55 },
  entryTitle: { color: '#F0E8D5', fontSize: 13, fontWeight: '600' },
  entryBlurb: { color: 'rgba(240,232,213,0.45)', fontSize: 11, lineHeight: 15 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
  linkRowText: { flex: 1, color: 'rgba(240,232,213,0.7)', fontSize: 13 },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
  rowMeta: { color: 'rgba(240,232,213,0.35)', fontSize: 11 },
  rowText: { color: 'rgba(240,232,213,0.85)', fontSize: 13, lineHeight: 18 },
  rowStats: { color: 'rgba(240,232,213,0.3)', fontSize: 11 },
  hiddenBadge: { color: '#C8922A', fontSize: 11, fontWeight: '600' },
})
