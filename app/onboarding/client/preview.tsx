import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useClientStore } from '@/store/clientStore'

// Reusable person silhouette — centered inside any circle
function Silhouette({ size = 40, opacity = 0.18 }: { size?: number; opacity?: number }) {
  const head = size * 0.38
  const bodyW = size * 0.55
  const bodyH = size * 0.28
  const color = `rgba(240,232,213,${opacity})`
  return (
    <View style={{ alignItems: 'center', gap: size * 0.06 }}>
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: color }} />
      <View style={{ width: bodyW, height: bodyH, borderTopLeftRadius: bodyH, borderTopRightRadius: bodyH, backgroundColor: color }} />
    </View>
  )
}

function Stars({ n = 5, size = 10 }: { n?: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 1.5 }}>
      {Array.from({ length: n }).map((_, i) => (
        <Text key={i} style={{ fontSize: size, color: '#C8922A', lineHeight: size + 3 }}>★</Text>
      ))}
    </View>
  )
}

// 6 placeholder photo boxes in a 3-col grid
function PhotoGrid() {
  return (
    <View style={grid.wrap}>
      {Array.from({ length: 6 }).map((_, i) => (
        <View key={i} style={grid.box}>
          <Text style={grid.plus}>+</Text>
        </View>
      ))}
    </View>
  )
}

const grid = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
    paddingHorizontal: 20,
  },
  box: {
    width: '31.5%',
    aspectRatio: 1,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    fontSize: 18,
    color: 'rgba(240,232,213,0.12)',
  },
})

export default function ClientPreview() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { firstName, lastName, neighborhood, bio, reset } = useClientStore()
  const [isLoading, setIsLoading] = useState(false)

  async function handleGoLive() {
    if (isLoading) return

    if (!user) {
      router.replace('/(tabs)/')
      return
    }

    setIsLoading(true)

    const { error } = await supabase.from('clients').upsert({
      id: user.id,
      first_name: firstName,
      last_name: lastName,
      neighborhood,
      bio,
      phone: user.phone ?? null,
      created_at: new Date().toISOString(),
    })

    if (error) {
      console.log('Profile save error:', error)
    }

    reset()
    setIsLoading(false)
    router.replace('/(tabs)/')
  }

  return (
    <View style={s.root}>
      {/* Top bar */}
      <View style={[s.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={s.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.topTitle}>Me</Text>
        <TouchableOpacity activeOpacity={0.7} onPress={() => console.log('settings')} style={[s.navBtn, { alignItems: 'flex-end' }]}>
          <Text style={s.gearIcon}>⚙</Text>
        </TouchableOpacity>
      </View>

      {/* Provider-view banner */}
      <View style={s.banner}>
        <Text style={s.bannerEye}>◉</Text>
        <Text style={s.bannerText}>Providers see this profile before accepting your booking.</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HERO ─────────────────────────────────── */}
        <View style={s.hero}>
          {/* Photo */}
          <View style={s.photoWrap}>
            <View style={s.photoCircle}>
              <Silhouette size={40} opacity={0.18} />
            </View>
            <View style={s.badge}>
              <Text style={s.badgeCheck}>✓</Text>
            </View>
          </View>

          <Text style={s.heroName}>Jasmine Turner</Text>
          <Text style={s.heroLocation}>Heights, Houston</Text>
          <Text style={s.heroSince}>Member since January 2024</Text>

          <TouchableOpacity activeOpacity={0.7} style={s.editRow}>
            <Text style={s.editIcon}>✎</Text>
            <Text style={s.editLabel}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        {/* ── SOCIAL STATS ─────────────────────────── */}
        <View style={s.statsRow}>
          <View style={s.statItem}>
            <Text style={s.statNum}>23</Text>
            <Text style={s.statLabel}>Bookings</Text>
          </View>
          <View style={s.statItem}>
            <Text style={s.statNum}>142</Text>
            <Text style={s.statLabel}>Following</Text>
          </View>
          <View style={s.statItem}>
            <Text style={s.statNum}>89</Text>
            <Text style={s.statLabel}>Followers</Text>
          </View>
          <View style={s.statItem}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, justifyContent: 'center' }}>
              <Text style={s.statNum}>4.8</Text>
              <Text style={s.ratingStar}>★</Text>
            </View>
            <Text style={s.statLabel}>My Rating</Text>
          </View>
        </View>

        <View style={s.sep} />

        {/* ── TRUST BADGES ─────────────────────────── */}
        <View style={s.trustSection}>
          <Text style={s.microLabel}>VERIFIED</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.badgeScroll}
          >
            <View style={[s.trustBadge, s.badgeGreen]}>
              <Text style={s.badgeIconGreen}>✓</Text>
              <Text style={s.badgeText}>Phone Verified</Text>
            </View>
            <View style={[s.trustBadge, s.badgeGreen]}>
              <Text style={s.badgeIconGreen}>⬡</Text>
              <Text style={s.badgeText}>ID Verified</Text>
            </View>
            <View style={[s.trustBadge, s.badgeAmber]}>
              <Text style={s.badgeIconAmber}>▣</Text>
              <Text style={s.badgeText}>Payment Active</Text>
            </View>
          </ScrollView>
        </View>

        <View style={s.sep} />

        {/* ── PHOTO GRID ───────────────────────────── */}
        <View style={s.gridSection}>
          <Text style={[s.microLabel, { paddingHorizontal: 20, marginBottom: 12 }]}>PHOTOS</Text>
          <PhotoGrid />
          <Text style={s.gridHint}>Add photos to show providers your personality</Text>
        </View>

        <View style={s.sep} />

        {/* ── REELS ────────────────────────────────── */}
        <View style={s.reelSection}>
          <Text style={s.microLabel}>REELS</Text>
          <View style={s.reelRow}>
            {[0, 1].map((i) => (
              <View key={i} style={s.reelBox}>
                <Text style={s.reelPlay}>▷</Text>
                <Text style={s.reelLabel}>Add a reel</Text>
              </View>
            ))}
          </View>
          <Text style={s.gridHint}>Short clips that show your vibe and style</Text>
        </View>

        <View style={s.sep} />

        {/* ── BOOKING HISTORY ──────────────────────── */}
        <View style={s.bookingSection}>
          <Text style={s.microLabel}>BOOKING HISTORY</Text>
          <View style={s.bookingStats}>
            <View style={s.bookingStat}>
              <Text style={s.bookingNum}>23</Text>
              <Text style={s.bookingNumLabel}>Appointments</Text>
            </View>
            <View style={s.bookingDivider} />
            <View style={s.bookingStat}>
              <Text style={s.bookingNum}>96%</Text>
              <Text style={s.bookingNumLabel}>Show Rate</Text>
            </View>
            <View style={s.bookingDivider} />
            <View style={s.bookingStat}>
              <Text style={[s.bookingNum, { color: '#4CAF50' }]}>0</Text>
              <Text style={s.bookingNumLabel}>No-shows</Text>
            </View>
          </View>
        </View>

        <View style={s.sep} />

        {/* ── PROVIDER REVIEWS ─────────────────────── */}
        <View style={s.reviewsSection}>
          <View style={s.reviewsHeader}>
            <Text style={s.microLabel}>PROVIDER REVIEWS</Text>
            <Text style={s.reviewsSummary}>4.8 · 18 reviews</Text>
          </View>

          {/* Review 1 */}
          <View style={s.reviewCard}>
            <View style={s.reviewTop}>
              <View style={s.reviewerPhoto}>
                <Silhouette size={22} opacity={0.25} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.reviewerName}>Elena Ross</Text>
                <Text style={s.reviewerMeta}>Silk Press, Oct 12 2023</Text>
              </View>
              <Stars n={5} size={10} />
            </View>
            <Text style={s.reviewText}>
              Jasmine is an absolute dream client. Always early, knows exactly what she wants, and tips well. Would accept her booking any time.
            </Text>
          </View>

          <View style={s.reviewDivider} />

          {/* Review 2 */}
          <View style={s.reviewCard}>
            <View style={s.reviewTop}>
              <View style={s.reviewerPhoto}>
                <Silhouette size={22} opacity={0.25} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.reviewerName}>Marcus J.</Text>
                <Text style={s.reviewerMeta}>Fade + Line-up, Sep 3 2023</Text>
              </View>
              <Stars n={5} size={10} />
            </View>
            <Text style={s.reviewText}>
              Great communication beforehand. Showed up on time and was easy to work with. Would definitely book again.
            </Text>
          </View>

          <TouchableOpacity activeOpacity={0.6} style={{ marginTop: 20, marginBottom: 4 }}>
            <Text style={s.seeAll}>See all 18 reviews</Text>
          </TouchableOpacity>
        </View>

        {/* Bottom spacer — clears fixed CTA */}
        <View style={{ height: 140 }} />
      </ScrollView>

      {/* ── FIXED BOTTOM CTA ─────────────────────── */}
      <View style={[s.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={s.ctaEyebrow}>This is what providers see.</Text>
        <Pressable
          style={({ pressed }) => [s.continueBtn, pressed && { opacity: 0.88 }]}
          disabled={isLoading}
          onPress={handleGoLive}
        >
          {isLoading ? (
            <ActivityIndicator color="#080808" />
          ) : (
            <Text style={s.continueBtnText}>Looks good, continue</Text>
          )}
        </Pressable>
        <TouchableOpacity
          activeOpacity={0.6}
          style={{ marginTop: 10, alignItems: 'center' }}
          onPress={() => router.back()}
        >
          <Text style={s.editProfileLink}>Edit my profile</Text>
        </TouchableOpacity>
      </View>
    </View>
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
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 0,
  },
  navBtn: {
    width: 40,
    justifyContent: 'center',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  gearIcon: {
    fontSize: 19,
    color: 'rgba(240,232,213,0.4)',
  },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.07)',
    paddingVertical: 8,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  bannerEye: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.35)',
  },
  bannerText: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 15,
  },

  scroll: {
    paddingBottom: 0,
  },

  // Shared separator
  sep: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginHorizontal: 20,
    marginVertical: 4,
  },

  // Shared micro label
  microLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 0,
  },

  // ── HERO ─────────────────────────────────────────
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  photoWrap: {
    width: 96,
    height: 96,
    marginBottom: 0,
  },
  photoCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: '#080808',
  },
  badgeCheck: {
    fontSize: 11,
    color: '#080808',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 13,
  },
  heroName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginTop: 14,
    textAlign: 'center',
  },
  heroLocation: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
    textAlign: 'center',
  },
  heroSince: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 12,
  },
  editIcon: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
  },
  editLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },

  // ── SOCIAL STATS ──────────────────────────────────
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 20,
    paddingHorizontal: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  statLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
    textAlign: 'center',
  },
  ratingStar: {
    fontSize: 13,
    color: '#C8922A',
    lineHeight: 20,
  },

  // ── TRUST BADGES ──────────────────────────────────
  trustSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 16,
  },
  badgeScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 10,
    paddingRight: 20,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeGreen: {
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderColor: 'rgba(76,175,80,0.2)',
  },
  badgeAmber: {
    backgroundColor: 'rgba(200,146,42,0.08)',
    borderColor: 'rgba(200,146,42,0.2)',
  },
  badgeIconGreen: {
    fontSize: 13,
    color: '#4CAF50',
  },
  badgeIconAmber: {
    fontSize: 13,
    color: '#C8922A',
  },
  badgeText: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },

  // ── PHOTO GRID ────────────────────────────────────
  gridSection: {
    paddingTop: 20,
    paddingBottom: 20,
  },
  gridHint: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.28)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 12,
    paddingHorizontal: 20,
  },

  // ── REELS ─────────────────────────────────────────
  reelSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  reelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  reelBox: {
    width: '47.5%',
    aspectRatio: 9 / 16,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 10,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reelPlay: {
    fontSize: 26,
    color: 'rgba(240,232,213,0.15)',
  },
  reelLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.28)',
    fontFamily: 'Manrope_400Regular',
  },

  // ── BOOKING HISTORY ───────────────────────────────
  bookingSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
  },
  bookingStats: {
    flexDirection: 'row',
    marginTop: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    overflow: 'hidden',
  },
  bookingStat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
  },
  bookingDivider: {
    width: 1,
    backgroundColor: 'rgba(240,232,213,0.07)',
    marginVertical: 12,
  },
  bookingNum: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  bookingNumLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.38)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },

  // ── PROVIDER REVIEWS ──────────────────────────────
  reviewsSection: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  reviewsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reviewsSummary: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
  reviewDivider: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  reviewCard: {
    paddingVertical: 16,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  reviewerPhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  reviewerMeta: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.38)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  reviewText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.65)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
    marginTop: 10,
  },
  seeAll: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.38)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },

  // ── FIXED CTA ─────────────────────────────────────
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  ctaEyebrow: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.38)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginBottom: 10,
  },
  continueBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  editProfileLink: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
  },
})
