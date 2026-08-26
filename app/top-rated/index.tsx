import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProviders, useCategories, Provider, Category } from '../../hooks/useProviders'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function ratingValue(p: Provider): number | null {
  return p.average_rating ?? p.rating
}

function providerHood(p: Provider): string {
  return p.neighborhood ?? p.location ?? ''
}

function categoryName(categoryId: number | null, categories: Category[]): string {
  if (categoryId == null) return ''
  return categories.find((c) => c.id === categoryId)?.name ?? ''
}

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return n.toString()
}

function subtitleFor(p: Provider, categories: Category[]): string {
  return [
    categoryName(p.category_id, categories) || p.custom_category || '',
    providerHood(p),
  ]
    .filter(Boolean)
    .join(' · ')
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => {
      loop.stop()
      opacity.stopAnimation()
    }
  }, [opacity])

  return (
    <View>
      <Animated.View style={[s.heroCard, s.skeletonBlock, { opacity }]} />
      <View style={{ height: 24 }} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Animated.View key={i} style={[s.row, { opacity }]}>
          <View style={[s.rankCol, s.skeletonBlock, { height: 22, borderRadius: 4 }]} />
          <View style={[s.rowAvatar, s.skeletonBlock]} />
          <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
            <View style={[s.skeletonLine, { width: '55%' }]} />
            <View style={[s.skeletonLine, { width: '42%' }]} />
            <View style={[s.skeletonLine, { width: '30%' }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  )
}

// ── Featured #1 hero ──────────────────────────────────────────────────────────

function FeaturedHero({
  provider,
  categories,
}: {
  provider: Provider
  categories: Category[]
}) {
  const rating = ratingValue(provider)
  const reviews = provider.review_count ?? 0
  const image = provider.cover_image_url ?? provider.profile_photo_url

  function goToProvider() {
    router.push('/providers/' + provider.id)
  }

  return (
    <View style={s.heroCard}>
      {image ? (
        <Image source={{ uri: image }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, s.heroFallback]}>
          <Text style={s.heroFallbackText}>{getInitials(provider.display_name)}</Text>
        </View>
      )}
      <LinearGradient
        colors={['rgba(8,8,8,0)', 'rgba(8,8,8,0.85)']}
        locations={[0.35, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={s.heroBadge}>
        <Text style={s.heroBadgeText}>#1 in Houston</Text>
      </View>

      <View style={s.heroContent}>
        <Text style={s.heroName} numberOfLines={1}>
          {provider.display_name}
        </Text>
        <Text style={s.heroSub} numberOfLines={1}>
          {subtitleFor(provider, categories)}
        </Text>
        <View style={s.heroMeta}>
          <Ionicons name="star" size={13} color="#C8922A" />
          <Text style={s.heroRating}>{rating != null ? rating.toFixed(1) : 'New'}</Text>
          {reviews > 0 && (
            <Text style={s.heroReviews}>
              {formatCount(reviews)} {reviews === 1 ? 'review' : 'reviews'}
            </Text>
          )}
        </View>
        <View style={s.heroButtons}>
          <TouchableOpacity style={s.heroBtnOutline} activeOpacity={0.85} onPress={goToProvider}>
            <Text style={s.heroBtnOutlineText}>View Profile</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.heroBtnFilled} activeOpacity={0.85} onPress={goToProvider}>
            <Text style={s.heroBtnFilledText}>Book Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ── Ranked row ────────────────────────────────────────────────────────────────

function RankRow({
  provider,
  rank,
  categories,
}: {
  provider: Provider
  rank: number
  categories: Category[]
}) {
  const rating = ratingValue(provider)
  const reviews = provider.review_count ?? 0

  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.8}
      onPress={() => router.push('/providers/' + provider.id)}
    >
      <Text style={s.rankCol}>{rank}</Text>

      <View style={s.rowAvatarWrap}>
        <View style={s.rowAvatar}>
          {provider.profile_photo_url ? (
            <Image source={{ uri: provider.profile_photo_url }} style={s.rowAvatarImg} />
          ) : (
            <Text style={s.rowInitials}>{getInitials(provider.display_name)}</Text>
          )}
        </View>
        {provider.identity_verified && (
          <View style={s.verifiedBadge}>
            <Ionicons name="checkmark" size={10} color="#080808" />
          </View>
        )}
      </View>

      <View style={s.rowBody}>
        <Text style={s.rowName} numberOfLines={1}>
          {provider.display_name}
        </Text>
        <Text style={s.rowSub} numberOfLines={1}>
          {subtitleFor(provider, categories)}
        </Text>
        <View style={s.rowMeta}>
          <Ionicons name="star" size={11} color="#C8922A" />
          <Text style={s.rowRating}>{rating != null ? rating.toFixed(1) : 'New'}</Text>
          {reviews > 0 && <Text style={s.rowReviews}>({formatCount(reviews)})</Text>}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={18} color="rgba(240,232,213,0.45)" />
    </TouchableOpacity>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function TopRatedScreen() {
  const insets = useSafeAreaInsets()
  const { providers, loading } = useProviders()
  const categoriesResult = useCategories() as { categories?: Category[] }
  const categories = Array.isArray(categoriesResult?.categories)
    ? categoriesResult.categories
    : []

  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)

  const ranked = useMemo(() => {
    const filtered =
      activeCategoryId == null
        ? providers
        : providers.filter((p) => p.category_id === activeCategoryId)
    return [...filtered].sort((a, b) => {
      const ar = a.average_rating ?? a.rating ?? 0
      const br = b.average_rating ?? b.rating ?? 0
      if (br !== ar) return br - ar
      return (b.review_count ?? 0) - (a.review_count ?? 0)
    })
  }, [providers, activeCategoryId])

  const hero = ranked[0]

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={s.headerSide}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Top Rated</Text>
        <View style={s.headerSide} />
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipsRow}
        style={s.chipsScroll}
      >
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveCategoryId(null)}
          style={[s.chip, activeCategoryId === null ? s.chipActive : s.chipInactive]}
        >
          <Text style={activeCategoryId === null ? s.chipTextActive : s.chipTextInactive}>
            All
          </Text>
        </TouchableOpacity>
        {categories.map((cat) => {
          const active = cat.id === activeCategoryId
          return (
            <TouchableOpacity
              key={cat.id}
              activeOpacity={0.8}
              onPress={() => setActiveCategoryId(cat.id)}
              style={[s.chip, active ? s.chipActive : s.chipInactive]}
            >
              <Text style={active ? s.chipTextActive : s.chipTextInactive}>{cat.name}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <View style={s.divider} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
      >
        {loading ? (
          <Skeleton />
        ) : ranked.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="star-outline" size={40} color="rgba(240,232,213,0.25)" />
            <Text style={s.emptyTitle}>No rated providers yet.</Text>
            <Text style={s.emptySub}>Try a different category or check back soon.</Text>
          </View>
        ) : (
          <>
            {hero && <FeaturedHero provider={hero} categories={categories} />}

            <Text style={s.listLabel}>Houston's Best</Text>
            <View>
              {ranked.map((p, i) => (
                <View key={p.id}>
                  <RankRow provider={p} rank={i + 1} categories={categories} />
                  {i < ranked.length - 1 && <View style={s.rowDivider} />}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  headerSide: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.1,
  },

  // Filter chips
  chipsScroll: {
    flexGrow: 0,
  },
  chipsRow: {
    paddingHorizontal: 24,
    gap: 8,
    paddingVertical: 8,
  },
  chip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#F0E8D5',
  },
  chipInactive: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  chipTextActive: {
    fontSize: 13,
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
  },
  chipTextInactive: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },

  // Scroll
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },

  // Featured hero
  heroCard: {
    height: 280,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(240,232,213,0.06)',
    justifyContent: 'flex-end',
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroFallbackText: {
    fontSize: 48,
    color: 'rgba(240,232,213,0.2)',
    fontFamily: 'Manrope_700Bold',
  },
  heroBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: '#C8922A',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 6,
  },
  heroBadgeText: {
    fontSize: 11,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
  },
  heroContent: {
    padding: 20,
  },
  heroName: {
    fontSize: 28,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.4,
  },
  heroSub: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  heroRating: {
    fontSize: 14,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },
  heroReviews: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
    marginLeft: 4,
  },
  heroButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  heroBtnOutline: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnOutlineText: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  heroBtnFilled: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBtnFilledText: {
    fontSize: 14,
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
  },

  // List label
  listLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 24,
    marginBottom: 8,
  },

  // Ranked row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
  },
  rankCol: {
    width: 22,
    fontSize: 20,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  rowAvatarWrap: {
    width: 52,
    height: 52,
    position: 'relative',
  },
  rowAvatar: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarImg: {
    width: 52,
    height: 52,
  },
  rowInitials: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  verifiedBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  rowName: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.1,
  },
  rowSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  rowRating: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },
  rowReviews: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginLeft: 2,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.05)',
    marginLeft: 86,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 64,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },

  // Skeleton
  skeletonBlock: {
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
})
