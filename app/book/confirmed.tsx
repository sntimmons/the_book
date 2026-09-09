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
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>()
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

  // ITEM N: the primary action after sending is VIEW REQUEST.
  //
  // "Back to Home" was the only way off this screen, which dropped the client
  // back into discovery with nothing to act on and no route to the thing they
  // had just done. The request they just sent is the one place where its status,
  // the provider's answer and the option to withdraw all live, so that is where
  // the primary button goes. Home stays as the quiet secondary.
  //
  // `reset()` still runs: the booking-flow store is per-attempt scratch state,
  // and leaving it populated would make a later attempt resume this one's
  // service and date. The request itself is on the server and is what the next
  // screen reads.
  function handleViewRequest() {
    reset()
    if (bookingId) {
      // `/bookings/[id]`, NOT `/bookings/request/[id]`. The latter is the
      // PROVIDER's request screen: a client who lands on it is told "This view is
      // only available to the provider", and because this screen is replaced, the
      // only way back out of that dead end was into the completed send step —
      // which would have sent a second request. The client's own booking detail
      // is where the status, the provider's answer and the withdraw control live.
      router.replace({ pathname: '/bookings/[id]', params: { id: bookingId } })
      return
    }
    // No id to open — do not pretend there is a request to show.
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

        {/* ITEM 2 (PM decision, PR #74): the client IS told the window.

            A "has 24 hours to respond" timer used to sit here, driven by a
            hardcoded string that matched no enforced rule. It was removed rather
            than corrected, and PD-071 recorded whether to tell the client at all
            as a Founder question. That question is now answered: tell them.

            The number is the real one — PD-071's server-authoritative 72 hours —
            and the second sentence is what makes the first safe to say. There is
            no push, email or SMS channel in this product, so the client is told
            where to LOOK rather than promised something will arrive. */}
        <Text style={styles.responseWindowText}>
          Your provider has up to 72 hours to respond. You can check this request
          anytime.
        </Text>

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
        {bookingId ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={handleViewRequest}
          >
            <Text style={styles.primaryBtnText}>View Request</Text>
          </TouchableOpacity>
        ) : null}
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
  responseWindowText: {
    marginTop: 14,
    fontSize: 13,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
  primaryBtn: {
    height: 54,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  primaryBtnText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
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
