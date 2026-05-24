import { useRef, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const CHECKLIST = [
  { key: 'profile',      label: 'Profile',       detail: 'Name, photo, category, bio',          done: true  },
  { key: 'portfolio',    label: 'Portfolio',      detail: 'Work photos uploaded',                done: true  },
  { key: 'reels',        label: 'Reels',          detail: 'Video clips added',                   done: false },
  { key: 'services',     label: 'Services',       detail: 'Pricing and offerings set',           done: true  },
  { key: 'availability', label: 'Availability',   detail: 'Schedule and hours configured',       done: true  },
  { key: 'policy',       label: 'Policies',       detail: 'Cancellation and reschedule rules',   done: true  },
  { key: 'payout',       label: 'Payout',         detail: 'How you get paid',                    done: false },
]

export default function ProviderGoLive() {
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const completedCount = CHECKLIST.filter((c) => c.done).length
  const allComplete = completedCount === CHECKLIST.length

  function handleGoLive() {
    // Navigate to the main app dashboard
    router.replace('/(tabs)')
  }

  return (
    <View style={styles.root}>
      {/* Progress bar — 100% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar — no back arrow */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <View style={styles.topBarSpacer} />
        <Text style={styles.topBarLabel}>You're almost live</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 180 }]}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        {/* Profile preview card */}
        <View style={styles.previewCard}>
          {/* Banner area */}
          <View style={styles.previewBanner}>
            <Feather name="camera" size={28} color="rgba(240,232,213,0.15)" />
            {/* PREVIEW badge */}
            <View style={styles.previewBadge}>
              <View style={styles.previewDot} />
              <Text style={styles.previewBadgeText}>PREVIEW</Text>
            </View>
          </View>

          {/* Card body */}
          <View style={styles.previewBody}>
            <Text style={styles.previewName}>Your Name</Text>
            <Text style={styles.previewMeta}>Category · Location</Text>

            <View style={styles.previewStats}>
              <Feather name="star" size={11} color="#C8922A" />
              <Text style={styles.previewStatNew}>New</Text>
              <View style={styles.previewDotSep} />
              <Text style={styles.previewStatBookings}>0 bookings</Text>
            </View>

            <View style={styles.bookNowBtn}>
              <Text style={styles.bookNowText}>Book Now</Text>
            </View>
          </View>
        </View>

        {/* Headline */}
        <Text style={styles.headline}>You're ready.</Text>
        <Text style={styles.subtext}>
          Your profile goes live the moment you tap the button below.
        </Text>

        {/* Checklist */}
        <Text style={styles.sectionLabel}>YOUR SETUP</Text>
        <View style={styles.checklist}>
          {CHECKLIST.map((item) => (
            <View
              key={item.key}
              style={[styles.checkItem, item.done ? styles.checkItemDone : styles.checkItemPending]}
            >
              <View style={[styles.checkCircle, item.done ? styles.checkCircleDone : styles.checkCirclePending]}>
                {item.done ? (
                  <Feather name="check" size={12} color="#080808" />
                ) : (
                  <Feather name="clock" size={11} color="rgba(240,232,213,0.35)" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.checkLabel, !item.done && styles.checkLabelPending]}>
                  {item.label}
                </Text>
                <Text style={styles.checkDetail}>{item.detail}</Text>
              </View>
              {!item.done && (
                <Text style={styles.checkOptional}>Optional</Text>
              )}
            </View>
          ))}
        </View>

        {/* Completion note */}
        <View style={styles.completionNote}>
          <Feather
            name={allComplete ? 'check-circle' : 'info'}
            size={14}
            color={allComplete ? '#C8922A' : 'rgba(240,232,213,0.25)'}
            style={{ marginTop: 2 }}
          />
          <Text style={[styles.completionText, allComplete && styles.completionTextComplete]}>
            {allComplete
              ? 'All steps complete. Your profile is ready to go live.'
              : `${completedCount} of ${CHECKLIST.length} steps complete. You can finish the rest from your dashboard.`}
          </Text>
        </View>

        {/* What happens next */}
        <Text style={[styles.sectionLabel, { marginTop: 28 }]}>WHAT HAPPENS NEXT</Text>
        <View style={styles.nextList}>
          {[
            { icon: 'search',       text: 'Clients in Houston can discover your profile'   },
            { icon: 'calendar',     text: 'Booking requests start coming to your dashboard' },
            { icon: 'dollar-sign',  text: 'Get paid automatically after each appointment'  },
          ].map((item, i) => (
            <View key={i} style={styles.nextRow}>
              <View style={styles.nextIconBox}>
                <Feather name={item.icon as any} size={15} color="rgba(240,232,213,0.5)" />
              </View>
              <Text style={styles.nextText}>{item.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.goLiveBtn} onPress={handleGoLive}>
          <Text style={styles.goLiveBtnText}>Go Live</Text>
        </Pressable>
        <TouchableOpacity
          activeOpacity={0.6}
          style={styles.previewWrap}
          onPress={handleGoLive}
        >
          <Text style={styles.previewLinkText}>Preview profile first</Text>
        </TouchableOpacity>
        <Text style={styles.ctaNote}>
          You can take your profile offline anytime from settings.
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.1)',
    zIndex: 10,
  },
  progressFill: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  topBarSpacer: {
    width: 36,
  },
  topBarLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 32,
    alignItems: 'center',
  },

  // Preview card
  previewCard: {
    width: '100%',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    marginBottom: 32,
  },
  previewBanner: {
    height: 120,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,8,8,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.2)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  previewDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(240,232,213,0.4)',
  },
  previewBadgeText: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
    marginLeft: 6,
  },
  previewBody: {
    padding: 14,
  },
  previewName: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  previewMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  previewStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  previewStatNew: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  previewDotSep: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(240,232,213,0.3)',
  },
  previewStatBookings: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  bookNowBtn: {
    backgroundColor: '#C8922A',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
    width: '100%',
    marginTop: 12,
  },
  bookNowText: {
    fontSize: 13,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },

  // Headline
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
    lineHeight: 38,
    marginBottom: 6,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 32,
  },

  // Section label
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 14,
    alignSelf: 'center',
  },

  // Checklist
  checklist: {
    width: '100%',
    gap: 10,
    marginBottom: 16,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
  checkItemDone: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderColor: 'rgba(240,232,213,0.08)',
  },
  checkItemPending: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(240,232,213,0.05)',
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkCircleDone: {
    backgroundColor: '#F0E8D5',
  },
  checkCirclePending: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  checkLabel: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  checkLabelPending: {
    color: 'rgba(240,232,213,0.4)',
  },
  checkDetail: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  checkOptional: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    flexShrink: 0,
  },

  // Completion note
  completionNote: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 4,
  },
  completionText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },
  completionTextComplete: {
    color: 'rgba(240,232,213,0.5)',
  },

  // What happens next
  nextList: {
    width: '100%',
    gap: 12,
  },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  nextIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  nextText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },

  // CTA
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  goLiveBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  goLiveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  previewWrap: {
    alignItems: 'center',
    marginTop: 10,
  },
  previewLinkText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  ctaNote: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
})
