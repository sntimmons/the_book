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
import { useTheme } from '@/context/ThemeContext'

const DOUBLE_TAP_MS = 280

// The scrim over media is Ink in BOTH schemes (`mediaScrim`) — a scrim over a
// photograph must not invert. A gradient needs alpha stops and a hex token
// cannot express one, so Ink's channels are written out here and nowhere else.
// This is the same exception the provider profile takes.
const INK = '33,31,29'
const scrim = (alpha: number) => `rgba(${INK},${alpha})`

// How long the word "Paused" and the seek line linger after a tap.
const PAUSE_FADE_MS = 160

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface Reel {
  id: string
  providerId: string
  providerName: string
  providerCategory: string
  providerNeighborhood: string
  providerAvatarUrl?: string
  caption: string
  likes: number
  comments: number
  isLiked: boolean
  isSaved: boolean
  isFollowing: boolean
  // Video source for expo-av's Video. Bundled mock assets are a `require()`
  // number; real reels from the posts table are a { uri } streaming URL from
  // the posts-media bucket. Video's source prop accepts either form.
  video: number | { uri: string }
}

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
  } | null
}

// Fetch real reels (posts with a video) joined to provider info, mapped to the
// Reel shape the feed already renders. Returns [] on error or when there are
// no real videos yet, in which case the feed shows an empty state.
async function fetchReels(): Promise<Reel[]> {
  // PD-089: `posts_visible`, not `posts` — the same columns minus anyone the
  // caller is blocked with, in either direction. The embedded provider join
  // still reads `providers`, which is correct: by the time a row is returned its
  // owner is not blocked, so resolving their name is not a leak.
  const { data, error } = await supabase
    .from('posts_visible')
    .select(
      'id, media_url, caption, like_count, comment_count, provider:providers(id, display_name, category_id, neighborhood, profile_photo_url)',
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
        // No real-time availability signal on the posts feed yet; do not
        // fabricate one.
        caption: row.caption ?? '',
        likes: row.like_count ?? 0,
        comments: row.comment_count ?? 0,
        // Per-user like/save/follow state resolved after the fetch.
        isLiked: false,
        isSaved: false,
        isFollowing: false,
        video: { uri: row.media_url },
      }
    })
}

// `formatCount` lived here and turned 1200 into "1.2k" for the like and comment
// tallies on the rail. Both tallies are gone by PM ruling — no engagement or
// popularity number is shown on this surface — so the helper went with them
// rather than sitting unused waiting to be reintroduced.

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
    supabase.from('clients_public').select('id, name').in('id', userIds),
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
  // PD-089. Comments are where a blocked person most easily reappears after
  // their own content is hidden, because they arrive under someone else's post.
  const { data, error } = await supabase
    .from('post_comments_visible')
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
  const { colors, type } = useTheme()
  const { user, providerId: myProviderId, isProvider } = useAuth()

  // THE CREATION AFFORDANCE IS PROVIDER-ONLY, AND "ELIGIBLE" MEANS BOTH HALVES.
  // `isProvider` is the resolved role and `myProviderId` is the row the
  // uploader needs; a signed-out viewer or a client has neither, and a provider
  // still mid-onboarding can have the first without the second. Requiring both
  // means the control can never appear for someone the uploader would then turn
  // away — an entry point to a door you cannot open is worse than no door.
  const canCreate = !!user && isProvider && !!myProviderId
  const [reels, setReels] = useState<Reel[]>([])
  // True until the first reels fetch resolves, so we show a spinner instead of
  // the empty state during the initial load.
  const [loadingReels, setLoadingReels] = useState(true)
  // True once real reels (backed by real post rows) have loaded — only then do
  // like/save/comment interactions persist.
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

  // Load real reels from the posts table. The tab starts empty and shows a
  // spinner until this resolves; if there are no real reels yet (or the query
  // fails) it shows an honest empty state rather than fabricated mock content.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const real = await fetchReels()
      if (cancelled) return
      if (real.length === 0) {
        setLoadingReels(false)
        return
      }

      // Resolve which of these posts the current user has already liked/saved,
      // and which providers they already follow, so the icons render filled.
      if (user) {
        const ids = real.map((r) => r.id)
        const providerIds = Array.from(new Set(real.map((r) => r.providerId).filter(Boolean)))
        const [likesRes, savesRes, followsRes] = await Promise.all([
          supabase.from('post_likes').select('post_id').eq('user_id', user.id).in('post_id', ids),
          supabase.from('post_saves').select('post_id').eq('user_id', user.id).in('post_id', ids),
          supabase
            .from('provider_follows')
            .select('provider_id')
            .eq('follower_user_id', user.id)
            .in('provider_id', providerIds),
        ])
        const liked = new Set(
          ((likesRes.data as { post_id: string }[] | null) ?? []).map((r) => r.post_id),
        )
        const saved = new Set(
          ((savesRes.data as { post_id: string }[] | null) ?? []).map((r) => r.post_id),
        )
        const following = new Set(
          ((followsRes.data as { provider_id: string }[] | null) ?? []).map((r) => r.provider_id),
        )
        real.forEach((r) => {
          r.isLiked = liked.has(r.id)
          r.isSaved = saved.has(r.id)
          r.isFollowing = following.has(r.providerId)
        })
      }

      if (!cancelled) {
        setReels(real)
        setIsRealData(true)
        setLoadingReels(false)
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

  // Follow / unfollow the reel's provider with optimistic UI + revert. Toggles
  // every reel by the same provider so the state stays consistent in the feed.
  async function toggleFollow(id: string) {
    const reel = reels.find((r) => r.id === id)
    if (!reel) return
    const pid = reel.providerId
    const wasFollowing = reel.isFollowing

    setReels((prev) =>
      prev.map((r) => (r.providerId === pid ? { ...r, isFollowing: !wasFollowing } : r)),
    )

    if (!isRealData || !user) return
    try {
      const { error } = wasFollowing
        ? await supabase
            .from('provider_follows')
            .delete()
            .eq('follower_user_id', user.id)
            .eq('provider_id', pid)
        : await supabase
            .from('provider_follows')
            .insert({ follower_user_id: user.id, provider_id: pid })
      if (error) throw error
    } catch (err) {
      console.log('Follow persist error:', err)
      setReels((prev) =>
        prev.map((r) => (r.providerId === pid ? { ...r, isFollowing: wasFollowing } : r)),
      )
    }
  }

  // Adjust a reel's comment count (used by the comment sheet on add/revert).
  function bumpCommentCount(id: string, delta: number) {
    setReels((prev) =>
      prev.map((r) => (r.id === id ? { ...r, comments: Math.max(0, r.comments + delta) } : r)),
    )
  }

  function handleComment(id: string) {
    // COMMENTS ARE BUILT. This used to answer "Coming soon" whenever `isRealData`
    // was false — that is, on the seeded demo reels — so a working feature reported
    // itself unbuilt depending on which rows happened to be on screen. The honest
    // distinction is not "is the feature ready" but "can this particular item hold a
    // comment", and a demo reel cannot because it has no row to attach one to.
    if (isRealData) {
      setCommentPostId(id)
      return
    }
    Alert.alert(
      'Not available on sample content',
      'This is a sample reel, so it has nothing to comment on. Comments work on real posts.',
      [{ text: 'OK' }],
    )
  }

  async function handleShare(reel: Reel) {
    try {
      await Share.share({
        message: `Check out ${reel.providerName} on Third. ${reel.caption}`,
      })
    } catch {}
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
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
        ListEmptyComponent={
          <View
            style={[
              styles.emptyReels,
              { height: SCREEN_HEIGHT, backgroundColor: colors.bgCanvas },
            ]}
          >
            {loadingReels ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <>
                <Ionicons name="film-outline" size={40} color={colors.textSecondary} />
                <Text style={[styles.emptyReelsTitle, type.titleCard, { color: colors.textPrimary }]}>
                  No reels yet
                </Text>
                <Text
                  style={[styles.emptyReelsSub, type.bodySmall, { color: colors.textSecondary }]}
                >
                  {canCreate
                    ? 'Post a video from Posts & Reels and it will show up here.'
                    : 'Provider reels will show up here as they post them.'}
                </Text>
                {/* The empty feed is the one place the uploader can be offered
                    at full weight without competing with anyone's video,
                    because there is no video. Provider-only, same destination
                    as the header control — not a second uploader. */}
                {canCreate && (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => router.push('/(tabs)/business/posts' as any)}
                    style={[styles.emptyAddBtn, { backgroundColor: colors.actionPrimary }]}
                    accessibilityRole="button"
                    accessibilityLabel="Add a reel"
                  >
                    <Text style={[type.labelAction, { color: colors.textOnAction }]}>
                      Add a reel
                    </Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        }
        renderItem={({ item, index }) => (
          <ReelItem
            reel={item}
            isActive={index === currentIndex && screenFocused}
            // A provider cannot follow their own reel — the DB rejects the row
            // and the button would only error. Hide the follow affordance.
            isOwnReel={!!myProviderId && item.providerId === myProviderId}
            canCreate={canCreate}
            onLike={() => toggleLike(item.id)}
            onDoubleTapLike={() => likeReel(item.id)}
            onSave={() => toggleSave(item.id)}
            onFollow={() => toggleFollow(item.id)}
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
        onCountLoaded={(count) => {
          if (!commentPostId) return
          setReels((prev) =>
            prev.map((r) =>
              r.id === commentPostId ? { ...r, comments: Math.max(r.comments, count) } : r,
            ),
          )
        }}
      />
    </View>
  )
}

interface ReelItemProps {
  reel: Reel
  isActive: boolean
  isOwnReel: boolean
  canCreate: boolean
  onLike: () => void
  onDoubleTapLike: () => void
  onSave: () => void
  onFollow: () => void
  onComment: () => void
  onShare: () => void
  insets: { top: number; bottom: number; left: number; right: number }
}

function ReelItem({
  reel,
  isActive,
  isOwnReel,
  canCreate,
  onLike,
  onDoubleTapLike,
  onSave,
  onFollow,
  onComment,
  onShare,
  insets,
}: ReelItemProps) {
  const { colors, type } = useTheme()
  const providerInitials = getInitials(reel.providerName)
  const videoRef = useRef<Video>(null)
  const lastTapAt = useRef(0)
  const burst = useRef(new Animated.Value(0)).current

  // PAUSE IS A REAL STATE NOW, AND IT IS THE USER'S.
  //
  // Before this migration a single tap did nothing at all: `handleVideoTap`
  // only counted double-taps, and the thing that looked like a play control was
  // a 5%-opacity glyph with `pointerEvents="none"` mounted on every reel
  // forever. There was no way to pause a video, and the one affordance that
  // implied there was could not be pressed.
  //
  // `wantsPlay` is the viewer's intent and `isActive` is the feed's. A video
  // plays only when both agree, so scrolling away still stops audio and
  // scrolling back does not silently resume something the viewer paused.
  const [wantsPlay, setWantsPlay] = useState(true)
  const [progress, setProgress] = useState(0)
  const pauseFade = useRef(new Animated.Value(0)).current
  const paused = isActive && !wantsPlay

  // Reset intent whenever this card becomes the active one, so a paused reel
  // does not stay paused after the viewer has scrolled past it and come back.
  useEffect(() => {
    if (isActive) setWantsPlay(true)
  }, [isActive])

  useEffect(() => {
    Animated.timing(pauseFade, {
      toValue: paused ? 1 : 0,
      duration: PAUSE_FADE_MS,
      useNativeDriver: true,
    }).start()
  }, [paused, pauseFade])

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

  // The pulse animation and its Animated.Value went with the removed
  // "Available" badge — both existed only for a flag nothing ever set.

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

  // A single tap toggles playback; a double tap still likes. The single-tap
  // action is DEFERRED past the double-tap window rather than fired
  // immediately, because otherwise every double-tap-to-like would also pause
  // the video underneath it — two gestures on one region, one of them wrong.
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (singleTapTimer.current) clearTimeout(singleTapTimer.current)
    }
  }, [])

  function handleVideoTap() {
    const now = Date.now()
    if (now - lastTapAt.current < DOUBLE_TAP_MS) {
      // Double-tap: like (never unlike). Cancel the pending pause.
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current)
        singleTapTimer.current = null
      }
      onDoubleTapLike()
      playBurst()
      lastTapAt.current = 0
      return
    }
    lastTapAt.current = now
    if (singleTapTimer.current) clearTimeout(singleTapTimer.current)
    singleTapTimer.current = setTimeout(() => {
      singleTapTimer.current = null
      setWantsPlay((p) => !p)
    }, DOUBLE_TAP_MS)
  }

  function goToProvider() {
    router.push(`/providers/${reel.providerId}` as any)
  }

  // The ground behind a still-loading video is `mediaScrim` — Ink, and the same
  // Ink in both schemes, which is exactly the role's purpose. It used to be a
  // per-reel `thumbnailColor` field carrying one hardcoded near-black for every
  // row; the field is gone with the literal.
  return (
    <View style={[styles.reelRoot, { backgroundColor: colors.mediaScrim }]}>
      {/* Bundled video wrapped in a Pressable to catch double-taps. The
          right rail and header render after this Pressable so their
          touches take priority in their own regions. */}
      <Pressable
        onPress={handleVideoTap}
        style={StyleSheet.absoluteFill}
        accessibilityRole="button"
        accessibilityLabel={paused ? 'Play video' : 'Pause video'}
      >
        <Video
          ref={videoRef}
          source={reel.video}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isActive && wantsPlay}
          isLooping
          isMuted={false}
          volume={1.0}
          useNativeControls={false}
          onPlaybackStatusUpdate={(status) => {
            if (!status.isLoaded || !status.durationMillis) return
            setProgress(status.positionMillis / status.durationMillis)
          }}
        />
      </Pressable>

      {/* THERE IS NO CENTRE PLAY CONTROL, AND THAT IS THE POINT.
          What stood here was a 48pt play-circle at 5% opacity with
          `pointerEvents="none"`, mounted on every reel in every state. It was
          commented as a fallback for a video that fails to load, but nothing
          ever conditioned it — so it was a decorative glyph that looked like a
          broken control. The visual system's rule is blunt about this: if a
          control does not do anything, do not show it. Playback state is now
          carried by the word below and by the seek line, both of which appear
          only when there is something to say. */}

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
        {/* The burst is Linen, not an engagement red. PM ruling: no
            engagement-red token, and an active Like must not compete with the
            screen's primary marketplace action, which owns Mulberry. */}
        <Ionicons name="heart" size={112} color={colors.textOnAction} />
      </Animated.View>

      {/* Top scrim: 128px, 0.5 -> 0 */}
      <LinearGradient
        colors={[scrim(0.5), scrim(0)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.topGradient}
        pointerEvents="none"
      />

      {/* Bottom scrim: transparent until 65%, 0.3 at 80%, 0.7 at bottom */}
      <LinearGradient
        colors={[scrim(0), scrim(0), scrim(0.3), scrim(0.72)]}
        locations={[0, 0.65, 0.8, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top header: the Reels wordmark, the paused state, and the provider's
          way in. No back chevron here: Reels is a root tab, so switch away via
          the bottom bar. */}
      <View style={[styles.header, { top: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.wordmark, type.titleCard, { color: colors.textOnAction }]}>
            Reels
          </Text>
          {/* PAUSED IS SAID, NOT MERELY SHOWN. The visual system requires state
              to be carried in words rather than colour alone, and a paused
              video is otherwise indistinguishable from one that stalled.

              MOUNTED ONLY WHILE PAUSED, not merely faded to zero. A
              transparent Text node is still in the accessibility tree, so
              keeping it mounted meant a screen reader announced "PAUSED" over a
              video that was playing. Losing the fade-OUT is the cheaper of the
              two costs; the fade-in still runs on mount. */}
          {paused && (
            <Animated.View style={{ opacity: pauseFade }} pointerEvents="none">
              <Text style={[styles.pausedWord, type.caption, { color: colors.textOnAction }]}>
                PAUSED
              </Text>
            </Animated.View>
          )}
        </View>

        {/* A "For You" label sat here under a full-width selected-tab underline.
            It was NOT a control — no Pressable, no handler — so it wore the
            standard "this option is selected" affordance while being the only
            option that existed. And the feed underneath it is `posts_visible`
            ordered by `created_at` descending: strictly reverse-chronological
            eligible video, with no personalization, no follow input and no
            ranking of any kind. The only viewer-dependent part is PD-089's
            block filter, which removes rows for safety and does not order them.
            So the label claimed a personalization the product does not perform
            and a selector that does not exist. Removed rather than renamed: the
            wordmark already says what this surface is, and PD-073 asks a lane to
            print the rule that put content in front of you rather than imply a
            different one. Founder-approved truthfulness correction, 2026-09-15.
            A second feed, a Following feed or a category switcher would each be
            a product decision, not a reinstatement of this. */}

        {/* THE PROVIDER-ONLY WAY IN. This slot was reserved as an empty spacer
            with a note that a capture entry point would live here once one
            existed. One does: the Posts & Reels uploader. It is a contextual
            entry point, NOT a second uploader, not a tab and not a floating
            button — a consumer sees the same empty space they see today, which
            is why the spacer stays rather than the row re-centring. The durable
            provider-management path remains Me / My Studio. */}
        {canCreate ? (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => router.push('/(tabs)/business/posts' as any)}
            style={styles.cameraBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Add a reel"
            accessibilityHint="Opens your Posts and Reels uploader"
          >
            <View style={[styles.addReel, { borderColor: colors.textOnAction }]}>
              <Ionicons name="add" size={18} color={colors.textOnAction} />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.cameraBtn} />
        )}
      </View>

      {/* Seek line. Sits on the frame's bottom edge, above the tab bar. It is
          the only thing that reports position, and it brightens when paused
          rather than appearing from nothing — a line that materialises on tap
          reads as a glitch. */}
      <View
        pointerEvents="none"
        style={[styles.seekTrack, { bottom: insets.bottom + 56 }]}
      >
        <Animated.View
          style={[
            styles.seekFill,
            {
              backgroundColor: colors.textOnAction,
              width: `${Math.min(Math.max(progress, 0), 1) * 100}%`,
              opacity: pauseFade.interpolate({ inputRange: [0, 1], outputRange: [0.28, 0.9] }),
            },
          ]}
        />
      </View>

      {/* THE RAIL IS FOUR QUIET GLYPHS AND NOTHING ELSE.
          Gone from it: the provider's avatar (the same provider was rendered
          twice on one screen — once here, once in the identity block below),
          the follow badge, every engagement count, and Book. Counts are removed
          by PM ruling; Book left because a marketplace's conversion action
          should not be the fifth icon in a stack of icons, weighted the same as
          Share. It now lives under the provider's name where it reads as part
          of a sentence. */}
      <View style={[styles.rightActions, { bottom: insets.bottom + 128 }]}>
        <ActionButton
          ionicon={reel.isLiked ? 'heart' : 'heart-outline'}
          size={26}
          color={colors.textOnAction}
          // Active state is FILL plus the word, never a colour the primary
          // action could be confused with. There is deliberately no
          // engagement-red token in this system.
          active={reel.isLiked}
          label={reel.isLiked ? 'Liked' : 'Like'}
          type={type}
          onPress={onLike}
        />

        <ActionButton
          ionicon={reel.isSaved ? 'bookmark' : 'bookmark-outline'}
          size={24}
          color={colors.textOnAction}
          active={reel.isSaved}
          label={reel.isSaved ? 'Saved' : 'Save'}
          type={type}
          onPress={onSave}
        />

        <ActionButton
          ionicon="chatbubble-outline"
          size={25}
          color={colors.textOnAction}
          label="Comment"
          type={type}
          onPress={onComment}
        />

        <ActionButton
          ionicon="paper-plane-outline"
          size={24}
          color={colors.textOnAction}
          label="Share"
          type={type}
          onPress={onShare}
        />
      </View>

      {/* ONE IDENTITY BLOCK, AND THE ACTION THAT FOLLOWS FROM IT.
          The provider used to appear twice on this screen: an avatar with a
          follow badge on the rail, and this row. They were the same person.
          This is now the only identity on the reel, and the reading order is
          deliberate — who made this, where they work, what they said, then the
          way to reach them. That last step is a sentence ending, not the fifth
          icon in a column. */}
      <View style={[styles.leftContent, { bottom: insets.bottom + 88 }]}>
        <View style={styles.providerRow}>
          <TouchableOpacity
            style={styles.providerTap}
            activeOpacity={0.8}
            onPress={goToProvider}
            accessibilityRole="button"
            accessibilityLabel={`${reel.providerName}, view profile`}
          >
            <View style={[styles.providerAvatar, { borderColor: colors.textOnAction }]}>
              {reel.providerAvatarUrl ? (
                <Image
                  source={{ uri: reel.providerAvatarUrl }}
                  style={styles.providerAvatarImg}
                />
              ) : (
                <Text
                  style={[
                    styles.providerAvatarInitials,
                    type.labelAction,
                    { color: colors.textOnAction },
                  ]}
                >
                  {providerInitials}
                </Text>
              )}
            </View>

            <View style={styles.providerInfo}>
              <Text
                style={[styles.providerName, type.titleCard, { color: colors.textOnAction }]}
                numberOfLines={1}
              >
                {reel.providerName}
              </Text>
              {/* Category is plain; the NEIGHBOURHOOD takes Cypress, because in
                  this system Cypress is the colour of where — place and
                  truthful status, never quality. Lifted Cypress is used so it
                  holds over media in both schemes. No availability claim, no
                  verification mark, no rating: attribution only. */}
              <Text style={[styles.providerMeta, type.labelMeta]} numberOfLines={1}>
                <Text style={{ color: colors.textOnAction }}>{reel.providerCategory}</Text>
                <Text style={{ color: colors.textOnAction }}>{'  ·  '}</Text>
                <Text style={{ color: colors.statusLocal }}>{reel.providerNeighborhood}</Text>
              </Text>
            </View>
          </TouchableOpacity>

          {/* Follow moved off the rail and into the identity block as a word.
              It is an outline against the primary action, never beside it in
              weight. Hidden on your own reel, where the DB would reject it. */}
          {!isOwnReel && (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={onFollow}
              style={[styles.followChip, { borderColor: colors.textOnAction }]}
              accessibilityRole="button"
              accessibilityLabel={reel.isFollowing ? 'Following. Tap to unfollow' : 'Follow'}
            >
              <Text
                style={[styles.followChipText, type.caption, { color: colors.textOnAction }]}
              >
                {reel.isFollowing ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Caption: restrained, subordinate, two lines. */}
        {reel.caption ? (
          <Text
            style={[styles.caption, type.bodyDefault, { color: colors.textOnAction }]}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            {reel.caption}
          </Text>
        ) : null}

        {/* THE ONE PRIMARY ACTION ON THIS SCREEN, IN MULBERRY.
            Labelled "View & book" and not "Book": it routes to the provider
            profile, where the real booking action lives. Calling it "Book"
            promised something this control does not do, and the system's rule
            against copy that sounds confident about what the product cannot do
            covers exactly that. The booking flow itself is untouched here. */}
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={goToProvider}
          style={[styles.bookBtn, { backgroundColor: colors.actionPrimary }]}
          accessibilityRole="button"
          accessibilityLabel={`View ${reel.providerName}'s profile and book`}
        >
          <Text style={[styles.bookLabel, type.labelAction, { color: colors.textOnAction }]}>
            View &amp; book
          </Text>
        </TouchableOpacity>
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
  onCountLoaded,
}: {
  postId: string | null
  userId: string | null
  insets: { top: number; bottom: number; left: number; right: number }
  onClose: () => void
  onCountDelta: (delta: number) => void
  onCountLoaded: (count: number) => void
}) {
  const { colors, type } = useTheme()
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
      // Correct the overlay count from the real loaded comments — the DB
      // comment_count trigger may be lagging (shows 0 with comments present).
      onCountLoaded(list.length)
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
      <View style={[styles.commentRoot, { backgroundColor: scrim(0.6) }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={[
            styles.commentSheet,
            {
              paddingBottom: insets.bottom + 8,
              backgroundColor: colors.bgSurface,
              borderColor: colors.borderSubtle,
            },
          ]}
        >
          <View style={[styles.commentHandle, { backgroundColor: colors.borderSubtle }]} />
          <View style={[styles.commentHeader, { borderBottomColor: colors.borderSubtle }]}>
            <Text style={[styles.commentTitle, type.titleCard, { color: colors.textPrimary }]}>
              Comments
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={22} color={colors.iconPrimary} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.commentLoading}>
              <ActivityIndicator color={colors.textSecondary} />
            </View>
          ) : comments.length === 0 ? (
            <View style={styles.commentEmpty}>
              <Text
                style={[styles.commentEmptyText, type.bodyDefault, { color: colors.textSecondary }]}
              >
                No comments yet. Be the first.
              </Text>
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
                  <View style={[styles.commentAvatar, { backgroundColor: colors.bgSubtle }]}>
                    <Text
                      style={[styles.commentAvatarText, type.labelMeta, { color: colors.textPrimary }]}
                    >
                      {getInitials(item.authorName)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.commentAuthor, type.labelAction, { color: colors.textPrimary }]}
                    >
                      {item.authorName}
                      <Text style={[styles.commentTime, type.labelMeta, { color: colors.textSecondary }]}>
                        {'  '}
                        {timeAgo(item.created_at)}
                      </Text>
                    </Text>
                    <Text style={[styles.commentBody, type.bodyDefault, { color: colors.textPrimary }]}>
                      {item.comment_text}
                    </Text>
                  </View>
                </View>
              )}
            />
          )}

          <View style={[styles.commentInputRow, { borderTopColor: colors.borderSubtle }]}>
            <TextInput
              style={[
                styles.commentInput,
                type.bodyDefault,
                {
                  backgroundColor: colors.bgSubtle,
                  borderColor: colors.borderSubtle,
                  color: colors.textPrimary,
                },
              ]}
              placeholder="Add a comment..."
              placeholderTextColor={colors.textSecondary}
              value={input}
              onChangeText={setInput}
              multiline
            />
            <TouchableOpacity
              style={[
                styles.commentSend,
                { backgroundColor: colors.actionPrimary, opacity: canSend ? 1 : 0.45 },
              ]}
              onPress={submit}
              disabled={!canSend}
              activeOpacity={0.8}
            >
              {submitting ? (
                <ActivityIndicator color={colors.textOnAction} size="small" />
              ) : (
                <Ionicons name="arrow-up" size={18} color={colors.textOnAction} />
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
  label: string
  active?: boolean
  type: Record<string, { fontFamily: string; fontSize: number; lineHeight: number; letterSpacing: number }>
  onPress: () => void
}

// ACTIVE IS A FILLED GLYPH PLUS A CHANGED WORD — never a colour of its own.
// PM ruling: no engagement-red token, and an active Like must not compete with
// the screen's primary marketplace action, which owns Mulberry. So both states
// are Linen and the difference is carried by weight and by the label, which is
// also what the system means by "state is carried in words, not only colour".
function ActionButton({ ionicon, color, size = 26, label, active, type, onPress }: ActionButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      style={styles.actionWrap}
      hitSlop={{ top: 6, bottom: 6, left: 10, right: 10 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active != null ? { selected: active } : undefined}
    >
      <Ionicons name={ionicon} size={size} color={color} style={{ opacity: active ? 1 : 0.92 }} />
      <Text style={[styles.actionLabel, type.caption, { color, opacity: active ? 1 : 0.7 }]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

// STRUCTURE ONLY — NO COLOUR LIVES HERE.
//
// Every colour on this screen now resolves from the theme at render time. That
// is not a stylistic preference: a StyleSheet is created once at module load,
// so a colour baked into one cannot follow a Light/Dark/System change. The
// screen previously held 35 literals from the retired The Book palette —
// including a gold and a bone that are not roles in the Third system at all —
// and none of them could respond to the appearance the viewer chose.
//
// Most chrome here reads `textOnAction` and `mediaScrim`, which are the two
// roles deliberately IDENTICAL in both schemes, because lettering over a
// photograph and a scrim over one must not invert. So this surface looking the
// same in Light and Dark is the system working, not the migration missing.
const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  emptyReels: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 48,
    gap: 12,
  },
  emptyReelsTitle: {
    textAlign: 'center',
  },
  emptyReelsSub: {
    textAlign: 'center',
  },
  emptyAddBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    letterSpacing: 0.16,
  },
  pausedWord: {
    letterSpacing: 1.4,
    opacity: 0.75,
  },
  cameraBtn: {
    width: 44,
    height: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  addReel: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.85,
  },

  // Seek line
  seekTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    zIndex: 4,
  },
  seekFill: {
    height: 2,
  },

  // Right rail
  rightActions: {
    position: 'absolute',
    right: 14,
    alignItems: 'center',
    gap: 22,
    zIndex: 5,
  },
  actionWrap: {
    alignItems: 'center',
    gap: 5,
    minWidth: 44,
  },
  actionLabel: {
    letterSpacing: 0.2,
  },

  // Bottom-left content
  leftContent: {
    position: 'absolute',
    left: 20,
    right: 76,
    zIndex: 5,
  },

  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  providerTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  providerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
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
    textAlign: 'center',
  },
  providerInfo: {
    flexShrink: 1,
  },
  providerName: {
    flexShrink: 1,
  },
  providerMeta: {
    marginTop: 2,
  },
  followChip: {
    paddingHorizontal: 10,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  followChipText: {
    letterSpacing: 0.3,
  },

  caption: {
    marginTop: 10,
    opacity: 0.92,
  },

  bookBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookLabel: {
    letterSpacing: 0.1,
  },

  // Comment sheet
  commentRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  commentSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    maxHeight: '75%',
    minHeight: '45%',
  },
  commentHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
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
  },
  commentTitle: {},
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  commentAvatarText: {},
  commentAuthor: {
    marginBottom: 3,
  },
  commentTime: {},
  commentBody: {},
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  commentInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
  },
  commentSend: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
