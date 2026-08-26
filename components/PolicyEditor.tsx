import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather, Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import {
  DEFAULT_POLICY,
  POLICY_OPTIONS,
  PolicyValue,
  TravelFeeType,
  policyToBookingPrefs,
  policyToPoliciesRow,
  rowsToPolicy,
} from '@/lib/policy'

export type PolicyMode = 'onboarding' | 'dashboard'

type DropdownKey = keyof typeof POLICY_OPTIONS

const DROPDOWN_LABELS: Record<DropdownKey, string> = {
  cancelWindow: 'Free Cancellation Window',
  rescheduleWindow: 'Reschedule Window',
  rescheduleLimit: 'Reschedule Limit',
  gracePeriod: 'Grace Period',
  freeRadius: 'Free Travel Radius',
  maxDistance: 'Max Travel Distance',
}

interface PolicyEditorProps {
  mode: PolicyMode
  initialValue?: PolicyValue
  // Onboarding only
  onContinue?: (value: PolicyValue) => void
  onSkip?: () => void
  // Dashboard only
  onOpenPanel?: () => void
}

export default function PolicyEditor({
  mode,
  initialValue,
  onContinue,
  onSkip,
  onOpenPanel,
}: PolicyEditorProps) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const scrollRef = useRef<ScrollView>(null)

  const [value, setValue] = useState<PolicyValue>(initialValue ?? DEFAULT_POLICY)
  const savedSnapshot = useRef<PolicyValue>(initialValue ?? DEFAULT_POLICY)
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null)
  const [activeDropdown, setActiveDropdown] = useState<DropdownKey | null>(null)

  const [loading, setLoading] = useState(mode === 'dashboard')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [providerId, setProviderId] = useState<string | null>(null)

  const dirty = JSON.stringify(value) !== JSON.stringify(savedSnapshot.current)

  useEffect(() => {
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 0)
    return () => clearTimeout(t)
  }, [])

  // ─── Dashboard load ───────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    if (mode !== 'dashboard') return
    if (!user) {
      setLoading(false)
      setLoadError('You need to be signed in to manage policies.')
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const { data: provider, error: provErr } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (provErr) throw provErr
      if (!provider) {
        setLoadError('No provider profile found for this account.')
        setLoading(false)
        return
      }
      setProviderId(provider.id)

      // Policy spans two tables: provider_policies (fees/reschedule/travel) and
      // provider_booking_preferences (cancellation window + grace).
      const [policiesRes, prefsRes] = await Promise.all([
        supabase
          .from('provider_policies')
          .select('*')
          .eq('provider_id', provider.id)
          .maybeSingle(),
        supabase
          .from('provider_booking_preferences')
          .select('cancellation_window_hours, lateness_grace_minutes')
          .eq('provider_id', provider.id)
          .maybeSingle(),
      ])
      if (policiesRes.error) throw policiesRes.error
      if (prefsRes.error) throw prefsRes.error

      // Missing rows → the real defaults, never invented terms.
      const next = rowsToPolicy(
        (policiesRes.data as any) ?? null,
        (prefsRes.data as any) ?? null,
      )
      savedSnapshot.current = next
      setValue(next)
      setLoading(false)
    } catch (err: any) {
      console.log('Policy load error:', err)
      setLoadError(err.message ?? 'Could not load policies.')
      setLoading(false)
    }
  }, [mode, user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Mutators ─────────────────────────────────────────────────────────
  function patch(p: Partial<PolicyValue>) {
    setValue((prev) => ({ ...prev, ...p }))
  }

  function applyPreset(preset: string) {
    if (preset === 'Flexible') {
      patch({ cancelWindow: '24 hours before', cancellationFeePercent: '0', noShowFeePercent: '100' })
    } else if (preset === 'Moderate') {
      patch({ cancelWindow: '48 hours before', cancellationFeePercent: '50', noShowFeePercent: '100' })
    } else if (preset === 'Strict') {
      patch({ cancelWindow: '72 hours before', cancellationFeePercent: '100', noShowFeePercent: '100' })
    }
    setSelectedPreset(preset)
  }

  function getDropdownValue(key: DropdownKey): string {
    switch (key) {
      case 'cancelWindow':     return value.cancelWindow
      case 'rescheduleWindow': return value.rescheduleWindow
      case 'rescheduleLimit':  return value.rescheduleLimit
      case 'gracePeriod':      return value.gracePeriod
      case 'freeRadius':       return value.freeRadius
      case 'maxDistance':      return value.maxDistance
    }
  }

  function setDropdownValue(key: DropdownKey, v: string) {
    switch (key) {
      case 'cancelWindow':     patch({ cancelWindow: v }); setSelectedPreset(null); break
      case 'rescheduleWindow': patch({ rescheduleWindow: v }); break
      case 'rescheduleLimit':  patch({ rescheduleLimit: v }); break
      case 'gracePeriod':      patch({ gracePeriod: v }); break
      case 'freeRadius':       patch({ freeRadius: v }); break
      case 'maxDistance':      patch({ maxDistance: v }); break
    }
  }

  // ─── Dashboard save / navigation ──────────────────────────────────────
  async function handleSave() {
    if (mode !== 'dashboard' || saving) return
    if (!providerId) {
      Alert.alert('No provider profile', 'Could not find a provider profile for this account.')
      return
    }
    setSaving(true)
    try {
      const policiesRes = await supabase
        .from('provider_policies')
        .upsert(policyToPoliciesRow(providerId, value), { onConflict: 'provider_id' })
      if (policiesRes.error) throw policiesRes.error

      // Cancellation window + grace live on provider_booking_preferences; only
      // those columns are sent so the availability step's columns are preserved.
      const prefsRes = await supabase
        .from('provider_booking_preferences')
        .upsert(policyToBookingPrefs(providerId, value), { onConflict: 'provider_id' })
      if (prefsRes.error) throw prefsRes.error

      savedSnapshot.current = value
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch (err: any) {
      console.log('Policy save error:', err)
      Alert.alert('Could not save', err.message ?? 'Try again in a moment.')
    } finally {
      setSaving(false)
    }
  }

  function tryNavigateBack() {
    if (mode === 'dashboard' && dirty) {
      Alert.alert('Discard unsaved changes?', 'Your edits will be lost.', [
        { text: 'Keep editing', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => {
            if (router.canGoBack()) router.back()
            else router.replace('/(tabs)/business')
          },
        },
      ])
      return
    }
    if (router.canGoBack()) router.back()
    else if (mode === 'dashboard') router.replace('/(tabs)/business')
  }

  const isOnboarding = mode === 'onboarding'
  const travelPlaceholder = value.travelFeeType === 'flat' ? '25' : '1.50'
  const travelHelper = value.travelFeeType === 'flat' ? 'Per appointment' : 'Per mile traveled'

  // ─── Dashboard loading / error states ─────────────────────────────────
  if (mode === 'dashboard' && loading) {
    return (
      <View style={styles.root}>
        <DashHeader insets={insets} onOpenPanel={onOpenPanel} />
        <View style={styles.skeletonBody}>
          <View style={[styles.skeletonBar, { width: 140 }]} />
          <View style={[styles.skeletonCard, { height: 220 }]} />
          <View style={[styles.skeletonBar, { width: 120 }]} />
          <View style={[styles.skeletonCard, { height: 160 }]} />
        </View>
      </View>
    )
  }

  if (mode === 'dashboard' && loadError) {
    return (
      <View style={styles.root}>
        <DashHeader insets={insets} onOpenPanel={onOpenPanel} />
        <View style={styles.errorBody}>
          <Ionicons name="cloud-offline" size={32} color="rgba(240,232,213,0.25)" />
          <Text style={styles.errorTitle}>Could not load policies</Text>
          <Text style={styles.errorSub}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {isOnboarding ? (
        <>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
            <TouchableOpacity
              onPress={tryNavigateBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              style={styles.iconBtn}
            >
              <Feather name="chevron-left" size={18} color="#F0E8D5" />
            </TouchableOpacity>
            <Text style={styles.topBarLabel}>Your policies</Text>
            <Text style={styles.topBarStep}>Step 6 of 8</Text>
          </View>
        </>
      ) : (
        <View style={[styles.dashHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={tryNavigateBack} activeOpacity={0.8}>
            <Feather name="chevron-left" size={20} color="#F0E8D5" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={onOpenPanel} activeOpacity={0.8}>
            <Feather name="menu" size={18} color="#F0E8D5" />
          </TouchableOpacity>
          <Text style={styles.dashTitle}>Policies</Text>
          <Pressable
            disabled={!dirty || saving}
            onPress={handleSave}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {saving ? (
              <ActivityIndicator color="#C8922A" />
            ) : (
              <Text style={[styles.saveAction, !dirty && styles.saveActionMuted]}>Save</Text>
            )}
          </Pressable>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: isOnboarding ? insets.bottom + 180 : insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isOnboarding && (
          <>
            <Text style={styles.headline}>Protect your time.</Text>
            <Text style={styles.subtext}>
              Set your cancellation and reschedule rules. Clients agree to these before booking you.
            </Text>
          </>
        )}

        {/* ── CANCELLATION ── */}
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
          <DropdownField value={value.cancelWindow} onPress={() => setActiveDropdown('cancelWindow')} />
          <Text style={styles.helper}>Clients cancel free before this time.</Text>

          <View style={styles.fieldGap} />

          <Text style={styles.fieldLabel}>CANCELLATION FEE</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.feeInput, { flex: 1 }]}
              value={value.cancellationFeePercent}
              onChangeText={(t) => { patch({ cancellationFeePercent: t }); setSelectedPreset(null) }}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor="rgba(240,232,213,0.2)"
            />
            <Text style={styles.inputSuffix}>%</Text>
          </View>
          <Text style={styles.helper}>Percentage of service price charged if cancelled after the window.</Text>

          <View style={styles.fieldGap} />

          <Text style={styles.fieldLabel}>NO-SHOW FEE</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.feeInput, { flex: 1 }]}
              value={value.noShowFeePercent}
              onChangeText={(t) => { patch({ noShowFeePercent: t }); setSelectedPreset(null) }}
              keyboardType="number-pad"
              placeholder="100"
              placeholderTextColor="rgba(240,232,213,0.2)"
            />
            <Text style={styles.inputSuffix}>%</Text>
          </View>
          <Text style={styles.helper}>Percentage of service price charged if client does not show up.</Text>
        </View>

        {/* ── RESCHEDULE ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>RESCHEDULE POLICY</Text>

          <Text style={styles.fieldLabel}>RESCHEDULE WINDOW</Text>
          <DropdownField value={value.rescheduleWindow} onPress={() => setActiveDropdown('rescheduleWindow')} />
          <Text style={styles.helper}>How far in advance clients can reschedule for free.</Text>

          <View style={styles.fieldGap} />

          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Charge a reschedule fee</Text>
              <Text style={styles.toggleSub}>Apply a fee for late reschedules</Text>
            </View>
            <Switch
              value={value.rescheduleFeeEnabled}
              onValueChange={(v) => patch({ rescheduleFeeEnabled: v })}
              trackColor={{ false: 'rgba(240,232,213,0.1)', true: 'rgba(240,232,213,0.35)' }}
              thumbColor={value.rescheduleFeeEnabled ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
              ios_backgroundColor="rgba(240,232,213,0.1)"
            />
          </View>

          {value.rescheduleFeeEnabled && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.fieldLabel}>RESCHEDULE FEE</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputPrefix}>$</Text>
                <TextInput
                  style={styles.feeInput}
                  value={value.rescheduleFee}
                  onChangeText={(t) => patch({ rescheduleFee: t })}
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
          <DropdownField value={value.rescheduleLimit} onPress={() => setActiveDropdown('rescheduleLimit')} />
          <Text style={styles.helper}>Max times a client can reschedule one appointment.</Text>
        </View>

        {/* ── LATE ARRIVAL ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>LATE ARRIVAL</Text>
          <Text style={styles.fieldLabel}>GRACE PERIOD</Text>
          <DropdownField value={value.gracePeriod} onPress={() => setActiveDropdown('gracePeriod')} />
          <Text style={styles.helper}>After this time the appointment is considered a no-show.</Text>
        </View>

        {/* ── TRAVEL FEE ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>TRAVEL FEE</Text>
          {(
            [
              { key: 'flat' as TravelFeeType,     label: 'Flat fee',                 desc: 'Same rate every appointment' },
              { key: 'per-mile' as TravelFeeType, label: 'Per mile',                 desc: 'Rate based on distance' },
              { key: 'free' as TravelFeeType,     label: 'Free, included in price',  desc: 'No separate travel charge' },
            ] as const
          ).map((opt) => (
            <Pressable
              key={opt.key}
              style={[styles.radioRow, value.travelFeeType === opt.key && styles.radioRowActive]}
              onPress={() => patch({ travelFeeType: opt.key })}
            >
              <View style={[styles.radioCircle, value.travelFeeType === opt.key && styles.radioCircleActive]}>
                {value.travelFeeType === opt.key && <View style={styles.radioDot} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.radioLabel}>{opt.label}</Text>
                <Text style={styles.radioDesc}>{opt.desc}</Text>
              </View>
            </Pressable>
          ))}

          {value.travelFeeType !== 'free' && (
            <View style={{ marginTop: 16 }}>
              <Text style={styles.fieldLabel}>TRAVEL FEE</Text>
              <View style={styles.inputRow}>
                <Text style={styles.inputPrefix}>$</Text>
                <TextInput
                  style={styles.feeInput}
                  value={value.travelAmount}
                  onChangeText={(t) => patch({ travelAmount: t })}
                  keyboardType="decimal-pad"
                  placeholder={travelPlaceholder}
                  placeholderTextColor="rgba(240,232,213,0.2)"
                />
              </View>
              <Text style={styles.helper}>{travelHelper}</Text>
              <View style={styles.fieldGap} />
            </View>
          )}

          {value.travelFeeType !== 'free' && (
            <>
              <Text style={styles.fieldLabel}>FREE TRAVEL RADIUS</Text>
              <DropdownField value={value.freeRadius} onPress={() => setActiveDropdown('freeRadius')} />
              <Text style={styles.helper}>No travel fee within this distance.</Text>
              <View style={styles.fieldGap} />
            </>
          )}

          <Text style={styles.fieldLabel}>MAX TRAVEL DISTANCE</Text>
          <DropdownField value={value.maxDistance} onPress={() => setActiveDropdown('maxDistance')} />
          <Text style={styles.helper}>You will not appear in searches beyond this distance.</Text>
        </View>

        <View style={styles.footnoteRow}>
          <Feather name="info" size={14} color="rgba(240,232,213,0.25)" style={{ marginTop: 2 }} />
          <Text style={styles.footnoteText}>
            Policies are legally binding agreements between you and your clients. The Book facilitates fee collection but you are responsible for maintaining fair practice.
          </Text>
        </View>

        {savedFlash && (
          <View style={styles.savedFlash}>
            <Ionicons name="checkmark-circle" size={14} color="#C8922A" />
            <Text style={styles.savedFlashText}>Policies saved.</Text>
          </View>
        )}
      </ScrollView>

      {isOnboarding && (
        <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.continueBtn} onPress={() => onContinue?.(value)}>
            <Text style={styles.continueBtnText}>Continue</Text>
          </Pressable>
          <TouchableOpacity activeOpacity={0.6} onPress={onSkip} style={styles.skipWrap}>
            <Text style={styles.skipText}>Use default policies for now</Text>
          </TouchableOpacity>
          <Text style={styles.skipNote}>You can update policies anytime from your dashboard.</Text>
        </View>
      )}

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
          <Text style={styles.sheetTitle}>{activeDropdown ? DROPDOWN_LABELS[activeDropdown] : ''}</Text>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {activeDropdown &&
              POLICY_OPTIONS[activeDropdown].map((opt, i, arr) => {
                const isSelected = getDropdownValue(activeDropdown) === opt
                return (
                  <Pressable
                    key={opt}
                    style={[styles.sheetOption, i < arr.length - 1 && styles.sheetOptionBorder]}
                    onPress={() => {
                      setDropdownValue(activeDropdown, opt)
                      setActiveDropdown(null)
                    }}
                  >
                    <Text style={styles.sheetOptionText}>{opt}</Text>
                    {isSelected && <Feather name="check" size={16} color="#C8922A" />}
                  </Pressable>
                )
              })}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

function DashHeader({
  insets,
  onOpenPanel,
}: {
  insets: { top: number }
  onOpenPanel?: () => void
}) {
  return (
    <View style={[styles.dashHeader, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={onOpenPanel} activeOpacity={0.8}>
        <Feather name="menu" size={18} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={styles.dashTitle}>Policies</Text>
      <View style={styles.iconBtnSpacer} />
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
  root: { flex: 1, backgroundColor: '#080808' },

  progressTrack: {
    position: 'absolute', top: 0, left: 0, right: 0, height: 4,
    backgroundColor: 'rgba(240,232,213,0.1)', zIndex: 10,
  },
  progressFill: { width: '75%', height: 4, backgroundColor: 'rgba(240,232,213,0.6)' },

  topBar: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingBottom: 12,
  },
  topBarLabel: { fontSize: 13, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  topBarStep: { fontSize: 13, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_500Medium' },

  dashHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 24, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  dashTitle: { flex: 1, textAlign: 'center', fontSize: 17, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  saveAction: { fontSize: 15, color: '#C8922A', fontFamily: 'Manrope_600SemiBold' },
  saveActionMuted: { color: 'rgba(240,232,213,0.25)' },
  iconBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)', borderWidth: 1, borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center', justifyContent: 'center',
  },
  iconBtnSpacer: { width: 36, height: 36 },

  skeletonBody: { paddingHorizontal: 24, paddingTop: 24, gap: 12 },
  skeletonBar: { height: 10, borderRadius: 5, backgroundColor: 'rgba(240,232,213,0.06)', marginTop: 8 },
  skeletonCard: { borderRadius: 16, backgroundColor: 'rgba(240,232,213,0.04)', borderWidth: 1, borderColor: 'rgba(240,232,213,0.06)' },

  errorBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  errorTitle: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold', marginTop: 14, textAlign: 'center' },
  errorSub: { fontSize: 13, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  retryBtn: {
    marginTop: 16, paddingHorizontal: 22, height: 44, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(200,146,42,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  retryBtnText: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_600SemiBold' },

  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 24, paddingTop: 20 },
  headline: { fontSize: 30, fontWeight: '700', color: '#F0E8D5', fontFamily: 'Manrope_700Bold', lineHeight: 36, marginBottom: 8 },
  subtext: { fontSize: 14, color: 'rgba(240,232,213,0.55)', fontFamily: 'Manrope_400Regular', lineHeight: 20, marginBottom: 32 },

  section: { marginBottom: 28 },
  sectionLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(240,232,213,0.4)', fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 14,
  },

  presetHint: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginBottom: 10 },
  presetRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  presetPill: {
    flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center',
    borderColor: 'rgba(240,232,213,0.08)', backgroundColor: 'transparent',
  },
  presetPillActive: { backgroundColor: 'rgba(240,232,213,0.1)', borderColor: 'rgba(240,232,213,0.25)' },
  presetText: { fontSize: 13, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  presetTextActive: { color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },

  fieldLabel: {
    fontSize: 10, fontWeight: '600', color: 'rgba(240,232,213,0.4)', fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8,
  },
  fieldGap: { height: 16 },

  dropdown: {
    backgroundColor: 'rgba(240,232,213,0.05)', borderWidth: 1, borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12, height: 52, paddingHorizontal: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  dropdownValue: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_400Regular' },

  helper: { fontSize: 11, color: 'rgba(240,232,213,0.3)', fontFamily: 'Manrope_400Regular', marginTop: 6, lineHeight: 16 },

  inputRow: {
    backgroundColor: 'rgba(240,232,213,0.05)', borderWidth: 1, borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12, height: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  inputPrefix: { fontSize: 16, color: 'rgba(240,232,213,0.5)', fontFamily: 'Manrope_400Regular' },
  inputSuffix: { fontSize: 16, color: 'rgba(240,232,213,0.5)', fontFamily: 'Manrope_400Regular' },
  feeInput: { flex: 1, fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_400Regular', padding: 0 },

  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: 'rgba(240,232,213,0.05)',
  },
  toggleInfo: { flex: 1, marginRight: 12 },
  toggleTitle: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_500Medium' },
  toggleSub: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 3 },

  radioRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14,
    borderWidth: 1, borderRadius: 10, borderCurve: 'continuous', marginBottom: 8,
    borderColor: 'rgba(240,232,213,0.07)', backgroundColor: 'transparent',
  },
  radioRowActive: { backgroundColor: 'rgba(240,232,213,0.05)', borderColor: 'rgba(240,232,213,0.15)' },
  radioCircle: {
    width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: 'rgba(240,232,213,0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  radioCircleActive: { borderColor: '#F0E8D5' },
  radioDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#F0E8D5' },
  radioLabel: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_500Medium' },
  radioDesc: { fontSize: 11, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 1 },

  footnoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 8, marginBottom: 8 },
  footnoteText: { flex: 1, fontSize: 11, color: 'rgba(240,232,213,0.3)', fontFamily: 'Manrope_400Regular', lineHeight: 16 },

  savedFlash: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center',
    backgroundColor: 'rgba(200,146,42,0.1)', borderColor: 'rgba(200,146,42,0.35)', borderWidth: 1,
    borderRadius: 18, paddingHorizontal: 12, paddingVertical: 6, marginTop: 4,
  },
  savedFlashText: { fontSize: 12, color: '#C8922A', fontFamily: 'Manrope_600SemiBold' },

  cta: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#080808',
    borderTopWidth: 1, borderTopColor: 'rgba(240,232,213,0.06)', paddingHorizontal: 24, paddingTop: 16,
  },
  continueBtn: {
    backgroundColor: '#F0E8D5', borderRadius: 14, borderCurve: 'continuous', height: 52,
    alignItems: 'center', justifyContent: 'center', width: '100%',
  },
  continueBtnText: { fontSize: 16, fontWeight: '700', color: '#080808', fontFamily: 'Manrope_700Bold' },
  skipWrap: { alignItems: 'center', marginTop: 10 },
  skipText: { fontSize: 13, color: 'rgba(240,232,213,0.3)', fontFamily: 'Manrope_500Medium', textAlign: 'center' },
  skipNote: { fontSize: 11, color: 'rgba(240,232,213,0.25)', fontFamily: 'Manrope_400Regular', textAlign: 'center', marginTop: 6 },

  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#0D0D0D', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 12, maxHeight: '60%',
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(240,232,213,0.15)', alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 17, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold', paddingHorizontal: 24, marginBottom: 16 },
  sheetOption: { height: 52, paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetOptionBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(240,232,213,0.05)' },
  sheetOptionText: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_500Medium' },
})
