import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { checkRateLimit } from '@/lib/rateLimit'
import {
  ensureBookingDraft,
  submitBookingRequest,
  toIsoDate,
  buildAppointmentTime,
  ProviderUnavailableError,
  BookingWriteBlockedError,
} from '@/lib/bookingDraft'

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
    draftBookingId,
    setDraftBookingId,
  } = useBookingStore()
  const [isProcessing, setIsProcessing] = useState(false)
  const [processError, setProcessError] = useState('')
  // True once the signature for this attempt is known to be recorded, so a retry
  // of a later step does not re-attempt it.
  const [signatureSaved, setSignatureSaved] = useState(false)
  // Item K: the request is SENT when this screen's submit succeeds. It is set
  // before navigating so that a bounce back to this screen cannot send a second
  // one — the same booking is simply carried forward.
  const [submitted, setSubmitted] = useState(false)

  // Service price — shown for information only. The Book charges nothing and
  // holds nothing, at request time or ever (PD-042). An earlier version of this
  // comment ended "payment happens later, after the provider accepts", which is
  // the exact proposition this file's user-visible copy was corrected to stop
  // making; the guard strips comments, so it could only be caught by reading.
  const servicePrice = parseFloat(selectedService?.price ?? '0') || 0

  async function handleConfirm() {
    if (isProcessing) return
    // ALREADY SENT. `submitted` used to gate only the rate-limit check, which
    // left the real hazard open: bouncing back to this screen from the pushed
    // confirmation and tapping again could not FIND the submitted draft
    // (`findDraft` looks for `submitted_at IS NULL`), so it inserted and
    // submitted a SECOND request — and because `signatureSaved` was already
    // true, that second request carried no contract signature at all. One intent
    // is one request; going forward is the only thing left to do here.
    if (submitted) {
      if (draftBookingId) {
        router.push({ pathname: '/book/confirmed', params: { bookingId: draftBookingId } })
      }
      return
    }

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
      // ── ONE INTENT = ONE REQUEST (item K) ──────────────────────────────
      //
      // Every step below is resumable and lands on the SAME booking row. The
      // draft was created before the contract step (item J) and is looked up by
      // (client, provider) rather than re-inserted, so a dropped network, a
      // failed signature, a back-out or a double tap continues one request
      // instead of starting a second. The row only becomes visible to the
      // provider at the final step.
      const dateForRow = rawDate || toIsoDate(selectedDate)
      const appointmentTime = buildAppointmentTime(rawDate, selectedTime)

      // The rate limit guards SENDING a request, and it is checked here, after
      // the already-sent question above. `if (!submitted)` used to wrap this and
      // was dead code — the handler returns earlier when `submitted` is true — so
      // the only thing it did was hide that a RETRY after a failed send is
      // charged again. It still is, deliberately: a retry that reaches this line
      // is one where nothing was sent, so it is a genuine send attempt. What must
      // not happen is charging a client for a request that DID land, and the
      // already-sent branch above is what prevents that. Expected behavior, not
      // an error: no Sentry capture.
      const rl = await checkRateLimit(user.id, 'booking_create')
      if (!rl.allowed) {
        setIsProcessing(false)
        Alert.alert('Please wait', rl.message ?? 'Please wait before trying again.')
        return
      }

      Sentry.addBreadcrumb({
        message: 'Booking submit',
        category: 'booking',
        data: { providerId, serviceId: selectedService.id ?? null },
      })

      const resolved = await ensureBookingDraft(user.id, {
        providerId,
        serviceId: selectedService.id || null,
        serviceName: selectedService.name,
        requestedDate: dateForRow,
        requestedTime: selectedTime,
        appointmentTime,
        message: bookingMessage || null,
        paymentAmount: servicePrice,
      })
      const bookingId = resolved.id
      setDraftBookingId(bookingId)

      // THE SERVER SAYS THIS INTENT IS ALREADY SENT. This is what makes "one
      // intent = one request" hold across a lost response and a re-entry into a
      // fresh screen instance — neither of which the local `submitted` flag can
      // survive. Going forward is the only thing left to do.
      if (resolved.alreadySubmitted) {
        setSubmitted(true)
        setIsProcessing(false)
        // The REQUEST, not the confirmation screen — see the note on the same
        // branch in book/contract.tsx. Nothing was sent just now, so nothing here
        // may say it was.
        router.replace({ pathname: '/bookings/[id]', params: { id: bookingId } })
        return
      }

      // The signature is recorded against the booking BEFORE it is submitted, so
      // a request the provider can see is never one whose signature failed to
      // save. A failed signature keeps the draft — invisible, resumable — rather
      // than leaving a sent request in a half-signed state.
      if (contractSigned && contractId && !signatureSaved) {
        const { error: sigError } = await supabase.from('contract_signatures').insert({
          contract_id: contractId,
          booking_id: bookingId,
          client_user_id: user.id,
          signature_url: null,
          signed_at: new Date().toISOString(),
          status: 'signed',
        })
        // A duplicate means a previous attempt already recorded it — the retry
        // succeeded from the client's point of view, so treat it as saved.
        if (sigError && sigError.code !== '23505') {
          console.log('Contract signature insert error:', sigError)
          Sentry.captureException(sigError)
          setProcessError(
            'We could not save your contract signature, so your request has not been sent yet. Tap Send Booking Request to try again — nothing was sent twice.',
          )
          setIsProcessing(false)
          return
        }
        setSignatureSaved(true)
      }

      // THE SEND. Until this line the provider cannot see anything.
      await submitBookingRequest(bookingId)
      setSubmitted(true)

      setIsProcessing(false)
      router.push({
        pathname: '/book/confirmed',
        params: { bookingId },
      })
    } catch (err: any) {
      console.log('Booking error:', err)
      setIsProcessing(false)
      // ITEM H: the provider stopped taking new bookings between opening the
      // flow and sending. That is availability, not a fault and not a judgement
      // of the provider, and it is not a technical failure worth a Sentry event.
      // A write the database FILTERED to zero rows. It reports no error, so this
      // is the only place it can be caught — and it must never be allowed to
      // reach the confirmation screen, which would tell the client their request
      // was sent when nothing was written.
      if (err instanceof BookingWriteBlockedError) {
        setProcessError(
          'We could not send your request — nothing was saved. Please try again, or go back and start a new request with this provider.',
        )
        return
      }
      if (err instanceof ProviderUnavailableError) {
        setProcessError(
          'This provider is not currently available for new bookings. Your existing bookings and messages with them are unaffected.',
        )
        return
      }
      Sentry.captureException(err)
      setProcessError(
        err?.message
          ? `We could not send your request: ${err.message}`
          : 'We could not send your request. Please try again.',
      )
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
        {/* PRODUCT TRUTH: this read "No payment now. You'll be asked to pay
            after the provider accepts your request." The first half was true;
            the second promised an in-app payment step that does not exist and
            is not coming in this beta (PD-042). */}
        {/* ITEM D (Correction 3): the Founder-approved wording, verbatim. It
            says the same thing the corrected line said, in the words the product
            has settled on — and "for now" is the one forward-looking clause item
            D permits: payment is COMING LATER, which is true, as against the
            removed copy that implied a charge was already part of this flow. */}
        <Text style={styles.headerSubtext}>
          In-app payments aren&apos;t available during beta. Payment is handled
          directly with your provider for now.
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

          {/* Service price — information only; The Book never charges it. */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Service price</Text>
            <Text style={styles.priceValue}>{money(servicePrice)}</Text>
          </View>
          {/* PRODUCT TRUTH: "You won't be charged now" implied a later charge.
              The Book does not charge at any point in this beta. */}
          <Text style={styles.holdHelperText}>
            Shown so you know the cost. The Book does not take payment.
          </Text>
        </View>

        {/* What happens next */}
        <View style={styles.authInfoBox}>
          <Feather name="send" size={13} color="#4CAF50" style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.authInfoTitle}>This is a request, not a confirmed booking</Text>
            {/* PRODUCT TRUTH: the closing clause promised "you'll be asked to
                pay only after they accept", which describes an in-app payment
                step that does not exist. */}
            <Text style={styles.authInfoSub}>
              The provider reviews your request and accepts or declines. No card, no payment, and no hold are taken — payment is arranged directly with your provider.
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
