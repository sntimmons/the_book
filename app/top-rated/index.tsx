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

function reviewsLabel(p: Provider): string {
  const n = p.review_count ?? 0
  if (n <= 0) return 'New provider'
  return formatCount(n) + (n === 1 ? ' review' : ' reviews')
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
    <View style={{ gap: 12 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Animated.View key={i} style={[s.card, { opacity }]}>
          <View style={[s.rankCol, s.skeletonBlock, { height: 20, borderRadius: 4 }]} />
          <View style={[s.avatar, s.skeletonBlock]} />
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

// ── Rank card ─────────────────────────────────────────────────────────────────

function RankCard({
  provider,
  rank,
  categories,
}: {
  provider: Provider
  rank: number
  categories: Category[]
}) {
  const rating = ratingValue(provider)
  const role = categoryName(provider.category_id, categories)
  const hood = providerHood(provider)
  const subtitle = [role, hood].filter(Boolean).join(' · ')

  return (
    <TouchableOpacity
      style={s.card}
      activeOpacity={0.8}
      onPress={() => router.push('/providers/' + provider.id)}
    >
      <Text style={s.rankCol}>{rank}</Text>

      <View style={s.avatarWrap}>
        <View style={s.avatar}>
          {provider.profile_photo_url ? (
            <Image source={{ uri: provider.profile_photo_url }} style={s.avatarImg} />
          ) : (
            <Text style={s.avatarInitials}>{getInitials(provider.display_name)}</Text>
          )}
        </View>
        {provider.identity_verified && (
          <View style={s.verifiedBadge}>
            <Ionicons name="checkmark" size={11} color="#080808" />
          </View>
        )}
      </View>

      <View style={s.body}>
        <Text style={s.name} numberOfLines={1}>
          {provider.display_name}
        </Text>
        {subtitle ? (
          <Text style={s.category} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        <Text style={s.meta} numberOfLines={1}>
          {reviewsLabel(provider)}
        </Text>
      </View>

      <View style={s.ratingPill}>
        <Ionicons name="star" size={12} color="#C8922A" />
        <Text style={s.ratingText}>{rating != null ? rating.toFixed(1) : 'New'}</Text>
      </View>
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

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>Top Rated</Text>
          <Text style={s.subtitle}>Houston's highest rated providers</Text>
        </View>
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
          <View style={{ gap: 12 }}>
            {ranked.map((p, i) => (
              <RankCard key={p.id} provider={p} rank={i + 1} categories={categories} />
            ))}
          </View>
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
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },

  // Filter chips
  chipsScroll: {
    flexGrow: 0,
    marginBottom: 4,
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

  // List
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 12,
  },

  // Rank card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  rankCol: {
    width: 24,
    fontSize: 20,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  avatarWrap: {
    width: 64,
    height: 64,
    position: 'relative',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImg: {
    width: 64,
    height: 64,
  },
  avatarInitials: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  verifiedBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  name: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.1,
  },
  category: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  meta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 1,
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(200,146,42,0.12)',
  },
  ratingText: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
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
