import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cacheBustedPhoto } from '@/lib/image'
import {
  COMMUNITY_CATEGORIES,
  categoryLabel,
  fetchCommunityFeed,
  fetchLikedPostIds,
  timeAgo,
  initials,
  CommunityPostView,
} from '@/lib/community'

type FeedPost = CommunityPostView & { isLiked: boolean }

export default function CommunityFeed() {
  const insets = useSafeAreaInsets()
  const { user, isProvider, roleLoading } = useAuth()

  const [posts, setPosts] = useState<FeedPost[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(
    async (refresh = false) => {
      if (!isProvider) {
        setLoading(false)
        return
      }
      if (refresh) setRefreshing(true)
      const feed = await fetchCommunityFeed(activeCategory)
      let liked = new Set<string>()
      if (user) liked = await fetchLikedPostIds(user.id, feed.map((p) => p.id))
      setPosts(feed.map((p) => ({ ...p, isLiked: liked.has(p.id) })))
      setLoading(false)
      setRefreshing(false)
    },
    [isProvider, activeCategory, user],
  )

  // Reload on focus (and whenever the category filter changes) so new posts,
  // replies, and likes reflect when returning from compose/thread.
  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  async function toggleLike(postId: string) {
    const post = posts.find((p) => p.id === postId)
    if (!post || !user) return
    const wasLiked = post.isLiked
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, isLiked: !wasLiked, likeCount: Math.max(0, p.likeCount + (wasLiked ? -1 : 1)) }
          : p,
      ),
    )
    try {
      const { error } = wasLiked
        ? await supabase
            .from('community_post_likes')
            .delete()
            .eq('user_id', user.id)
            .eq('post_id', postId)
        : await supabase
            .from('community_post_likes')
            .insert({ user_id: user.id, post_id: postId })
      if (error) throw error
    } catch (err) {
      console.log('Community like error:', err)
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, isLiked: wasLiked, likeCount: Math.max(0, p.likeCount + (wasLiked ? 1 : -1)) }
            : p,
        ),
      )
    }
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity
        style={styles.iconBtn}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Feather name="chevron-left" size={20} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Community</Text>
      <View style={styles.iconBtn} />
    </View>
  )

  // Provider-only gate.
  if (!roleLoading && !isProvider) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centerBody}>
          <Feather name="users" size={36} color="rgba(240,232,213,0.12)" />
          <Text style={styles.gateTitle}>This space is for providers</Text>
          <Text style={styles.gateSub}>
            The community hub is where providers connect and support each other.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {header}

      {/* Category filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.pillScroll}
        contentContainerStyle={styles.pillRow}
      >
        <Pill label="All" active={activeCategory === null} onPress={() => setActiveCategory(null)} />
        {COMMUNITY_CATEGORIES.map((c) => (
          <Pill
            key={c.key}
            label={c.label}
            active={activeCategory === c.key}
            onPress={() => setActiveCategory(c.key)}
          />
        ))}
      </ScrollView>

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(p) => p.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor="rgba(240,232,213,0.4)"
            />
          }
          ListEmptyComponent={
            <View style={styles.centerBody}>
              <Feather name="message-circle" size={36} color="rgba(240,232,213,0.12)" />
              <Text style={styles.gateTitle}>Be the first to post</Text>
              <Text style={styles.gateSub}>Share advice, ask a question, or celebrate a win.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <PostCard post={item} onLike={() => toggleLike(item.id)} />
          )}
        />
      )}

      {/* New Post */}
      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        activeOpacity={0.85}
        onPress={() => router.push('/community/compose' as never)}
      >
        <Feather name="edit-2" size={18} color="#080808" />
        <Text style={styles.fabText}>New Post</Text>
      </TouchableOpacity>
    </View>
  )
}

function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
      activeOpacity={0.8}
      onPress={onPress}
    >
      <Text style={active ? styles.pillTextActive : styles.pillTextInactive}>{label}</Text>
    </TouchableOpacity>
  )
}

function PostCard({ post, onLike }: { post: FeedPost; onLike: () => void }) {
  const meta = [post.provider.category].filter(Boolean).join('')
  return (
    <Pressable
      style={styles.card}
      onPress={() => router.push(`/community/${post.id}` as never)}
    >
      <View style={styles.cardTop}>
        {post.provider.photo ? (
          <Image source={{ uri: cacheBustedPhoto(post.provider.photo) }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initials(post.provider.name)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName} numberOfLines={1}>
            {post.provider.name}
          </Text>
          <Text style={styles.authorMeta} numberOfLines={1}>
            {meta ? `${meta} · ` : ''}
            {timeAgo(post.createdAt)}
          </Text>
        </View>
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryBadgeText}>{categoryLabel(post.category)}</Text>
        </View>
      </View>

      <Text style={styles.content}>{post.content}</Text>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={onLike}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather
            name="heart"
            size={16}
            color={post.isLiked ? '#C8922A' : 'rgba(240,232,213,0.5)'}
          />
          <Text style={[styles.actionText, post.isLiked && styles.actionTextActive]}>
            {post.likeCount}
          </Text>
        </TouchableOpacity>
        <View style={styles.actionBtn}>
          <Feather name="message-circle" size={16} color="rgba(240,232,213,0.5)" />
          <Text style={styles.actionText}>{post.replyCount}</Text>
        </View>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  centerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 80,
  },
  gateTitle: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 14,
  },
  gateSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  pillScroll: {
    maxHeight: 56,
    flexGrow: 0,
  },
  pillRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  pillActive: { backgroundColor: '#F0E8D5' },
  pillInactive: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  pillTextActive: { fontSize: 13, color: '#080808', fontFamily: 'Manrope_700Bold' },
  pillTextInactive: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_500Medium',
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1410' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  authorName: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  authorMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(200,146,42,0.12)',
  },
  categoryBadgeText: {
    fontSize: 10,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  content: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.9)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    marginTop: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 14,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
  actionTextActive: { color: '#C8922A' },
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0E8D5',
    borderRadius: 26,
    paddingHorizontal: 20,
    height: 52,
  },
  fabText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
})
