import { useEffect, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  StyleSheet,
  SafeAreaView,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

// ── Static data ────────────────────────────────────────────────────────────────

const STORIES = [
  { id: '1', name: 'Nia', type: 'Lash Tech', active: true },
  { id: '2', name: 'Marcus', type: 'Barber', active: true },
  { id: '3', name: 'Elena', type: 'MUA', active: false },
  { id: '4', name: 'Jade', type: 'Braider', active: true },
]

const TRENDING = [
  { id: '1', name: 'Marcus Blade', category: 'Barber', rating: '4.9', distance: '1.2 mi' },
  { id: '2', name: 'Camille B.', category: 'Knotless Braids', rating: '4.8', distance: '2.1 mi' },
  { id: '3', name: 'Sienna J.', category: 'MUA', rating: '5.0', distance: '0.8 mi' },
]

const CATEGORIES = [
  { id: '1', icon: '✦', name: 'Lash & Brows' },
  { id: '2', icon: '◈', name: 'Hair & Braids' },
  { id: '3', icon: '◉', name: 'Makeup' },
  { id: '4', icon: '⬡', name: 'Nails' },
  { id: '5', icon: '⌖', name: 'Barber' },
  { id: '6', icon: '◎', name: 'Wellness' },
]

// ── Animated pulse dot ─────────────────────────────────────────────────────────

function PulseDot() {
  const pulse = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start()
    return () => pulse.stopAnimation()
  }, [])

  return <Animated.View style={[s.pulseDot, { opacity: pulse }]} />
}

// ── Small person silhouette ────────────────────────────────────────────────────

function PersonIcon({ size = 24 }: { size?: number }) {
  const head = size * 0.38
  const bodyW = size * 0.55
  const bodyH = size * 0.28
  const color = 'rgba(240,232,213,0.18)'
  return (
    <View style={{ alignItems: 'center', gap: size * 0.06 }}>
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: color }} />
      <View style={{ width: bodyW, height: bodyH, borderTopLeftRadius: bodyH, borderTopRightRadius: bodyH, backgroundColor: color }} />
    </View>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DiscoveryFeed() {
  return (
    <SafeAreaView style={s.root}>
      {/* Top bar */}
      <View style={s.topBar}>
        <Text style={s.wordmark}>The Book</Text>
        <View style={s.topRight}>
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={s.topIcon}>⌕</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.7}>
            <View style={s.bellWrap}>
              <Text style={s.topIcon}>♔</Text>
              <View style={s.notifDot} />
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Live ticker */}
      <View style={s.ticker}>
        <PulseDot />
        <Text style={s.tickerText}>14 booked in Houston today</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scrollContent}
      >
        {/* ── Story rings ─────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.storyRow}
          style={s.storyScroll}
        >
          {STORIES.map((p) => (
            <TouchableOpacity key={p.id} activeOpacity={0.8} style={s.storyItem}>
              <View style={[s.storyRing, p.active ? s.storyRingActive : s.storyRingInactive]}>
                <View style={s.storyInner}>
                  <PersonIcon size={24} />
                </View>
              </View>
              <Text style={s.storyName}>{p.name}</Text>
              <Text style={s.storyType}>{p.type}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── Featured hero ────────────────────────────── */}
        <View style={s.heroWrap}>
          <LinearGradient
            colors={['#3D2010', '#1a0e05', '#080808']}
            start={{ x: 0.3, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.heroContent}>
            <View style={s.featuredPill}>
              <Text style={s.featuredPillText}>FEATURED</Text>
            </View>
            <Text style={s.heroName}>Nia Laurent</Text>
            <Text style={s.heroSub}>Lash Tech · River Oaks</Text>
            <View style={s.heroStats}>
              <Text style={s.heroStar}>★</Text>
              <Text style={s.heroStatNum}>4.9</Text>
              <View style={s.heroDot} />
              <Text style={s.heroStatText}>127 reviews</Text>
              <View style={s.heroDot} />
              <Text style={s.heroAvail}>Available today</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              style={s.bookNowBtn}
              onPress={() => console.log('book Nia')}
            >
              <Text style={s.bookNowText}>Book Now</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Trending ─────────────────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Trending</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={s.sectionLink}>This week →</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.trendingRow}
          >
            {TRENDING.map((p) => (
              <TouchableOpacity key={p.id} activeOpacity={0.8} style={s.providerCard}>
                <View style={s.providerCardPhoto}>
                  <PersonIcon size={36} />
                </View>
                <View style={s.providerCardInfo}>
                  <Text style={s.providerCardName}>{p.name}</Text>
                  <Text style={s.providerCardCat}>{p.category}</Text>
                  <View style={s.providerCardStats}>
                    <Text style={s.providerStar}>★</Text>
                    <Text style={s.providerRating}>{p.rating}</Text>
                    <Text style={s.providerDist}> · {p.distance}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Browse by category ───────────────────────── */}
        <View style={s.section}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Browse</Text>
          </View>
          <View style={s.categoryGrid}>
            {CATEGORIES.map((c) => (
              <TouchableOpacity key={c.id} activeOpacity={0.8} style={s.categoryCard}>
                <Text style={s.categoryIcon}>{c.icon}</Text>
                <Text style={s.categoryName}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    marginBottom: 8,
  },
  wordmark: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  topIcon: {
    fontSize: 22,
    color: 'rgba(240,232,213,0.5)',
  },
  bellWrap: {
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: -1,
    right: -1,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },

  // Live ticker
  ticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 20,
    marginTop: 4,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  tickerText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },

  scrollContent: {
    paddingBottom: 100,
  },

  // Story rings
  storyScroll: {
    marginBottom: 28,
  },
  storyRow: {
    paddingHorizontal: 20,
    gap: 16,
    flexDirection: 'row',
  },
  storyItem: {
    alignItems: 'center',
  },
  storyRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyRingActive: {
    borderColor: '#C8922A',
  },
  storyRingInactive: {
    borderColor: 'rgba(240,232,213,0.1)',
  },
  storyInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyName: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    marginTop: 6,
    textAlign: 'center',
  },
  storyType: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },

  // Featured hero
  heroWrap: {
    width: '100%',
    height: 240,
    marginBottom: 28,
    justifyContent: 'flex-end',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  featuredPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#C8922A',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  featuredPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.5,
  },
  heroName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  heroSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  heroStar: {
    fontSize: 12,
    color: '#C8922A',
  },
  heroStatNum: {
    fontSize: 12,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  heroDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(240,232,213,0.3)',
  },
  heroStatText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  heroAvail: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  bookNowBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#C8922A',
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 14,
  },
  bookNowText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },

  // Sections
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  sectionLink: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },

  // Trending cards
  trendingRow: {
    flexDirection: 'row',
    gap: 12,
    paddingRight: 4,
  },
  providerCard: {
    width: 160,
    height: 200,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    overflow: 'hidden',
  },
  providerCardPhoto: {
    height: 120,
    backgroundColor: 'rgba(240,232,213,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerCardInfo: {
    padding: 12,
  },
  providerCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  providerCardCat: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  providerCardStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  providerStar: {
    fontSize: 10,
    color: '#C8922A',
  },
  providerRating: {
    fontSize: 11,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginLeft: 3,
  },
  providerDist: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },

  // Category grid
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  categoryCard: {
    width: '47.5%',
    height: 72,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 12,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
  },
  categoryIcon: {
    fontSize: 20,
    color: 'rgba(240,232,213,0.45)',
  },
  categoryName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
})
