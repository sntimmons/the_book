import { useMemo, useRef, useEffect, useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Animated,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import {
  useProviders,
  useCategories,
  Provider,
  Category,
} from '../../hooks/useProviders'
import { cacheBustedPhoto } from '../../lib/image'

// ── Shimmer skeleton ──────────────────────────────────────────────────────────

function Shimmer({ style }: { style: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start()
    return () => opacity.stopAnimation()
  }, [opacity])

  return (
    <Animated.View style={[{ backgroundColor: 'rgba(240,232,213,0.06)', opacity }, style]} />
  )
}

// ── Person silhouette placeholder (missing photo) ─────────────────────────────

function Silhouette({ size = 48 }: { size?: number }) {
  const head = size * 0.36
  const bodyW = size * 0.52
  const bodyH = size * 0.27
  const c = 'rgba(240,232,213,0.12)'
  return (
    <View style={{ alignItems: 'center', gap: size * 0.06 }}>
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: c }} />
      <View
        style={{
          width: bodyW,
          height: bodyH,
          borderTopLeftRadius: bodyH,
          borderTopRightRadius: bodyH,
          backgroundColor: c,
        }}
      />
    </View>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function categoryName(categoryId: number | null | undefined, categories: Category[]) {
  if (categoryId == null) return ''
  return categories.find((c) => c.id === categoryId)?.name ?? ''
}

function ratingLabel(p: Provider): string {
  const r = p.average_rating ?? p.rating
  return r != null ? r.toFixed(1) : 'New'
}

// ── Masonry layout ────────────────────────────────────────────────────────────
//
// Card heights follow the Figma rhythm (one extra-large, one large, the rest
// medium/small). The height a card gets is keyed off its POSITION in the feed,
// never off the provider's identity or rating — so as the feed order changes the
// "big" slots rotate through different providers rather than permanently
// spotlighting the same few. Cards are then packed shortest-column-first to get
// the staggered two-column look.
const CARD_HEIGHTS = [380, 220, 220, 240, 240, 300]

function heightForIndex(i: number): number {
  return CARD_HEIGHTS[i % CARD_HEIGHTS.length]
}

interface Tile {
  provider: Provider
  height: number
}

function packColumns(providers: Provider[]): [Tile[], Tile[]] {
  const cols: [Tile[], Tile[]] = [[], []]
  const heights = [0, 0]
  providers.forEach((provider, i) => {
    const height = heightForIndex(i)
    const target = heights[0] <= heights[1] ? 0 : 1
    cols[target].push({ provider, height })
    heights[target] += height + 16
  })
  return cols
}

// ── Provider tile ─────────────────────────────────────────────────────────────

function ProviderTile({
  provider,
  height,
  categories,
}: {
  provider: Provider
  height: number
  categories: Category[]
}) {
  const tier = height >= 360 ? 'xl' : height >= 300 ? 'lg' : 'sm'
  const big = tier !== 'sm'
  const cat = categoryName(provider.category_id, categories)
  // Badge uses real signal only — featured first, then trending. Shown on the
  // extra-large card where the Figma places a label pill.
  const badge =
    tier === 'xl'
      ? provider.is_featured
        ? 'Featured'
        : provider.is_trending
          ? 'Trending'
          : null
      : null

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => router.push(`/providers/${provider.id}` as any)}
      style={[
        s.tile,
        { height, borderRadius: big ? 32 : 16 },
      ]}
    >
      {(() => {
        // Prefer the provider's best portfolio photo; fall back to their
        // profile photo, then the silhouette placeholder.
        const cardImage = provider.heroImage ?? provider.profile_photo_url
        return cardImage ? (
          <Image
            source={{ uri: cacheBustedPhoto(cardImage) }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
          />
        ) : (
          <View style={s.tileCenter}>
            <Silhouette size={big ? 56 : 44} />
          </View>
        )
      })()}

      <LinearGradient
        colors={['transparent', 'rgba(8,8,8,0.9)']}
        locations={[0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View style={[s.tileInfo, { padding: big ? 24 : 16 }]}>
        <View style={s.tileTopRow}>
          {badge && (
            <View style={s.badge}>
              <Text style={s.badgeText}>{badge}</Text>
            </View>
          )}
          <View style={s.ratingRow}>
            <Text style={[s.star, { fontSize: big ? 12 : 10 }]}>★</Text>
            <Text style={[s.ratingText, { fontSize: big ? 12 : 10 }]}>
              {ratingLabel(provider)}
            </Text>
          </View>
        </View>

        <Text
          style={[
            s.tileName,
            { fontSize: tier === 'xl' ? 24 : tier === 'lg' ? 20 : 14 },
          ]}
          numberOfLines={1}
        >
          {provider.display_name}
        </Text>

        {cat ? (
          <Text style={[s.tileCat, { fontSize: big ? 12 : 10 }]} numberOfLines={1}>
            {cat}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DiscoveryFeed() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)

  const { providers, loading } = useProviders(activeCategoryId ?? undefined)
  const { categories } = useCategories()

  const colW = (width - 48 - 16) / 2

  const [leftCol, rightCol] = useMemo(() => packColumns(providers), [providers])

  const showEmptyState = !loading && providers.length === 0

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top }]}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headingWrap}>
            <Text style={s.heading}>Discover</Text>
            <Text style={s.subheading}>Curated beauty for you</Text>
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={s.searchBtn}
              onPress={() => router.push('/notifications' as any)}
            >
              <Ionicons name="notifications-outline" size={17} color="rgba(240,232,213,0.8)" />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              style={s.searchBtn}
              onPress={() => router.push('/(tabs)/search' as any)}
            >
              <Ionicons name="search" size={16} color="rgba(240,232,213,0.8)" />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              style={s.avatarBtn}
              onPress={() => router.push('/(tabs)/me' as any)}
            >
              <Ionicons name="person" size={18} color="rgba(240,232,213,0.7)" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Category pills ──────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pillRow}
          style={s.pillScroll}
        >
          <Pill
            label="All"
            active={activeCategoryId === null}
            onPress={() => setActiveCategoryId(null)}
          />
          {categories.map((cat) => (
            <Pill
              key={cat.id}
              label={cat.name}
              active={cat.id === activeCategoryId}
              onPress={() => setActiveCategoryId(cat.id)}
            />
          ))}
        </ScrollView>

        {/* ── Feed ────────────────────────────────────────────────────────── */}
        {loading ? (
          <View style={s.gridWrap}>
            <View style={[s.col, { width: colW }]}>
              <Shimmer style={[s.tile, { height: 380, borderRadius: 32 }]} />
              <Shimmer style={[s.tile, { height: 240, borderRadius: 16 }]} />
            </View>
            <View style={[s.col, { width: colW }]}>
              <Shimmer style={[s.tile, { height: 220, borderRadius: 16 }]} />
              <Shimmer style={[s.tile, { height: 220, borderRadius: 16 }]} />
              <Shimmer style={[s.tile, { height: 300, borderRadius: 32 }]} />
            </View>
          </View>
        ) : showEmptyState ? (
          <View style={s.emptyWrap}>
            <Silhouette size={56} />
            <Text style={s.emptyTitle}>
              {activeCategoryId === null
                ? 'No providers yet in Houston.'
                : 'No providers in this category yet.'}
            </Text>
            <Text style={s.emptySub}>
              {activeCategoryId === null
                ? 'Be the first to join.'
                : 'Try another category.'}
            </Text>
            {activeCategoryId !== null && (
              <TouchableOpacity
                style={s.emptyBtn}
                activeOpacity={0.85}
                onPress={() => setActiveCategoryId(null)}
              >
                <Text style={s.emptyBtnText}>Show all</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <View style={s.gridWrap}>
            <View style={[s.col, { width: colW }]}>
              {leftCol.map((t) => (
                <ProviderTile
                  key={t.provider.id}
                  provider={t.provider}
                  height={t.height}
                  categories={categories}
                />
              ))}
            </View>
            <View style={[s.col, { width: colW }]}>
              {rightCol.map((t) => (
                <ProviderTile
                  key={t.provider.id}
                  provider={t.provider}
                  height={t.height}
                  categories={categories}
                />
              ))}
            </View>
          </View>
        )}

        {/* ── Philosophy ──────────────────────────────────────────────────── */}
        {!loading && !showEmptyState && (
          <View style={s.philosophy}>
            <Text style={s.philosophyEyebrow}>Our Philosophy</Text>
            <Text style={s.philosophyQuote}>
              {'"Beauty is found in the architectural harmony of one\'s own natural features."'}
            </Text>
            <View style={s.philosophyDivider} />
          </View>
        )}

        {/* Bottom spacer for the tab bar */}
        <View style={{ height: 96 }} />
      </ScrollView>
    </View>
  )
}

// ── Category pill ─────────────────────────────────────────────────────────────

function Pill({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      style={[s.pill, active ? s.pillActive : s.pillInactive]}
    >
      <Text style={[s.pillText, active ? s.pillTextActive : s.pillTextInactive]}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 24,
  },
  headingWrap: {
    gap: 4,
  },
  heading: {
    fontSize: 30,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.75,
    lineHeight: 36,
  },
  subheading: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  searchBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1A1A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.2)',
    backgroundColor: 'rgba(240,232,213,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // Category pills
  pillScroll: {
    marginBottom: 24,
  },
  pillRow: {
    paddingHorizontal: 24,
    gap: 8,
    alignItems: 'center',
  },
  pill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 9999,
  },
  pillActive: {
    backgroundColor: '#C8922A',
  },
  pillInactive: {
    backgroundColor: '#1A1A1A',
  },
  pillText: {
    fontSize: 14,
    lineHeight: 20,
  },
  pillTextActive: {
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  pillTextInactive: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },

  // Masonry grid
  gridWrap: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    gap: 16,
  },
  col: {
    gap: 16,
  },
  tile: {
    width: '100%',
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  tileCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileInfo: {
    gap: 4,
  },
  tileTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: '#C8922A',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  badgeText: {
    fontSize: 10,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  star: {
    color: '#C8922A',
  },
  ratingText: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.4,
  },
  tileName: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.3,
  },
  tileCat: {
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    paddingHorizontal: 20,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: {
    fontSize: 14,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },

  // Philosophy
  philosophy: {
    alignItems: 'center',
    paddingTop: 48,
    paddingBottom: 32,
    paddingHorizontal: 24,
    gap: 16,
  },
  philosophyEyebrow: {
    fontSize: 10,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  philosophyQuote: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 32,
  },
  philosophyDivider: {
    width: 48,
    height: 1,
    backgroundColor: 'rgba(200,146,42,0.4)',
    marginTop: 8,
  },
})
