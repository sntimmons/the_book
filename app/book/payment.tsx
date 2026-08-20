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
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

// Convert "May 28, 2026" to "2026-05-28" for the date column.
function toIsoDate(displayDate: string): string {
  const d = new Date(displayDate)
  if (Number.isNaN(d.getTime())) return displayDate
  const yyyy = d.getFullYear()
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Assemble an ISO timestamp from a YYYY-MM-DD date and a "H:MM AM/PM" time
// using numeric parts. Hermes (React Native's engine) cannot parse locale
// strings like "June 21, 2026 11:00 AM" via new Date(), so we never rely on
// string parsing. Returns null if inputs are missing or malformed, so a bad
// value can never throw "Date value out of bounds" (appointment_time is
// nullable).
function buildAppointmentTime(
  isoDate: string | null | undefined,
  displayTime: string | null | undefined,
): string | null {
  if (!isoDate || !displayTime) return null
  const dateMatch = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const timeMatch = displayTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!dateMatch || !timeMatch) return null
  let hour = parseInt(timeMatch[1], 10) % 12
  if (/PM/i.test(timeMatch[3])) hour += 12
  const d = new Date(
    parseInt(dateMatch[1], 10),
    parseInt(dateMatch[2], 10) - 1,
    parseInt(dateMatch[3], 10),
    hour,
    parseInt(timeMatch[2], 10),
  )
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

function money(n: number): string {
  return '$' + Number(n).toFixed(2)
}

export default function BookPayment() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const {
    providerId,
    providerName,
    providerCategory,
    providerLocation,
    selectedService,
    selectedDate,
    rawDate,
    selectedTime,
    bookingMessage,
    contractId,
    contractSigned,
  } = useBookingStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [processError, setProcessError] = useState('')

  // Service price — shown for information only. At request time nothing is
  // charged or held; payment happens later, after the provider accepts.
  const servicePrice = parseFloat(selectedService?.price ?? '0') || 0

  async function handleConfirm() {
    if (isProcessing) return

    // Specific, actionable validation instead of one generic "something is
    // missing". The service / date / time are required to advance through the
    // earlier steps, so the piece that actually trips this guard in practice is
    // `user`: nothing before this screen checks auth, so a client whose session
    // is not established reaches the final step and must be told to sign in,
    // not shown a vague "missing booking details".
    if (!user) {
      setProcessError('Please sign in to send a booking request.')
      return
    }
    if (!selectedService) {
      setProcessError('Please choose a service before sending your request.')
      return
    }
    if (!selectedDate || !selectedTime) {
      setProcessError('Please pick a date and time before sending your request.')
      return
    }

    setIsProcessing(true)
    setProcessError('')

    try {
      // rawDate is YYYY-MM-DD (set in book/datetime.tsx) and selectedTime is
      // "H:MM AM/PM". Build appointment_time from numeric parts; if it cannot
      // be assembled it stays null rather than crashing the save.
      const dateForRow = rawDate || toIsoDate(selectedDate)
      const appointmentTime = buildAppointmentTime(rawDate, selectedTime)

      const { data: booking, error } = await supabase
        .from('bookings')
        .insert({
          user_id: user.id,
          provider_id: providerId,
          service_id: selectedService.id || null,
          service_name: selectedService.name,
          requested_date: dateForRow,
          requested_time: selectedTime,
          appointment_time: appointmentTime,
          message: bookingMessage || null,
          status: 'pending',
          payment_status: 'unpaid',
          payment_amount: servicePrice,
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (error) {
        console.log('Booking insert error:', error)
        // Surface the real reason rather than hiding every failure behind a
        // single generic line. If the request fails because of a schema or
        // permission problem (e.g. a missing column or an RLS rule), the tester
        // now sees exactly what went wrong so it can be reported and fixed.
        setProcessError(
          error.message
            ? `We could not send your request: ${error.message}`
            : 'We could not send your request. Please try again.',
        )
        setIsProcessing(false)
        return
      }

      // If the client signed the provider's contract earlier in the flow, write
      // the signature row now that the booking (and its id) exists. Best-effort:
      // a failure here should not block the confirmed request. The signature is
      // a placeholder (null url) until the real canvas ships in an EAS build.
      if (contractSigned && contractId) {
        const { error: sigError } = await supabase.from('contract_signatures').insert({
          contract_id: contractId,
          booking_id: booking.id,
          client_user_id: user.id,
          signature_url: null,
          signed_at: new Date().toISOString(),
          status: 'signed',
        })
        if (sigError) console.log('Contract signature insert error:', sigError)
      }

      setIsProcessing(false)
      router.push({
        pathname: '/book/confirmed',
        params: { bookingId: booking.id },
      })
    } catch (err: any) {
      console.log('Booking error:', err)
      setProcessError('Something went wrong. Please try again.')
      setIsProcessing(false)
    }
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
        <Text style={styles.topBarTitle}>Confirm Request</Text>
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
        <Text style={styles.headerSubtext}>
          No payment now. You'll be asked to pay after the provider accepts your request.
        </Text>

        {/* Order summary */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>ORDER SUMMARY</Text>

          <View style={styles.providerRow}>
            <View style={styles.providerAvatar}>
              <Feather name="user" size={16} color="rgba(240,232,213,0.4)" />
            </View>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{providerName || 'Your provider'}</Text>
              <Text style={styles.providerMeta}>
                {providerCategory}
                {providerCategory && providerLocation ? ' · ' : ''}
                {providerLocation}
              </Text>
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
              <Text style={styles.detailValue}>{selectedService?.name ?? '-'}</Text>
              <Text style={styles.detailSub}>{selectedService?.duration ?? ''}</Text>
            </View>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Feather name="calendar" size={12} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>Date</Text>
            </View>
            <Text style={styles.detailValue}>{selectedDate || '-'}</Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Feather name="clock" size={12} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>Time</Text>
            </View>
            <Text style={styles.detailValue}>{selectedTime || '-'}</Text>
          </View>

          <View style={styles.separator} />

          {/* Service price — information only; nothing is charged at request time. */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Service price</Text>
            <Text style={styles.priceValue}>{money(servicePrice)}</Text>
          </View>
          <Text style={styles.holdHelperText}>
            Shown so you know the cost. You won't be charged now.
          </Text>
        </View>

        {/* What happens next */}
        <View style={styles.authInfoBox}>
          <Feather name="send" size={13} color="#4CAF50" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.authInfoTitle}>This is a request, not a confirmed booking</Text>
            <Text style={styles.authInfoSub}>
              The provider reviews your request and accepts or declines. No card, no payment, and no hold are taken now — you'll be asked to pay only after they accept.
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Text style={styles.ctaLabel}>Service price</Text>
        <Text style={styles.ctaAmount}>{money(servicePrice)}</Text>

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
            <Text style={styles.confirmBtnText}>Send Booking Request</Text>
          )}
        </Pressable>

        {processError.length > 0 && (
          <Text style={styles.errorText}>{processError}</Text>
        )}
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
    paddingBottom: 220,
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
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: '#E05C5C',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
})
