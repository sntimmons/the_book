import { useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { useClientStore } from '@/store/clientStore'
import { uploadMedia } from '@/lib/storage'

// Reusable person silhouette, centered inside any circle
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
  const { user, retryRole } = useAuth()
  const { name, notes, neighborhood, photo, reset } = useClientStore()
  const [isLoading, setIsLoading] = useState(false)

  async function handleGoLive() {
    if (isLoading) return

    if (!user) {
      router.replace('/(tabs)/')
      return
    }

    setIsLoading(true)

    // Upload client photo if selected. Profile photos live in the
    // provider-media bucket under the user's own user_id/profile/ prefix.
    let avatarUrl: string | null = null
    if (photo) {
      const result = await uploadMedia(photo, user.id, 'profile', 'provider-media')
      avatarUrl = result.url
      if (result.error) console.log('Client photo upload error:', result.error)
    }

    // created_at is omitted so a row created earlier (e.g. by AuthContext on
    // login) keeps its original date; the column defaults to now() on insert.
    // avatar_url is only set when a photo actually uploaded.
    const updates: {
      id: string
      name: string
      notes: string
      neighborhood: string | null
      avatar_url?: string
    } = { id: user.id, name, notes, neighborhood: neighborhood.trim() || null }
    if (avatarUrl) updates.avatar_url = avatarUrl

    const { error } = await supabase
      .from('clients')
      .upsert(updates, { onConflict: 'id' })

    if (error) {
      console.log('Client save error:', error)
      // Non-critical, still navigate forward.
    }

    // The clients row now exists. Re-resolve the session role so it settles as
    // 'client' in this session, consistent with the provider path.
    retryRole()

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
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() =>
            Alert.alert(
              'Coming soon',
              'This feature is coming in the next update.',
              [{ text: 'OK' }],
            )
          }
          style={[s.navBtn, { alignItems: 'flex-end' }]}
        >
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
              {photo ? (
                <Image source={{ uri: photo }} style={s.photoImage} resizeMode="cover" />
              ) : (
                <Silhouette size={40} opacity={0.18} />
              )}
            </View>
          </View>

          <Text style={s.heroName}>{name || 'Your name'}</Text>
          {neighborhood ? (
            <Text style={s.heroLocation}>{neighborhood}</Text>
          ) : null}

          <TouchableOpacity activeOpacity={0.7} style={s.editRow} onPress={() => router.back()}>
            <Text style={s.editIcon}>✎</Text>
            <Text style={s.editLabel}>Edit Profile</Text>
          </TouchableOpacity>
        </View>

        <View style={s.sep} />

        {/* ── VERIFICATION ─────────────────────────── */}
        {/* Verification does not exist yet: a neutral, unearned pill. No green
            check, no "Phone/ID/Payment" claims a new client never earned. */}
        <View style={s.trustSection}>
          <View style={s.comingPill}>
            <Feather name="clock" size={12} color="rgba(240,232,213,0.4)" />
            <Text style={s.comingPillText}>Verification coming soon</Text>
          </View>
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
          <Text style={s.emptyText}>No booking history yet.</Text>
        </View>

        <View style={s.sep} />

        {/* ── PROVIDER REVIEWS ─────────────────────── */}
        <View style={s.reviewsSection}>
          <Text style={s.microLabel}>PROVIDER REVIEWS</Text>
          <Text style={s.emptyText}>No reviews yet.</Text>
        </View>

        {/* Bottom spacer, clears fixed CTA */}
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

  // Shared honest empty state
  emptyText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 10,
  },

  // Neutral "coming soon" pill (replaces the fake verified badges)
  comingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderColor: 'rgba(240,232,213,0.1)',
  },
  comingPillText: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
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
    overflow: 'hidden',
  },
  photoImage: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
