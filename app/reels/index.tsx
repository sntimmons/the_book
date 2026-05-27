import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
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
import { Feather } from '@expo/vector-icons'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

interface Reel {
  id: string
  providerId: string
  providerName: string
  providerCategory: string
  providerNeighborhood: string
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
    caption:
      'Classic full set on my client today. 6 week retention guaranteed. Booking link in bio.',
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
    <View
      style={[
        styles.reelRoot,
        { backgroundColor: reel.thumbnailColor },
      ]}
    >
      {/* Video placeholder layer */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: reel.thumbnailColor, alignItems: 'center', justifyContent: 'center' },
        ]}
      >
        <Feather name="play-circle" size={48} color="rgba(240,232,213,0.1)" />
      </View>

      {/* Gradient overlay */}
      <LinearGradient
        colors={[
          'transparent',
          'transparent',
          'rgba(0,0,0,0.3)',
          'rgba(0,0,0,0.7)',
          'rgba(0,0,0,0.92)',
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Top section */}
      <View style={[styles.topSection, { top: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back()
            } else {
              router.replace('/(tabs)/' as any)
            }
          }}
          activeOpacity={0.7}
        >
          <Feather name="x" size={22} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topWordmark}>Reels</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress indicators on the right */}
      <View style={styles.progressColumn}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={{
              width: 2,
              height: i === currentIndex ? 24 : 8,
              borderRadius: 1,
              backgroundColor:
                i === currentIndex ? '#F0E8D5' : 'rgba(240,232,213,0.3)',
              marginVertical: 2,
            }}
          />
        ))}
      </View>

      {/* Bottom content */}
      <View style={[styles.bottomRow, { bottom: insets.bottom + 16 }]}>
        {/* Left content */}
        <View style={styles.leftContent}>
          {reel.providerAvailable && (
            <View style={styles.availPill}>
              <Animated.View
                style={{
                  opacity: pulseAnim,
                  width: 5,
                  height: 5,
                  borderRadius: 2.5,
                  backgroundColor: '#C8922A',
                }}
              />
              <Text style={styles.availText}>Available now</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.providerRow}
            activeOpacity={0.8}
            onPress={() => router.push(`/providers/${reel.providerId}` as any)}
          >
            <View style={styles.providerAvatar}>
              <Feather name="user" size={18} color="rgba(240,232,213,0.6)" />
            </View>
            <View>
              <View style={styles.nameRow}>
                <Text style={styles.providerName}>{reel.providerName}</Text>
                {reel.providerVerified && (
                  <Feather
                    name="check-circle"
                    size={13}
                    color="#C8922A"
                    style={{ marginLeft: 4 }}
                  />
                )}
              </View>
              <Text style={styles.providerMeta}>
                {reel.providerCategory} · {reel.providerNeighborhood}
              </Text>
            </View>
          </TouchableOpacity>

          <Text style={styles.caption} numberOfLines={2} ellipsizeMode="tail">
            {reel.caption}
          </Text>

          <TouchableOpacity
            style={styles.bookBtn}
            activeOpacity={0.85}
            onPress={() => router.push(`/providers/${reel.providerId}` as any)}
          >
            <Feather name="calendar" size={14} color="#080808" />
            <Text style={styles.bookBtnText}>Book Now</Text>
          </TouchableOpacity>
        </View>

        {/* Right actions column */}
        <View style={styles.rightActions}>
          <ActionButton
            icon="heart"
            iconColor={reel.isLiked ? '#E05C5C' : 'rgba(240,232,213,0.8)'}
            count={formatCount(reel.likes)}
            countColor={reel.isLiked ? '#E05C5C' : '#F0E8D5'}
            onPress={onLike}
          />
          <ActionButton
            icon="message-circle"
            iconColor="rgba(240,232,213,0.8)"
            count={formatCount(reel.comments)}
            countColor="#F0E8D5"
            onPress={() => console.log('comments')}
          />
          <ActionButton
            icon="bookmark"
            iconColor={reel.isSaved ? '#C8922A' : 'rgba(240,232,213,0.8)'}
            onPress={onSave}
          />
          <ActionButton
            icon="share"
            iconColor="rgba(240,232,213,0.8)"
            onPress={onShare}
          />

          <TouchableOpacity
            style={styles.profileAction}
            activeOpacity={0.8}
            onPress={() => router.push(`/providers/${reel.providerId}` as any)}
          >
            <View style={styles.profileAvatar}>
              <Feather name="user" size={18} color="rgba(240,232,213,0.6)" />
            </View>
            <Text style={styles.profileLabel}>Visit</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

interface ActionButtonProps {
  icon: keyof typeof Feather.glyphMap
  iconColor: string
  count?: string
  countColor?: string
  onPress: () => void
}

function ActionButton({
  icon,
  iconColor,
  count,
  countColor,
  onPress,
}: ActionButtonProps) {
  return (
    <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={styles.actionWrap}>
      <View style={styles.actionCircle}>
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      {count != null && (
        <Text style={[styles.actionCount, countColor ? { color: countColor } : null]}>
          {count}
        </Text>
      )}
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
  topSection: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 5,
  },
  topWordmark: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  progressColumn: {
    position: 'absolute',
    right: 4,
    top: '40%',
    alignItems: 'center',
  },
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
  },
  leftContent: {
    flex: 1,
    marginRight: 16,
  },
  availPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(200,146,42,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.3)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  availText: {
    fontSize: 11,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  providerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  providerMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  caption: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
    marginBottom: 14,
  },
  bookBtn: {
    backgroundColor: '#C8922A',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bookBtnText: {
    fontSize: 13,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  rightActions: {
    alignItems: 'center',
    gap: 20,
    paddingBottom: 4,
  },
  actionWrap: {
    alignItems: 'center',
    gap: 4,
  },
  actionCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCount: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  profileAction: {
    alignItems: 'center',
    gap: 4,
  },
  profileAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(240,232,213,0.12)',
    borderWidth: 2,
    borderColor: 'rgba(240,232,213,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileLabel: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
})
