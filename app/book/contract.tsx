import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import { useBookingStore } from '@/store/bookingStore'
import { bookingProgressLabel } from '@/lib/bookingProgress'
import { useTheme } from '@/context/ThemeContext'
import BookingFlowScreen, { BookingFlowHeading } from '@/components/ui/BookingFlowScreen'
import Button from '@/components/ui/Button'
import AcknowledgeRow from '@/components/ui/AcknowledgeRow'
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
  const { colors } = useTheme()
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
    contractRequired,
  setContractRequired,
} = useBookingStore()

  const [contract, setContract] = useState<Contract | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [unavailable, setUnavailable] = useState(false)
  const [blocked, setBlocked] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [agreed, setAgreed] = useState(false)
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
          // The step count is now SETTLED, and settling it is what lets the
          // progress indicator state a total instead of a bare step number. This
          // is the earliest point it can be known: the safe read is keyed on a
          // booking, and the booking is created just above.
          setContractRequired(false)
          router.replace('/book/payment')
          return
        }
        setContractRequired(true)
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

  function acceptAndContinue() {
    if (!agreed || !opened || !contract) return
    // Capture the acceptance AND THE EXACT VERSION on screen. The row is written
    // in book/payment.tsx once the booking id exists; binding the version here
    // rather than there means a provider editing their contract in between
    // cannot bind the acceptance to a document this client never saw.
    setContractSigned(contract.id, contract.currentVersionId ?? null)
    router.push('/book/payment')
  }

  function decline() {
    // Pre-booking, there is no acceptance row to mark declined; simply back out
    // to reconsider. The booking has not been created yet.
    router.back()
  }

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
        <View style={styles.centerBody}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </View>
    )
  }

  if (blocked) {
    // Permanent, and says so. No "try again": the write was refused, not lost.
    return (
      <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
        <View style={styles.centerBody}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>We could not start this request</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
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
      <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
        <View style={styles.centerBody}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Not currently available for new bookings</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
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
      <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
        <View style={styles.centerBody}>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Could not load the agreement</Text>
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>
            We could not load this service agreement. Please check your connection
            and try again before continuing.
          </Text>
          {/* These two are the ONLY way out of a gate that now deliberately
              refuses to advance, so they have to be real buttons. They were built
              from `iconBtn` (a 36x36 circle) and `headerTitle` (a 17pt centred
              label) — a tap target smaller than the words inside it. The gate was
              unreachable before this correction, so the state had never rendered
              for anyone. */}
          <TouchableOpacity style={[styles.recoveryBtn, { backgroundColor: colors.actionPrimary }]} onPress={retryLoad} activeOpacity={0.85}>
            <Text style={[styles.recoveryBtnText, { color: colors.textOnAction }]}>Try again</Text>
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
    <BookingFlowScreen
      progressLabel={bookingProgressLabel('contract', contractRequired)}
      onBack={() => router.back()}
      // The body owns its scroll — the open-before-accept gate depends on it.
      scrollable={false}
      testID="book-contract"
      footer={
        <>
          <Button
            label="Accept and continue"
            // The open-gate is REAL and unchanged: the agreement must be opened
            // before this activates.
            disabled={!agreed || !opened}
            onPress={acceptAndContinue}
            testID="contract-accept"
          />
          <Button label="Decline" variant="secondary" onPress={decline} testID="contract-decline" />
        </>
      }
    >
      <BookingFlowHeading
        title="Service agreement"
        subtitle="Read it, then accept to continue."
      />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 8 }}
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
        <Text style={[styles.title, { color: colors.textPrimary }]}>{contract?.title}</Text>

        {contract?.contractType === 'pdf' ? (
          <View style={[styles.pdfBlock, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
            {/* Was "You must read the full contract before signing." — a rule the
                app could not enforce and did not check. What it can require, and
                now does, is that the contract be OPENED. */}
            <Text style={styles.pdfHint}>
              {opened
                ? 'Take your time — you can reopen the contract as often as you like.'
                : 'Open the contract to read it. You can sign once you have opened it.'}
            </Text>
            <TouchableOpacity
              style={[styles.readBtn, { backgroundColor: colors.actionPrimary }]}
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
              <Feather name="file-text" size={16} color={colors.textOnAction} />
              <Text style={[styles.readBtnText, { color: colors.textOnAction }]}>
                {opened ? 'Reopen Contract' : 'Read Contract'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={[styles.bodyText, { color: colors.textSecondary }]}>{contract?.body}</Text>
        )}

        {/* THE FAKE SIGNATURE CANVAS IS GONE.
            It rendered "Signature canvas — requires development build" beside a
            button labelled "Sign", and produced a `signature_url` of null. So it
            showed the client a broken-looking placeholder, asked them to sign
            into it, and recorded no signature — a control that looked like
            evidence and was not.

            What replaces it is what the record actually holds: an explicit
            ACCEPTANCE of a specific document version. That is a real thing, it
            is durable, and it does not pretend to be a signature. */}
        {/* The same acknowledge shape the policy step uses. Ticking it is an
            acceptance of a specific document VERSION — it is not a signature, and
            the versioning, stale-version refusal and durable record are unchanged. */}
        <AcknowledgeRow
          label="I accept the terms of this service agreement."
          checked={agreed}
          onToggle={() => setAgreed((v) => !v)}
          testID="contract-acknowledge"
        />

        {/* ITEM I. The gate above is real: the contract must be opened before the
            Sign control activates. This line exists so the product does not imply
            more than that. The Book checks that the agreement was opened; it
            cannot and does not verify that every word was read, and the ticked
            box is the client's own statement rather than something the app
            proved. Saying so plainly is the difference between a real gate and a
            trust claim we cannot support. */}
        {/* WHAT THE RECORD CLAIMS, AND ITS LIMITS, IN THE SAME BREATH.
            The gate above is real — the agreement must be opened before this
            activates. Everything else here is a limit, and they are stated
            rather than implied because the beta positioning is explicit: this is
            durable document acceptance and NOT DocuSign-equivalent
            infrastructure, NOT a verified legal e-signature, and NOT a claim of
            enforceability. */}
        <Text style={[styles.gateNote, { color: colors.textSecondary }]}>
          Third records that you opened this agreement, which version you accepted,
          and when. It does not verify that you read every word, and it is not a
          witnessed or legally certified signature.
        </Text>
      </ScrollView>

    </BookingFlowScreen>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: 'Manrope_800ExtraBold', textAlign: 'center' },
  bodyText: { fontSize: 15, lineHeight: 22, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  recoveryBtn: {
    marginTop: 16,
    alignSelf: 'stretch',
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  recoveryBtnQuiet: {
    marginTop: 10,
    borderWidth: 1,
  },
  recoveryBtnText: {
    fontSize: 15,
    fontFamily: 'Manrope_700Bold',
  },
  recoveryBtnTextQuiet: {
  },
  pdfBlock: { marginTop: 4 },
  pdfHint: {
    fontSize: 14,
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
  },
  readBtnText: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
  sigLabel: {
    fontSize: 10,
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
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 20,
  },
  sigPlaceholderText: {
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  sigSimBtn: {
    paddingHorizontal: 24,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sigSimBtnText: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  sigGateText: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  gateNote: {
    marginTop: 12,
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },
  sigSignedRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sigSignedText: { fontSize: 15, fontFamily: 'Manrope_700Bold' },
})
