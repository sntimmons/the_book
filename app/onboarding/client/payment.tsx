import { View, Text, ScrollView, Pressable, TouchableOpacity, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ClientPayment() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      {/* Progress bar 100% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.topBarLabel}>Almost there</Text>
        <Text style={styles.topBarStep}>Step 4 of 4</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.headline}>Set up payments.</Text>
        <Text style={styles.subtext}>
          Add a payment method to confirm bookings{'\n'}
          and pay deposits securely.
        </Text>

        {/* Payment options */}
        <View style={styles.optionsStack}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.optionCard}
            onPress={() => console.log('open card input')}
          >
            <View style={styles.optionIconWrap}>
              <Text style={styles.optionIcon}>▣</Text>
            </View>
            <View style={styles.optionBody}>
              <Text style={styles.optionTitle}>Debit or Credit Card</Text>
              <Text style={styles.optionSubtitle}>Visa, Mastercard, Amex accepted</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.optionCard}
            onPress={() => console.log('apple pay')}
          >
            <View style={styles.optionIconWrap}>
              <Text style={styles.optionIcon}>⌘</Text>
            </View>
            <View style={styles.optionBody}>
              <Text style={styles.optionTitle}>Apple Pay</Text>
              <Text style={styles.optionSubtitle}>Fast and secure checkout</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Security note */}
        <View style={styles.securityRow}>
          <Text style={styles.securityIcon}>⬡</Text>
          <Text style={styles.securityText}>
            Your payment info is encrypted and secure.
            You are only charged when you confirm a booking.
            Deposits are held safely until your appointment.
          </Text>
        </View>

        {/* Skip */}
        <TouchableOpacity
          activeOpacity={0.6}
          style={styles.skipWrap}
          onPress={() => router.push('/onboarding/client/preview')}
        >
          <Text style={styles.skipText}>Skip for now, add later in settings</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [styles.finishBtn, pressed && { opacity: 0.88 }]}
          onPress={() => router.push('/onboarding/client/preview')}
        >
          <Text style={styles.finishBtnText}>Finish Setup</Text>
        </Pressable>
        <Text style={styles.ctaNote}>You can always update this in settings.</Text>
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
    paddingHorizontal: 24,
    marginBottom: 8,
  },
  topBarLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  topBarStep: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 140,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 36,
    marginTop: 24,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 32,
  },
  optionsStack: {
    gap: 12,
    marginBottom: 24,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 20,
  },
  optionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIcon: {
    fontSize: 20,
    color: 'rgba(240,232,213,0.6)',
  },
  optionBody: {
    flex: 1,
    marginLeft: 16,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  optionSubtitle: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: 'rgba(240,232,213,0.3)',
    lineHeight: 26,
  },
  securityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 24,
  },
  securityIcon: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.35)',
    marginTop: 1,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },
  skipWrap: {
    marginTop: 24,
  },
  skipText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
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
  finishBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 8,
  },
  finishBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  ctaNote: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
})
