import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  Animated,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'

// ── Static data ──────────────────────────────────────────────────────────────

const FEATURED = [
  { id: '1', name: 'Jasmine Turner', category: 'Lashes and Brows', location: 'Midtown', bg: 'rgba(240,232,213,0.08)' },
  { id: '2', name: 'Marcus Chen', category: 'Photography', location: 'Heights', bg: 'rgba(240,232,213,0.08)' },
  { id: '3', name: 'Tanya Robinson', category: 'Hair Styling', location: 'Montrose', bg: 'rgba(240,232,213,0.08)' },
]

const CATEGORIES = [
  'All', 'Hair', 'Lashes', 'Nails', 'Barber', 'Makeup',
  'Massage', 'Photography', 'Bartending', 'Fitness', 'Wellness', 'Mechanics',
]

const FOR_YOU = [
  { id: '1', name: 'Maya Reed',     category: 'Braids',       rating: '4.9', verified: false, bg: 'rgba(240,232,213,0.08)' },
  { id: '2', name: 'Devon Pierce',  category: 'Barber',       rating: '5.0', verified: true,  bg: 'rgba(240,232,213,0.08)' },
  { id: '3', name: 'Aisha Coleman', category: 'Lashes',       rating: '4.8', verified: false, bg: 'rgba(240,232,213,0.08)' },
  { id: '4', name: 'Marcus Hall',   category: 'Photography',  rating: '4.9', verified: true,  bg: 'rgba(240,232,213,0.08)' },
  { id: '5', name: 'Tia Brooks',    category: 'Makeup',       rating: '4.7', verified: false, bg: 'rgba(240,232,213,0.08)' },
]

const LIVE_NOW = [
  { id: '1', name: 'Jordan Ellis', category: 'Nails',  watching: 23, bg: 'rgba(240,232,213,0.08)' },
  { id: '2', name: 'Sasha Mills',  category: 'Hair',   watching: 41, bg: 'rgba(240,232,213,0.08)' },
  { id: '3', name: 'Ray Tucker',   category: 'Barber', watching: 18, bg: 'rgba(240,232,213,0.08)' },
  { id: '4', name: 'Naomi Cross',  category: 'Makeup', watching: 9,  bg: 'rgba(240,232,213,0.08)' },
]

const TRENDING = [
  { id: '1', name: 'Whitney Adams',  category: 'Lashes',      rating: '4.9', tag: 'Mobile, books fast',  bg: 'rgba(240,232,213,0.08)' },
  { id: '2', name: 'Trey Morgan',    category: 'Barber',      rating: '5.0', tag: 'Shop in Heights',      bg: 'rgba(240,232,213,0.08)' },
  { id: '3', name: 'Camille Booker', category: 'Makeup',      rating: '4.8', tag: 'Bridal specialist',    bg: 'rgba(240,232,213,0.08)' },
  { id: '4', name: 'Andre Watts',    category: 'Photography', rating: '4.9', tag: 'Events and portraits', bg: 'rgba(240,232,213,0.08)' },
]

const BROWSE = [
  { id: '1', name: 'Hair',        icon: '✂',  count: 240 },
  { id: '2', name: 'Lashes',      icon: '✦',  count: 156 },
  { id: '3', name: 'Nails',       icon: '⬡',  count: 189 },
  { id: '4', name: 'Barber',      icon: '◈',  count: 203 },
  { id: '5', name: 'Photography', icon: '⌗',  count: 98  },
  { id: '6', name: 'Bartending',  icon: '◉',  count: 67  },
]

// ── Animated pulse dot ────────────────────────────────────────────────────────

function PulseDot({ size = 6 }: { size?: number }) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ])
    ).start()
    return () => opacity.stopAnimation()
  }, [])

  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#C8922A', opacity }}
    />
  )
}

// ── Person silhouette placeholder ─────────────────────────────────────────────

function Silhouette({ size = 36 }: { size?: number }) {
  const head = size * 0.36
  const bodyW = size * 0.52
  const bodyH = size * 0.27
  const c = 'rgba(240,232,213,0.12)'
  return (
    <View style={{ alignItems: 'center', gap: size * 0.06 }}>
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: c }} />
      <View style={{
        width: bodyW, height: bodyH,
        borderTopLeftRadius: bodyH, borderTopRightRadius: bodyH,
        backgroundColor: c,
      }} />
    </View>
  )
}

// ── Rating row ────────────────────────────────────────────────────────────────

function RatingRow({ rating, category }: { rating: string; category: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 10, color: '#C8922A' }}>★</Text>
      <Text style={{ fontSize: 12, color: '#F0E8D5', fontFamily: 'Manrope_500Medium' }}>{rating}</Text>
      <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(240,232,213,0.4)' }} />
      <Text style={{ fontSize: 12, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_400Regular' }}>{category}</Text>
    </View>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity activeOpacity={0.7} onPress={onSeeAll}>
          <Text style={s.seeAll}>See all</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DiscoveryFeed() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [activeCategory, setActiveCategory] = useState('All')
  const [currentFeatured, setCurrentFeatured] = useState(0)
  const heroRef = useRef<ScrollView>(null)

  const heroW = width - 48
  const colW  = (width - 48 - 16) / 2

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top }]}
      >
        {/* ── Top bar ────────────────────────────────────────────────────── */}
        <View style={s.topBar}>
          <Text style={s.wordmark}>The Book</Text>
          <View style={s.topRight}>
            <TouchableOpacity activeOpacity={0.7} style={s.iconBtn}>
              <Text style={s.bellIcon}>♔</Text>
            </TouchableOpacity>
            <View style={s.avatarCircle}>
              <Silhouette size={16} />
            </View>
          </View>
        </View>

        {/* ── Live ticker ─────────────────────────────────────────────────── */}
        <View style={s.ticker}>
          <PulseDot />
          <Text style={s.tickerText}>12 providers live right now in Houston</Text>
        </View>

        {/* ── Featured hero carousel ─────────────────────────────────────── */}
        <View style={s.heroOuter}>
          <ScrollView
            ref={heroRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={{ width: heroW }}
            onMomentumScrollEnd={(e) => {
              const idx = Math.round(e.nativeEvent.contentOffset.x / heroW)
              setCurrentFeatured(Math.max(0, Math.min(idx, FEATURED.length - 1)))
            }}
          >
            {FEATURED.map((p) => (
              <View key={p.id} style={[s.heroCard, { width: heroW, backgroundColor: p.bg }]}>
                <LinearGradient
                  colors={['transparent', 'rgba(8,8,8,0.85)']}
                  style={StyleSheet.absoluteFill}
                />
                <View style={s.heroInner}>
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={s.featuredLabel}>FEATURED PROVIDER</Text>
                    <Text style={s.heroName}>{p.name}</Text>
                    <Text style={s.heroSub}>{p.category} · {p.location}</Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={s.viewBtn}
                    onPress={() => router.push('/providers/1')}
                  >
                    <Text style={s.viewBtnText}>View</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>

          {/* Pagination dots */}
          <View style={s.dots}>
            {FEATURED.map((_, i) => (
              <TouchableOpacity
                key={i}
                activeOpacity={0.7}
                onPress={() => {
                  heroRef.current?.scrollTo({ x: i * heroW, animated: true })
                  setCurrentFeatured(i)
                }}
              >
                <View style={[s.dot, i === currentFeatured ? s.dotActive : s.dotInactive]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Category nav ───────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.categoryRow}
          style={s.categoryScroll}
        >
          {CATEGORIES.map((cat) => {
            const active = cat === activeCategory
            return (
              <TouchableOpacity
                key={cat}
                activeOpacity={0.8}
                onPress={() => setActiveCategory(cat)}
                style={s.categoryBtn}
              >
                <Text style={[s.categoryText, active ? s.catActive : s.catInactive]}>
                  {cat}
                </Text>
                {active && <View style={s.catUnderline} />}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* ── For You ────────────────────────────────────────────────────── */}
        <View style={s.section}>
          <SectionHeader title="For you, Stephen" onSeeAll={() => {}} />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.hRow}
          >
            {FOR_YOU.map((p) => (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.8}
                onPress={() => router.push('/providers/1')}
                style={[s.forYouCard, { backgroundColor: p.bg }]}
              >
                {/* background silhouette */}
                <View style={s.absCenter}>
                  <Silhouette size={40} />
                </View>
                {/* gradient overlay */}
                <LinearGradient
                  colors={['transparent', 'rgba(8,8,8,0.7)']}
                  start={{ x: 0, y: 0.6 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {/* verified badge — above gradient */}
                {p.verified && (
                  <View style={s.verifiedBadge}>
                    <Text style={s.verifiedCheck}>✓</Text>
                  </View>
                )}
                {/* info */}
                <View style={s.cardInfo}>
                  <Text style={s.cardName} numberOfLines={1}>{p.name}</Text>
                  <RatingRow rating={p.rating} category={p.category} />
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Live Right Now ──────────────────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PulseDot />
              <Text style={s.sectionTitle}>Live right now</Text>
            </View>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={s.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.hRow}
          >
            {LIVE_NOW.map((p) => (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.8}
                onPress={() => router.push('/providers/1')}
                style={[s.liveCard, { backgroundColor: p.bg }]}
              >
                {/* background silhouette */}
                <View style={s.absCenter}>
                  <Silhouette size={36} />
                </View>
                {/* gradient overlay */}
                <LinearGradient
                  colors={['transparent', 'rgba(8,8,8,0.7)']}
                  start={{ x: 0, y: 0.6 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                {/* LIVE badge — above gradient */}
                <View style={s.liveBadge}>
                  <Text style={s.liveBadgeText}>LIVE</Text>
                </View>
                {/* info */}
                <View style={s.cardInfo}>
                  <Text style={s.liveCardName} numberOfLines={1}>{p.name}</Text>
                  <Text style={s.liveCardDetail}>{p.category}, {p.watching} watching</Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Trending in Houston ─────────────────────────────────────────── */}
        <View style={[s.section, s.padded]}>
          <SectionHeader title="Trending in Houston" onSeeAll={() => {}} />
          <View style={s.grid}>
            {TRENDING.map((p) => (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.8}
                onPress={() => router.push('/providers/1')}
                style={[s.trendCard, { width: colW, backgroundColor: p.bg }]}
              >
                <View style={s.absCenter}>
                  <Silhouette size={48} />
                </View>
                <LinearGradient
                  colors={['transparent', 'rgba(8,8,8,0.8)']}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 0, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={s.trendInfo}>
                  <Text style={s.trendName}>{p.name}</Text>
                  <RatingRow rating={p.rating} category={p.category} />
                  <Text style={s.trendTag}>{p.tag}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Browse by category ──────────────────────────────────────────── */}
        <View style={[s.section, s.padded]}>
          <Text style={s.sectionTitle}>Browse by category</Text>
          <View style={[s.grid, { marginTop: 16 }]}>
            {BROWSE.map((c) => (
              <TouchableOpacity
                key={c.id}
                activeOpacity={0.8}
                onPress={() => router.push('/(tabs)/search')}
                style={[s.browseCard, { width: colW }]}
              >
                <Text style={s.browseIcon}>{c.icon}</Text>
                <View>
                  <Text style={s.browseName}>{c.name}</Text>
                  <Text style={s.browseCount}>{c.count} providers</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
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

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    height: 56,
  },
  wordmark: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.2,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellIcon: {
    fontSize: 22,
    color: 'rgba(240,232,213,0.8)',
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Live ticker
  ticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 24,
    height: 36,
    marginBottom: 12,
  },
  tickerText: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: -0.05,
  },

  // Hero carousel
  heroOuter: {
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  heroCard: {
    height: 200,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  heroInner: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    padding: 12,
  },
  featuredLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  heroName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.2,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
    letterSpacing: -0.05,
  },
  viewBtn: {
    width: 80,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Pagination dots
  dots: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#F0E8D5',
  },
  dotInactive: {
    backgroundColor: 'rgba(240,232,213,0.25)',
  },

  // Category nav
  categoryScroll: {
    marginTop: 12,
    marginBottom: 32,
    height: 44,
  },
  categoryRow: {
    paddingHorizontal: 24,
    gap: 24,
    alignItems: 'center',
    height: 44,
  },
  categoryBtn: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryText: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    letterSpacing: -0.05,
  },
  catActive: {
    color: '#F0E8D5',
  },
  catInactive: {
    color: 'rgba(240,232,213,0.5)',
  },
  catUnderline: {
    position: 'absolute',
    bottom: 7,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: '#F0E8D5',
    borderRadius: 1,
  },

  // Section structure
  section: {
    marginBottom: 40,
  },
  padded: {
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.2,
  },
  seeAll: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: -0.05,
  },
  hRow: {
    paddingHorizontal: 24,
    gap: 12,
  },

  // For You cards
  forYouCard: {
    width: 160,
    height: 220,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  absCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  verifiedCheck: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  cardInfo: {
    padding: 10,
    gap: 4,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.05,
  },

  // Live cards
  liveCard: {
    width: 140,
    height: 180,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#C8922A',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    zIndex: 2,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1,
  },
  liveCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.05,
    marginBottom: 3,
  },
  liveCardDetail: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
    letterSpacing: -0.05,
  },

  // Grid layout
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },

  // Trending cards
  trendCard: {
    height: 230,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  trendInfo: {
    padding: 12,
    gap: 4,
  },
  trendName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.05,
  },
  trendTag: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    letterSpacing: -0.05,
    marginTop: 2,
  },

  // Browse cards
  browseCard: {
    height: 100,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    padding: 14,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  browseIcon: {
    fontSize: 20,
    color: '#F0E8D5',
  },
  browseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.05,
    marginBottom: 2,
  },
  browseCount: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: -0.05,
  },
})
