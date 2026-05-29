import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  Dimensions,
  TouchableOpacity,
  StyleSheet,
  Animated,
  StatusBar,
  Share,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'

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
}

const MOCK_REELS: Reel[] = [
  {
    id: '1',
    providerId: '1',
    providerName: 'Nia Laurent',
    providerCategory: 'Lash Tech',
    providerNeighborhood: 'River Oaks',
    providerVerified: true,
    providerAvailable: true,
    caption: 'Classic full set on my client today. 6 week retention guaranteed.',
    likes: 847,
    comments: 43,
    isLiked: false,
    isSaved: false,
    thumbnailColor: '#1a0d0d',
  },
  {
    id: '2',
    providerId: '2',
    providerName: 'Marcus Blade',
    providerCategory: 'Barber',
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
  },
  {
    id: '3',
    providerId: '3',
    providerName: 'Zara Baptiste',
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
  },
  {
    id: '4',
    providerId: '4',
    providerName: 'Kendra Simmons',
    providerCategory: 'Stylist',
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
  },
  {
    id: '5',
    providerId: '5',
    providerName: 'Marcus Delray',
    providerCategory: 'Fitness',
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
  },
]

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

export default function ReelsScreen() {
  const insets = useSafeAreaInsets()
  const [reels, setReels] = useState<Reel[]>(MOCK_REELS)
  const [currentIndex, setCurrentIndex] = useState(0)

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current
  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      if (viewableItems.length > 0 && viewableItems[0].index != null) {
        setCurrentIndex(viewableItems[0].index)
      }
    },
  ).current

  function toggleLike(id: string) {
    setReels((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              isLiked: !r.isLiked,
              likes: r.isLiked ? r.likes - 1 : r.likes + 1,
            }
          : r,
      ),
    )
  }

  function toggleSave(id: string) {
    setReels((prev) =>
      prev.map((r) => (r.id === id ? { ...r, isSaved: !r.isSaved } : r)),
    )
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
            isActive={index === currentIndex}
            currentIndex={currentIndex}
            total={reels.length}
            onLike={() => toggleLike(item.id)}
            onSave={() => toggleSave(item.id)}
            onShare={() => handleShare(item)}
            insets={insets}
          />
        )}
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
  onSave: () => void
  onShare: () => void
  insets: { top: number; bottom: number; left: number; right: number }
}

function ReelItem({
  reel,
  currentIndex,
  total,
  onLike,
  onShare,
  insets,
}: ReelItemProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current
  const providerInitials = getInitials(reel.providerName)

  // Horizontal scrubber: no real video time yet, so reflect progress through the feed.
  const progressPct = total > 0 ? ((currentIndex + 1) / total) * 100 : 0

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

  function goToProvider() {
    router.push(`/providers/${reel.providerId}` as any)
  }

  return (
    <View style={[styles.reelRoot, { backgroundColor: reel.thumbnailColor }]}>
      {/* Video placeholder layer */}
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: reel.thumbnailColor,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Ionicons name="play-circle" size={48} color="rgba(240,232,213,0.1)" />
      </View>

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

      {/* Top header: back chevron + Reels wordmark, For You tab, camera */}
      <View style={[styles.header, { top: insets.top + 8 }]}>
        <View style={styles.headerLeft}>
          <TouchableOpacity
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            onPress={() => {
              if (router.canGoBack()) {
                router.back()
              } else {
                router.replace('/(tabs)/' as any)
              }
            }}
          >
            <Ionicons name="chevron-back" size={22} color="#F0E8D5" />
          </TouchableOpacity>
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
          color="#F0E8D5"
          label={formatCount(reel.likes)}
          onPress={onLike}
        />

        {/* Comment */}
        <ActionButton
          ionicon="chatbubble"
          size={28}
          color="#F0E8D5"
          label={formatCount(reel.comments)}
          onPress={() => console.log('comments')}
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

      {/* Bottom-left content */}
      <View style={[styles.leftContent, { bottom: insets.bottom + 24 }]}>
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

      {/* Bottom horizontal scrubber */}
      <View style={styles.scrubberTrack}>
        <View style={[styles.scrubberFill, { width: `${progressPct}%` }]} />
      </View>
    </View>
  )
}

interface ActionButtonProps {
  ionicon: keyof typeof Ionicons.glyphMap
  color: string
  size?: number
  label?: string
  onPress: () => void
}

function ActionButton({ ionicon, color, size = 28, label, onPress }: ActionButtonProps) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.actionWrap}>
      <Ionicons name={ionicon} size={size} color={color} />
      {label != null && <Text style={styles.actionLabel}>{label}</Text>}
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
})
