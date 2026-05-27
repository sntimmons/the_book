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

function splitCaption(caption: string): { hook: string; rest: string } {
  const match = caption.match(/^(.+?[.!?])\s+(.*)$/s)
  if (match) return { hook: match[1], rest: match[2] }
  return { hook: caption, rest: '' }
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
  onSave,
  onShare,
  insets,
}: ReelItemProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current
  const { hook, rest } = splitCaption(reel.caption)
  const providerInitials = getInitials(reel.providerName)

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

      {/* Top scrim */}
      <LinearGradient
        colors={['rgba(8,8,8,0.65)', 'rgba(8,8,8,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.topGradient}
        pointerEvents="none"
      />

      {/* Bottom scrim, longer + softer */}
      <LinearGradient
        colors={['rgba(8,8,8,0)', 'rgba(8,8,8,0.55)', 'rgba(8,8,8,0.92)']}
        locations={[0, 0.6, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.bottomGradient}
        pointerEvents="none"
      />

      {/* Top section: X only, top-left */}
      <View style={[styles.topSection, { top: insets.top + 10 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            if (router.canGoBack()) {
              router.back()
            } else {
              router.replace('/(tabs)/' as any)
            }
          }}
          style={styles.closeBtn}
        >
          <Ionicons name="close" size={20} color="#F0E8D5" />
        </TouchableOpacity>
      </View>

      {/* Progress bars on the right */}
      <View style={styles.progressColumn}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 2,
              height: i === currentIndex ? 22 : 8,
              borderRadius: 1,
              backgroundColor:
                i === currentIndex
                  ? 'rgba(240,232,213,0.9)'
                  : 'rgba(240,232,213,0.25)',
              marginVertical: 1.5,
            }}
          />
        ))}
      </View>

      {/* Bottom content */}
      <View style={[styles.bottomRow, { bottom: insets.bottom + 16 }]}>
        {/* Left content */}
        <View style={styles.leftContent}>
          {/* Provider row + availability inline */}
          {/* TODO: design Houston-native trust signal to replace the verification check */}
          <TouchableOpacity
            style={styles.providerRow}
            activeOpacity={0.8}
            onPress={() => router.push(`/providers/${reel.providerId}` as any)}
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

          {/* Caption: hook + rest, max 2 lines */}
          <Text
            style={styles.captionRest}
            numberOfLines={2}
            ellipsizeMode="tail"
          >
            <Text style={styles.captionHook}>{hook}</Text>
            {rest ? ' ' + rest : ''}
          </Text>

          {/* 20px gap before Book Now via marginTop */}
          <TouchableOpacity
            style={styles.bookBtn}
            activeOpacity={0.88}
            onPress={() => router.push(`/providers/${reel.providerId}` as any)}
          >
            <Text style={styles.bookBtnText}>Book Now</Text>
          </TouchableOpacity>
        </View>

        {/* Right rail */}
        <View style={styles.rightActions}>
          <ActionButton
            ionicon={reel.isLiked ? 'heart' : 'heart-outline'}
            color={reel.isLiked ? '#C8922A' : 'rgba(240,232,213,0.92)'}
            count={formatCount(reel.likes)}
            onPress={onLike}
          />
          <ActionButton
            ionicon="chatbubble"
            color="rgba(240,232,213,0.92)"
            count={formatCount(reel.comments)}
            onPress={() => console.log('comments')}
          />
          <ActionButton
            ionicon={reel.isSaved ? 'bookmark' : 'bookmark-outline'}
            color={reel.isSaved ? '#C8922A' : 'rgba(240,232,213,0.92)'}
            onPress={onSave}
          />
          <ActionButton
            ionicon="paper-plane"
            color="rgba(240,232,213,0.92)"
            rotate="-20deg"
            onPress={onShare}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => router.push(`/providers/${reel.providerId}` as any)}
            style={styles.providerActionAvatar}
          >
            {reel.providerAvatarUrl ? (
              <Image
                source={{ uri: reel.providerAvatarUrl }}
                style={styles.providerActionAvatarImg}
              />
            ) : (
              <Text style={styles.providerActionInitials}>
                {providerInitials}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

interface ActionButtonProps {
  ionicon: keyof typeof Ionicons.glyphMap
  color: string
  count?: string
  rotate?: string
  onPress: () => void
}

function ActionButton({ ionicon, color, count, rotate, onPress }: ActionButtonProps) {
  return (
    <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={styles.actionWrap}>
      <Ionicons
        name={ionicon}
        size={28}
        color={color}
        style={rotate ? { transform: [{ rotate }] } : undefined}
      />
      {count != null && <Text style={styles.actionCount}>{count}</Text>}
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000000',
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
    height: '12%',
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    top: '35%',
  },

  // Top section
  topSection: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 5,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Progress bars
  progressColumn: {
    position: 'absolute',
    right: 6,
    top: '40%',
    alignItems: 'center',
  },

  // Bottom row
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingLeft: 24,
    paddingRight: 16,
  },
  leftContent: {
    flex: 1,
    marginRight: 16,
  },

  // Provider row
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  providerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
    fontSize: 17,
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

  // Caption (8px gap from provider row, single text with mixed weights)
  captionRest: {
    marginTop: 8,
    fontSize: 14,
    color: 'rgba(240,232,213,0.75)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  captionHook: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    lineHeight: 21,
  },

  // Book Now (20px gap from caption)
  bookBtn: {
    marginTop: 20,
    height: 48,
    paddingHorizontal: 22,
    borderRadius: 14,
    backgroundColor: '#C8922A',
    alignSelf: 'flex-start',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#C8922A',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  bookBtnText: {
    fontSize: 15,
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Right rail
  rightActions: {
    alignItems: 'center',
    gap: 22,
    paddingBottom: 4,
  },
  actionWrap: {
    alignItems: 'center',
    gap: 6,
  },
  actionCount: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_600SemiBold',
  },
  providerActionAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  providerActionAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  providerActionInitials: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
})
