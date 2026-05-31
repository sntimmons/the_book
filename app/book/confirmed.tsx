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
  const depositAmount = selectedService?.depositRequired
    ? '$' + (parseFloat(selectedService.depositAmount || '0') || 0).toFixed(2)
    : '$0.00'

  const responseWindow = '24 hours'
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
          <Text style={styles.statusBadgeText}>REQUEST SENT · NO CHARGE YET</Text>
        </View>

        {/* Headline */}
        <Text style={styles.headline}>You're almost in.</Text>

        {/* Subtext */}
        <Text style={styles.subtext}>
          {firstName} typically responds within 2 hours.{'\n'}
          Your card will not be charged until{'\n'}
          they confirm. If they decline nothing{'\n'}
          happens to your account.
        </Text>

        {/* Response timer */}
        <View style={styles.responseTimer}>
          <Feather name="clock" size={13} color="#C8922A" />
          <Text style={styles.responseTimerText}>{firstName} has {responseWindow} to respond</Text>
        </View>

        {/* Booking summary pill */}
        {bookingSummary.length > 0 && (
          <View style={styles.summaryPill}>
            <View style={styles.pillAvatar}>
              <Feather name="user" size={12} color="rgba(240,232,213,0.4)" />
            </View>
            <Text style={styles.summaryPillText}>{bookingSummary}</Text>
          </View>
        )}

        {/* Deposit confirmation */}
        {selectedService?.depositRequired && (
          <View style={styles.depositConfirm}>
            <Feather name="shield" size={13} color="#4CAF50" />
            <Text style={styles.depositConfirmText}>{depositAmount} authorized, not charged yet</Text>
          </View>
        )}

        {/* What happens next */}
        <View style={styles.nextSteps}>
          <Text style={styles.nextStepsLabel}>WHAT HAPPENS NEXT</Text>

          {[
            {
              n: '1',
              title: 'Provider reviews your request',
              desc: `${firstName} will review your profile and confirm or suggest an alternative time. They have 24 hours to respond.`,
              green: false,
            },
            {
              n: '2',
              title: 'You get notified instantly',
              desc: selectedService?.depositRequired
                ? `The moment ${firstName} responds you get a notification. If they accept your ${depositAmount} deposit is charged automatically.`
                : `The moment ${firstName} responds you get a notification. If they accept your card is charged automatically.`,
              green: false,
            },
            {
              n: '3',
              title: 'If declined, zero charge',
              desc: `If ${firstName} declines or does not respond in time your hold releases instantly. Nothing is charged. Ever.`,
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
  responseTimer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  responseTimerText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  depositConfirm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    marginTop: 16,
  },
  depositConfirmText: {
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
