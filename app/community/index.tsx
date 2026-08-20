import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native'
import { Feather, Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cacheBustedPhoto } from '@/lib/image'
import {
  COMMUNITY_CATEGORIES,
  categoryLabel,
  fetchCommunityFeed,
  fetchBookmarkedFeed,
  fetchLikedPostIds,
  fetchBookmarkedPostIds,
  timeAgo,
  initials,
  CommunityPostView,
} from '@/lib/community'
import {
  fetchBarterFeed,
  fetchMyInterests,
  BarterOfferWithProvider,
} from '@/lib/barter'

type FeedPost = CommunityPostView & { isLiked: boolean; isBookmarked: boolean }

type HubTab = 'posts' | 'barter'

const INTEREST_MAX = 300

const SAVED_KEY = 'saved'

const REPORT_REASONS: { label: string; value: string }[] = [
  { label: 'Inappropriate content', value: 'inappropriate' },
  { label: 'Spam', value: 'spam' },
  { label: 'Misinformation', value: 'misinformation' },
  { label: 'Other', value: 'other' },
]

export default function CommunityFeed() {
  const insets = useSafeAreaInsets()
  const { user, providerId, isProvider, roleLoading } = useAuth()
  const currentUserId = user?.id ?? null

  const [tab, setTab] = useState<HubTab>('posts')

  const [allPosts, setAllPosts] = useState<FeedPost[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  // Barter tab state.
  const [offers, setOffers] = useState<BarterOfferWithProvider[]>([])
  const [myInterests, setMyInterests] = useState<Set<string>>(new Set())
  const [barterLoading, setBarterLoading] = useState(true)
  const [barterRefreshing, setBarterRefreshing] = useState(false)
  // The offer the interest modal is open for (null = closed) and its draft note.
  const [interestOffer, setInterestOffer] = useState<BarterOfferWithProvider | null>(null)
  const [interestNote, setInterestNote] = useState('')
  const [sendingInterest, setSendingInterest] = useState(false)

  const isSavedTab = activeCategory === SAVED_KEY

  // 300ms debounce on the search box.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const load = useCallback(
    async (refresh = false) => {
      if (!isProvider || !user) {
        setLoading(false)
        return
      }
      if (refresh) setRefreshing(true)
      // Non-saved tabs load ALL active posts (category is filtered client-side
      // so search can span every category); the Saved tab loads bookmarks.
      const feed = isSavedTab
        ? await fetchBookmarkedFeed(user.id)
        : await fetchCommunityFeed(null)
      const ids = feed.map((p) => p.id)
      const [liked, bookmarked] = await Promise.all([
        fetchLikedPostIds(user.id, ids),
        isSavedTab
          ? Promise.resolve(new Set(ids))
          : fetchBookmarkedPostIds(user.id, ids),
      ])
      setAllPosts(
        feed.map((p) => ({
          ...p,
          isLiked: liked.has(p.id),
          isBookmarked: bookmarked.has(p.id),
        })),
      )
      setLoading(false)
      setRefreshing(false)
    },
    [isProvider, user, isSavedTab],
  )

  const loadBarter = useCallback(
    async (refresh = false) => {
      if (!isProvider || !user) {
        setBarterLoading(false)
        return
      }
      if (refresh) setBarterRefreshing(true)
      const [feed, mine] = await Promise.all([
        fetchBarterFeed(),
        fetchMyInterests(user.id),
      ])
      setOffers(feed)
      setMyInterests(mine)
      setBarterLoading(false)
      setBarterRefreshing(false)
    },
    [isProvider, user],
  )

  // Load whichever tab is active on focus; re-runs when the tab or the active
  // loader changes (e.g. switching category rebuilds `load`).
  useFocusEffect(
    useCallback(() => {
      if (tab === 'barter') {
        setBarterLoading(true)
        loadBarter()
      } else {
        setLoading(true)
        load()
      }
    }, [tab, load, loadBarter]),
  )

  // Client-side filtering: Saved shows only still-bookmarked; search spans all
  // categories; otherwise apply the active category filter.
  const visiblePosts = useMemo(() => {
    let list = allPosts
    if (isSavedTab) list = list.filter((p) => p.isBookmarked)
    const q = debouncedSearch.trim().toLowerCase()
    if (q) {
      list = list.filter(
        (p) =>
          p.content.toLowerCase().includes(q) ||
          p.provider.name.toLowerCase().includes(q),
      )
    } else if (!isSavedTab && activeCategory) {
      list = list.filter((p) => p.category === activeCategory)
    }
    return list
  }, [allPosts, isSavedTab, activeCategory, debouncedSearch])

  async function toggleLike(postId: string) {
    const post = allPosts.find((p) => p.id === postId)
    if (!post || !user) return
    const was = post.isLiked
    setAllPosts((prev) =>
      prev.map((p) =>
        p.id === postId
          ? { ...p, isLiked: !was, likeCount: Math.max(0, p.likeCount + (was ? -1 : 1)) }
          : p,
      ),
    )
    try {
      const { error } = was
        ? await supabase.from('community_post_likes').delete().eq('user_id', user.id).eq('post_id', postId)
        : await supabase.from('community_post_likes').insert({ user_id: user.id, post_id: postId })
      if (error) throw error
    } catch (err) {
      console.log('Community like error:', err)
      setAllPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? { ...p, isLiked: was, likeCount: Math.max(0, p.likeCount + (was ? 1 : -1)) }
            : p,
        ),
      )
    }
  }

  async function toggleBookmark(postId: string) {
    const post = allPosts.find((p) => p.id === postId)
    if (!post || !user) return
    const was = post.isBookmarked
    setAllPosts((prev) =>
      prev.map((p) => (p.id === postId ? { ...p, isBookmarked: !was } : p)),
    )
    try {
      const { error } = was
        ? await supabase.from('community_bookmarks').delete().eq('user_id', user.id).eq('post_id', postId)
        : await supabase.from('community_bookmarks').insert({ user_id: user.id, post_id: postId })
      if (error) throw error
    } catch (err) {
      console.log('Community bookmark error:', err)
      setAllPosts((prev) =>
        prev.map((p) => (p.id === postId ? { ...p, isBookmarked: was } : p)),
      )
    }
  }

  async function deletePost(postId: string) {
    const idx = allPosts.findIndex((p) => p.id === postId)
    if (idx < 0) return
    const removed = allPosts[idx]
    setAllPosts((prev) => prev.filter((p) => p.id !== postId))
    const { error } = await supabase.from('community_posts').delete().eq('id', postId)
    if (error) {
      console.log('Delete post error:', error)
      setAllPosts((prev) => {
        const next = [...prev]
        next.splice(Math.min(idx, next.length), 0, removed)
        return next
      })
      Alert.alert('Could not delete', 'Please try again.', [{ text: 'OK' }])
    }
  }

  async function reportPost(postId: string, reason: string) {
    if (!user) return
    const { error } = await supabase
      .from('community_reports')
      .insert({ reporter_user_id: user.id, post_id: postId, reason })
    if (error) {
      console.log('Report error:', error)
      Alert.alert('Could not report', 'Please try again.', [{ text: 'OK' }])
      return
    }
    Alert.alert('Reported', "Thanks for reporting. We'll review it.", [{ text: 'OK' }])
  }

  function openMenu(post: FeedPost) {
    if (post.userId === currentUserId) {
      Alert.alert('Delete post', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deletePost(post.id) },
      ])
    } else {
      Alert.alert('Report post', 'Why are you reporting this?', [
        ...REPORT_REASONS.map((r) => ({
          text: r.label,
          onPress: () => reportPost(post.id, r.value),
        })),
        { text: 'Cancel', style: 'cancel' as const },
      ])
    }
  }

  function openInterest(offer: BarterOfferWithProvider) {
    setInterestNote('')
    setInterestOffer(offer)
  }

  async function submitInterest() {
    const offer = interestOffer
    if (!offer || !user || !providerId || sendingInterest) return
    setSendingInterest(true)
    const { error } = await supabase.from('barter_interests').insert({
      offer_id: offer.id,
      interested_provider_id: providerId,
      interested_user_id: user.id,
      message: interestNote.trim() || null,
      status: 'pending',
    })
    setSendingInterest(false)
    if (error) {
      console.log('Express interest error:', error)
      Alert.alert('Could not send', 'Please try again.', [{ text: 'OK' }])
      return
    }
    // Mark this offer as interested and bump its local count.
    setMyInterests((prev) => new Set(prev).add(offer.id))
    setOffers((prev) =>
      prev.map((o) => (o.id === offer.id ? { ...o, interestCount: o.interestCount + 1 } : o)),
    )
    setInterestOffer(null)
    setInterestNote('')
  }

  async function markFilled(offerId: string) {
    const prev = offers
    setOffers((list) => list.filter((o) => o.id !== offerId))
    const { error } = await supabase
      .from('barter_offers')
      .update({ is_active: false })
      .eq('id', offerId)
    if (error) {
      console.log('Mark filled error:', error)
      setOffers(prev)
      Alert.alert('Could not update', 'Please try again.', [{ text: 'OK' }])
    }
  }

  async function deleteOffer(offerId: string) {
    const prev = offers
    setOffers((list) => list.filter((o) => o.id !== offerId))
    const { error } = await supabase.from('barter_offers').delete().eq('id', offerId)
    if (error) {
      console.log('Delete offer error:', error)
      setOffers(prev)
      Alert.alert('Could not delete', 'Please try again.', [{ text: 'OK' }])
    }
  }

  function openOfferMenu(offer: BarterOfferWithProvider) {
    Alert.alert('Manage offer', undefined, [
      {
        text: 'Mark as filled',
        onPress: () => markFilled(offer.id),
      },
      {
        text: 'Delete offer',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete offer', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteOffer(offer.id) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ])
  }

  function viewInterests(offer: BarterOfferWithProvider) {
    router.push({
      pathname: '/community/barter-interests',
      params: {
        offerId: offer.id,
        offeringService: offer.offeringService,
        ownerName: offer.provider.name,
      },
    } as never)
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Feather name="chevron-left" size={20} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Community</Text>
      <View style={styles.iconBtn} />
    </View>
  )

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

  const query = debouncedSearch.trim()

  return (
    <View style={styles.root}>
      {header}

      {/* Posts | Barter tab switcher */}
      <View style={styles.tabBar}>
        <TabButton label="Posts" active={tab === 'posts'} onPress={() => setTab('posts')} />
        <TabButton label="Barter" active={tab === 'barter'} onPress={() => setTab('barter')} />
      </View>

      {tab === 'posts' ? (
      <>
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
        <Pill label="Saved" active={isSavedTab} onPress={() => setActiveCategory(SAVED_KEY)} />
      </ScrollView>

      {/* Search */}
      <View style={styles.searchRow}>
        <Feather name="search" size={16} color="rgba(240,232,213,0.35)" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search community"
          placeholderTextColor="rgba(240,232,213,0.3)"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={16} color="rgba(240,232,213,0.35)" />
          </TouchableOpacity>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <FlatList
          data={visiblePosts}
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
              <Text style={styles.gateTitle}>
                {query
                  ? `No results for "${query}"`
                  : isSavedTab
                    ? 'No saved posts yet'
                    : 'Be the first to post'}
              </Text>
              {!query && !isSavedTab ? (
                <Text style={styles.gateSub}>Share advice, ask a question, or celebrate a win.</Text>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onLike={() => toggleLike(item.id)}
              onBookmark={() => toggleBookmark(item.id)}
              onMenu={() => openMenu(item)}
            />
          )}
        />
      )}
      </>
      ) : barterLoading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 4 }}
          refreshControl={
            <RefreshControl
              refreshing={barterRefreshing}
              onRefresh={() => loadBarter(true)}
              tintColor="rgba(240,232,213,0.4)"
            />
          }
          ListEmptyComponent={
            <View style={styles.centerBody}>
              <Feather name="repeat" size={36} color="rgba(240,232,213,0.12)" />
              <Text style={styles.gateTitle}>No barter offers yet</Text>
              <Text style={styles.gateSub}>Post one to start trading.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <BarterCard
              offer={item}
              isOwner={item.userId === currentUserId}
              hasInterest={myInterests.has(item.id)}
              onInterest={() => openInterest(item)}
              onMenu={() => openOfferMenu(item)}
              onViewInterests={() => viewInterests(item)}
            />
          )}
        />
      )}

      {tab === 'posts' ? (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
          activeOpacity={0.85}
          onPress={() => router.push('/community/compose' as never)}
        >
          <Feather name="edit-2" size={18} color="#080808" />
          <Text style={styles.fabText}>New Post</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
          activeOpacity={0.85}
          onPress={() => router.push('/community/barter-compose' as never)}
        >
          <Feather name="repeat" size={18} color="#080808" />
          <Text style={styles.fabText}>Post Offer</Text>
        </TouchableOpacity>
      )}

      {/* Express-interest modal */}
      <Modal
        visible={interestOffer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInterestOffer(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setInterestOffer(null)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.modalTitle}>Express interest</Text>
            {interestOffer ? (
              <Text style={styles.modalSub} numberOfLines={2}>
                {interestOffer.provider.name} is offering {interestOffer.offeringService}
              </Text>
            ) : null}
            <TextInput
              style={styles.modalInput}
              placeholder="Add a note about what you can offer…"
              placeholderTextColor="rgba(240,232,213,0.25)"
              multiline
              maxLength={INTEREST_MAX}
              value={interestNote}
              onChangeText={setInterestNote}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                activeOpacity={0.8}
                onPress={() => setInterestOffer(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSend, sendingInterest && styles.modalSendDisabled]}
                activeOpacity={0.85}
                disabled={sendingInterest}
                onPress={submitInterest}
              >
                {sendingInterest ? (
                  <ActivityIndicator color="#080808" size="small" />
                ) : (
                  <Text style={styles.modalSendText}>Send interest</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity style={styles.tabBtn} activeOpacity={0.8} onPress={onPress}>
      <Text style={active ? styles.tabTextActive : styles.tabTextInactive}>{label}</Text>
      <View style={[styles.tabUnderline, active && styles.tabUnderlineActive]} />
    </TouchableOpacity>
  )
}

function BarterCard({
  offer,
  isOwner,
  hasInterest,
  onInterest,
  onMenu,
  onViewInterests,
}: {
  offer: BarterOfferWithProvider
  isOwner: boolean
  hasInterest: boolean
  onInterest: () => void
  onMenu: () => void
  onViewInterests: () => void
}) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {offer.provider.photo ? (
          <Image source={{ uri: cacheBustedPhoto(offer.provider.photo) }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initials(offer.provider.name)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName} numberOfLines={1}>
            {offer.provider.name}
          </Text>
          <Text style={styles.authorMeta} numberOfLines={1}>
            {offer.provider.category ? `${offer.provider.category} · ` : ''}
            {timeAgo(offer.createdAt)}
          </Text>
        </View>
        {isOwner ? (
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={onMenu}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="more-horizontal" size={18} color="rgba(240,232,213,0.4)" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.tradeRow}>
        <View style={styles.tradeCol}>
          <Text style={styles.tradeLabel}>OFFERING</Text>
          <Text style={styles.tradeValue}>{offer.offeringService}</Text>
        </View>
        <Feather name="repeat" size={16} color="rgba(240,232,213,0.3)" style={styles.tradeIcon} />
        <View style={styles.tradeCol}>
          <Text style={styles.tradeLabel}>SEEKING</Text>
          <Text style={styles.tradeValue}>{offer.seekingService}</Text>
        </View>
      </View>

      {offer.offeringValue != null ? (
        <View style={styles.valueBadge}>
          <Text style={styles.valueBadgeText}>~${offer.offeringValue} value</Text>
        </View>
      ) : null}

      {offer.notes ? <Text style={styles.notes}>{offer.notes}</Text> : null}

      <View style={styles.cardActions}>
        {isOwner ? (
          <TouchableOpacity
            style={styles.interestCountBtn}
            activeOpacity={0.7}
            onPress={onViewInterests}
          >
            <Feather name="users" size={15} color="rgba(240,232,213,0.6)" />
            <Text style={styles.interestCountText}>
              {offer.interestCount} interested
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <View style={styles.interestCountBtn}>
              <Feather name="users" size={15} color="rgba(240,232,213,0.5)" />
              <Text style={styles.interestCountTextMuted}>{offer.interestCount}</Text>
            </View>
            <View style={{ flex: 1 }} />
            {hasInterest ? (
              <View style={styles.interestSentBtn}>
                <Feather name="check" size={15} color="rgba(240,232,213,0.6)" />
                <Text style={styles.interestSentText}>Interest sent</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.interestBtn} activeOpacity={0.85} onPress={onInterest}>
                <Text style={styles.interestBtnText}>I'm Interested</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
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

function PostCard({
  post,
  onLike,
  onBookmark,
  onMenu,
}: {
  post: FeedPost
  onLike: () => void
  onBookmark: () => void
  onMenu: () => void
}) {
  const meta = [post.provider.category].filter(Boolean).join('')
  return (
    <Pressable style={styles.card} onPress={() => router.push(`/community/${post.id}` as never)}>
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
        <TouchableOpacity
          style={styles.menuBtn}
          onPress={onMenu}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="more-horizontal" size={18} color="rgba(240,232,213,0.4)" />
        </TouchableOpacity>
      </View>

      <Text style={styles.content}>{post.content}</Text>

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.7}
          onPress={onLike}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="heart" size={16} color={post.isLiked ? '#C8922A' : 'rgba(240,232,213,0.5)'} />
          <Text style={[styles.actionText, post.isLiked && styles.actionTextActive]}>
            {post.likeCount}
          </Text>
        </TouchableOpacity>
        <View style={styles.actionBtn}>
          <Feather name="message-circle" size={16} color="rgba(240,232,213,0.5)" />
          <Text style={styles.actionText}>{post.replyCount}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={onBookmark}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.7}
        >
          <Ionicons
            name={post.isBookmarked ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={post.isBookmarked ? '#C8922A' : 'rgba(240,232,213,0.5)'}
          />
        </TouchableOpacity>
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
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
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
    textAlign: 'center',
  },
  gateSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  pillScroll: { maxHeight: 56, flexGrow: 0 },
  pillRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  pillActive: { backgroundColor: '#F0E8D5' },
  pillInactive: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  pillTextActive: { fontSize: 13, color: '#080808', fontFamily: 'Manrope_700Bold' },
  pillTextInactive: { fontSize: 13, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_500Medium' },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
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
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
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
  menuBtn: { paddingLeft: 4 },
  content: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.9)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    marginTop: 12,
  },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 13, color: 'rgba(240,232,213,0.5)', fontFamily: 'Manrope_500Medium' },
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingTop: 12 },
  tabTextActive: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  tabTextInactive: { fontSize: 15, color: 'rgba(240,232,213,0.4)', fontFamily: 'Manrope_600SemiBold' },
  tabUnderline: {
    height: 2,
    width: 40,
    borderRadius: 1,
    marginTop: 10,
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: { backgroundColor: '#C8922A' },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  tradeCol: { flex: 1 },
  tradeIcon: { marginTop: 12 },
  tradeLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  tradeValue: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    lineHeight: 21,
  },
  valueBadge: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(200,146,42,0.12)',
  },
  valueBadgeText: {
    fontSize: 11,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
  notes: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.8)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    marginTop: 12,
  },
  interestCountBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  interestCountText: { fontSize: 13, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_500Medium' },
  interestCountTextMuted: { fontSize: 13, color: 'rgba(240,232,213,0.5)', fontFamily: 'Manrope_500Medium' },
  interestBtn: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  interestBtnText: { fontSize: 13, color: '#080808', fontFamily: 'Manrope_700Bold' },
  interestSentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  interestSentText: { fontSize: 13, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_600SemiBold' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: '#141210',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  modalTitle: { fontSize: 17, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  modalSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
    lineHeight: 19,
  },
  modalInput: {
    minHeight: 90,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 22,
    padding: 14,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
  },
  modalCancelText: { fontSize: 14, color: 'rgba(240,232,213,0.7)', fontFamily: 'Manrope_600SemiBold' },
  modalSend: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  modalSendDisabled: { opacity: 0.5 },
  modalSendText: { fontSize: 14, color: '#080808', fontFamily: 'Manrope_700Bold' },
})
