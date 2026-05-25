import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'

export default function BookPayment() {
  const insets = useSafeAreaInsets()
  const {
    providerName,
    providerCategory,
    providerLocation,
    selectedService,
    selectedDate,
    selectedTime,
  } = useBookingStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [useApplePay, setUseApplePay] = useState(false)

  const depositAmount = selectedService?.depositRequired ? selectedService.depositAmount : '$45'
  const servicePrice = selectedService?.price ?? '$145'
  const protectionFee = '$7.25'
  const dueAtAppointment = '$107.25'

  function handleConfirm() {
    if (isProcessing) return
    setIsProcessing(true)
    setTimeout(() => {
      router.push('/book/confirmed')
    }, 1500)
  }

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Add Payment Method</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={true}
        scrollEventThrottle={16}
      >
        {/* Subtext */}
        <Text style={styles.headerSubtext}>
          Your card is saved securely. Nothing is charged until your provider confirms your booking.
        </Text>

        {/* Order summary */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>

          {/* Provider row */}
          <View style={styles.providerRow}>
            <View style={styles.providerAvatar}>
              <Feather name="user" size={16} color="rgba(240,232,213,0.4)" />
            </View>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{providerName}</Text>
              <Text style={styles.providerMeta}>{providerCategory} · {providerLocation}</Text>
            </View>
          </View>

          <View style={styles.separator} />

          {/* Service details */}
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Feather name="scissors" size={12} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>Service</Text>
            </View>
            <View style={styles.detailRight}>
              <Text style={styles.detailValue}>{selectedService?.name ?? 'Classic Full Set'}</Text>
              <Text style={styles.detailSub}>{selectedService?.duration ?? '90 min'}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Feather name="calendar" size={12} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>Date</Text>
            </View>
            <Text style={styles.detailValue}>{selectedDate || 'May 28, 2026'}</Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Feather name="clock" size={12} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>Time</Text>
            </View>
            <Text style={styles.detailValue}>{selectedTime || '1:00 PM'}</Text>
          </View>

          <View style={styles.separator} />

          {/* Price breakdown */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>{selectedService?.name ?? 'Classic Full Set'}</Text>
            <Text style={styles.priceValue}>{servicePrice}.00</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Booking protection (5%)</Text>
            <Text style={styles.priceSub}>+{protectionFee}</Text>
          </View>

          <View style={styles.priceSeparator} />

          <View style={styles.priceRow}>
            <Text style={styles.depositLabel}>Deposit (saved, not charged yet)</Text>
            <Text style={styles.depositValue}>{depositAmount}</Text>
          </View>
          <Text style={styles.holdHelperText}>
            Only charged when provider confirms.
          </Text>
          <View style={[styles.priceRow, { marginTop: 6 }]}>
            <Text style={styles.remainingLabel}>Balance due at appointment</Text>
            <Text style={styles.remainingValue}>{dueAtAppointment}</Text>
          </View>
        </View>

        {/* Payment method */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PAYMENT METHOD</Text>

          <TouchableOpacity
            style={[styles.paymentCard, !useApplePay && styles.paymentCardSelected]}
            activeOpacity={0.8}
            onPress={() => setUseApplePay(false)}
          >
            <View style={styles.paymentCardLeft}>
              <Feather name="credit-card" size={20} color="rgba(240,232,213,0.5)" />
              <View>
                <Text style={styles.cardName}>Visa ending in 4242</Text>
                <Text style={styles.cardExpiry}>Expires 12/27</Text>
              </View>
            </View>
            <Text style={styles.changeText}>Change</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.paymentCard, styles.applePayCard, useApplePay && styles.paymentCardSelected]}
            activeOpacity={0.8}
            onPress={() => setUseApplePay(true)}
          >
            <View style={styles.paymentCardLeft}>
              <Feather name="smartphone" size={20} color="rgba(240,232,213,0.5)" />
              <Text style={styles.cardName}>Pay with Apple Pay</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Info box — inside scroll so it's always reachable */}
        <View style={styles.authInfoBox}>
          <Feather name="shield" size={13} color="#4CAF50" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.authInfoTitle}>Zero charge until confirmed</Text>
            <Text style={styles.authInfoSub}>
              Your card is saved but never charged until your provider says yes. If they decline nothing happens to your account. Ever.
            </Text>
          </View>
        </View>

        {/* Security note */}
        <View style={styles.securityNote}>
          <Feather name="lock" size={13} color="rgba(240,232,213,0.3)" />
          <Text style={styles.securityText}>
            Your card details are encrypted and stored securely by Stripe. Nothing is charged until your provider confirms your booking request.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA — outside ScrollView, always visible */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.ctaLabel}>Deposit saved, not charged:</Text>
        <Text style={styles.ctaAmount}>{depositAmount}</Text>

        <Pressable
          style={[styles.confirmBtn, isProcessing && styles.confirmBtnProcessing]}
          onPress={handleConfirm}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <View style={styles.processingRow}>
              <ActivityIndicator color="#080808" size="small" />
              <Text style={styles.confirmBtnText}>Sending your request...</Text>
            </View>
          ) : (
            <Text style={styles.confirmBtnText}>Save Card & Send Request</Text>
          )}
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 180,
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
  topBarTitle: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  topBarSpacer: {
    width: 36,
  },
  headerSubtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    textAlign: 'center',
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 4,
  },
  section: {
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  providerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  providerMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  detailRight: {
    alignItems: 'flex-end',
  },
  detailValue: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  detailSub: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  priceLabel: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  priceValue: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  priceSub: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  priceSeparator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginVertical: 8,
  },
  depositLabel: {
    fontSize: 15,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },
  depositValue: {
    fontSize: 15,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },
  remainingLabel: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  remainingValue: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  holdHelperText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
    marginTop: 4,
  },
  authInfoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(76,175,80,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.15)',
    borderRadius: 10,
    borderCurve: 'continuous',
    marginTop: 16,
  },
  authInfoTitle: {
    fontSize: 12,
    color: '#4CAF50',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 2,
  },
  authInfoSub: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 15,
  },
  paymentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 14,
  },
  paymentCardSelected: {
    borderColor: 'rgba(240,232,213,0.2)',
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  applePayCard: {
    marginTop: 8,
  },
  paymentCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cardName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  cardExpiry: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  changeText: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  securityNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    marginTop: 16,
  },
  securityText: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
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
    alignItems: 'center',
  },
  ctaLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 4,
  },
  ctaAmount: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 12,
  },
  confirmBtn: {
    backgroundColor: '#C8922A',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  confirmBtnProcessing: {
    opacity: 0.7,
  },
  confirmBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
})
