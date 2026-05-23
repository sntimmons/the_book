import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function PersonSilhouette({ size = 40 }: { size?: number }) {
  const headSize = size * 0.42
  const bodyW = size * 0.58
  const bodyH = size * 0.3
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 3 }}>
      <View style={{
        width: headSize,
        height: headSize,
        borderRadius: headSize / 2,
        backgroundColor: 'rgba(240,232,213,0.2)',
      }} />
      <View style={{
        width: bodyW,
        height: bodyH,
        borderTopLeftRadius: bodyH,
        borderTopRightRadius: bodyH,
        backgroundColor: 'rgba(240,232,213,0.2)',
      }} />
    </View>
  )
}

function SmallSilhouette() {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: 'rgba(240,232,213,0.25)' }} />
      <View style={{ width: 18, height: 9, borderTopLeftRadius: 9, borderTopRightRadius: 9, backgroundColor: 'rgba(240,232,213,0.25)' }} />
    </View>
  )
}

function Stars({ count = 5, size = 10 }: { count?: number; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: count }).map((_, i) => (
        <Text key={i} style={{ fontSize: size, color: '#C8922A', lineHeight: size + 2 }}>★</Text>
      ))}
    </View>
  )
}

export default function ClientPreview() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity activeOpacity={0.7} onPress={() => router.back()} style={styles.topBarSide}>
          <Text style={styles.backArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Client Profile</Text>
        <View style={[styles.topBarSide, { alignItems: 'flex-end' }]}>
          <Text style={styles.flagIcon}>⚑</Text>
        </View>
      </View>

      {/* Public profile banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerEye}>◉</Text>
        <Text style={styles.bannerText}>
          This is exactly what providers see before accepting your booking request.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.photoWrap}>
            <View style={styles.photoCircle}>
              <PersonSilhouette size={40} />
            </View>
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedCheck}>✓</Text>
            </View>
          </View>

          <Text style={styles.name}>Jasmine Turner</Text>
          <Text style={styles.location}>Heights, Houston</Text>

          <View style={styles.memberRow}>
            <Text style={styles.calendarIcon}>⊙</Text>
            <Text style={styles.memberText}>Member since January 2024</Text>
          </View>
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <Text style={styles.statNum}>23</Text>
            <Text style={styles.statLabel}>BOOKINGS</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statNum}>96%</Text>
            <Text style={styles.statLabel}>SHOW RATE</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <View style={styles.ratingRow}>
              <Text style={styles.statNum}>4.8</Text>
              <Text style={styles.ratingStar}>★</Text>
            </View>
            <Text style={styles.statLabel}>RATING</Text>
          </View>
        </View>
        <View style={styles.separator} />

        {/* Trust badges */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.badgesRow}
        >
          <View style={styles.badge}>
            <Text style={styles.badgeIconGreen}>✓</Text>
            <Text style={styles.badgeText}>Phone Verified</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeIconGreen}>⬡</Text>
            <Text style={styles.badgeText}>ID Verified</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeIconAmber}>▣</Text>
            <Text style={styles.badgeText}>Payment Active</Text>
          </View>
        </ScrollView>
        <View style={styles.separator} />

        {/* About */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <Text style={styles.aboutText}>
            Beauty enthusiast based in Houston Heights. Love supporting local creators. Always on time and communicative before appointments.
          </Text>
        </View>
        <View style={[styles.separator, { marginTop: 20 }]} />

        {/* Booking History */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>BOOKING HISTORY</Text>

          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Total appointments</Text>
            <Text style={styles.historyValue}>23</Text>
          </View>
          <View style={styles.thinDivider} />

          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>Cancellations</Text>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.historyValue}>1</Text>
              <Text style={styles.historyMeta}>Last: 3 months ago</Text>
            </View>
          </View>
          <View style={styles.thinDivider} />

          <View style={styles.historyRow}>
            <Text style={styles.historyLabel}>No-shows</Text>
            <Text style={styles.historyValueGreen}>0</Text>
          </View>
        </View>
        <View style={[styles.separator, { marginTop: 4 }]} />

        {/* Provider Reviews */}
        <View style={styles.section}>
          <View style={styles.reviewsHeader}>
            <Text style={styles.sectionLabel}>PROVIDER REVIEWS</Text>
            <Text style={styles.reviewsSummary}>4.8 · 18 reviews</Text>
          </View>

          {/* Review 1 */}
          <View style={styles.thinDivider} />
          <View style={styles.reviewCard}>
            <View style={styles.reviewTop}>
              <View style={styles.reviewerCircle}>
                <SmallSilhouette />
              </View>
              <View style={styles.reviewerInfo}>
                <Text style={styles.reviewerName}>Elena Ross</Text>
                <Text style={styles.reviewerMeta}>Silk Press, Oct 12, 2023</Text>
              </View>
              <Stars count={5} size={10} />
            </View>
            <Text style={styles.reviewText}>
              Jasmine is an absolute dream client. Always early, knows exactly what she wants, and tips well. Would accept her booking any time.
            </Text>
          </View>

          {/* Review 2 */}
          <View style={styles.thinDivider} />
          <View style={styles.reviewCard}>
            <View style={styles.reviewTop}>
              <View style={styles.reviewerCircle}>
                <SmallSilhouette />
              </View>
              <View style={styles.reviewerInfo}>
                <Text style={styles.reviewerName}>Marcus J.</Text>
                <Text style={styles.reviewerMeta}>Fade + Line-up, Sep 3, 2023</Text>
              </View>
              <Stars count={5} size={10} />
            </View>
            <Text style={styles.reviewText}>
              Great communication beforehand. Showed up on time and was easy to work with. Would definitely book again.
            </Text>
          </View>

          <TouchableOpacity activeOpacity={0.6} style={{ marginTop: 16, marginBottom: 8 }}>
            <Text style={styles.seeAllText}>See all 18 reviews</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.ctaEyebrow}>This is what providers see.</Text>
        <Pressable
          style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.88 }]}
          onPress={() => router.push('/discovery')}
        >
          <Text style={styles.confirmBtnText}>Looks good, continue</Text>
        </Pressable>
        <TouchableOpacity
          activeOpacity={0.6}
          style={{ marginTop: 10, alignItems: 'center' }}
          onPress={() => router.back()}
        >
          <Text style={styles.editText}>Edit my profile</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
  topBarSide: {
    width: 44,
    justifyContent: 'center',
  },
  backArrow: {
    fontSize: 28,
    color: '#F0E8D5',
    lineHeight: 32,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  flagIcon: {
    fontSize: 18,
    color: 'rgba(240,232,213,0.35)',
  },

  // Banner
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.08)',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  bannerEye: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.4)',
  },
  bannerText: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
  },

  scrollContent: {
    paddingBottom: 0,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: 24,
    paddingHorizontal: 20,
  },
  photoWrap: {
    width: 88,
    height: 88,
  },
  photoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderWidth: 2.5,
    borderColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 1,
    right: 1,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#080808',
  },
  verifiedCheck: {
    fontSize: 11,
    color: '#080808',
    fontWeight: '700',
    fontFamily: 'Manrope_700Bold',
  },
  name: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginTop: 14,
    textAlign: 'center',
  },
  location: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 6,
    marginBottom: 24,
  },
  calendarIcon: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
  },
  memberText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(240,232,213,0.08)',
    marginVertical: 4,
  },
  statNum: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2,
    marginTop: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  ratingStar: {
    fontSize: 14,
    color: '#C8922A',
    lineHeight: 22,
  },

  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.07)',
  },
  thinDivider: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },

  // Trust badges
  badgesRow: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 8,
    flexDirection: 'row',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeIconGreen: {
    fontSize: 12,
    color: '#4CAF50',
  },
  badgeIconAmber: {
    fontSize: 12,
    color: '#C8922A',
  },
  badgeText: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },

  // Section
  section: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  aboutText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.75)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
  },

  // Booking history
  historyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 48,
  },
  historyLabel: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  historyValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  historyValueGreen: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4CAF50',
    fontFamily: 'Manrope_700Bold',
  },
  historyMeta: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },

  // Reviews
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
  reviewCard: {
    paddingVertical: 16,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
  },
  reviewerCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  reviewerInfo: {
    flex: 1,
  },
  reviewerName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  reviewerMeta: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
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
  seeAllText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },

  // Fixed CTA
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  ctaEyebrow: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginBottom: 12,
  },
  confirmBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  confirmBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  editText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
  },
})
