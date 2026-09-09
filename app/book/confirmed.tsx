import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'

export default function BookConfirmed() {
  const insets = useSafeAreaInsets()
  useLocalSearchParams<{ bookingId: string }>()
  const {
    providerName,
    selectedService,
    selectedDate,
    selectedTime,
    reset,
  } = useBookingStore()

  const displayProviderName = providerName || 'Your provider'
  const firstName = displayProviderName.split(' ')[0]

  const bookingSummary = [
    selectedService?.name ?? 'Service',
    selectedDate || '',
    selectedTime || '',
  ]
    .filter(Boolean)
    .join(' · ')

  function handleBackToHome() {
    reset()
    router.replace('/(tabs)/')
  }

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
      {/* Main content */}
      <View style={styles.centerContent}>

        {/* Status icon */}
        <View style={styles.iconRing}>
          <Feather name="send" size={28} color="rgba(240,232,213,0.6)" />
        </View>

        {/* Status badge */}
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>BOOKING REQUEST SENT</Text>
        </View>

        {/* Headline */}
        <Text style={styles.headline}>You're almost in.</Text>

        {/* Subtext */}
        {/* PRODUCT TRUTH: "You'll be notified as soon as they respond" promised
            a push notification. There is no push channel in this beta (PD-059);
            a response appears in the app. */}
        <Text style={styles.subtext}>
          Your booking request has been sent. {firstName} will review it and
          accept or decline. You&apos;ll see their response in The Book.
        </Text>

        {/* PRODUCT TRUTH: a "has 24 hours to respond" timer used to sit here,
            driven by a hardcoded string, and told the CLIENT that a response was
            guaranteed within a window.

            BE PRECISE ABOUT WHAT IS AND IS NOT ENFORCED, because an earlier
            version of this comment said "nothing expires a pending booking" and
            that is wrong. There is no server-side expiry — no trigger, no job,
            no column, and a pending booking sits pending forever in the
            database. But the PROVIDER's controls do expire client-side at 24h
            from `created_at`: app/(tabs)/business/index.tsx disables Accept and
            Decline, and app/bookings/request/[id].tsx says the request "has
            expired". So the window is real UI behaviour on one side and no
            guarantee on the other, which is exactly why a promise to the client
            was the wrong thing to make. Removed rather than restated with a
            different number. Whether the client should be told about a window
            the provider is held to is a Founder question, recorded, not decided
            here. */}

        {/* Booking summary pill */}
        {bookingSummary.length > 0 && (
          <View style={styles.summaryPill}>
            <View style={styles.pillAvatar}>
              <Feather name="user" size={12} color="rgba(240,232,213,0.4)" />
            </View>
            <Text style={styles.summaryPillText}>{bookingSummary}</Text>
          </View>
        )}

        {/* No-payment reassurance. PRODUCT TRUTH: previously "No payment taken
            until the provider accepts", which implied a charge on acceptance. */}
        <View style={styles.noPaymentBox}>
          <Feather name="shield" size={13} color="#4CAF50" />
          <Text style={styles.noPaymentText}>No in-app payment in this beta</Text>
        </View>

        {/* What happens next */}
        <View style={styles.nextSteps}>
          <Text style={styles.nextStepsLabel}>WHAT HAPPENS NEXT</Text>

          {[
            {
              n: '1',
              title: 'Provider reviews your request',
              // No response deadline is stated: none is enforced anywhere.
              desc: `${firstName} will review your profile and confirm or suggest an alternative time.`,
              green: false,
            },
            {
              n: '2',
              // PRODUCT TRUTH: was "You get notified instantly" / "you get a
              // notification". No push, device or email notification exists.
              title: 'You see their answer in The Book',
              desc: `When ${firstName} responds you will see it in your bookings — whether they accept, decline, or suggest another time.`,
              green: false,
            },
            {
              n: '3',
              // PRODUCT TRUTH: was "No payment upfront" / "No payment is taken
              // until ... accepts", both of which implied a later in-app charge.
              title: 'No in-app payment',
              desc: `The Book does not take payment in this beta. You arrange payment directly with ${firstName}.`,
              green: true,
            },
          ].map((step) => (
            <View key={step.n} style={styles.stepRow}>
              <View style={[styles.stepNumCircle, step.green && styles.stepNumCircleGreen]}>
                <Text style={[styles.stepNum, step.green && styles.stepNumGreen]}>{step.n}</Text>
              </View>
              <View style={styles.stepText}>
                <Text style={[styles.stepTitle, step.green && styles.stepTitleGreen]}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom buttons, inside scroll so they never overlap content */}
      <View style={styles.bottomButtons}>
        <TouchableOpacity
          style={styles.homeBtn}
          activeOpacity={0.7}
          onPress={handleBackToHome}
        >
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
  },
  centerContent: {
    alignItems: 'center',
    paddingTop: 40,
  },
  iconRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    marginTop: 16,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  statusBadgeText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.5,
  },
  headline: {
    fontSize: 30,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
    marginTop: 20,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: 10,
    paddingHorizontal: 16,
  },
  summaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    alignSelf: 'center',
    marginTop: 24,
  },
  pillAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryPillText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  noPaymentBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginTop: 16,
  },
  noPaymentText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  nextSteps: {
    width: '100%',
    marginTop: 32,
  },
  nextStepsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 14,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  stepNumCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  stepNum: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_700Bold',
  },
  stepText: {
    flex: 1,
  },
  stepNumCircleGreen: {
    backgroundColor: 'rgba(76,175,80,0.1)',
    borderColor: 'rgba(76,175,80,0.2)',
  },
  stepNumGreen: {
    color: '#4CAF50',
  },
  stepTitle: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  stepTitleGreen: {
    color: '#4CAF50',
  },
  stepDesc: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
    lineHeight: 17,
  },
  bottomButtons: {
    marginTop: 32,
  },
  homeBtn: {
    height: 44,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
  },
})
