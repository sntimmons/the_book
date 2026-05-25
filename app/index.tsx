import { useRef, useState, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  Animated,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Alert,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Video, ResizeMode } from 'expo-av'
import { Asset } from 'expo-asset'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Feather } from '@expo/vector-icons'

const SLIDES = [
  {
    pill: true,
    headline: "Your city's best providers. One place.",
    subtext: "Discover and book the talent your\ncity is talking about.",
  },
  {
    pill: false,
    headline: 'Book with confidence. Every time.',
    subtext: 'Protected payments. Verified providers.\nReal reviews from real clients.',
  },
  {
    pill: false,
    headline: 'Built for providers. Loved by clients.',
    subtext: "Whether you're booking or building,\nthis is where Houston shows up.",
  },
] as const

const VIDEO_MODULE = require("../assets/videos/welcome.mp4")

const DISPLAY_MS = 4500
const FADE_MS = 600
const CYCLE_MS = DISPLAY_MS + FADE_MS * 2

// ─── Dev nav config ───────────────────────────────────────────────────────────

type RouteStatus = 'Built' | 'Stub' | 'Planned'

interface NavSection {
  label: string
  items: { label: string; route: string }[]
}

interface SiteMapRoute {
  label: string
  route: string
  status: RouteStatus
}

const STATUS_COLOR: Record<RouteStatus, string> = {
  Built: '#4CAF50',
  Stub: '#C8922A',
  Planned: 'rgba(240,232,213,0.3)',
}

const DEV_NAV: NavSection[] = [
  {
    label: 'AUTH',
    items: [
      { label: 'Sign Up', route: '/auth/signup' },
      { label: 'Sign In', route: '/auth/signin' },
      { label: 'Auth Callback', route: '/auth/callback' },
    ],
  },
  {
    label: 'CLIENT',
    items: [
      { label: 'Discovery Feed', route: '/(tabs)/' },
      { label: 'Nearby', route: '/(tabs)/nearby' },
      { label: 'Top Rated', route: '/(tabs)/top-rated' },
      { label: 'New Posts', route: '/(tabs)/new' },
      { label: 'My Bookings', route: '/(tabs)/bookings' },
      { label: 'Me', route: '/(tabs)/me' },
    ],
  },
  {
    label: 'PROVIDER PROFILE',
    items: [
      { label: 'Provider Profile (Marcus)', route: '/providers/1' },
    ],
  },
  {
    label: 'PROVIDER ONBOARDING',
    items: [
      { label: 'Step 1 — Profile Basics', route: '/onboarding/provider' },
      { label: 'Step 2 — Portfolio', route: '/onboarding/provider/portfolio' },
      { label: 'Step 3 — Reels', route: '/onboarding/provider/reels' },
      { label: 'Step 4 — Services', route: '/onboarding/provider/services' },
      { label: 'Step 5 — Availability', route: '/onboarding/provider/availability' },
      { label: 'Step 6 — Policy', route: '/onboarding/provider/policy' },
      { label: 'Step 7 — Payout', route: '/onboarding/provider/payout' },
      { label: 'Step 8 — Go Live', route: '/onboarding/provider/golive' },
    ],
  },
  {
    label: 'PROVIDER DASHBOARD',
    items: [
      { label: 'Dashboard Home', route: '/dashboard/provider' },
      { label: 'Bookings', route: '/dashboard/provider/bookings' },
      { label: 'Availability', route: '/dashboard/provider/availability' },
      { label: 'My Clients', route: '/dashboard/provider/clients' },
      { label: 'Analytics', route: '/dashboard/provider/analytics' },
      { label: 'Portfolio', route: '/dashboard/provider/portfolio' },
      { label: 'Posts & Reels', route: '/dashboard/provider/posts' },
      { label: 'Payouts', route: '/dashboard/provider/payouts' },
      { label: 'Services / Pricing', route: '/dashboard/provider/services' },
      { label: 'Settings', route: '/dashboard/provider/settings' },
    ],
  },
  {
    label: 'CLIENT DASHBOARD',
    items: [
      { label: 'Client Dashboard', route: '/dashboard/client' },
      { label: 'My Bookings', route: '/dashboard/client/bookings' },
      { label: 'Favorites', route: '/dashboard/client/favorites' },
      { label: 'Messages', route: '/dashboard/client/messages' },
    ],
  },
  {
    label: 'BOOKING FLOW',
    items: [
      { label: 'Step 1 — Select Service', route: '/book/service' },
      { label: 'Step 2 — Pick Date & Time', route: '/book/datetime' },
      { label: 'Step 3 — Review Policy', route: '/book/policy' },
      { label: 'Step 4 — Confirm & Pay', route: '/book/payment' },
      { label: 'Step 5 — Confirmed', route: '/book/confirmed' },
    ],
  },
  {
    label: 'POST BOOKING',
    items: [
      { label: 'Booking Accepted', route: '/post-booking/accepted' },
      { label: 'Booking Declined', route: '/post-booking/declined' },
      { label: 'Satisfaction Check', route: '/post-booking/satisfaction' },
      { label: 'Write a Review', route: '/post-booking/review' },
      { label: 'Review Submitted', route: '/post-booking/submitted' },
      { label: 'Something Went Wrong', route: '/post-booking/issue' },
      { label: 'Provider Rate Client', route: '/post-booking/provider-review' },
    ],
  },
  {
    label: 'MESSAGING',
    items: [
      { label: 'Inbox', route: '/messages' },
      { label: 'Conversation', route: '/messages/1' },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { label: 'Admin Providers', route: '/admin/providers' },
      { label: 'Create Provider', route: '/admin/create-provider' },
    ],
  },
]

const SITE_MAP: SiteMapRoute[] = [
  { label: '/ (Welcome)', route: '/', status: 'Built' },
  { label: '/auth/signup', route: '/auth/signup', status: 'Built' },
  { label: '/auth/signin', route: '/auth/signin', status: 'Built' },
  { label: '/auth/callback', route: '/auth/callback', status: 'Built' },
  { label: '/(tabs)/ (Discovery)', route: '/(tabs)/', status: 'Built' },
  { label: '/(tabs)/nearby', route: '/(tabs)/nearby', status: 'Built' },
  { label: '/(tabs)/top-rated', route: '/(tabs)/top-rated', status: 'Built' },
  { label: '/(tabs)/new', route: '/(tabs)/new', status: 'Built' },
  { label: '/(tabs)/bookings', route: '/(tabs)/bookings', status: 'Built' },
  { label: '/(tabs)/me', route: '/(tabs)/me', status: 'Built' },
  { label: '/providers/[id]', route: '/providers/1', status: 'Built' },
  { label: '/onboarding/provider (Step 1)', route: '/onboarding/provider', status: 'Built' },
  { label: '/onboarding/provider/portfolio (Step 2)', route: '/onboarding/provider/portfolio', status: 'Built' },
  { label: '/onboarding/provider/reels (Step 3)', route: '/onboarding/provider/reels', status: 'Built' },
  { label: '/onboarding/provider/services (Step 4)', route: '/onboarding/provider/services', status: 'Built' },
  { label: '/onboarding/provider/availability (Step 5)', route: '/onboarding/provider/availability', status: 'Built' },
  { label: '/onboarding/provider/policy (Step 6)', route: '/onboarding/provider/policy', status: 'Built' },
  { label: '/onboarding/provider/payout (Step 7)', route: '/onboarding/provider/payout', status: 'Built' },
  { label: '/onboarding/provider/golive (Step 8)', route: '/onboarding/provider/golive', status: 'Built' },
  { label: '/dashboard/provider', route: '/dashboard/provider', status: 'Built' },
  { label: '/dashboard/provider/bookings', route: '/dashboard/provider/bookings', status: 'Stub' },
  { label: '/dashboard/provider/availability', route: '/dashboard/provider/availability', status: 'Stub' },
  { label: '/dashboard/provider/clients', route: '/dashboard/provider/clients', status: 'Stub' },
  { label: '/dashboard/provider/analytics', route: '/dashboard/provider/analytics', status: 'Stub' },
  { label: '/dashboard/provider/portfolio', route: '/dashboard/provider/portfolio', status: 'Stub' },
  { label: '/dashboard/provider/posts', route: '/dashboard/provider/posts', status: 'Stub' },
  { label: '/dashboard/provider/payouts', route: '/dashboard/provider/payouts', status: 'Stub' },
  { label: '/dashboard/provider/services', route: '/dashboard/provider/services', status: 'Stub' },
  { label: '/dashboard/provider/settings', route: '/dashboard/provider/settings', status: 'Stub' },
  { label: '/dashboard/client', route: '/dashboard/client', status: 'Planned' },
  { label: '/dashboard/client/bookings', route: '/dashboard/client/bookings', status: 'Planned' },
  { label: '/dashboard/client/favorites', route: '/dashboard/client/favorites', status: 'Planned' },
  { label: '/dashboard/client/messages', route: '/dashboard/client/messages', status: 'Planned' },
  { label: '/messages', route: '/messages', status: 'Planned' },
  { label: '/messages/[id]', route: '/messages/1', status: 'Planned' },
  { label: '/admin/providers', route: '/admin/providers', status: 'Stub' },
  { label: '/admin/create-provider', route: '/admin/create-provider', status: 'Stub' },
  { label: '/book/service', route: '/book/service', status: 'Built' },
  { label: '/book/datetime', route: '/book/datetime', status: 'Built' },
  { label: '/book/policy', route: '/book/policy', status: 'Built' },
  { label: '/book/payment', route: '/book/payment', status: 'Built' },
  { label: '/book/confirmed', route: '/book/confirmed', status: 'Built' },
  { label: '/post-booking/accepted', route: '/post-booking/accepted', status: 'Built' },
  { label: '/post-booking/declined', route: '/post-booking/declined', status: 'Built' },
  { label: '/post-booking/satisfaction', route: '/post-booking/satisfaction', status: 'Built' },
  { label: '/post-booking/review', route: '/post-booking/review', status: 'Built' },
  { label: '/post-booking/submitted', route: '/post-booking/submitted', status: 'Built' },
  { label: '/post-booking/issue', route: '/post-booking/issue', status: 'Built' },
  { label: '/post-booking/provider-review', route: '/post-booking/provider-review', status: 'Built' },
  { label: '/reviews/[id]', route: '/reviews/1', status: 'Planned' },
  { label: '/notifications', route: '/notifications', status: 'Planned' },
  { label: '/search', route: '/search', status: 'Planned' },
]

// ─── Component ────────────────────────────────────────────────────────────────

export default function WelcomeScreen() {
  const fadeAnim = useRef(new Animated.Value(1)).current
  const [currentIndex, setCurrentIndex] = useState(0)
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const insets = useSafeAreaInsets()
  const { height } = useWindowDimensions()

  // Secret tap state
  const tapCount = useRef(0)
  const lastTap = useRef(0)
  const [showDevMenu, setShowDevMenu] = useState(false)
  const [showSiteMap, setShowSiteMap] = useState(false)

  // Load video via Asset system (works in Expo Go)
  useEffect(() => {
    if (!VIDEO_MODULE) return
    async function loadVideo() {
      try {
        const asset = Asset.fromModule(VIDEO_MODULE as number)
        await asset.downloadAsync()
        setVideoUri(asset.localUri)
      } catch {
        console.log('Video not available, using gradient')
      }
    }
    loadVideo()
  }, [])

  // Content cycling animation
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex((prev) => (prev + 1) % SLIDES.length)
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start()
      })
    }, CYCLE_MS)

    return () => {
      clearInterval(interval)
      fadeAnim.stopAnimation()
    }
  }, [])

  function handleSecretTap() {
    const now = Date.now()
    if (now - lastTap.current > 500) {
      tapCount.current = 1
    } else {
      tapCount.current += 1
    }
    lastTap.current = now
    if (tapCount.current >= 5) {
      tapCount.current = 0
      setShowDevMenu(true)
    }
  }

  function devNavigate(route: string) {
    setShowDevMenu(false)
    setShowSiteMap(false)
    setTimeout(() => {
      try {
        router.push(route as any)
      } catch {
        Alert.alert('Not built yet', `Route ${route} doesn't exist yet.`)
      }
    }, 100)
  }

  const slide = SLIDES[currentIndex]

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Video or gradient background */}
      {videoUri ? (
        <Video
          source={{ uri: videoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted
          rate={1.0}
          volume={0}
        />
      ) : (
        <LinearGradient
          colors={['#2A1808', '#1a0e05', '#080808']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Dark scrim — always on top */}
      <LinearGradient
        colors={['transparent', 'rgba(8,8,8,0.2)', 'rgba(8,8,8,0.7)', '#080808']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Secret dev tap zone — top-right corner, invisible */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleSecretTap}
        style={[styles.secretZone, { top: insets.top + 8 }]}
      />

      {/* Bottom content */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 32 }]}>

        {/* Animated block: pill + headline + subtext */}
        <Animated.View style={{ opacity: fadeAnim }}>
          {slide.pill && (
            <View style={styles.pill}>
              <Text style={styles.pillText}>HOUSTON, TX</Text>
            </View>
          )}
          <Text style={styles.headline}>{slide.headline}</Text>
          <Text style={styles.subtext}>{slide.subtext}</Text>
        </Animated.View>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View key={i} style={i === currentIndex ? styles.dotActive : styles.dotInactive} />
          ))}
        </View>

        {/* Get Started */}
        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.86 }]}
          onPress={() => router.push('/auth/signup')}
        >
          <Text style={styles.btnPrimaryText}>Get Started</Text>
        </Pressable>

        {/* Sign in link */}
        <Pressable onPress={() => router.push('/auth/signin')}>
          <Text style={styles.signInText}>
            Already have an account?{'  '}
            <Text style={styles.signInLink}>Sign in</Text>
          </Text>
        </Pressable>

      </View>

      {/* ── Dev Menu Modal ─────────────────────────────────────────── */}
      <Modal
        visible={showDevMenu}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDevMenu(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.devMenuSheet, { paddingBottom: insets.bottom + 16 }]}>
            {/* Header */}
            <View style={styles.devMenuHeader}>
              <View>
                <Text style={styles.devMenuTitle}>DEV MENU</Text>
                <Text style={styles.devMenuSub}>Jump to any screen instantly</Text>
              </View>
              <TouchableOpacity onPress={() => setShowDevMenu(false)} style={styles.devCloseBtn}>
                <Feather name="x" size={16} color="#F0E8D5" />
              </TouchableOpacity>
            </View>

            {/* Site map shortcut */}
            <TouchableOpacity
              style={styles.siteMapBtn}
              activeOpacity={0.8}
              onPress={() => { setShowDevMenu(false); setShowSiteMap(true) }}
            >
              <Feather name="map" size={14} color="#C8922A" />
              <Text style={styles.siteMapBtnText}>View full site map</Text>
              <Feather name="chevron-right" size={14} color="#C8922A" />
            </TouchableOpacity>

            {/* Nav sections */}
            <ScrollView
              style={styles.devMenuScroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {DEV_NAV.map((section) => (
                <View key={section.label}>
                  <Text style={styles.devSectionLabel}>{section.label}</Text>
                  {section.items.map((item) => (
                    <TouchableOpacity
                      key={item.route}
                      style={styles.devNavItem}
                      activeOpacity={0.7}
                      onPress={() => devNavigate(item.route)}
                    >
                      <Feather name="arrow-right" size={13} color="rgba(240,232,213,0.3)" />
                      <Text style={styles.devNavLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Site Map Modal ─────────────────────────────────────────── */}
      <Modal
        visible={showSiteMap}
        transparent={false}
        animationType="slide"
        onRequestClose={() => setShowSiteMap(false)}
      >
        <View style={[styles.siteMapRoot, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={styles.siteMapHeader}>
            <TouchableOpacity onPress={() => { setShowSiteMap(false); setShowDevMenu(true) }}>
              <Feather name="chevron-left" size={20} color="#F0E8D5" />
            </TouchableOpacity>
            <Text style={styles.siteMapTitle}>Site Map</Text>
            <TouchableOpacity onPress={() => setShowSiteMap(false)}>
              <Feather name="x" size={18} color="rgba(240,232,213,0.5)" />
            </TouchableOpacity>
          </View>

          {/* Legend */}
          <View style={styles.legendRow}>
            {(['Built', 'Stub', 'Planned'] as RouteStatus[]).map((s) => (
              <View key={s} style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: STATUS_COLOR[s] }]} />
                <Text style={styles.legendLabel}>{s}</Text>
              </View>
            ))}
          </View>

          {/* Route list */}
          <ScrollView
            style={styles.siteMapScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          >
            {SITE_MAP.map((r) => (
              <TouchableOpacity
                key={r.route}
                style={styles.siteMapRow}
                activeOpacity={0.7}
                onPress={() => devNavigate(r.route)}
              >
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[r.status] }]} />
                <Text style={styles.siteMapRouteLabel}>{r.label}</Text>
                <Feather name="arrow-right" size={12} color="rgba(240,232,213,0.2)" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  secretZone: {
    position: 'absolute',
    right: 8,
    width: 44,
    height: 44,
    zIndex: 99,
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: '#C8922A',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 16,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.5,
  },
  headline: {
    fontSize: 36,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 42,
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.65)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 22,
    marginBottom: 28,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 28,
  },
  dotActive: {
    width: 20,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F0E8D5',
  },
  dotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(240,232,213,0.3)',
  },
  btnPrimary: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  signInText: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 8,
  },
  signInLink: {
    color: '#F0E8D5',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },

  // ── Dev Menu ──────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  devMenuSheet: {
    backgroundColor: '#0E0E0E',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    maxHeight: '85%',
    paddingTop: 20,
    paddingHorizontal: 20,
  },
  devMenuHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  devMenuTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 2,
  },
  devMenuSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  devCloseBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(240,232,213,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  siteMapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.4)',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  siteMapBtnText: {
    flex: 1,
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  devMenuScroll: {
    flex: 1,
  },
  devSectionLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 4,
  },
  devNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.04)',
  },
  devNavLabel: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.75)',
    fontFamily: 'Manrope_400Regular',
  },

  // ── Site Map ──────────────────────────────────────────────────────
  siteMapRoot: {
    flex: 1,
    backgroundColor: '#080808',
  },
  siteMapHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  siteMapTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  legendRow: {
    flexDirection: 'row',
    gap: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.04)',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendLabel: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  siteMapScroll: {
    flex: 1,
    paddingHorizontal: 20,
  },
  siteMapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.04)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    flexShrink: 0,
  },
  siteMapRouteLabel: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
  },
})
