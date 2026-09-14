import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useBookingStore } from '@/store/bookingStore'
import { bookingProgressLabel } from '@/lib/bookingProgress'
import { useTheme } from '@/context/ThemeContext'
import BookingFlowScreen, {
  BookingFlowHeading,
  BookingFlowNote,
} from '@/components/ui/BookingFlowScreen'
import Button from '@/components/ui/Button'
import DayCell from '@/components/ui/DayCell'
// Aliased: this file already has a `TimeSlot` TYPE for the server's slot data.
import TimeSlotChip from '@/components/ui/TimeSlot'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { openMessageEntry } from '../../hooks/useMessaging'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// Live schema from migration 027 + AvailabilityEditor:
// provider_availability(weekday int 0-6 [0=Sunday], start_time time,
//   end_time time, is_available bool)
// provider_blocked_dates(date date)
interface ScheduleRow {
  weekday: number
  start_time: string
  end_time: string
  is_available: boolean | null
}

interface TimeSlot {
  time: string // display, "9:00 AM"
}

function isoDate(d: Date): string {
  const y = d.getFullYear()
  const m = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return `${y}-${m}-${day}`
}

function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

function sameYearMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}

function parseHourMin(t: string): { hours: number; minutes: number } {
  const parts = t.split(':')
  return {
    hours: parseInt(parts[0], 10) || 0,
    minutes: parseInt(parts[1], 10) || 0,
  }
}

function formatHour12(hours: number, minutes: number): string {
  const ampm = hours < 12 ? 'AM' : 'PM'
  const h = hours % 12 === 0 ? 12 : hours % 12
  const m = minutes.toString().padStart(2, '0')
  return `${h}:${m} ${ampm}`
}

function getTimeSlotsForDate(dateStr: string, schedule: ScheduleRow[]): TimeSlot[] {
  // Parse YYYY-MM-DD without timezone shifts.
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10))
  const date = new Date(y, m - 1, d)
  const weekday = date.getDay()
  const row = schedule.find((s) => s.weekday === weekday && s.is_available !== false)
  if (!row) return []

  const start = parseHourMin(row.start_time)
  const end = parseHourMin(row.end_time)

  // 1-hour slots from start (inclusive) up to but not crossing end.
  const slots: TimeSlot[] = []
  let h = start.hours
  const min = start.minutes
  while (h < end.hours || (h === end.hours && min < end.minutes)) {
    slots.push({ time: formatHour12(h, min) })
    h += 1
  }
  return slots
}

function Shimmer({ style }: { style: any }) {
  const { colors } = useTheme()
  const opacity = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    )
    loop.start()
    return () => {
      loop.stop()
      opacity.stopAnimation()
    }
  }, [opacity])
  return <Animated.View style={[{ backgroundColor: colors.bgSubtle, opacity }, style]} />
}

export default function BookDateTime() {
  const { colors } = useTheme()
  const { width } = useWindowDimensions()
  const {
    providerId,
    providerName,
    providerCategory,
    providerLocation,
    selectedService,
    setSelectedDate,
    setRawDate,
    setSelectedTime,
    contractRequired,
} = useBookingStore()
  const { user } = useAuth()
  const scrollRef = useRef<ScrollView>(null)

  // The approved frame addresses the provider by first name throughout.
  const providerFirstName = (providerName || 'your provider').split(' ')[0]

  const today = useMemo(() => startOfDay(new Date()), [])
  const [currentMonth, setCurrentMonth] = useState<Date>(
    new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null)
  const [selectedTimeStr, setSelectedTimeStr] = useState<string | null>(null)
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [availableSet, setAvailableSet] = useState<Set<string>>(new Set())
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([])

  const fetchAvailability = useCallback(async () => {
    if (!providerId) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const [schedRes, blockedRes] = await Promise.all([
        supabase
          .from('provider_availability')
          .select('weekday, start_time, end_time, is_available')
          .eq('provider_id', providerId),
        supabase
          .from('provider_blocked_dates')
          .select('date')
          .eq('provider_id', providerId),
      ])

      const sched = (schedRes.data ?? []) as ScheduleRow[]
      const blocked = ((blockedRes.data ?? []) as Array<{ date: string }>).map((b) => b.date)
      const blockedLookup = new Set(blocked)

      const dates = new Set<string>()
      for (let i = 0; i < 60; i++) {
        const d = new Date(today)
        d.setDate(today.getDate() + i)
        const wk = d.getDay()
        const hasSchedule = sched.some(
          (s) => s.weekday === wk && s.is_available !== false,
        )
        if (!hasSchedule) continue
        const ds = isoDate(d)
        if (blockedLookup.has(ds)) continue
        dates.add(ds)
      }

      setSchedule(sched)
      setAvailableSet(dates)
      setBlockedSet(blockedLookup)
    } catch (err) {
      console.log('Availability fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [providerId, today])

  useEffect(() => {
    fetchAvailability()
  }, [fetchAvailability])

  function canStepPrev(): boolean {
    // Can go back as long as we don't land before today's month.
    const prev = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    return !(prev.getFullYear() < today.getFullYear() ||
      (prev.getFullYear() === today.getFullYear() && prev.getMonth() < today.getMonth()))
  }

  function canStepNext(): boolean {
    // Cap at 2 months ahead so we don't browse past the 60-day window.
    const maxMonth = new Date(today.getFullYear(), today.getMonth() + 2, 1)
    const next = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
    return !(next.getFullYear() > maxMonth.getFullYear() ||
      (next.getFullYear() === maxMonth.getFullYear() && next.getMonth() > maxMonth.getMonth()))
  }

  function prevMonth() {
    if (!canStepPrev()) return
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
    setSelectedDateStr(null)
    setSelectedTimeStr(null)
    setTimeSlots([])
  }

  function nextMonth() {
    if (!canStepNext()) return
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
    setSelectedDateStr(null)
    setSelectedTimeStr(null)
    setTimeSlots([])
  }

  function handleDateTap(dateStr: string) {
    if (!availableSet.has(dateStr)) return
    setSelectedDateStr(dateStr)

    // Display string for the rest of the UI.
    const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10))
    const displayDate = new Date(y, m - 1, d).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
    setSelectedDate(displayDate)
    setRawDate(dateStr)

    setSelectedTimeStr(null)
    setSelectedTime('')
    setTimeSlots(getTimeSlotsForDate(dateStr, schedule))

    setTimeout(() => scrollRef.current?.scrollTo({ y: 420, animated: true }), 100)
  }

  function handleTimeTap(slot: TimeSlot) {
    setSelectedTimeStr(slot.time)
    setSelectedTime(slot.time)
  }

  // Build calendar grid for currentMonth.
  const firstDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()
  const daysInMonth = new Date(
    currentMonth.getFullYear(),
    currentMonth.getMonth() + 1,
    0,
  ).getDate()
  const calendarCells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) calendarCells.push(null)
  for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d)
  while (calendarCells.length % 7 !== 0) calendarCells.push(null)

  const cellSize = (width - 40) / 7
  const canContinue = !!selectedDateStr && !!selectedTimeStr
  const providerHasSchedule = schedule.length > 0
  const monthHasAvailability = useMemo(() => {
    if (availableSet.size === 0) return false
    for (const ds of availableSet) {
      const [y, m] = ds.split('-').map((s) => parseInt(s, 10))
      if (y === currentMonth.getFullYear() && m - 1 === currentMonth.getMonth()) {
        return true
      }
    }
    return false
  }, [availableSet, currentMonth])

  return (
    <BookingFlowScreen
      progressLabel={bookingProgressLabel('datetime', contractRequired)}
      onBack={() => router.back()}
      testID="book-datetime"
      scrollable={false}
      footer={
        <>
          {canContinue && selectedService ? (
            <Text style={[styles.ctaSummary, { color: colors.textSecondary }]}>
              {selectedService.name} · {formatSummaryDate(selectedDateStr!)} · {selectedTimeStr}
            </Text>
          ) : null}
          {/* Unchanged destination: the message step. The label no longer has to
              carry the step name now that the shell shows where in the flow we are. */}
          <Button
            label="Continue"
            disabled={!canContinue}
            onPress={() => canContinue && router.push('/book/message')}
            testID="datetime-continue"
          />
        </>
      }
    >
      {/* The shell does not own the scroll here: picking a date auto-scrolls to
          the time grid (`scrollRef`), which needs a ref this screen holds. */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        <BookingFlowHeading title="Pick a date & time" />
        {/* These are PUBLISHED HOURS, not a live capacity read. Picking one sends
            a request; it is not a held or confirmed slot until the provider
            accepts. Nothing here may imply live availability or scarcity. */}
        <BookingFlowNote
          title={`These are the hours ${providerFirstName} published.`}
          body={`Picking one sends a request. It is not a confirmed slot until ${providerFirstName} accepts.`}
        />

        {/* Provider strip */}
        <View style={[styles.providerStrip, { borderBottomColor: colors.borderSubtle }]}>
          <View style={[styles.providerAvatar, { backgroundColor: colors.bgSubtle }]}>
            <Feather name="user" size={16} color={colors.textSecondary} />
          </View>
          <View style={styles.providerInfo}>
            <Text style={[styles.providerName, { color: colors.textPrimary }]}>{providerName}</Text>
            <Text style={[styles.providerMeta, { color: colors.textSecondary }]}>
              {providerCategory}
              {providerCategory && providerLocation ? ' · ' : ''}
              {providerLocation}
            </Text>
            {selectedService && (
              <Text style={[styles.serviceMeta, { color: colors.textSecondary }]}>
                {selectedService.name} · {selectedService.duration}
              </Text>
            )}
          </View>
        </View>
        {/* No-schedule empty state takes over the whole content area */}
        {!loading && !providerHasSchedule ? (
          <View style={styles.noScheduleWrap}>
            <Feather name="clock" size={32} color={colors.textSecondary} />
            <Text style={[styles.noScheduleTitle, { color: colors.textPrimary }]}>
              This provider hasn&apos;t published any hours yet.
            </Text>
            <Text style={[styles.noScheduleSub, { color: colors.textSecondary }]}>
              Message them directly to arrange a time.
            </Text>
            <Pressable
              style={[styles.messageBtn, { backgroundColor: colors.actionPrimary }]}
              onPress={async () => {
                if (!user || !providerId) return
                // Pre-booking contact is a message REQUEST — same centralized entry
                // as the provider-profile Message button (not a free open chat).
                await openMessageEntry(user.id, providerId, providerName)
              }}
            >
              <Feather name="message-circle" size={14} color={colors.textOnAction} />
              <Text style={[styles.messageBtnText, { color: colors.textOnAction }]}>
                Message provider
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Month navigation */}
            <View style={styles.monthNav}>
              <TouchableOpacity
                style={[
                  styles.monthArrow,
                  { borderColor: colors.borderSubtle },
                  !canStepPrev() && styles.monthArrowDisabled,
                ]}
                onPress={prevMonth}
                disabled={!canStepPrev()}
                activeOpacity={0.7}
              >
                <Feather
                  name="chevron-left"
                  size={16}
                  color={canStepPrev() ? colors.iconPrimary : colors.textSecondary}
                />
              </TouchableOpacity>
              <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
                {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                style={[
                  styles.monthArrow,
                  { borderColor: colors.borderSubtle },
                  !canStepNext() && styles.monthArrowDisabled,
                ]}
                onPress={nextMonth}
                disabled={!canStepNext()}
                activeOpacity={0.7}
              >
                <Feather
                  name="chevron-right"
                  size={16}
                  color={canStepNext() ? colors.iconPrimary : colors.textSecondary}
                />
              </TouchableOpacity>
            </View>

            {/* Day of week header */}
            <View style={styles.dayHeader}>
              {DAY_LABELS.map((d) => (
                <Text
                  key={d}
                  style={[styles.dayHeaderText, { width: cellSize, color: colors.textSecondary }]}
                >
                  {d}
                </Text>
              ))}
            </View>

            {/* Calendar grid */}
            {loading ? (
              <View style={[styles.calendarGrid, { paddingTop: 8, paddingBottom: 8 }]}>
                {Array.from({ length: 35 }).map((_, i) => (
                  <View key={i} style={{ width: cellSize, height: cellSize, padding: 6 }}>
                    <Shimmer style={{ flex: 1, borderRadius: 12 }} />
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.calendarGrid}>
                {calendarCells.map((date, i) => {
                  if (!date) {
                    return (
                      <View
                        key={`empty-${i}`}
                        style={{ width: cellSize, height: cellSize }}
                      />
                    )
                  }
                  const dateObj = new Date(
                    currentMonth.getFullYear(),
                    currentMonth.getMonth(),
                    date,
                  )
                  const dateStr = isoDate(dateObj)
                  const isToday =
                    sameYearMonth(dateObj, today) && dateObj.getDate() === today.getDate()
                  const isSelected = dateStr === selectedDateStr
                  const isAvailable = availableSet.has(dateStr)
                  const isBlocked = blockedSet.has(dateStr)
                  const isPast = startOfDay(dateObj).getTime() < today.getTime()

                  return (
                    <DayCell
                      key={date}
                      day={String(date)}
                      size={cellSize}
                      selected={isSelected}
                      today={isToday}
                      // Unavailable covers "no published hours", "blocked by the
                      // provider" and "already past". None of them is a capacity
                      // read, and none is labelled as one.
                      available={isAvailable && !isPast && !isBlocked}
                      showAvailabilityDot={isAvailable}
                      onPress={() => handleDateTap(dateStr)}
                      testID={`datetime-day-${dateStr}`}
                    />
                  )
                })}
              </View>
            )}

            {/* No availability this month */}
            {!loading && !monthHasAvailability && (
              <View style={styles.monthEmptyWrap}>
                <Text style={[styles.monthEmptyText, { color: colors.textPrimary }]}>
                  No published hours in this period.
                </Text>
                <Text style={[styles.monthEmptySub, { color: colors.textSecondary }]}>
                  Check another month or contact the provider directly.
                </Text>
              </View>
            )}

            {/* Separator */}
            <View style={[styles.separator, { backgroundColor: colors.borderSubtle }]} />

            {/* Time slots */}
            <View style={styles.timeSlotsSection}>
              {/* Was "AVAILABLE TIMES" behind a ternary whose two branches were the
                  same string. These are the times the provider PUBLISHES, read from
                  their schedule — not a live capacity check, and picking one holds
                  nothing. */}
              <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
                PUBLISHED TIMES
              </Text>

              {!selectedDateStr ? (
                <Text style={[styles.noDateText, { color: colors.textSecondary }]}>
                  Select a date to see their times.
                </Text>
              ) : timeSlots.length === 0 ? (
                <Text style={[styles.noDateText, { color: colors.textSecondary }]}>
                  No hours published for this date.
                </Text>
              ) : (
                <View style={styles.timeGrid}>
                  {timeSlots.map((slot) => {
                    const isSlotSelected = selectedTimeStr === slot.time
                    return (
                      <TimeSlotChip
                        key={slot.time}
                        time={slot.time}
                        selected={isSlotSelected}
                        onPress={() => handleTimeTap(slot)}
                        testID={`datetime-slot-${slot.time}`}
                      />
                    )
                  })}
                </View>
              )}

              {/* Says out loud what the greyed slots mean, so a disabled chip is
                  never read as "someone else got there first". */}
              {selectedDateStr && timeSlots.length > 0 ? (
                <Text style={[styles.slotFootnote, { color: colors.textSecondary }]}>
                  Greyed times are outside the hours {providerFirstName} published. Third does
                  not show live availability.
                </Text>
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </BookingFlowScreen>
  )
}

function formatSummaryDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10))
  return `${MONTHS[m - 1]} ${d}`
}

// Geometry and type only. Every colour comes from the theme at render time —
// this screen has no appearance of its own.
const styles = StyleSheet.create({
  providerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  providerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: { flex: 1 },
  providerName: { fontSize: 13, fontFamily: 'Manrope_600SemiBold' },
  providerMeta: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  serviceMeta: { fontSize: 11, fontFamily: 'Manrope_400Regular', marginTop: 1 },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 12,
  },
  monthArrow: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowDisabled: { opacity: 0.4 },
  monthLabel: { fontSize: 16, fontFamily: 'Manrope_600SemiBold' },
  dayHeader: { flexDirection: 'row', paddingHorizontal: 20, marginBottom: 8 },
  dayHeaderText: { textAlign: 'center', fontSize: 12, fontFamily: 'Manrope_500Medium' },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 20 },
  monthEmptyWrap: { paddingHorizontal: 24, paddingTop: 12, alignItems: 'center', gap: 4 },
  monthEmptyText: { fontSize: 13, fontFamily: 'Manrope_500Medium' },
  monthEmptySub: { fontSize: 12, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  separator: { height: 1, marginHorizontal: 20, marginTop: 16 },
  timeSlotsSection: { paddingHorizontal: 20, marginTop: 16 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  noDateText: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    paddingVertical: 20,
  },
  timeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  slotFootnote: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
    marginTop: 14,
  },
  // No-schedule full takeover
  noScheduleWrap: { paddingHorizontal: 32, paddingTop: 64, alignItems: 'center', gap: 8 },
  noScheduleTitle: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  noScheduleSub: { fontSize: 13, fontFamily: 'Manrope_400Regular', textAlign: 'center' },
  messageBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    height: 46,
    borderRadius: 14,
  },
  messageBtnText: { fontSize: 14, fontFamily: 'Manrope_700Bold' },
  ctaSummary: {
    fontSize: 12,
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginBottom: 8,
  },
})
