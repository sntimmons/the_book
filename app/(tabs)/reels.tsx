import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  Dimensions,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Share,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { Audio, Video, ResizeMode } from 'expo-av'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

const LIKE_RED = '#FF2D55'
const DOUBLE_TAP_MS = 280

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface Reel {
  id: string
  providerId: string
  providerName: string
  providerCategory: string
  providerNeighborhood: string
  providerAvatarUrl?: string
  providerVerified: boolean
  providerAvailable: boolean
  caption: string
  likes: number
  comments: number
  isLiked: boolean
  isSaved: boolean
  thumbnailColor: string
  // Video source for expo-av's Video. Bundled mock assets are a `require()`
  // number; real reels from the posts table are a { uri } streaming URL from
  // the posts-media bucket. Video's source prop accepts either form.
  video: number | { uri: string }
}

// Bundled reel assets. 11 files in /assets/videos.
const REEL_ASSETS: Record<string, number> = {
  reel1: require('../../assets/videos/reel1.mp4'),
  reel2: require('../../assets/videos/reel2.mp4'),
  reel3: require('../../assets/videos/reel3.mp4'),
  reel4: require('../../assets/videos/reel4.mp4'),
  reel5: require('../../assets/videos/reel5.mp4'),
  reel6: require('../../assets/videos/reel6.mp4'),
  reel7: require('../../assets/videos/reel7.mp4'),
  reel8: require('../../assets/videos/reel8.mp4'),
  reel9: require('../../assets/videos/reel9.mp4'),
  reel10: require('../../assets/videos/reel10.mp4'),
  reel11: require('../../assets/videos/reel11.mp4'),
}

const MOCK_REELS: Reel[] = [
  {
    id: '1',
    providerId: '05df1125-9149-4f52-8f06-cc580e5665b4',
    providerName: 'Nia Laurent',
    providerCategory: 'Lashes',
    providerNeighborhood: 'River Oaks',
    providerVerified: true,
    providerAvailable: true,
    caption: 'Classic full set on my client today. 6 week retention guaranteed.',
    likes: 847,
    comments: 43,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#1a0d0d',
    video: REEL_ASSETS.reel1,
  },
  {
    id: '2',
    providerId: '4024fde8-6b72-4e1b-9bd2-84351e56e6bd',
    providerName: 'Kendra Simmons',
    providerCategory: 'Hair',
    providerNeighborhood: 'Midtown',
    providerVerified: true,
    providerAvailable: false,
    caption:
      'Taper fade with a hard part. Clean lines every time. Walk-ins welcome Thursday.',
    likes: 1203,
    comments: 67,
    isLiked: true,
    isSaved: false,
    thumbnailColor: '#0d0d1a',
    video: REEL_ASSETS.reel2,
  },
  {
    id: '3',
    providerId: '2e8f4bf1-73f1-4084-9e1b-68b46f149d43',
    providerName: 'Zara Baptise',
    providerCategory: 'Braider',
    providerNeighborhood: 'Midtown',
    providerVerified: false,
    providerAvailable: true,
    caption:
      'Knotless braids, tension-free. Your edges will thank you. Booking 3 weeks out.',
    likes: 2341,
    comments: 128,
    isLiked: false,
    isSaved: true,
    thumbnailColor: '#0a1a0a',
    video: REEL_ASSETS.reel3,
  },
  {
    id: '4',
    providerId: '4024fde8-6b72-4e1b-9bd2-84351e56e6bd',
    providerName: 'Kendra Simmons',
    providerCategory: 'Hair',
    providerNeighborhood: 'Midtown',
    providerVerified: true,
    providerAvailable: true,
    caption:
      'Silk press season. Come through looking like silk. Open slots this week.',
    likes: 934,
    comments: 52,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#1a0d1a',
    video: REEL_ASSETS.reel4,
  },
  {
    id: '5',
    providerId: '6c20dce6-9063-4587-8b3c-1dc5a2323f6d',
    providerName: 'Marcus Delray',
    providerCategory: 'Fitness Trainer',
    providerNeighborhood: 'Third Ward',
    providerVerified: true,
    providerAvailable: true,
    caption:
      '12-week body recomp. Results speak for themselves. DM for a consult.',
    likes: 567,
    comments: 31,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#0d1a1a',
    video: REEL_ASSETS.reel5,
  },
  {
    id: '6',
    providerId: '05df1125-9149-4f52-8f06-cc580e5665b4',
    providerName: 'Nia Laurent',
    providerCategory: 'Lashes',
    providerNeighborhood: 'EaDo',
    providerVerified: true,
    providerAvailable: true,
    caption: 'Chrome ombre with a chrome French. Two-hour set, walk out glowing.',
    likes: 1102,
    comments: 58,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#1a0a0a',
    video: REEL_ASSETS.reel6,
  },
  {
    id: '7',
    providerId: '05df1125-9149-4f52-8f06-cc580e5665b4',
    providerName: 'Nia Laurent',
    providerCategory: 'Lashes',
    providerNeighborhood: 'Museum District',
    providerVerified: true,
    providerAvailable: false,
    caption: 'Soft glam, full glam, bridal, whatever the moment calls for.',
    likes: 1876,
    comments: 94,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#0d0d0d',
    video: REEL_ASSETS.reel7,
  },
  {
    id: '8',
    providerId: '05df1125-9149-4f52-8f06-cc580e5665b4',
    providerName: 'Nia Laurent',
    providerCategory: 'Lashes',
    providerNeighborhood: 'Heights',
    providerVerified: true,
    providerAvailable: true,
    caption: 'Wispy hybrid set. Light, fluffy, and they last.',
    likes: 643,
    comments: 27,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#0a0a1a',
    video: REEL_ASSETS.reel8,
  },
  {
    id: '9',
    providerId: '4024fde8-6b72-4e1b-9bd2-84351e56e6bd',
    providerName: 'Kendra Simmons',
    providerCategory: 'Hair',
    providerNeighborhood: 'Heights',
    providerVerified: false,
    providerAvailable: true,
    caption: 'Skin fade with a beard line-up. Quick, sharp, on-time.',
    likes: 521,
    comments: 22,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#101010',
    video: REEL_ASSETS.reel9,
  },
  {
    id: '10',
    providerId: '2e8f4bf1-73f1-4084-9e1b-68b46f149d43',
    providerName: 'Zara Baptise',
    providerCategory: 'Braider',
    providerNeighborhood: 'Third Ward',
    providerVerified: true,
    providerAvailable: true,
    caption: 'Boho knotless with the human-hair curls. Took five hours, worth it.',
    likes: 2098,
    comments: 113,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#0d1a14',
    video: REEL_ASSETS.reel10,
  },
  {
    id: '11',
    providerId: '6c20dce6-9063-4587-8b3c-1dc5a2323f6d',
    providerName: 'Marcus Delray',
    providerCategory: 'Fitness Trainer',
    providerNeighborhood: 'Montrose',
    providerVerified: true,
    providerAvailable: true,
    caption: 'Behind the scenes from a portrait session last week.',
    likes: 412,
    comments: 19,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#141414',
    video: REEL_ASSETS.reel11,
  },
]

// Shape of a posts row joined to its provider. The provider embed is a
// single object (posts.provider_id -> providers.id is many-to-one), though
// supabase-js types it loosely, so we cast through this local type.
interface RawReelRow {
  id: string
  media_url: string
  caption: string | null
  like_count: number | null
  comment_count: number | null
  provider: {
    id: string
    display_name: string
    category_id: number | null
    neighborhood: string | null
    profile_photo_url: string | null
    identity_verified: boolean | null
  } | null
}

// Default background shown behind a video while it loads. Real reels have no
// per-item accent color the way the mock set does; the video covers this.
const REEL_FALLBACK_COLOR = '#0d0d0d'

// Fetch real reels (posts with a video) joined to provider info, mapped to the
// Reel shape the feed already renders. Returns [] on error or when there are
// no real videos yet, so the caller can fall back to MOCK_REELS.
async function fetchReels(): Promise<Reel[]> {
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, media_url, caption, like_count, comment_count, provider:providers(id, display_name, category_id, neighborhood, profile_photo_url, identity_verified)',
    )
    .eq('media_type', 'video')
    .eq('is_active', true)
    .eq('is_demo', false)
    .order('created_at', { ascending: false })

  if (error) {
    console.log('Fetch reels error:', error)
    return []
  }

  const rows = (data as unknown as RawReelRow[]) ?? []

  // Resolve category ids to names once for all rows.
  const { data: cats } = await supabase.from('categories').select('id, name')
  const categoryNames = new Map<number, string>(
    ((cats as { id: number; name: string }[]) ?? []).map((c) => [c.id, c.name]),
  )

  return rows
    .filter((row) => row.provider != null && !!row.media_url)
    .map((row) => {
      const p = row.provider!
      return {
        id: row.id,
        providerId: p.id,
        providerName: p.display_name,
        providerCategory:
          p.category_id != null ? categoryNames.get(p.category_id) ?? '' : '',
        providerNeighborhood: p.neighborhood ?? '',
        providerAvatarUrl: p.profile_photo_url ?? undefined,
        providerVerified: !!p.identity_verified,
        // No real-time availability signal on the posts feed yet; do not
        // fabricate one.
        providerAvailable: false,
        caption: row.caption ?? '',
        likes: row.like_count ?? 0,
        comments: row.comment_count ?? 0,
        // Per-user like/save state is not wired yet (future stage).
        isLiked: false,
        isSaved: false,
        thumbnailColor: REEL_FALLBACK_COLOR,
        video: { uri: row.media_url },
      }
    })
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

interface CommentRow {
  id: string
  user_id: string
  comment_text: string
  created_at: string
  authorName: string
}

// Short relative timestamp for comments (now / 5m / 3h / 2d / 1w).
function timeAgo(iso: string): string {
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

// post_comments has no author-name column, so resolve names from clients (by
// id) and providers (by user_id) in two batch queries. Provider display name
// wins when a user owns both rows.
async function resolveCommenterNames(userIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  if (userIds.length === 0) return map
  const [clientsRes, providersRes] = await Promise.all([
    supabase.from('clients').select('id, name').in('id', userIds),
    supabase.from('providers').select('user_id, display_name').in('user_id', userIds),
  ])
  for (const c of (clientsRes.data as { id: string; name: string | null }[] | null) ?? []) {
    if (c.name) map.set(c.id, c.name)
  }
  for (const p of (providersRes.data as { user_id: string; display_name: string | null }[] | null) ?? []) {
    if (p.display_name) map.set(p.user_id, p.display_name)
  }
  return map
}

async function loadComments(postId: string): Promise<CommentRow[]> {
  const { data, error } = await supabase
    .from('post_comments')
    .select('id, user_id, comment_text, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
  if (error) {
    console.log('Load comments error:', error)
    return []
  }
  const rows =
    (data as { id: string; user_id: string; comment_text: string; created_at: string }[] | null) ?? []
  const names = await resolveCommenterNames([...new Set(rows.map((r) => r.user_id))])
  return rows.map((r) => ({ ...r, authorName: names.get(r.user_id) ?? 'Member' }))
}

export default function ReelsScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [reels, setReels] = useState<Reel[]>(MOCK_REELS)
  // True once real reels (backed by real post rows) have loaded — only then do
  // like/save/comment interactions persist. Mock reels stay local-only.
  const [isRealData, setIsRealData] = useState(false)
  const [commentPostId, setCommentPostId] = useState<string | null>(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [screenFocused, setScreenFocused] = useState(true)

  // Make video sound play even when the iOS silent switch is on, matching
  // TikTok / Instagram Reels behavior. Without this, every iPhone in
  // silent mode (most of them) plays the reels muted regardless of the
  // isMuted prop.
  useEffect(() => {
    Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => {})
  }, [])

  // Load real reels from the posts table. Start on MOCK_REELS so the tab is
  // never empty, and swap to real videos once they load. If there are no real
  // videos yet (or the query fails), MOCK_REELS stays in place as the fallback.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const real = await fetchReels()
      if (cancelled || real.length === 0) return

      // Resolve which of these posts the current user has already liked/saved
      // so the heart/bookmark render filled on load.
      if (user) {
        const ids = real.map((r) => r.id)
        const [likesRes, savesRes] = await Promise.all([
          supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', ids),
          supabase.from('post_saves').select('post_id').eq('user_id', user.id).in('post_id', ids),
        ])
        const liked = new Set(
          ((likesRes.data as { post_id: string }[] | null) ?? []).map((r) => r.post_id),
        )
        const saved = new Set(
          ((savesRes.data as { post_id: string }[] | null) ?? []).map((r) => r.post_id),
        )
        real.forEach((r) => {
          r.isLiked = liked.has(r.id)
          r.isSaved = saved.has(r.id)
        })
      }

      if (!cancelled) {
        setReels(real)
        setIsRealData(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  // Pause every video the moment the user navigates away (e.g. taps Book
  // and lands on a provider profile). expo-router keeps this screen
  // mounted in the stack so without this the audio keeps playing under
  // whatever screen is on top.
  useFocusEffect(
    useCallback(() => {
      setScreenFocused(true)
      return () => setScreenFocused(false)
    }, []),
  )

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index)
      }
    },
  ).current

  // Like / unlike with optimistic UI + revert-on-failure. Persists to
  // post_likes only for real posts; mock reels stay local-only.
  async function toggleLike(id: string) {
    const reel = reels.find((r) => r.id === id)
    if (!reel) return
    const wasLiked = reel.isLiked

    setReels((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, isLiked: !wasLiked, likes: Math.max(0, r.likes + (wasLiked ? -1 : 1)) }
          : r,
      ),
    )

    if (!isRealData || !user) return
    try {
      const { error } = wasLiked
        ? await supabase.from('post_likes').delete().eq('user_id', user.id).eq('post_id', id)
        : await supabase.from('post_likes').insert({ user_id: user.id, post_id: id })
      if (error) throw error
    } catch (err) {
      console.log('Like persist error:', err)
      setReels((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, isLiked: wasLiked, likes: Math.max(0, r.likes + (wasLiked ? 1 : -1)) }
            : r,
        ),
      )
    }
  }

  // Double-tap only ever likes (never unlikes), matching TikTok/Instagram.
  function likeReel(id: string) {
    const reel = reels.find((r) => r.id === id)
    if (reel && !reel.isLiked) toggleLike(id)
  }

  // Save / unsave with optimistic UI + revert-on-failure.
  async function toggleSave(id: string) {
    const reel = reels.find((r) => r.id === id)
    if (!reel) return
    const wasSaved = reel.isSaved

    setReels((prev) => prev.map((r) => (r.id === id ? { ...r, isSaved: !wasSaved } : r)))

    if (!isRealData || !user) return
    try {
      const { error } = wasSaved
        ? await supabase.from('post_saves').delete().eq('user_id', user.id).eq('post_id', id)
        : await supabase.from('post_saves').insert({ user_id: user.id, post_id: id })
      if (error) throw error
    } catch (err) {
      console.log('Save persist error:', err)
      setReels((prev) => prev.map((r) => (r.id === id ? { ...r, isSaved: wasSaved } : r)))
    }
  }

  // Adjust a reel's comment count (used by the comment sheet on add/revert).
  function bumpCommentCount(id: string, delta: number) {
    setReels((prev) =>
      prev.map((r) => (r.id === id ? { ...r, comments: Math.max(0, r.comments + delta) } : r)),
    )
  }

  function handleComment(id: string) {
    if (isRealData) {
      setCommentPostId(id)
    } else {
      Alert.alert('Coming soon', 'This feature is coming in the next update.', [{ text: 'OK' }])
    }
  }

  async function handleShare(reel: Reel) {
    try {
      await Share.share({
        message: `Check out ${reel.providerName} on The Book. ${reel.caption}`,
      })
    } catch {}
  }

  return (
    <View style={styles.root}>
      <StatusBar hidden />
      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={SCREEN_HEIGHT}
        snapToAlignment="start"
        decelerationRate="fast"
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SCREEN_HEIGHT,
          offset: SCREEN_HEIGHT * index,
          index,
        })}
        renderItem={({ item, index }) => (
          <ReelItem
            reel={item}
            isActive={index === currentIndex && screenFocused}
            currentIndex={currentIndex}
            total={reels.length}
            onLike={() => toggleLike(item.id)}
            onDoubleTapLike={() => likeReel(item.id)}
            onSave={() => toggleSave(item.id)}
            onComment={() => handleComment(item.id)}
            onShare={() => handleShare(item)}
            insets={insets}
          />
        )}
      />

      <CommentSheet
        postId={commentPostId}
        userId={user?.id ?? null}
        insets={insets}
        onClose={() => setCommentPostId(null)}
        onCountDelta={(delta) => {
          if (commentPostId) bumpCommentCount(commentPostId, delta)
        }}
      />
    </View>
  )
}

interface ReelItemProps {
  reel: Reel
  isActive: boolean
  currentIndex: number
  total: number
  onLike: () => void
  onDoubleTapLike: () => void
  onSave: () => void
  onComment: () => void
  onShare: () => void
  insets: { top: number; bottom: number; left: number; right: number }
}

function ReelItem({
  reel,
  isActive,
  currentIndex,
  total,
  onLike,
  onDoubleTapLike,
  onSave,
  onComment,
  onShare,
  insets,
}: ReelItemProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current
  const providerInitials = getInitials(reel.providerName)
  const videoRef = useRef<Video>(null)
  const lastTapAt = useRef(0)
  const burst = useRef(new Animated.Value(0)).current

  // Horizontal scrubber: no real video time yet, so reflect progress through the feed.
  const progressPct = total > 0 ? ((currentIndex + 1) / total) * 100 : 0

  // Restart the video from the top every time this card becomes active,
  // and force a pause + rewind when it goes inactive so audio cannot
  // bleed under a pushed screen.
  useEffect(() => {
    if (isActive) {
      videoRef.current?.setPositionAsync(0).catch(() => {})
    } else {
      videoRef.current?.pauseAsync().catch(() => {})
      videoRef.current?.setPositionAsync(0).catch(() => {})
    }
  }, [isActive])

  useEffect(() => {
    if (!reel.providerAvailable) return
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    )
    loop.start()
    return () => {
      loop.stop()
      pulseAnim.stopAnimation()
    }
  }, [reel.providerAvailable, pulseAnim])

  function playBurst() {
    burst.setValue(0)
    Animated.sequence([
      Animated.spring(burst, {
        toValue: 1,
        useNativeDriver: true,
        speed: 28,
        bounciness: 10,
      }),
      Animated.timing(burst, {
        toValue: 0,
        duration: 180,
        delay: 40,
        useNativeDriver: true,
      }),
    ]).start()
  }

  function handleVideoTap() {
    const now = Date.now()
    if (now - lastTapAt.current < DOUBLE_TAP_MS) {
      // Double-tap: like (never unlike, matching TikTok).
      onDoubleTapLike()
      playBurst()
      lastTapAt.current = 0
      return
    }
    lastTapAt.current = now
  }

  function goToProvider() {
    router.push(`/providers/${reel.providerId}` as any)
  }

  return (
    <View style={[styles.reelRoot, { backgroundColor: reel.thumbnailColor }]}>
      {/* Bundled video wrapped in a Pressable to catch double-taps. The
          right rail and header render after this Pressable so their
          touches take priority in their own regions. */}
      <Pressable onPress={handleVideoTap} style={StyleSheet.absoluteFill}>
        <Video
          ref={videoRef}
          source={reel.video}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive}
          isLooping
          isMuted={false}
          volume={1.0}
          useNativeControls={false}
        />
      </Pressable>

      {/* Fallback play icon if a video fails to load. Sits below the
          scrims so it disappears the moment the video shows a frame. */}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <Ionicons name="play-circle" size={48} color="rgba(240,232,213,0.05)" />
      </View>

      {/* Double-tap heart burst */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.burstWrap,
          {
            opacity: burst,
            transform: [
              {
                scale: burst.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.4, 1.25],
                }),
              },
            ],
          },
        ]}
      >
        <Ionicons name="heart" size={120} color={LIKE_RED} />
      </Animated.View>

      {/* Top scrim: 128px, 0.5 -> 0 */}
      <LinearGradient
        colors={['rgba(8,8,8,0.5)', 'rgba(8,8,8,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.topGradient}
        pointerEvents="none"
      />

      {/* Bottom scrim: transparent until 65%, 0.3 at 80%, 0.7 at bottom */}
      <LinearGradient
        colors={[
          'rgba(8,8,8,0)',
          'rgba(8,8,8,0)',
          'rgba(8,8,8,0.3)',
          'rgba(8,8,8,0.7)',
        ]}
        locations={[0, 0.65, 0.8, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top header: Reels wordmark, For You tab, camera. (No back chevron —
          Reels is now a root tab; switch away via the bottom bar.) */}
      <View style={[styles.header, { top: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={styles.wordmark}>Reels</Text>
        </View>

        <View style={styles.tab}>
          <Text style={styles.tabText}>For You</Text>
          <View style={styles.tabUnderline} />
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.cameraBtn}
          onPress={() => {}}
        >
          <Ionicons name="camera" size={22} color="#F0E8D5" />
        </TouchableOpacity>
      </View>

      {/* Right rail: avatar+Follow, heart, comment, share, Book */}
      <View style={[styles.rightActions, { bottom: insets.bottom + 128 }]}>
        {/* Provider avatar + follow */}
        <View style={styles.railAvatarGroup}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={goToProvider}
            style={styles.railAvatarWrap}
          >
            <View style={styles.railAvatar}>
              {reel.providerAvatarUrl ? (
                <Image
                  source={{ uri: reel.providerAvatarUrl }}
                  style={styles.railAvatarImg}
                />
              ) : (
                <Text style={styles.railAvatarInitials}>{providerInitials}</Text>
              )}
            </View>
            <View style={styles.followBadge}>
              <Ionicons name="add" size={14} color="#080808" />
            </View>
          </TouchableOpacity>
          <Text style={styles.followLabel}>Follow</Text>
        </View>

        {/* Like */}
        <ActionButton
          ionicon={reel.isLiked ? 'heart' : 'heart-outline'}
          size={28}
          color={reel.isLiked ? LIKE_RED : '#F0E8D5'}
          labelColor={reel.isLiked ? LIKE_RED : undefined}
          label={formatCount(reel.likes)}
          onPress={onLike}
        />

        {/* Save */}
        <ActionButton
          ionicon={reel.isSaved ? 'bookmark' : 'bookmark-outline'}
          size={26}
          color={reel.isSaved ? '#C8922A' : '#F0E8D5'}
          labelColor={reel.isSaved ? '#C8922A' : undefined}
          label="Save"
          onPress={onSave}
        />

        {/* Comment */}
        <ActionButton
          ionicon="chatbubble"
          size={28}
          color="#F0E8D5"
          label={formatCount(reel.comments)}
          onPress={onComment}
        />

        {/* Share */}
        <ActionButton
          ionicon="paper-plane"
          size={26}
          color="#F0E8D5"
          label="Share"
          onPress={onShare}
        />

        {/* Book */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={goToProvider}
          style={styles.bookWrap}
        >
          <View style={styles.bookCircle}>
            <Ionicons name="calendar" size={24} color="#C8922A" />
          </View>
          <Text style={styles.bookLabel}>Book</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom-left content. +64 clears the bottom tab bar now that Reels is a
          tab (keeps the original 24 gap above it). */}
      <View style={[styles.leftContent, { bottom: insets.bottom + 88 }]}>
        {/* Provider row + availability inline */}
        {/* TODO: design Houston-native trust signal to replace the verification check */}
        <TouchableOpacity
          style={styles.providerRow}
          activeOpacity={0.8}
          onPress={goToProvider}
        >
          <View style={styles.providerAvatar}>
            {reel.providerAvatarUrl ? (
              <Image
                source={{ uri: reel.providerAvatarUrl }}
                style={styles.providerAvatarImg}
              />
            ) : (
              <Text style={styles.providerAvatarInitials}>
                {providerInitials}
              </Text>
            )}
          </View>

          <View style={styles.providerInfo}>
            <View style={styles.providerNameRow}>
              <Text style={styles.providerName} numberOfLines={1}>
                {reel.providerName}
              </Text>
              {reel.providerAvailable && (
                <View style={styles.availInline}>
                  <Animated.View
                    style={{
                      opacity: pulseAnim,
                      width: 6,
                      height: 6,
                      borderRadius: 3,
                      backgroundColor: '#C8922A',
                    }}
                  />
                  <Text style={styles.availText}>Available</Text>
                </View>
              )}
            </View>
            <Text style={styles.providerMeta} numberOfLines={1}>
              {reel.providerCategory} · {reel.providerNeighborhood}
            </Text>
          </View>
        </TouchableOpacity>

        {/* Caption: plain, max 2 lines */}
        <Text style={styles.caption} numberOfLines={2} ellipsizeMode="tail">
          {reel.caption}
        </Text>
      </View>

      {/* Bottom horizontal scrubber — sits just above the tab bar. */}
      <View style={[styles.scrubberTrack, { bottom: insets.bottom + 64 }]}>
        <View style={[styles.scrubberFill, { width: `${progressPct}%` }]} />
      </View>
    </View>
  )
}

function CommentSheet({
  postId,
  userId,
  insets,
  onClose,
  onCountDelta,
}: {
  postId: string | null
  userId: string | null
  insets: { top: number; bottom: number; left: number; right: number }
  onClose: () => void
  onCountDelta: (delta: number) => void
}) {
  const [comments, setComments] = useState<CommentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [myName, setMyName] = useState('You')

  useEffect(() => {
    if (!postId) return
    let cancelled = false
    setLoading(true)
    setComments([])
    setInput('')
    ;(async () => {
      const list = await loadComments(postId)
      if (cancelled) return
      setComments(list)
      setLoading(false)
      if (userId) {
        const names = await resolveCommenterNames([userId])
        if (!cancelled) setMyName(names.get(userId) ?? 'You')
      }
    })()
    return () => {
      cancelled = true
    }
  }, [postId, userId])

  async function submit() {
    const text = input.trim()
    if (!text || !userId || !postId || submitting) return
    setSubmitting(true)

    // Optimistic: show the comment and bump the count immediately.
    const tempId = `temp-${Date.now()}`
    const optimistic: CommentRow = {
      id: tempId,
      user_id: userId,
      comment_text: text,
      created_at: new Date().toISOString(),
      authorName: myName,
    }
    setComments((prev) => [...prev, optimistic])
    setInput('')
    onCountDelta(1)

    try {
      const { data, error } = await supabase
        .from('post_comments')
        .insert({ user_id: userId, post_id: postId, comment_text: text })
        .select('id, created_at')
        .single()
      if (error) throw error
      const row = data as { id: string; created_at: string }
      setComments((prev) =>
        prev.map((c) => (c.id === tempId ? { ...c, id: row.id, created_at: row.created_at } : c)),
      )
    } catch (err) {
      console.log('Comment submit error:', err)
      setComments((prev) => prev.filter((c) => c.id !== tempId))
      onCountDelta(-1)
    } finally {
      setSubmitting(false)
    }
  }

  const canSend = input.trim().length > 0 && !submitting

  return (
    <Modal
      visible={postId != null}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.commentRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[styles.commentSheet, { paddingBottom: insets.bottom + 8 }]}
        >
          <View style={styles.commentHandle} />
          <View style={styles.commentHeader}>
            <Text style={styles.commentTitle}>Comments</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color="#F0E8D5" />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.commentLoading}>
              <ActivityIndicator color="rgba(240,232,213,0.4)" />
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.commentEmpty}>
              <Text style={styles.commentEmptyText}>No comments yet. Be the first.</Text>
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.commentList}
              renderItem={({ item }) => (
                <View style={styles.commentItem}>
                  <View style={styles.commentAvatar}>
                    <Text style={styles.commentAvatarText}>{getInitials(item.authorName)}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.commentAuthor}>
                      {item.authorName}
                      <Text style={styles.commentTime}>{'  '}{timeAgo(item.created_at)}</Text>
                    </Text>
                    <Text style={styles.commentBody}>{item.comment_text}</Text>
                  </View>
                </View>
              )}
            />
          )}

          <View style={styles.commentInputRow}>
            <TextInput
              style={styles.commentInput}
              placeholder="Add a comment..."
              placeholderTextColor="rgba(240,232,213,0.3)"
              value={input}
              onChangeText={setInput}
              multiline
            />
            <TouchableOpacity
              style={[styles.commentSend, !canSend && styles.commentSendDisabled]}
              onPress={submit}
              disabled={!canSend}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color="#080808" size="small" />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={18}
                  color={canSend ? '#080808' : 'rgba(8,8,8,0.4)'}
                />
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

interface ActionButtonProps {
  ionicon: keyof typeof Ionicons.glyphMap
  color: string
  size?: number
  label?: string
  labelColor?: string
  onPress: () => void
}

function ActionButton({ ionicon, color, size = 28, label, labelColor, onPress }: ActionButtonProps) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.actionWrap}>
      <Ionicons name={ionicon} size={size} color={color} />
      {label != null && (
        <Text style={[styles.actionLabel, labelColor ? { color: labelColor } : null]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  reelRoot: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: 'relative',
  },
  burstWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Gradients
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 128,
  },

  // Top header
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 44,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 5,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  wordmark: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.16,
  },
  tab: {
    alignItems: 'center',
  },
  tabText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.04,
  },
  tabUnderline: {
    marginTop: 4,
    height: 2,
    width: '100%',
    borderRadius: 9999,
    backgroundColor: '#F0E8D5',
  },
  cameraBtn: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  // Right rail
  rightActions: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    gap: 24,
  },
  railAvatarGroup: {
    alignItems: 'center',
    marginBottom: 28,
  },
  railAvatarWrap: {
    width: 48,
    height: 48,
    position: 'relative',
  },
  railAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#C8922A',
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  railAvatarImg: {
    width: '100%',
    height: '100%',
  },
  railAvatarInitials: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  followBadge: {
    position: 'absolute',
    bottom: -4,
    left: 14,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  followLabel: {
    marginTop: 12,
    fontSize: 10,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  actionWrap: {
    alignItems: 'center',
    gap: 4,
  },
  actionLabel: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  bookWrap: {
    alignItems: 'center',
    gap: 4,
  },
  bookCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(200,146,42,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookLabel: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },

  // Bottom-left content
  leftContent: {
    position: 'absolute',
    left: 16,
    right: 80,
  },

  // Provider row
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  providerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.2)',
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  providerAvatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  providerAvatarInitials: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  providerInfo: {
    flex: 1,
  },
  providerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  providerName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    flexShrink: 1,
  },
  availInline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  availText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_500Medium',
  },
  providerMeta: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },

  // Caption (Figma: plain Manrope Regular 14, ~11px gap from provider row)
  caption: {
    marginTop: 11,
    fontSize: 14,
    color: 'rgba(240,232,213,0.9)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 23,
  },

  // Bottom horizontal scrubber
  scrubberTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 2,
    backgroundColor: 'rgba(240,232,213,0.2)',
  },
  scrubberFill: {
    height: 2,
    backgroundColor: '#F0E8D5',
  },

  // Comment sheet
  commentRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  commentSheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    maxHeight: '75%',
    minHeight: '45%',
  },
  commentHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(240,232,213,0.2)',
    marginTop: 10,
    marginBottom: 6,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  commentTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  commentLoading: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  commentEmpty: {
    paddingVertical: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  commentEmptyText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  commentList: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  commentItem: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  commentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  commentAuthor: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 3,
  },
  commentTime: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  commentBody: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.85)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  commentSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentSendDisabled: {
    backgroundColor: 'rgba(240,232,213,0.2)',
  },
})
