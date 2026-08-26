import { useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_POLICY,
  PolicyDisplay,
  policyToDisplay,
  rowsToPolicy,
} from '@/lib/policy'

export default function BookPolicy() {
  const insets = useSafeAreaInsets()
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
  } = useBookingStore()

  // Show the REAL policy for this provider. If they somehow have no row, fall
  // back to the explicit defaults — never invent terms the client then agrees
  // to. Defaults render immediately; the fetch replaces them if a row exists.
  const [policy, setPolicy] = useState<PolicyDisplay>(policyToDisplay(DEFAULT_POLICY))
  useEffect(() => {
    let cancelled = false
    if (!providerId) return
    ;(async () => {
      // Policy spans two tables: provider_policies (fees/reschedule/travel) and
      // provider_booking_preferences (cancellation window + grace).
      const [policiesRes, prefsRes] = await Promise.all([
        supabase.from('provider_policies').select('*').eq('provider_id', providerId).maybeSingle(),
        supabase
          .from('provider_booking_preferences')
          .select('cancellation_window_hours, lateness_grace_minutes')
          .eq('provider_id', providerId)
          .maybeSingle(),
      ])
      if (cancelled) return
      if (!policiesRes.data && !prefsRes.data) return // keep explicit defaults
      setPolicy(
        policyToDisplay(
          rowsToPolicy((policiesRes.data as any) ?? null, (prefsRes.data as any) ?? null),
        ),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [providerId])

  const servicePrice = selectedService?.price ?? '$145'

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
        <Text style={styles.topBarTitle}>Review Policy</Text>
        <View style={styles.topBarSpacer} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* Booking summary card */}
        <View style={styles.summaryCard}>
          {/* Provider row */}
          <View style={styles.summaryProviderRow}>
            <View style={styles.providerAvatar}>
              <Feather name="user" size={16} color="rgba(240,232,213,0.4)" />
            </View>
            <View>
              <Text style={styles.providerName}>{providerName}</Text>
              <Text style={styles.providerMeta}>{providerCategory}</Text>
            </View>
          </View>

          <View style={styles.cardSeparator} />

          {/* Detail rows */}
          <View style={styles.detailRow}>
            <View style={styles.detailLeft}>
              <Feather name="scissors" size={12} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>Service</Text>
            </View>
            <Text style={styles.detailValue}>{selectedService?.name ?? 'Classic Full Set'}</Text>
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

          <View style={styles.cardSeparator} />

          {/* Price breakdown */}
          <View style={styles.priceRow}>
            <Text style={styles.priceLabel}>Service price</Text>
            <Text style={styles.priceValue}>{servicePrice}.00</Text>
          </View>
        </View>

        {/* Policy sections */}
        <View style={styles.policySections}>

          {/* Cancellation — real terms for this provider */}
          <Text style={styles.sectionLabel}>CANCELLATION POLICY</Text>
          <View style={[styles.policyCard, styles.policyCardGap]}>
            <PolicyLine tone="ok" text={policy.cancellation.free} />
            {policy.cancellation.fee && (
              <PolicyLine tone="warn" text={policy.cancellation.fee} />
            )}
            {policy.cancellation.noShow && (
              <PolicyLine tone="bad" text={policy.cancellation.noShow} />
            )}
          </View>

          {/* Reschedule */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>RESCHEDULE POLICY</Text>
          <View style={[styles.policyCard, styles.policyCardGap]}>
            <PolicyLine tone="ok" text={policy.reschedule.window} />
            {policy.reschedule.limit && (
              <PolicyLine tone="warn" text={policy.reschedule.limit} />
            )}
            {policy.reschedule.fee && (
              <PolicyLine tone="warn" text={policy.reschedule.fee} />
            )}
          </View>

          {/* Late arrival */}
          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>LATE ARRIVAL</Text>
          <View style={styles.policyCard}>
            <PolicyLine tone="clock" text={policy.grace} />
          </View>

          {/* Agree checkbox */}
          <TouchableOpacity
            style={[styles.checkboxRow, styles.checkboxRowTop]}
            activeOpacity={0.7}
            onPress={() => setAgreedToPolicy(!agreedToPolicy)}
          >
            <View style={[styles.checkbox, agreedToPolicy && styles.checkboxChecked]}>
              {agreedToPolicy && <Feather name="check" size={13} color="#080808" />}
            </View>
            <Text style={styles.checkboxText}>
              I have read and agree to the provider's cancellation and reschedule policies.
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.continueBtn, !agreedToPolicy && styles.continueBtnInactive]}
          onPress={() => agreedToPolicy && router.push('/book/contract')}
        >
          <Text style={[styles.continueBtnText, !agreedToPolicy && styles.continueBtnTextInactive]}>
            Send Request
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const POLICY_TONES = {
  ok: { icon: 'check-circle' as const, color: '#4CAF50' },
  warn: { icon: 'alert-circle' as const, color: '#C8922A' },
  bad: { icon: 'x-circle' as const, color: '#E05C5C' },
  clock: { icon: 'clock' as const, color: '#C8922A' },
}

function PolicyLine({
  tone,
  text,
}: {
  tone: keyof typeof POLICY_TONES
  text: string
}) {
  const { icon, color } = POLICY_TONES[tone]
  return (
    <View style={[styles.policyRow, { marginBottom: 0 }]}>
      <Feather name={icon} size={13} color={color} />
      <Text style={styles.policyText}>{text}</Text>
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
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
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
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
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
  cardSeparator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.07)',
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
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  detailValue: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  priceLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  priceValue: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  policySections: {
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
    marginBottom: 10,
  },
  policyCard: {
    backgroundColor: 'rgba(240,232,213,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.06)',
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
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 4,
    marginBottom: 8,
  },
  checkboxRowTop: {
    marginTop: 16,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.25)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: '#F0E8D5',
    borderColor: '#F0E8D5',
  },
  checkboxText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(240,232,213,0.65)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
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
  continueBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  continueBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  continueBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
})
