import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type PayoutMethod = 'debit' | 'bank'
type PayoutSchedule = 'each' | 'weekly' | 'monthly'
type AccountType = 'checking' | 'savings'

const SCHEDULE_OPTIONS: { key: PayoutSchedule; label: string; sub: string }[] = [
  { key: 'each',    label: 'After each', sub: 'Per appointment' },
  { key: 'weekly',  label: 'Weekly',     sub: 'Every Monday' },
  { key: 'monthly', label: 'Monthly',    sub: '1st of month' },
]

function formatCardNumber(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16)
  return digits.replace(/(.{4})/g, '$1 ').trim()
}

function formatExpiry(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4)
  if (digits.length >= 3) return digits.slice(0, 2) + ' / ' + digits.slice(2)
  return digits
}

export default function ProviderPayout() {
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)

  const [payoutMethod, setPayoutMethod] = useState<PayoutMethod>('debit')
  const [payoutSchedule, setPayoutSchedule] = useState<PayoutSchedule>('weekly')

  // Debit card fields
  const [cardNumber, setCardNumber] = useState('')
  const [cardExpiry, setCardExpiry] = useState('')
  const [cardCvv, setCardCvv] = useState('')
  const [cardName, setCardName] = useState('')

  // Bank fields
  const [routingNumber, setRoutingNumber] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [accountType, setAccountType] = useState<AccountType>('checking')

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    }, 0)
    return () => clearTimeout(t)
  }, [])

  function navigate() {
    // SECURITY: Do not wire to any API.
    // Replace entire screen with Stripe Connect CardField before launch.
    // Raw PAN/CVV must never be transmitted.
    router.push('/onboarding/provider/golive')
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Progress bar — 87.5% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarLabel}>Get paid</Text>
        <Text style={styles.topBarStep}>Step 7 of 8</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <Text style={styles.headline}>Get paid for your work.</Text>
        <Text style={styles.subtext}>
          Choose how you want to receive your earnings after each appointment.
        </Text>

        {/* Payout timing note */}
        <View style={styles.timingNote}>
          <Feather name="zap" size={14} color="#C8922A" style={{ marginTop: 2 }} />
          <Text style={styles.timingText}>
            Payouts are released automatically after your client confirms the appointment is complete.
          </Text>
        </View>

        {/* ── PAYOUT METHOD ── */}
        <Text style={styles.sectionLabel}>HOW DO YOU WANT TO GET PAID</Text>

        <View style={styles.methodCards}>
          <MethodCard
            icon="credit-card"
            name="Debit Card"
            speed="Instant payout available"
            tags={['Instant transfer', '1.5% instant fee', 'Free next day']}
            selected={payoutMethod === 'debit'}
            onPress={() => setPayoutMethod('debit')}
          />
          <MethodCard
            icon="database"
            name="Bank Account"
            speed="1-2 business days"
            tags={['Free transfers', 'ACH direct deposit', 'Most reliable']}
            selected={payoutMethod === 'bank'}
            onPress={() => setPayoutMethod('bank')}
          />
        </View>

        {/* ── PAYOUT SCHEDULE ── */}
        <Text style={styles.sectionLabel}>PAYOUT SCHEDULE</Text>
        <View style={styles.schedulePills}>
          {SCHEDULE_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              style={[styles.schedulePill, payoutSchedule === opt.key && styles.schedulePillActive]}
              onPress={() => setPayoutSchedule(opt.key)}
            >
              <Text style={[styles.schedulePillLabel, payoutSchedule === opt.key && styles.schedulePillLabelActive]}>
                {opt.label}
              </Text>
              <Text style={[styles.schedulePillSub, payoutSchedule === opt.key && styles.schedulePillSubActive]}>
                {opt.sub}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── ACCOUNT DETAILS ── */}
        <Text style={[styles.sectionLabel, { marginTop: 4 }]}>ACCOUNT DETAILS</Text>

        {payoutMethod === 'debit' ? (
          <View style={styles.fields}>
            {/* Card number */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>CARD NUMBER</Text>
              <View style={styles.inputRow}>
                <Feather name="credit-card" size={18} color="rgba(240,232,213,0.3)" />
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  value={cardNumber}
                  onChangeText={(t) => setCardNumber(formatCardNumber(t))}
                  keyboardType="number-pad"
                  maxLength={19}
                  placeholder="0000 0000 0000 0000"
                  placeholderTextColor="rgba(240,232,213,0.25)"
                />
              </View>
            </View>

            {/* Expiry + CVV */}
            <View style={styles.twoCol}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>EXPIRY</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    value={cardExpiry}
                    onChangeText={(t) => setCardExpiry(formatExpiry(t))}
                    keyboardType="number-pad"
                    maxLength={7}
                    placeholder="MM / YY"
                    placeholderTextColor="rgba(240,232,213,0.25)"
                  />
                </View>
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>CVV</Text>
                <View style={styles.inputBox}>
                  <TextInput
                    style={styles.input}
                    value={cardCvv}
                    onChangeText={setCardCvv}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder="•••"
                    placeholderTextColor="rgba(240,232,213,0.25)"
                    secureTextEntry
                  />
                </View>
              </View>
            </View>

            {/* Name on card */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>NAME ON CARD</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  value={cardName}
                  onChangeText={setCardName}
                  placeholder="Marcus Johnson"
                  placeholderTextColor="rgba(240,232,213,0.25)"
                  autoCapitalize="words"
                />
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.fields}>
            {/* Routing */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ROUTING NUMBER</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  value={routingNumber}
                  onChangeText={setRoutingNumber}
                  keyboardType="number-pad"
                  maxLength={9}
                  placeholder="021000021"
                  placeholderTextColor="rgba(240,232,213,0.25)"
                />
              </View>
            </View>

            {/* Account number */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ACCOUNT NUMBER</Text>
              <View style={styles.inputBox}>
                <TextInput
                  style={styles.input}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  keyboardType="number-pad"
                  placeholder="••••••••••"
                  placeholderTextColor="rgba(240,232,213,0.25)"
                  secureTextEntry
                />
              </View>
            </View>

            {/* Account type */}
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>ACCOUNT TYPE</Text>
              <View style={styles.twoCol}>
                {(['checking', 'savings'] as AccountType[]).map((t) => (
                  <Pressable
                    key={t}
                    style={[styles.typePill, accountType === t && styles.typePillActive, { flex: 1 }]}
                    onPress={() => setAccountType(t)}
                  >
                    <Text style={[styles.typePillText, accountType === t && styles.typePillTextActive]}>
                      {t.charAt(0).toUpperCase() + t.slice(1)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Beta note */}
        <View style={styles.betaNote}>
          <Feather name="info" size={14} color="#C8922A" style={{ marginTop: 2 }} />
          <Text style={styles.betaText}>
            During beta, payouts are processed manually within 24 hours of appointment completion. Stripe Connect launches with the full release.
          </Text>
        </View>

        {/* Security note */}
        <View style={styles.securityNote}>
          <Feather name="shield" size={13} color="rgba(240,232,213,0.25)" style={{ marginTop: 1 }} />
          <Text style={styles.securityText}>
            Your banking details are encrypted and never stored on our servers. Powered by Stripe.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.continueBtn} onPress={navigate}>
          <Text style={styles.continueBtnText}>Connect & Continue</Text>
        </Pressable>
        <TouchableOpacity activeOpacity={0.6} onPress={navigate} style={styles.skipWrap}>
          <Text style={styles.skipText}>Set up later in dashboard</Text>
        </TouchableOpacity>
        <Text style={styles.skipNote}>
          You must add payout details before receiving your first payment.
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}

function MethodCard({
  icon,
  name,
  speed,
  tags,
  selected,
  onPress,
}: {
  icon: string
  name: string
  speed: string
  tags: string[]
  selected: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.methodCard, selected && styles.methodCardSelected]}
      onPress={onPress}
    >
      <View style={styles.methodCardTop}>
        <View style={styles.methodLeft}>
          <View style={styles.methodIconBox}>
            <Feather name={icon as any} size={20} color="rgba(240,232,213,0.6)" />
          </View>
          <View>
            <Text style={styles.methodName}>{name}</Text>
            <Text style={styles.methodSpeed}>{speed}</Text>
          </View>
        </View>
        <View style={[styles.radioCircle, selected && styles.radioCircleActive]}>
          {selected && <View style={styles.radioDot} />}
        </View>
      </View>
      <View style={styles.tagRow}>
        {tags.map((tag) => (
          <View key={tag} style={styles.tag}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
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
    width: '87.5%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 36,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 8,
  },
  timingNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 32,
  },
  timingText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 14,
  },

  // Method cards
  methodCards: {
    gap: 10,
    marginBottom: 28,
  },
  methodCard: {
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(240,232,213,0.03)',
    borderColor: 'rgba(240,232,213,0.07)',
  },
  methodCardSelected: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderColor: 'rgba(240,232,213,0.2)',
  },
  methodCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  methodLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  methodIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  methodSpeed: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#F0E8D5',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F0E8D5',
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
    marginTop: 12,
  },
  tag: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },

  // Schedule pills
  schedulePills: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 28,
  },
  schedulePill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    borderColor: 'rgba(240,232,213,0.08)',
    backgroundColor: 'transparent',
  },
  schedulePillActive: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.25)',
  },
  schedulePillLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  schedulePillLabelActive: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  schedulePillSub: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  schedulePillSubActive: {
    color: 'rgba(240,232,213,0.5)',
  },

  // Account fields
  fields: {
    gap: 16,
    marginBottom: 16,
  },
  fieldGroup: {
    gap: 0,
  },
  fieldLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputBox: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  inputRow: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
  },
  twoCol: {
    flexDirection: 'row',
    gap: 10,
  },
  typePill: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    borderColor: 'rgba(240,232,213,0.08)',
    backgroundColor: 'transparent',
  },
  typePillActive: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.25)',
  },
  typePillText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  typePillTextActive: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Beta note
  betaNote: {
    padding: 14,
    backgroundColor: 'rgba(200,146,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.15)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 16,
  },
  betaText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },

  // Security note
  securityNote: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  securityText: {
    flex: 1,
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
  },

  // CTA
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
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  skipWrap: {
    alignItems: 'center',
    marginTop: 10,
  },
  skipText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  skipNote: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
})
