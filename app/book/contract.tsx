import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Sentry from '@sentry/react-native'
import { useBookingStore } from '@/store/bookingStore'
import { useAuth } from '@/context/AuthContext'
import { fetchContractForBooking, Contract } from '@/lib/contracts'
import {
  ensureBookingDraft,
  toIsoDate,
  buildAppointmentTime,
  ProviderUnavailableError,
  ContactBlockedError,
  BookingWriteBlockedError,
} from '@/lib/bookingDraft'

export default function BookContract() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const {
    providerId,
    selectedService,
    selectedDate,
    rawDate,
    selectedTime,
    bookingMessage,
    setContractSigned,
    setDraftBookingId,
  } = useBookingStore()

  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [signed, setSigned] = useState(false)
  // ITEM I: the contract has to be OPENED before it can be signed. For a PDF
  // that means tapping through to the document; for an inline agreement it means
  // the text has actually been scrolled to the end. This is a real precondition,
  // not a claim: see the note above the gate for what it does and does not prove.
  const [opened, setOpened] = useState(false)
  const bodyHeight = useRef(0)
  const viewportHeight = useRef(0)

  const servicePrice = parseFloat(selectedService?.price ?? '0') || 0

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        // ITEM J: the booking exists BEFORE the contract step. Creating (or
        // resuming) the draft here is what lets contract access be scoped to a
        // transaction the client is actually in — `contract_for_booking` returns
        // the terms only to the client who holds this booking with this provider,
        // so there is no standing read path into other people's contract text.
        //
        // The draft is invisible to the provider until the request is sent, so
        // reaching this screen and backing out creates nothing anyone must answer.
        if (!user || !providerId || !selectedService) {
          if (!cancelled) {
            setLoadError(true)
            setLoading(false)
          }
          return
        }
        const resolved = await ensureBookingDraft(user.id, {
          providerId,
          serviceId: selectedService.id || null,
          serviceName: selectedService.name,
          requestedDate: rawDate || toIsoDate(selectedDate),
          requestedTime: selectedTime,
          appointmentTime: buildAppointmentTime(rawDate, selectedTime),
          message: bookingMessage || null,
          paymentAmount: servicePrice,
        })
        if (cancelled) return
        setDraftBookingId(resolved.id)

        // ALREADY SENT. Reached by backing out of the confirmation screen and
        // pressing forward again: this request exists, the provider can see it,
        // and re-signing and re-sending would produce a second one. Go to the
        // request rather than walking the client through the flow again.
        if (resolved.alreadySubmitted) {
          // Straight to the REQUEST, not to the confirmation screen. That screen
          // says "BOOKING REQUEST SENT" and states a live response window — both
          // true of a request just sent, and neither necessarily true of one this
          // client sent days ago and is now re-entering the flow for. The request
          // detail derives its own state, so it is honest whatever the age.
          router.replace({ pathname: '/bookings/[id]', params: { id: resolved.id } })
          return
        }

        const c = await fetchContractForBooking(resolved.id)
        if (cancelled) return
        // A genuine "no contract exists" (empty, no error) skips the step.
        if (!c) {
          router.replace('/book/payment')
          return
        }
        setContract(c)
        setLoading(false)
      } catch (e) {
        if (cancelled) return
        // ITEM H: the provider is no longer taking new bookings. That is
        // availability, not a technical failure and not a judgement of them.
        // Both are PERMANENT refusals, and neither is a connection problem. Before
        // this they fell through to "check your connection and try again" — a
        // false cause, and an invitation to retry something that can never
        // succeed. The block reuses the availability state deliberately: its copy
        // says nothing about a block, because telling the blocked party would turn
        // a safety action into a notification to the person it was taken against.
        if (e instanceof ProviderUnavailableError || e instanceof ContactBlockedError) {
          setUnavailable(true)
          setLoading(false)
          return
        }
        // A write the database FILTERED to zero rows is permanent, not a
        // connection problem — offering "check your connection and try again"
        // would loop the client forever on a gate that cannot open.
        if (e instanceof BookingWriteBlockedError) {
          setBlocked(true)
          setLoading(false)
          return
        }
        // A technical failure must NOT masquerade as "no contract" and skip
        // signing. Surface an error so the client can retry rather than
        // proceeding to book without agreeing to the provider's contract.
        Sentry.captureException(e)
        setLoadError(true)
        setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerId, reloadKey])

  function retryLoad() {
    setLoadError(false)
    setUnavailable(false)
    setBlocked(false)
    setLoading(true)
    setReloadKey((k) => k + 1)
  }

  // An inline agreement counts as opened once its text has been scrolled to the
  // end — or immediately if it is short enough to fit on one screen, since there
  // is nothing left to scroll to.
  function noteBodyScroll(offsetY: number) {
    if (opened) return
    if (bodyHeight.current - viewportHeight.current - offsetY <= 24) setOpened(true)
  }

  function signAndContinue() {
    if (!agreed || !signed || !opened || !contract) return
    // Capture the signing intent; the contract_signatures row is written in
    // book/payment.tsx once the booking (and its id) exists.
    setContractSigned(contract.id)
    router.push('/book/payment')
  }

  function decline() {
    // Pre-booking, there is no signature row to mark declined; simply back out
    // to reconsider. The booking has not been created yet.
    router.back()
  }

  if (loading) {
    return (
      <View style={styles.root}>
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      </View>
    )
  }

  if (blocked) {
    // Permanent, and says so. No "try again": the write was refused, not lost.
    return (
      <View style={styles.root}>
        <View style={styles.centerBody}>
          <Text style={styles.title}>We could not start this request</Text>
          <Text style={styles.bodyText}>
            Something about this booking could not be saved. Go back and start a new
            request with this provider.
          </Text>
          <TouchableOpacity
            style={[styles.recoveryBtn, styles.recoveryBtnQuiet]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={[styles.recoveryBtnText, styles.recoveryBtnTextQuiet]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (unavailable) {
    // ITEM H: availability, stated as availability. Their history with this
    // client is untouched and still reachable — only NEW bookings are closed —
    // and nothing here is a verification claim or a judgement of the provider.
    return (
      <View style={styles.root}>
        <View style={styles.centerBody}>
          <Text style={styles.title}>Not currently available for new bookings</Text>
          <Text style={styles.bodyText}>
            This provider is not taking new bookings right now. Any bookings and
            messages you already have with them are unaffected.
          </Text>
          <TouchableOpacity
            style={[styles.recoveryBtn, styles.recoveryBtnQuiet]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={[styles.recoveryBtnText, styles.recoveryBtnTextQuiet]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  if (loadError) {
    // Contract lookup failed technically — do not silently skip signing.
    return (
      <View style={styles.root}>
        <View style={styles.centerBody}>
          <Text style={styles.title}>Could not load the agreement</Text>
          <Text style={styles.bodyText}>
            We could not load this service agreement. Please check your connection
            and try again before continuing.
          </Text>
          {/* These two are the ONLY way out of a gate that now deliberately
              refuses to advance, so they have to be real buttons. They were built
              from `iconBtn` (a 36x36 circle) and `headerTitle` (a 17pt centred
              label) — a tap target smaller than the words inside it. The gate was
              unreachable before this correction, so the state had never rendered
              for anyone. */}
          <TouchableOpacity style={styles.recoveryBtn} onPress={retryLoad} activeOpacity={0.85}>
            <Text style={styles.recoveryBtnText}>Try again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.recoveryBtn, styles.recoveryBtnQuiet]}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={[styles.recoveryBtnText, styles.recoveryBtnTextQuiet]}>Go back</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Service Agreement</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}
        scrollEventThrottle={16}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height
          if (contract?.contractType !== 'pdf') noteBodyScroll(0)
        }}
        onContentSizeChange={(_w, h) => {
          bodyHeight.current = h
          if (contract?.contractType !== 'pdf') noteBodyScroll(0)
        }}
        onScroll={(e) => {
          if (contract?.contractType !== 'pdf') noteBodyScroll(e.nativeEvent.contentOffset.y)
        }}
      >
        <Text style={styles.title}>{contract?.title}</Text>

        {contract?.contractType === 'pdf' ? (
          <View style={styles.pdfBlock}>
            {/* Was "You must read the full contract before signing." — a rule the
                app could not enforce and did not check. What it can require, and
                now does, is that the contract be OPENED. */}
            <Text style={styles.pdfHint}>
              {opened
                ? 'Take your time — you can reopen the contract as often as you like.'
                : 'Open the contract to read it. You can sign once you have opened it.'}
            </Text>
            <TouchableOpacity
              style={styles.readBtn}
              activeOpacity={0.85}
              onPress={() => {
                if (contract?.pdfUrl) {
                  setOpened(true)
                  router.push({
                    pathname: '/contracts/pdf-viewer',
                    params: { url: contract.pdfUrl },
                  } as never)
                }
              }}
            >
              <Feather name="file-text" size={16} color="#080808" />
              <Text style={styles.readBtnText}>
                {opened ? 'Reopen Contract' : 'Read Contract'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.bodyText}>{contract?.body}</Text>
        )}

        {/* Signature placeholder — the real finger-drawn canvas (react-native-skia)
            requires an EAS development build and is swapped in later. */}
        <Text style={styles.sigLabel}>YOUR SIGNATURE</Text>
        <View style={styles.sigBox}>
          {signed ? (
            <View style={styles.sigSignedRow}>
              <Feather name="check-circle" size={18} color="#4CAF50" />
              <Text style={styles.sigSignedText}>Signed</Text>
            </View>
          ) : (
            <>
              <Feather name="edit-3" size={20} color="rgba(240,232,213,0.25)" />
              <Text style={styles.sigPlaceholderText}>
                Signature canvas — requires development build
              </Text>
              <TouchableOpacity
                style={[styles.sigSimBtn, !opened && styles.sigSimBtnInactive]}
                activeOpacity={0.85}
                disabled={!opened}
                onPress={() => setSigned(true)}
              >
                <Text style={[styles.sigSimBtnText, !opened && styles.sigSimBtnTextInactive]}>
                  Sign
                </Text>
              </TouchableOpacity>
              {!opened ? (
                <Text style={styles.sigGateText}>
                  {contract?.contractType === 'pdf'
                    ? 'Open the contract above first.'
                    : 'Scroll to the end of the agreement first.'}
                </Text>
              ) : null}
            </>
          )}
        </View>

        <Pressable style={styles.checkboxRow} onPress={() => setAgreed((v) => !v)}>
          <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
            {agreed ? <Feather name="check" size={13} color="#080808" /> : null}
          </View>
          <Text style={styles.checkboxText}>
            I agree to the terms of this service agreement.
          </Text>
        </Pressable>

        {/* ITEM I. The gate above is real: the contract must be opened before the
            Sign control activates. This line exists so the product does not imply
            more than that. The Book checks that the agreement was opened; it
            cannot and does not verify that every word was read, and the ticked
            box is the client's own statement rather than something the app
            proved. Saying so plainly is the difference between a real gate and a
            trust claim we cannot support. */}
        <Text style={styles.gateNote}>
          The Book records that you opened this agreement and agreed to it. It
          does not verify that you read every word.
        </Text>
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity style={styles.declineBtn} activeOpacity={0.8} onPress={decline}>
          <Text style={styles.declineText}>Decline</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.continueBtn, (!agreed || !signed || !opened) && styles.continueBtnInactive]}
          activeOpacity={0.85}
          onPress={signAndContinue}
          disabled={!agreed || !signed || !opened}
        >
          <Text
            style={[
              styles.continueText,
              (!agreed || !signed || !opened) && styles.continueTextInactive,
            ]}
          >
            Sign and Continue
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  recoveryBtn: {
    marginTop: 16,
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  recoveryBtnQuiet: {
    marginTop: 10,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.2)',
  },
  recoveryBtnText: {
    fontSize: 15,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  recoveryBtnTextQuiet: {
    color: '#F0E8D5',
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 22, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginBottom: 14 },
  bodyText: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.85)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 23,
  },
  pdfBlock: { marginTop: 4 },
  pdfHint: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 16,
  },
  readBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
  },
  readBtnText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
  sigLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 10,
  },
  sigBox: {
    minHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(240,232,213,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  sigPlaceholderText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  sigSimBtn: {
    paddingHorizontal: 24,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  sigSimBtnText: { fontSize: 14, color: '#080808', fontFamily: 'Manrope_700Bold' },
  sigSimBtnInactive: { backgroundColor: 'rgba(240,232,213,0.1)' },
  sigSimBtnTextInactive: { color: 'rgba(240,232,213,0.3)' },
  sigGateText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  gateNote: {
    marginTop: 12,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },
  sigSignedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sigSignedText: { fontSize: 15, color: '#4CAF50', fontFamily: 'Manrope_700Bold' },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 24 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxChecked: { backgroundColor: '#C8922A', borderColor: '#C8922A' },
  checkboxText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(240,232,213,0.8)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  cta: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  declineBtn: {
    paddingHorizontal: 24,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
  },
  declineText: { fontSize: 15, color: 'rgba(240,232,213,0.7)', fontFamily: 'Manrope_600SemiBold' },
  continueBtn: {
    flex: 1,
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  continueBtnInactive: { backgroundColor: 'rgba(240,232,213,0.1)' },
  continueText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
  continueTextInactive: { color: 'rgba(240,232,213,0.3)' },
})
