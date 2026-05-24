import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// No global store yet — default true so travel section is visible
const IS_MOBILE = true

// --- Dropdown config ---

type DropdownKey =
  | 'cancelWindow'
  | 'rescheduleWindow'
  | 'rescheduleLimit'
  | 'gracePeriod'
  | 'freeRadius'
  | 'maxDistance'

const DROPDOWN_OPTIONS: Record<DropdownKey, string[]> = {
  cancelWindow: [
    '2 hours before',
    '6 hours before',
    '12 hours before',
    '24 hours before',
    '48 hours before',
    '72 hours before',
  ],
  rescheduleWindow: [
    'No reschedules allowed',
    '2 hours before',
    '6 hours before',
    '12 hours before',
    '24 hours before',
    '48 hours before',
    'Anytime',
  ],
  rescheduleLimit: [
    'Once per booking',
    'Twice per booking',
    'Unlimited',
    'No reschedules allowed',
  ],
  gracePeriod: [
    'No grace period',
    '5 minutes',
    '10 minutes',
    '15 minutes',
    '20 minutes',
    '30 minutes',
  ],
  freeRadius: ['1 mile', '3 miles', '5 miles', '10 miles', 'No free radius'],
  maxDistance: ['5 miles', '10 miles', '15 miles', '25 miles', '50 miles', 'No limit'],
}

const DROPDOWN_LABELS: Record<DropdownKey, string> = {
  cancelWindow: 'Free Cancellation Window',
  rescheduleWindow: 'Reschedule Window',
  rescheduleLimit: 'Reschedule Limit',
  gracePeriod: 'Grace Period',
  freeRadius: 'Free Travel Radius',
  maxDistance: 'Max Travel Distance',
}

type TravelFeeType = 'flat' | 'per-mile' | 'free'

export default function ProviderPolicy() {
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)

  // Cancellation
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [cancelWindow, setCancelWindow] = useState('24 hours before')
  const [cancelFee, setCancelFee] = useState('0')
  const [noShowFee, setNoShowFee] = useState('100')

  // Reschedule
  const [rescheduleWindow, setRescheduleWindow] = useState('24 hours before')
  const [rescheduleFeeEnabled, setRescheduleFeeEnabled] = useState(false)
  const [rescheduleFee, setRescheduleFee] = useState('')
  const [rescheduleLimit, setRescheduleLimit] = useState('Once per booking')

  // Late arrival
  const [gracePeriod, setGracePeriod] = useState('15 minutes')

  // Travel
  const [travelFeeType, setTravelFeeType] = useState<TravelFeeType>('per-mile')
  const [travelAmount, setTravelAmount] = useState('')
  const [freeRadius, setFreeRadius] = useState('5 miles')
  const [maxDistance, setMaxDistance] = useState('25 miles')

  // Dropdown sheet
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    }, 0)
    return () => clearTimeout(t)
  }, [])

  function applyPreset(preset: string) {
    if (preset === 'Flexible') {
      setCancelWindow('24 hours before')
      setCancelFee('0')
      setNoShowFee('100')
    } else if (preset === 'Moderate') {
      setCancelWindow('48 hours before')
      setCancelFee('50')
      setNoShowFee('100')
    } else if (preset === 'Strict') {
      setCancelWindow('72 hours before')
      setCancelFee('100')
      setNoShowFee('100')
    }
    setSelectedPreset(preset)
  }

  function getDropdownValue(key: DropdownKey): string {
    switch (key) {
      case 'cancelWindow':    return cancelWindow
      case 'rescheduleWindow': return rescheduleWindow
      case 'rescheduleLimit': return rescheduleLimit
      case 'gracePeriod':     return gracePeriod
      case 'freeRadius':      return freeRadius
      case 'maxDistance':     return maxDistance
    }
  }

  function setDropdownValue(key: DropdownKey, value: string) {
    switch (key) {
      case 'cancelWindow':    setCancelWindow(value); break
      case 'rescheduleWindow': setRescheduleWindow(value); break
      case 'rescheduleLimit': setRescheduleLimit(value); break
      case 'gracePeriod':     setGracePeriod(value); break
      case 'freeRadius':      setFreeRadius(value); break
      case 'maxDistance':     setMaxDistance(value); break
    }
  }

  function navigate() {
    router.push('/onboarding/provider/payout')
  }

  const travelPlaceholder = travelFeeType === 'flat' ? '25' : '1.50'
  const travelHelper = travelFeeType === 'flat' ? 'Per appointment' : 'Per mile traveled'

  return (
    <View style={styles.root}>
      {/* Progress bar — 75% */}
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
        <Text style={styles.topBarLabel}>Your policies</Text>
        <Text style={styles.topBarStep}>Step 6 of 8</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 180 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <Text style={styles.headline}>Protect your time.</Text>
        <Text style={styles.subtext}>
          Set your cancellation and reschedule rules. Clients agree to these before booking you.
        </Text>

        {/* ── SECTION 1: CANCELLATION ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>CANCELLATION POLICY</Text>

          <Text style={styles.presetHint}>Choose a preset or customize below</Text>
          <View style={styles.presetRow}>
            {(['Flexible', 'Moderate', 'Strict'] as const).map((p) => (
              <Pressable
                key={p}
                style={[styles.presetPill, selectedPreset === p && styles.presetPillActive]}
                onPress={() => applyPreset(p)}
              >
                <Text style={[styles.presetText, selectedPreset === p && styles.presetTextActive]}>
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.fieldLabel}>FREE CANCELLATION WINDOW</Text>
          <DropdownField
            value={cancelWindow}
            onPress={() => setActiveDropdown('cancelWindow')}
          />
          <Text style={styles.helper}>Clients cancel free before this time.</Text>

          <View style={styles.fieldGap} />

          <Text style={styles.fieldLabel}>CANCELLATION FEE</Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputPrefix}>$</Text>
            <TextInput
              style={styles.feeInput}
              value={cancelFee}
              onChangeText={(t) => { setCancelFee(t); setSelectedPreset(null) }}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="rgba(240,232,213,0.2)"
            />
          </View>
          <Text style={styles.helper}>Charged if cancelled after the window.</Text>

          <View style={styles.fieldGap} />

          <Text style={styles.fieldLabel}>NO-SHOW FEE</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.feeInput, { flex: 1 }]}
              value={noShowFee}
              onChangeText={(t) => { setNoShowFee(t); setSelectedPreset(null) }}
              keyboardType="decimal-pad"
              placeholder="100"
              placeholderTextColor="rgba(240,232,213,0.2)"
            />
            <Text style={styles.inputSuffix}>%</Text>
          </View>
          <Text style={styles.helper}>Percentage of service price charged if client does not show up.</Text>
        </View>

        {/* ── SECTION 2: RESCHEDULE ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RESCHEDULE POLICY</Text>

          <Text style={styles.fieldLabel}>RESCHEDULE WINDOW</Text>
          <DropdownField
            value={rescheduleWindow}
            onPress={() => setActiveDropdown('rescheduleWindow')}
          />
          <Text style={styles.helper}>How far in advance clients can reschedule for free.</Text>

          <View style={styles.fieldGap} />

          {/* Reschedule fee toggle */}
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Charge a reschedule fee</Text>
              <Text style={styles.toggleSub}>Apply a fee for late reschedules</Text>
            </View>
            <Switch
              value={rescheduleFeeEnabled}
              onValueChange={setRescheduleFeeEnabled}
              trackColor={{ false: 'rgba(240,232,213,0.1)', true: 'rgba(240,232,213,0.35)' }}
              thumbColor={rescheduleFeeEnabled ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
              ios_backgroundColor="rgba(240,232,213,0.1)"
            />
          </View>

          {rescheduleFeeEnabled && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.fieldLabel}>RESCHEDULE FEE</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputPrefix}>$</Text>
                <TextInput
                  style={styles.feeInput}
                  value={rescheduleFee}
                  onChangeText={setRescheduleFee}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor="rgba(240,232,213,0.2)"
                />
              </View>
              <Text style={styles.helper}>Charged when rescheduled within the window.</Text>
            </View>
          )}

          <View style={styles.fieldGap} />

          <Text style={styles.fieldLabel}>RESCHEDULE LIMIT</Text>
          <DropdownField
            value={rescheduleLimit}
            onPress={() => setActiveDropdown('rescheduleLimit')}
          />
          <Text style={styles.helper}>Max times a client can reschedule one appointment.</Text>
        </View>

        {/* ── SECTION 3: LATE ARRIVAL ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LATE ARRIVAL</Text>

          <Text style={styles.fieldLabel}>GRACE PERIOD</Text>
          <DropdownField
            value={gracePeriod}
            onPress={() => setActiveDropdown('gracePeriod')}
          />
          <Text style={styles.helper}>After this time the appointment is considered a no-show.</Text>
        </View>

        {/* ── SECTION 4: TRAVEL FEE ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TRAVEL FEE</Text>

          {!IS_MOBILE ? (
            <Text style={styles.travelDisabled}>
              Enable travel in your profile settings to set travel fees.
            </Text>
          ) : (
            <>
              {/* Fee type radio options */}
              {(
                [
                  { key: 'flat' as TravelFeeType,     label: 'Flat fee',                  desc: 'Same rate every appointment' },
                  { key: 'per-mile' as TravelFeeType, label: 'Per mile',                  desc: 'Rate based on distance' },
                  { key: 'free' as TravelFeeType,     label: 'Free — included in price',  desc: 'No separate travel charge' },
                ] as const
              ).map((opt) => (
                <Pressable
                  key={opt.key}
                  style={[styles.radioRow, travelFeeType === opt.key && styles.radioRowActive]}
                  onPress={() => setTravelFeeType(opt.key)}
                >
                  <View style={[styles.radioCircle, travelFeeType === opt.key && styles.radioCircleActive]}>
                    {travelFeeType === opt.key && <View style={styles.radioDot} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.radioLabel}>{opt.label}</Text>
                    <Text style={styles.radioDesc}>{opt.desc}</Text>
                  </View>
                </Pressable>
              ))}

              {travelFeeType !== 'free' && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.fieldLabel}>TRAVEL FEE</Text>
                  <View style={styles.inputRow}>
                    <Text style={styles.inputPrefix}>$</Text>
                    <TextInput
                      style={styles.feeInput}
                      value={travelAmount}
                      onChangeText={setTravelAmount}
                      keyboardType="decimal-pad"
                      placeholder={travelPlaceholder}
                      placeholderTextColor="rgba(240,232,213,0.2)"
                    />
                  </View>
                  <Text style={styles.helper}>{travelHelper}</Text>
                  <View style={styles.fieldGap} />
                </View>
              )}

              {travelFeeType !== 'free' && (
                <>
                  <Text style={styles.fieldLabel}>FREE TRAVEL RADIUS</Text>
                  <DropdownField
                    value={freeRadius}
                    onPress={() => setActiveDropdown('freeRadius')}
                  />
                  <Text style={styles.helper}>No travel fee within this distance.</Text>
                  <View style={styles.fieldGap} />
                </>
              )}

              <Text style={styles.fieldLabel}>MAX TRAVEL DISTANCE</Text>
              <DropdownField
                value={maxDistance}
                onPress={() => setActiveDropdown('maxDistance')}
              />
              <Text style={styles.helper}>You will not appear in searches beyond this distance.</Text>
            </>
          )}
        </View>

        {/* Legal footnote */}
        <View style={styles.footnoteRow}>
          <Feather name="info" size={14} color="rgba(240,232,213,0.25)" style={{ marginTop: 2 }} />
          <Text style={styles.footnoteText}>
            Policies are legally binding agreements between you and your clients. The Book facilitates fee collection but you are responsible for maintaining fair practice.
          </Text>
        </View>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.continueBtn} onPress={navigate}>
          <Text style={styles.continueBtnText}>Continue</Text>
        </Pressable>
        <TouchableOpacity activeOpacity={0.6} onPress={navigate} style={styles.skipWrap}>
          <Text style={styles.skipText}>Use default policies for now</Text>
        </TouchableOpacity>
        <Text style={styles.skipNote}>You can update policies anytime from your dashboard.</Text>
      </View>

      {/* Dropdown bottom sheet */}
      <Modal
        visible={activeDropdown !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveDropdown(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setActiveDropdown(null)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>
            {activeDropdown ? DROPDOWN_LABELS[activeDropdown] : ''}
          </Text>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {activeDropdown &&
              DROPDOWN_OPTIONS[activeDropdown].map((opt, i, arr) => {
                const isSelected = getDropdownValue(activeDropdown) === opt
                return (
                  <Pressable
                    key={opt}
                    style={[
                      styles.sheetOption,
                      i < arr.length - 1 && styles.sheetOptionBorder,
                    ]}
                    onPress={() => {
                      setDropdownValue(activeDropdown, opt)
                      setActiveDropdown(null)
                    }}
                  >
                    <Text style={styles.sheetOptionText}>{opt}</Text>
                    {isSelected && (
                      <Feather name="check" size={16} color="#C8922A" />
                    )}
                  </Pressable>
                )
              })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function DropdownField({ value, onPress }: { value: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.75} style={styles.dropdown} onPress={onPress}>
      <Text style={styles.dropdownValue}>{value}</Text>
      <Feather name="chevron-down" size={16} color="rgba(240,232,213,0.3)" />
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
    width: '75%',
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
    marginBottom: 32,
  },

  // Section
  section: {
    marginBottom: 28,
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

  // Presets
  presetHint: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 10,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  presetPill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    borderColor: 'rgba(240,232,213,0.08)',
    backgroundColor: 'transparent',
  },
  presetPillActive: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.25)',
  },
  presetText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  presetTextActive: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Field label
  fieldLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  fieldGap: {
    height: 16,
  },

  // Dropdown
  dropdown: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownValue: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },

  // Helper
  helper: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
    lineHeight: 16,
  },

  // Input row (fee fields)
  inputRow: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  inputPrefix: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  inputSuffix: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  feeInput: {
    flex: 1,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(240,232,213,0.05)',
  },
  toggleInfo: {
    flex: 1,
    marginRight: 12,
  },
  toggleTitle: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  toggleSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },

  // Travel radio
  travelDisabled: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
    borderCurve: 'continuous',
    marginBottom: 8,
    borderColor: 'rgba(240,232,213,0.07)',
    backgroundColor: 'transparent',
  },
  radioRowActive: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderColor: 'rgba(240,232,213,0.15)',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#F0E8D5',
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F0E8D5',
  },
  radioLabel: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  radioDesc: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 1,
  },

  // Footnote
  footnoteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 8,
    marginBottom: 8,
  },
  footnoteText: {
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

  // Dropdown modal sheet
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    maxHeight: '60%',
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(240,232,213,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sheetOption: {
    height: 52,
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetOptionBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  sheetOptionText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
})
