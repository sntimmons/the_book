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
        <Text style={styles.topBarTitle}>Confirm & Pay</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 160 }}
      >
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
            <Text style={styles.depositLabel}>Due today (deposit)</Text>
            <Text style={styles.depositValue}>{depositAmount}</Text>
          </View>
          <View style={styles.priceRow}>
            <Text style={styles.remainingLabel}>Remaining at appointment</Text>
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

        {/* Security note */}
        <View style={styles.securityNote}>
          <Feather name="lock" size={13} color="rgba(240,232,213,0.3)" />
          <Text style={styles.securityText}>
            Your payment is protected by The Book. Deposit held securely until appointment.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 20 }]}>
        <Text style={styles.ctaLabel}>Deposit due today:</Text>
        <Text style={styles.ctaAmount}>{depositAmount}</Text>

        <Pressable
          style={[styles.confirmBtn, isProcessing && styles.confirmBtnProcessing]}
          onPress={handleConfirm}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <View style={styles.processingRow}>
              <ActivityIndicator color="#080808" size="small" />
              <Text style={styles.confirmBtnText}>Processing...</Text>
            </View>
          ) : (
            <Text style={styles.confirmBtnText}>Confirm & Pay {depositAmount}</Text>
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
    marginBottom: 4,
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
  section: {
    paddingHorizontal: 20,
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
    paddingHorizontal: 20,
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
