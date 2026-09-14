import { useEffect, useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useBookingStore } from '@/store/bookingStore'
import { bookingProgressLabel } from '@/lib/bookingProgress'
import { useTheme } from '@/context/ThemeContext'
import BookingFlowScreen, { BookingFlowHeading } from '@/components/ui/BookingFlowScreen'
import Button from '@/components/ui/Button'
import AcknowledgeRow from '@/components/ui/AcknowledgeRow'
import { supabase } from '@/lib/supabase'
import {
  NO_PUBLIC_BOOKING_TERMS,
  PublicBookingTerms,
  UNPUBLISHED_TERMS_COPY,
  bookingTermsCopy,
  fetchPublicBookingTerms,
} from '@/lib/publicBookingTerms'
import {
  PolicyDisplay,
  policyToDisplay,
  rowsToPolicy,
} from '@/lib/policy'

export default function BookPolicy() {
  const { colors } = useTheme()
  const {
    providerId,
    providerName,
    providerCategory,
    providerLocation,
    selectedService,
    selectedDate,
    selectedTime,
    agreedToPolicy,
    setAgreedToPolicy,
    contractRequired,
} = useBookingStore()

  // ── THE CANCELLATION WINDOW AND GRACE ARE READ SEPARATELY, ON PURPOSE ──
  //
  // They used to come from a direct read of `provider_booking_preferences`,
  // which is OWNER-ONLY: for a client it returned zero rows and no error, the
  // guard below did not fire because `provider_policies` DID return, and
  // `rowsToPolicy` substituted `DEFAULT_POLICY`. The client was shown a constant
  // beside that provider's real terms, in the same list and the same type, and
  // then ticked a box agreeing to it. The substitution was not even
  // self-consistent — the column default for grace is 60 minutes and
  // DEFAULT_POLICY says 15.
  //
  // `provider_public_booking_terms` (20261137000000) returns those two fields and
  // nothing else. NO ROW means the provider has not published them, and that is
  // rendered as "not published" rather than filled in.
  const [policy, setPolicy] = useState<PolicyDisplay | null>(null)
  const [terms, setTerms] = useState<PublicBookingTerms>(NO_PUBLIC_BOOKING_TERMS)
  useEffect(() => {
    let cancelled = false
    if (!providerId) return
    ;(async () => {
      const [policiesRes, publicTerms] = await Promise.all([
        supabase.from('provider_policies').select('*').eq('provider_id', providerId).maybeSingle(),
        fetchPublicBookingTerms(providerId),
      ])
      if (cancelled) return
      setTerms(publicTerms)
      // `rowsToPolicy` still owns the fee / reschedule / travel terms, which ARE
      // client-readable. It is handed null for the prefs row deliberately: those
      // two fields no longer come from here, so its defaults cannot reach the
      // screen through the back door.
      if (policiesRes.data) {
        setPolicy(policyToDisplay(rowsToPolicy(policiesRes.data as any, null)))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [providerId])

  const termsCopy = bookingTermsCopy(terms)
  // The fee line names the window it applies within, so it cannot be stated
  // while the window is unpublished — it would smuggle the default back in as
  // part of a sentence about money.
  const cancellationFeeLine =
    terms.cancellationWindowHours == null ? null : policy?.cancellation.fee ?? null

  const servicePrice = selectedService?.price ?? '$145'

  return (
    <BookingFlowScreen
      progressLabel={bookingProgressLabel('policy', contractRequired)}
      onBack={() => router.back()}
      testID="book-policy"
      footer={
        /* CTA TRUTH: this said "Send Request" and navigated to the CONTRACT
           screen. Nothing was sent, and two more steps stood between here and
           sending. The only control that may say a request is being sent is the
           one that sends it. */
        <Button
          label="Continue to agreement"
          disabled={!agreedToPolicy}
          onPress={() => agreedToPolicy && router.push('/book/contract')}
          testID="policy-continue"
        />
      }
    >
      <BookingFlowHeading
        title="Review the policy"
        subtitle={`These are ${providerName}'s terms for this booking.`}
      />
      <>
        {/* Booking summary card */}
        <View style={[styles.summaryCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
          {/* Provider row */}
          <View style={styles.summaryProviderRow}>
            <View style={[styles.providerAvatar, { backgroundColor: colors.bgSubtle }]}>
              <Feather name="user" size={16} color={colors.textSecondary} />
            </View>
            <View>
              <Text style={[styles.providerName, { color: colors.textPrimary }]}>{providerName}</Text>
              <Text style={[styles.providerMeta, { color: colors.textSecondary }]}>{providerCategory}</Text>
            </View>
          </View>

          <View style={[styles.cardSeparator, { backgroundColor: colors.borderSubtle }]} />

          {/* Detail rows */}
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Feather name="scissors" size={12} color={colors.textSecondary} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Service</Text>
            </View>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{selectedService?.name ?? 'Classic Full Set'}</Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Feather name="calendar" size={12} color={colors.textSecondary} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Date</Text>
            </View>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{selectedDate || 'May 28, 2026'}</Text>
          </View>
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Feather name="clock" size={12} color={colors.textSecondary} />
              <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>Time</Text>
            </View>
            <Text style={[styles.detailValue, { color: colors.textPrimary }]}>{selectedTime || '1:00 PM'}</Text>
          </View>

          <View style={[styles.cardSeparator, { backgroundColor: colors.borderSubtle }]} />

          {/* Price breakdown */}
          <View style={styles.priceRow}>
            <Text style={[styles.priceLabel, { color: colors.textSecondary }]}>Service price</Text>
            <Text style={[styles.priceValue, { color: colors.textPrimary }]}>{servicePrice}.00</Text>
          </View>
        </View>

        {/* Policy sections */}
        <View style={styles.policySections}>

          {/* Cancellation — real terms for this provider */}
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CANCELLATION POLICY</Text>
          <View style={[styles.policyCard, styles.policyCardGap]}>
            {termsCopy.cancellation ? (
              <PolicyLine tone="ok" text={termsCopy.cancellation} />
            ) : (
              <PolicyLine tone="clock" text={UNPUBLISHED_TERMS_COPY.cancellation} />
            )}
            {cancellationFeeLine && <PolicyLine tone="warn" text={cancellationFeeLine} />}
            {policy?.cancellation.noShow && (
              <PolicyLine tone="bad" text={policy.cancellation.noShow} />
            )}
          </View>

          {/* Reschedule */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>RESCHEDULE POLICY</Text>
          <View style={[styles.policyCard, styles.policyCardGap]}>
            {policy ? (
              <PolicyLine tone="ok" text={policy.reschedule.window} />
            ) : (
              <PolicyLine tone="clock" text="Reschedule terms not published" />
            )}
            {policy?.reschedule.limit && (
              <PolicyLine tone="warn" text={policy.reschedule.limit} />
            )}
            {policy?.reschedule.fee && (
              <PolicyLine tone="warn" text={policy.reschedule.fee} />
            )}
          </View>

          {/* Late arrival */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>LATE ARRIVAL</Text>
          <View style={[styles.policyCard, { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle }]}>
            {termsCopy.grace ? (
              <PolicyLine tone="clock" text={termsCopy.grace} />
            ) : (
              <PolicyLine tone="clock" text={UNPUBLISHED_TERMS_COPY.grace} />
            )}
          </View>

          {/* Said ONCE, and only when something is actually missing. */}
          {(!termsCopy.cancellation || !termsCopy.grace) && (
            <Text style={[styles.feeNote, { color: colors.textSecondary }]}>
              {UNPUBLISHED_TERMS_COPY.hint}
            </Text>
          )}

          {/* PRODUCT TRUTH: these are the PROVIDER's terms, and a client is about
              to tick a box agreeing to them — including percentages. Third takes
              no payment in this beta (PD-042), so it can neither charge nor
              enforce any of it. The terms are shown unchanged — they are the
              provider's to set and a client's to know — but the screen does not
              let a percentage imply the platform will collect it.

              Every line here now comes from a row that actually exists. A
              provider with no `provider_policies` row renders NO fee or
              reschedule lines rather than the platform defaults, for the same
              reason the cancellation window is not filled in: a default
              presented as this provider's term is a claim about them that
              nobody made. */}
          <Text style={[styles.feeNote, { color: colors.textSecondary }]}>
            Third does not take payment or collect these fees. Anything owed is
            settled directly with your provider.
          </Text>

          {/* The shared acknowledge shape — the same control the contract step
              uses, because the client is asked the same thing in both. */}
          <AcknowledgeRow
            label="I have read and agree to the provider's cancellation and reschedule policies."
            checked={agreedToPolicy}
            onToggle={() => setAgreedToPolicy(!agreedToPolicy)}
            testID="policy-acknowledge"
          />
        </View>
      </>
    </BookingFlowScreen>
  )
}

// ── WHY THESE ARE NOT STATUS COLOURS ─────────────────────────────────────
//
// A policy line is a TERM, not a booking outcome, so none of these borrows the
// danger role — that is reserved for genuine errors and destructive actions, and a
// strict cancellation window is neither. The distinction a client needs is carried
// by the ICON as much as the colour: a tick, an alert, a cross and a clock read
// differently in greyscale and to a screen reader, which colour alone would not.
const POLICY_TONE_ICONS = {
  ok: 'check-circle',
  warn: 'alert-circle',
  bad: 'x-circle',
  clock: 'clock',
} as const

type PolicyTone = keyof typeof POLICY_TONE_ICONS

function PolicyLine({ tone, text }: { tone: PolicyTone; text: string }) {
  const { colors } = useTheme()
  const icon = POLICY_TONE_ICONS[tone]
  // `ok` is the only line that earns the truthful-status colour. Everything else
  // stays neutral and leans on its icon.
  const tint = tone === 'ok' ? colors.statusLocal : colors.textSecondary
  return (
    <View style={[styles.policyRow, { marginBottom: 0 }]}>
      <Feather name={icon} size={13} color={tint} />
      <Text style={[styles.policyText, { color: colors.textPrimary }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
  },
  summaryProviderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  providerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerName: {
    fontSize: 14,
    fontFamily: 'Manrope_600SemiBold',
  },
  providerMeta: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  cardSeparator: {
    height: 1,
    marginVertical: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
  },
  detailValue: {
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  priceLabel: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
  },
  priceValue: {
    fontSize: 13,
    fontFamily: 'Manrope_500Medium',
  },
  policySections: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  policyCard: {
    borderWidth: 1,
    borderRadius: 12,
    borderCurve: 'continuous',
    padding: 14,
  },
  policyCardGap: {
    gap: 8,
  },
  policyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  policyText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },
  feeNote: {
    marginTop: 14,
    fontSize: 12,
    lineHeight: 17,
    fontFamily: 'Manrope_400Regular',
  },
})
