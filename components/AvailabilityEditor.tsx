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
  TouchableOpacity,
  View,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Feather, Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

// ─── Types ────────────────────────────────────────────────────────────────

export interface DaySchedule {
  enabled: boolean
  startTime: Date
  endTime: Date
}

export type Schedule = Record<DayName, DaySchedule>

export type DayName =
  | 'Monday'
  | 'Tuesday'
  | 'Wednesday'
  | 'Thursday'
  | 'Friday'
  | 'Saturday'
  | 'Sunday'

export interface AvailabilityValue {
  schedule: Schedule
  bufferTime: number
  instantBooking: boolean
  blackoutDates: string[]
  isMobile: boolean
}

export type AvailabilityMode = 'onboarding' | 'dashboard'

// ─── Constants ────────────────────────────────────────────────────────────

const DAYS: DayName[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
]

// DB convention: 0 = Sunday, 1 = Monday, ..., 6 = Saturday
const DAY_TO_WEEKDAY: Record<DayName, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
}

const WEEKDAY_TO_DAY: Record<number, DayName> = {
  0: 'Sunday',
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
}

const BUFFER_OPTIONS = [0, 15, 30, 45, 60, 90, 120]

function makeTime(h: number, m: number): Date {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

export const DEFAULT_VALUE: AvailabilityValue = {
  schedule: {
    Monday: { enabled: true, startTime: makeTime(9, 0), endTime: makeTime(18, 0) },
    Tuesday: { enabled: true, startTime: makeTime(9, 0), endTime: makeTime(18, 0) },
    Wednesday: { enabled: true, startTime: makeTime(9, 0), endTime: makeTime(18, 0) },
    Thursday: { enabled: true, startTime: makeTime(9, 0), endTime: makeTime(18, 0) },
    Friday: { enabled: true, startTime: makeTime(9, 0), endTime: makeTime(18, 0) },
    Saturday: { enabled: true, startTime: makeTime(10, 0), endTime: makeTime(16, 0) },
    Sunday: { enabled: false, startTime: makeTime(9, 0), endTime: makeTime(18, 0) },
  },
  bufferTime: 15,
  instantBooking: false,
  blackoutDates: [],
  isMobile: false,
}

function formatTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDate(s: string): string {
  const [, mo, d] = s.split('-')
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ]
  return `${months[parseInt(mo) - 1]} ${parseInt(d)}`
}

function dbTimeToDate(s: string): Date {
  const [h, m] = s.split(':').map((n) => parseInt(n, 10))
  return makeTime(h, m)
}

function dateToDbTime(d: Date): string {
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}:00`
}

function valuesEqual(a: AvailabilityValue, b: AvailabilityValue): boolean {
  if (a.bufferTime !== b.bufferTime) return false
  if (a.instantBooking !== b.instantBooking) return false
  if (a.isMobile !== b.isMobile) return false
  if (a.blackoutDates.length !== b.blackoutDates.length) return false
  for (let i = 0; i < a.blackoutDates.length; i++) {
    if (a.blackoutDates[i] !== b.blackoutDates[i]) return false
  }
  for (const day of DAYS) {
    const da = a.schedule[day]
    const db = b.schedule[day]
    if (da.enabled !== db.enabled) return false
    if (da.startTime.getTime() !== db.startTime.getTime()) return false
    if (da.endTime.getTime() !== db.endTime.getTime()) return false
  }
  return true
}

function cloneValue(v: AvailabilityValue): AvailabilityValue {
  const schedule = {} as Schedule
  for (const day of DAYS) {
    schedule[day] = {
      enabled: v.schedule[day].enabled,
      startTime: new Date(v.schedule[day].startTime),
      endTime: new Date(v.schedule[day].endTime),
    }
  }
  return {
    schedule,
    bufferTime: v.bufferTime,
    instantBooking: v.instantBooking,
    blackoutDates: [...v.blackoutDates],
    isMobile: v.isMobile,
  }
}

// Build the DB rows for an AvailabilityValue. Shared by the dashboard save
// (below) and go-live, so both write identical shapes to the same three tables.
export function buildAvailabilityRows(providerId: string, value: AvailabilityValue) {
  const hoursRows = DAYS.map((day) => ({
    provider_id: providerId,
    weekday: DAY_TO_WEEKDAY[day],
    start_time: dateToDbTime(value.schedule[day].startTime),
    end_time: dateToDbTime(value.schedule[day].endTime),
    is_available: value.schedule[day].enabled,
    timezone: 'America/Chicago',
  }))
  const blockedRows = value.blackoutDates.map((d) => ({
    provider_id: providerId,
    date: d,
  }))
  const preferences = {
    provider_id: providerId,
    buffer_minutes: value.bufferTime,
    requires_manual_approval: !value.instantBooking,
  }
  return { hoursRows, blockedRows, preferences }
}

// ─── Props ────────────────────────────────────────────────────────────────

interface AvailabilityEditorProps {
  mode: AvailabilityMode
  initialValue?: AvailabilityValue
  // Onboarding only: navigation handlers and header chrome
  onContinue?: (value: AvailabilityValue) => void
  onSkip?: () => void
  onOpenPanel?: () => void
}

// ─── Component ────────────────────────────────────────────────────────────

export default function AvailabilityEditor({
  mode,
  initialValue,
  onContinue,
  onSkip,
  onOpenPanel,
}: AvailabilityEditorProps) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [loading, setLoading] = useState(mode === 'dashboard')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [savedFlash, setSavedFlash] = useState(false)
  const [providerId, setProviderId] = useState<string | null>(null)

  const [value, setValue] = useState<AvailabilityValue>(
    initialValue ? cloneValue(initialValue) : cloneValue(DEFAULT_VALUE),
  )
  const savedSnapshot = useRef<AvailabilityValue>(
    initialValue ? cloneValue(initialValue) : cloneValue(DEFAULT_VALUE),
  )

  // Pickers
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [editingDay, setEditingDay] = useState<DayName | null>(null)
  const [editingField, setEditingField] = useState<'startTime' | 'endTime'>('startTime')
  const [pendingTime, setPendingTime] = useState<Date>(new Date())

  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pendingDate, setPendingDate] = useState<Date>(new Date())

  const dirty = !valuesEqual(value, savedSnapshot.current)

  // ─── Load existing data for dashboard mode ────────────────────────────
  const loadData = useCallback(async () => {
    if (mode !== 'dashboard') return
    if (!user) {
      setLoading(false)
      setLoadError('You need to be signed in to manage availability.')
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const { data: provider, error: provErr } = await supabase
        .from('providers')
        .select('id, is_mobile')
        .eq('user_id', user.id)
        .maybeSingle()
      if (provErr) throw provErr
      if (!provider) {
        setLoadError('No provider profile found for this account.')
        setLoading(false)
        return
      }
      setProviderId(provider.id)

      const [hoursRes, blockedRes, prefsRes] = await Promise.all([
        supabase
          .from('provider_availability')
          .select('weekday,start_time,end_time,is_available')
          .eq('provider_id', provider.id),
        supabase
          .from('provider_blocked_dates')
          .select('date')
          .eq('provider_id', provider.id),
        supabase
          .from('provider_booking_preferences')
          .select('buffer_minutes,requires_manual_approval')
          .eq('provider_id', provider.id)
          .maybeSingle(),
      ])
      if (hoursRes.error) throw hoursRes.error
      if (blockedRes.error) throw blockedRes.error
      if (prefsRes.error) throw prefsRes.error

      const next = cloneValue(DEFAULT_VALUE)

      const hoursRows = (hoursRes.data ?? []) as Array<{
        weekday: number
        start_time: string
        end_time: string
        is_available: boolean
      }>
      // Provider has saved hours: start every day disabled then populate from rows
      if (hoursRows.length > 0) {
        for (const day of DAYS) {
          next.schedule[day] = {
            enabled: false,
            startTime: makeTime(9, 0),
            endTime: makeTime(18, 0),
          }
        }
        for (const row of hoursRows) {
          const day = WEEKDAY_TO_DAY[row.weekday]
          if (!day) continue
          next.schedule[day] = {
            enabled: !!row.is_available,
            startTime: dbTimeToDate(row.start_time),
            endTime: dbTimeToDate(row.end_time),
          }
        }
      }

      next.blackoutDates = ((blockedRes.data ?? []) as Array<{ date: string }>)
        .map((r) => r.date)
        .sort()

      if (prefsRes.data) {
        const prefs = prefsRes.data as {
          buffer_minutes: number | null
          requires_manual_approval: boolean | null
        }
        if (prefs.buffer_minutes != null) next.bufferTime = prefs.buffer_minutes
        if (prefs.requires_manual_approval != null) {
          next.instantBooking = !prefs.requires_manual_approval
        }
      }

      next.isMobile =
        (provider as { is_mobile?: boolean | null }).is_mobile ?? false

      savedSnapshot.current = cloneValue(next)
      setValue(next)
      setLoading(false)
    } catch (err: any) {
      console.log('Availability load error:', err)
      setLoadError(err.message ?? 'Could not load availability.')
      setLoading(false)
    }
  }, [mode, user])

  useEffect(() => {
    loadData()
  }, [loadData])

  // ─── Unsaved-changes guard on navigation away ─────────────────────────
  useFocusEffect(
    useCallback(() => {
      return () => {
        // Cleanup runs when navigating away. We can't block here; the back
        // handlers below trigger the confirm dialog explicitly.
      }
    }, []),
  )

  function tryNavigateBack() {
    if (mode === 'dashboard' && dirty) {
      Alert.alert(
        'Discard unsaved changes?',
        'Your edits will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => {
              if (router.canGoBack()) router.back()
              else router.replace('/(tabs)/business')
            },
          },
        ],
      )
      return
    }
    if (router.canGoBack()) router.back()
    else if (mode === 'dashboard') router.replace('/(tabs)/business')
  }

  function tryOpenPanel() {
    if (mode === 'dashboard' && dirty && onOpenPanel) {
      Alert.alert(
        'Discard unsaved changes?',
        'Your edits will be lost.',
        [
          { text: 'Keep editing', style: 'cancel' },
          { text: 'Discard', style: 'destructive', onPress: onOpenPanel },
        ],
      )
      return
    }
    onOpenPanel?.()
  }

  // ─── Mutators ─────────────────────────────────────────────────────────
  function toggleDay(day: DayName) {
    setValue((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [day]: { ...prev.schedule[day], enabled: !prev.schedule[day].enabled },
      },
    }))
  }

  function openTimePicker(day: DayName, field: 'startTime' | 'endTime') {
    setEditingDay(day)
    setEditingField(field)
    setPendingTime(value.schedule[day][field])
    setShowTimePicker(true)
  }

  function confirmTime() {
    if (!editingDay) return
    setValue((prev) => ({
      ...prev,
      schedule: {
        ...prev.schedule,
        [editingDay]: { ...prev.schedule[editingDay], [editingField]: pendingTime },
      },
    }))
    setShowTimePicker(false)
  }

  function stepBuffer(dir: 1 | -1) {
    const idx = BUFFER_OPTIONS.indexOf(value.bufferTime)
    const next = idx + dir
    if (next < 0 || next >= BUFFER_OPTIONS.length) return
    setValue((prev) => ({ ...prev, bufferTime: BUFFER_OPTIONS[next] }))
  }

  function formatBuffer(min: number): string {
    if (min === 0) return 'None'
    if (min < 60) return `${min} min`
    return `${min / 60} hr`
  }

  function addBlackoutDate() {
    setPendingDate(new Date())
    setShowDatePicker(true)
  }

  async function checkBookingConflict(iso: string): Promise<boolean> {
    // Dashboard mode only: check if a CONFIRMED booking exists on this date.
    // 'accepted' is the post-approval status in the bookings table.
    if (mode !== 'dashboard' || !providerId) return false
    const { data, error } = await supabase
      .from('bookings')
      .select('id')
      .eq('provider_id', providerId)
      .eq('requested_date', iso)
      .in('status', ['accepted', 'arriving', 'checked_in'])
      .limit(1)
    if (error) {
      console.log('Booking conflict check failed:', error)
      return false
    }
    return (data?.length ?? 0) > 0
  }

  function commitBlackout(iso: string) {
    setValue((prev) => {
      if (prev.blackoutDates.includes(iso)) return prev
      return { ...prev, blackoutDates: [...prev.blackoutDates, iso].sort() }
    })
  }

  async function confirmDate() {
    const iso = pendingDate.toISOString().split('T')[0]
    setShowDatePicker(false)
    if (value.blackoutDates.includes(iso)) return

    const conflict = await checkBookingConflict(iso)
    if (conflict) {
      Alert.alert(
        'Existing booking on that date',
        `You have a confirmed booking on ${formatDate(iso)}. Blocking this day will not cancel it, you will need to cancel or reschedule with the client.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Go to that booking',
            onPress: () => {
              router.push('/(tabs)/business/bookings' as never)
            },
          },
          { text: 'Block anyway', style: 'destructive', onPress: () => commitBlackout(iso) },
        ],
      )
      return
    }
    commitBlackout(iso)
  }

  function removeBlackoutDate(iso: string) {
    setValue((prev) => ({
      ...prev,
      blackoutDates: prev.blackoutDates.filter((d) => d !== iso),
    }))
  }

  // ─── Save (dashboard mode) ────────────────────────────────────────────
  async function handleSave() {
    if (mode !== 'dashboard' || saving) return
    if (!providerId) {
      Alert.alert('No provider profile', 'Could not find a provider profile for this account.')
      return
    }
    setSaving(true)
    try {
      const { hoursRows, blockedRows, preferences } = buildAvailabilityRows(
        providerId,
        value,
      )

      // 1. Weekly hours: replace all rows for this provider.
      const delHours = await supabase
        .from('provider_availability')
        .delete()
        .eq('provider_id', providerId)
      if (delHours.error) throw delHours.error

      const insHours = await supabase.from('provider_availability').insert(hoursRows)
      if (insHours.error) throw insHours.error

      // 2. Blackout dates: replace all rows.
      const delBlocked = await supabase
        .from('provider_blocked_dates')
        .delete()
        .eq('provider_id', providerId)
      if (delBlocked.error) throw delBlocked.error

      if (blockedRows.length > 0) {
        const insBlocked = await supabase.from('provider_blocked_dates').insert(blockedRows)
        if (insBlocked.error) throw insBlocked.error
      }

      // 3. Booking preferences: upsert one row by provider_id.
      // UI "Instant booking" = DB requires_manual_approval inverted.
      const upsertPrefs = await supabase
        .from('provider_booking_preferences')
        .upsert(preferences, { onConflict: 'provider_id' })
      if (upsertPrefs.error) throw upsertPrefs.error

      // 4. Mobile-provider flag lives on the providers row.
      const updMobile = await supabase
        .from('providers')
        .update({ is_mobile: value.isMobile })
        .eq('id', providerId)
      if (updMobile.error) throw updMobile.error

      savedSnapshot.current = cloneValue(value)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 1500)
    } catch (err: any) {
      console.log('Availability save error:', err)
      Alert.alert('Could not save', err.message ?? 'Try again in a moment.')
    } finally {
      setSaving(false)
    }
  }

  // ─── Render: loading / error states (dashboard mode only) ─────────────
  if (mode === 'dashboard' && loading) {
    return (
      <View style={styles.root}>
        <View style={[styles.dashHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={onOpenPanel} activeOpacity={0.8}>
            <Feather name="menu" size={18} color="#F0E8D5" />
          </TouchableOpacity>
          <Text style={styles.dashTitle}>Availability</Text>
          <View style={styles.iconBtnSpacer} />
        </View>
        <View style={styles.skeletonBody}>
          <View style={[styles.skeletonBar, { width: 140 }]} />
          <View style={[styles.skeletonCard, { height: 320 }]} />
          <View style={[styles.skeletonBar, { width: 110 }]} />
          <View style={[styles.skeletonCard, { height: 70 }]} />
          <View style={[styles.skeletonBar, { width: 160 }]} />
          <View style={[styles.skeletonCard, { height: 100 }]} />
        </View>
      </View>
    )
  }

  if (mode === 'dashboard' && loadError) {
    return (
      <View style={styles.root}>
        <View style={[styles.dashHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={onOpenPanel} activeOpacity={0.8}>
            <Feather name="menu" size={18} color="#F0E8D5" />
          </TouchableOpacity>
          <Text style={styles.dashTitle}>Availability</Text>
          <View style={styles.iconBtnSpacer} />
        </View>
        <View style={styles.errorBody}>
          <Ionicons name="cloud-offline" size={32} color="rgba(240,232,213,0.25)" />
          <Text style={styles.errorTitle}>Could not load availability</Text>
          <Text style={styles.errorSub}>{loadError}</Text>
          <Pressable style={styles.retryBtn} onPress={loadData}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const isOnboarding = mode === 'onboarding'

  return (
    <View style={styles.root}>
      {isOnboarding ? (
        <>
          <View style={styles.progressTrack}>
            <View style={styles.progressFill} />
          </View>
          <View style={[styles.onboardingHeader, { paddingTop: insets.top + 16 }]}>
            <TouchableOpacity
              onPress={tryNavigateBack}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              style={styles.iconBtn}
            >
              <Feather name="chevron-left" size={18} color="#F0E8D5" />
            </TouchableOpacity>
            <Text style={styles.onboardingHeaderLabel}>Your availability</Text>
            <Text style={styles.onboardingHeaderStep}>Step 5 of 8</Text>
          </View>
        </>
      ) : (
        <View style={[styles.dashHeader, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity style={styles.iconBtn} onPress={tryNavigateBack} activeOpacity={0.8}>
            <Feather name="chevron-left" size={20} color="#F0E8D5" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={tryOpenPanel} activeOpacity={0.8}>
            <Feather name="menu" size={18} color="#F0E8D5" />
          </TouchableOpacity>
          <Text style={styles.dashTitle}>Availability</Text>
          <Pressable
            disabled={!dirty || saving}
            onPress={handleSave}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            {saving ? (
              <ActivityIndicator color="#C8922A" />
            ) : (
              <Text style={[styles.saveAction, !dirty && styles.saveActionMuted]}>
                Save
              </Text>
            )}
          </Pressable>
        </View>
      )}

      <ScrollView
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
            <Text style={styles.headline}>Set your schedule.</Text>
            <Text style={styles.subtext}>
              Clients will only see time slots that fit your availability. You can always change this later.
            </Text>
          </>
        )}

        {/* Mobile provider toggle (top). Persisted to providers.is_mobile via
            handleSave (dashboard) and go-live (onboarding). */}
        <Text style={styles.sectionLabel}>SERVICE STYLE</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Mobile Provider</Text>
              <Text style={styles.toggleSub}>I travel to clients.</Text>
            </View>
            <Switch
              value={value.isMobile}
              onValueChange={(v) => setValue((prev) => ({ ...prev, isMobile: v }))}
              trackColor={{ false: 'rgba(240,232,213,0.1)', true: 'rgba(200,146,42,0.55)' }}
              thumbColor={value.isMobile ? '#C8922A' : 'rgba(240,232,213,0.4)'}
              ios_backgroundColor="rgba(240,232,213,0.1)"
            />
          </View>
        </View>

        {/* Weekly schedule */}
        <Text style={styles.sectionLabel}>WEEKLY HOURS</Text>
        <View style={styles.card}>
          {DAYS.map((day, i) => {
            const s = value.schedule[day]
            return (
              <View key={day} style={[styles.dayRow, i < DAYS.length - 1 && styles.dayRowBorder]}>
                <Switch
                  value={s.enabled}
                  onValueChange={() => toggleDay(day)}
                  trackColor={{ false: 'rgba(240,232,213,0.1)', true: 'rgba(200,146,42,0.55)' }}
                  thumbColor={s.enabled ? '#C8922A' : 'rgba(240,232,213,0.4)'}
                  ios_backgroundColor="rgba(240,232,213,0.1)"
                />
                <Text style={[styles.dayName, !s.enabled && styles.dayNameOff]}>
                  {day.slice(0, 3)}
                </Text>
                {s.enabled ? (
                  <View style={styles.timePills}>
                    <Pressable style={styles.timePill} onPress={() => openTimePicker(day, 'startTime')}>
                      <Text style={styles.timePillText}>{formatTime(s.startTime)}</Text>
                    </Pressable>
                    <Text style={styles.timeSep}>to</Text>
                    <Pressable style={styles.timePill} onPress={() => openTimePicker(day, 'endTime')}>
                      <Text style={styles.timePillText}>{formatTime(s.endTime)}</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Text style={styles.unavailableText}>Unavailable</Text>
                )}
              </View>
            )
          })}
        </View>

        {/* Buffer time */}
        <Text style={styles.sectionLabel}>BUFFER BETWEEN APPOINTMENTS</Text>
        <View style={styles.card}>
          <View style={styles.bufferRow}>
            <View style={styles.bufferInfo}>
              <Text style={styles.bufferTitle}>Time between bookings</Text>
              <Text style={styles.bufferSub}>Give yourself a break between clients.</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepBtn, value.bufferTime === BUFFER_OPTIONS[0] && styles.stepBtnDisabled]}
                onPress={() => stepBuffer(-1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name="minus"
                  size={14}
                  color={value.bufferTime === BUFFER_OPTIONS[0]
                    ? 'rgba(240,232,213,0.2)'
                    : 'rgba(240,232,213,0.7)'}
                />
              </Pressable>
              <Text style={styles.stepValue}>{formatBuffer(value.bufferTime)}</Text>
              <Pressable
                style={[
                  styles.stepBtn,
                  value.bufferTime === BUFFER_OPTIONS[BUFFER_OPTIONS.length - 1] && styles.stepBtnDisabled,
                ]}
                onPress={() => stepBuffer(1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name="plus"
                  size={14}
                  color={value.bufferTime === BUFFER_OPTIONS[BUFFER_OPTIONS.length - 1]
                    ? 'rgba(240,232,213,0.2)'
                    : 'rgba(240,232,213,0.7)'}
                />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Blackout dates */}
        <Text style={styles.sectionLabel}>BLACKOUT DATES</Text>
        <View style={styles.card}>
          <Text style={styles.blackoutSub}>Block specific dates you are unavailable.</Text>
          {value.blackoutDates.length > 0 && (
            <View style={styles.chipWrap}>
              {value.blackoutDates.map((iso) => (
                <View key={iso} style={styles.chip}>
                  <Text style={styles.chipText}>{formatDate(iso)}</Text>
                  <Pressable
                    onPress={() => removeBlackoutDate(iso)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Feather name="x" size={11} color="rgba(240,232,213,0.5)" />
                  </Pressable>
                </View>
              ))}
            </View>
          )}
          <Pressable style={styles.addDateBtn} onPress={addBlackoutDate}>
            <Feather name="plus" size={14} color="#C8922A" />
            <Text style={styles.addDateText}>Add</Text>
          </Pressable>
        </View>

        {/* Instant booking */}
        <Text style={styles.sectionLabel}>BOOKING PREFERENCES</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Instant booking</Text>
              <Text style={styles.toggleSub}>
                {value.instantBooking
                  ? 'Clients book directly, no approval needed.'
                  : 'You review and approve each request.'}
              </Text>
            </View>
            <Switch
              value={value.instantBooking}
              onValueChange={(v) => setValue((prev) => ({ ...prev, instantBooking: v }))}
              trackColor={{ false: 'rgba(240,232,213,0.1)', true: 'rgba(200,146,42,0.55)' }}
              thumbColor={value.instantBooking ? '#C8922A' : 'rgba(240,232,213,0.4)'}
              ios_backgroundColor="rgba(240,232,213,0.1)"
            />
          </View>
        </View>

        {savedFlash && (
          <View style={styles.savedFlash}>
            <Ionicons name="checkmark-circle" size={14} color="#C8922A" />
            <Text style={styles.savedFlashText}>Availability saved.</Text>
          </View>
        )}
      </ScrollView>

      {isOnboarding && (
        <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable style={styles.continueBtn} onPress={() => onContinue?.(value)}>
            <Text style={styles.continueBtnText}>Continue</Text>
          </Pressable>
          {onSkip && (
            <Pressable style={styles.skipBtn} onPress={onSkip} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.skipText}>Skip for now</Text>
            </Pressable>
          )}
          <Text style={styles.ctaNote}>You can update your availability anytime from settings.</Text>
        </View>
      )}

      {/* Time picker modal */}
      <Modal
        visible={showTimePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowTimePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowTimePicker(false)} />
        <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.pickerHandle} />
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowTimePicker(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>
              {editingDay} {editingField === 'startTime' ? 'start' : 'end'}
            </Text>
            <TouchableOpacity onPress={confirmTime}>
              <Text style={styles.pickerDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={pendingTime}
            mode="time"
            display="spinner"
            minuteInterval={15}
            onChange={(_, date) => { if (date) setPendingTime(date) }}
            style={styles.dtPicker}
            textColor="#F0E8D5"
          />
        </View>
      </Modal>

      {/* Date picker modal */}
      <Modal
        visible={showDatePicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowDatePicker(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowDatePicker(false)} />
        <View style={[styles.pickerSheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.pickerHandle} />
          <View style={styles.pickerHeader}>
            <TouchableOpacity onPress={() => setShowDatePicker(false)}>
              <Text style={styles.pickerCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.pickerTitle}>Select date</Text>
            <TouchableOpacity onPress={confirmDate}>
              <Text style={styles.pickerDone}>Done</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={pendingDate}
            mode="date"
            display="spinner"
            minimumDate={new Date()}
            onChange={(_, date) => { if (date) setPendingDate(date) }}
            style={styles.dtPicker}
            textColor="#F0E8D5"
          />
        </View>
      </Modal>
    </View>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },

  // Onboarding header
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
    width: '62.5%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  onboardingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  onboardingHeaderLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  onboardingHeaderStep: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },

  // Dashboard header
  dashHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  dashTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  saveAction: {
    fontSize: 15,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
  saveActionMuted: {
    color: 'rgba(240,232,213,0.25)',
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnSpacer: {
    width: 36,
    height: 36,
  },

  // Loading state
  skeletonBody: {
    paddingHorizontal: 24,
    paddingTop: 24,
    gap: 12,
  },
  skeletonBar: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginTop: 8,
  },
  skeletonCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.06)',
  },

  // Error state
  errorBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 10,
  },
  errorTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 14,
    textAlign: 'center',
  },
  errorSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: {
    fontSize: 14,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Body
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  headline: {
    fontSize: 30,
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
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    marginBottom: 10,
    marginTop: 4,
  },
  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 16,
    borderCurve: 'continuous',
    marginBottom: 24,
    overflow: 'hidden',
  },

  // Toggle row (mobile + instant booking)
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    marginBottom: 2,
  },
  toggleSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
  },

  // Day rows
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  dayRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  dayName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    width: 34,
  },
  dayNameOff: {
    color: 'rgba(240,232,213,0.3)',
  },
  timePills: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  timePill: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  timePillText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  timeSep: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
  unavailableText: {
    flex: 1,
    textAlign: 'right',
    fontSize: 12,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
  },

  // Buffer stepper
  bufferRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  bufferInfo: {
    flex: 1,
  },
  bufferTitle: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    marginBottom: 2,
  },
  bufferSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnDisabled: {
    borderColor: 'rgba(240,232,213,0.05)',
    backgroundColor: 'rgba(240,232,213,0.03)',
  },
  stepValue: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    minWidth: 46,
    textAlign: 'center',
  },

  // Blackout dates
  blackoutSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  addDateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  addDateText: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Saved flash
  savedFlash: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: 'rgba(200,146,42,0.1)',
    borderColor: 'rgba(200,146,42,0.35)',
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginTop: 4,
  },
  savedFlashText: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Onboarding CTA
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
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  skipBtn: {
    alignItems: 'center',
    paddingTop: 10,
  },
  skipText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  ctaNote: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 10,
  },

  // Modals
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pickerSheet: {
    backgroundColor: '#111111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
  },
  pickerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(240,232,213,0.15)',
    alignSelf: 'center',
    marginBottom: 12,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  pickerTitle: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_500Medium',
  },
  pickerCancel: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  pickerDone: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  dtPicker: {
    height: 200,
  },
})
