import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'

export default function BookConfirmed() {
  const insets = useSafeAreaInsets()
  const {
    providerName,
    selectedService,
    selectedDate,
    selectedTime,
    reset,
  } = useBookingStore()

  const firstName = providerName.split(' ')[0]
  const depositAmount = selectedService?.depositRequired ? selectedService.depositAmount : '$45'
  const bookingSummary = [
    selectedService?.name ?? 'Classic Full Set',
    selectedDate || 'May 28',
    selectedTime || '1:00 PM',
  ].join(' · ')

  function handleBackToHome() {
    reset()
    router.push('/(tabs)/')
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 20 }]}>

      {/* Main content — centered */}
      <View style={styles.centerContent}>

        {/* Status icon */}
        <View style={styles.iconRing}>
          <Feather name="send" size={28} color="rgba(240,232,213,0.6)" />
        </View>

        {/* Status badge */}
        <View style={styles.statusBadge}>
          <Text style={styles.statusBadgeText}>REQUEST SENT</Text>
        </View>

        {/* Headline */}
        <Text style={styles.headline}>You're almost in.</Text>

        {/* Subtext */}
        <Text style={styles.subtext}>
          {firstName} typically responds within 2 hours.{'\n'}
          You will be notified the moment{'\n'}
          {firstName} confirms your booking.
        </Text>

        {/* Booking summary pill */}
        <View style={styles.summaryPill}>
          <View style={styles.pillAvatar}>
            <Feather name="user" size={12} color="rgba(240,232,213,0.4)" />
          </View>
          <Text style={styles.summaryPillText}>{bookingSummary}</Text>
        </View>

        {/* Deposit confirmation */}
        <View style={styles.depositConfirm}>
          <Feather name="shield" size={13} color="#4CAF50" />
          <Text style={styles.depositConfirmText}>{depositAmount} deposit held securely</Text>
        </View>

        {/* What happens next */}
        <View style={styles.nextSteps}>
          <Text style={styles.nextStepsLabel}>WHAT HAPPENS NEXT</Text>

          {[
            {
              n: '1',
              title: 'Provider reviews your request',
              desc: `${firstName} will review your profile and confirm or suggest an alternative time.`,
            },
            {
              n: '2',
              title: 'You get notified instantly',
              desc: `We will send you a notification the moment ${firstName} responds to your request.`,
            },
            {
              n: '3',
              title: 'Appointment is locked in',
              desc: 'Once confirmed your appointment is set and your deposit is applied.',
            },
          ].map((step) => (
            <View key={step.n} style={styles.stepRow}>
              <View style={styles.stepNumCircle}>
                <Text style={styles.stepNum}>{step.n}</Text>
              </View>
              <View style={styles.stepText}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      {/* Bottom buttons */}
      <View style={[styles.bottomButtons, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.messageBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/messages/1' as any)}
        >
          <Feather name="message-circle" size={18} color="#F0E8D5" />
          <Text style={styles.messageBtnText}>Message {firstName}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.homeBtn}
          activeOpacity={0.7}
          onPress={handleBackToHome}
        >
          <Text style={styles.homeBtnText}>Back to Home</Text>
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
  centerContent: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
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
  stepTitle: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  stepDesc: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
    lineHeight: 17,
  },
  bottomButtons: {
    paddingHorizontal: 24,
  },
  messageBtn: {
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    marginBottom: 10,
  },
  messageBtnText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
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
