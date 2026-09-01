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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'
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
  return (
    <Animated.View
      style={[{ backgroundColor: 'rgba(240,232,213,0.06)', opacity }, style]}
    />
  )
}

export default function BookDateTime() {
  const insets = useSafeAreaInsets()
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
  } = useBookingStore()
  const { user } = useAuth()
  const scrollRef = useRef<ScrollView>(null)

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
        <Text style={styles.topBarTitle}>Pick a Date & Time</Text>
        <View style={styles.topBarSpacer} />
      </View>

      {/* Provider strip */}
      <View style={styles.providerStrip}>
        <View style={styles.providerAvatar}>
          <Feather name="user" size={16} color="rgba(240,232,213,0.4)" />
        </View>
        <View style={styles.providerInfo}>
          <Text style={styles.providerName}>{providerName}</Text>
          <Text style={styles.providerMeta}>
            {providerCategory}
            {providerCategory && providerLocation ? ' · ' : ''}
            {providerLocation}
          </Text>
          {selectedService && (
            <Text style={styles.serviceMeta}>
              {selectedService.name} · {selectedService.duration}
            </Text>
          )}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        {/* No-schedule empty state takes over the whole content area */}
        {!loading && !providerHasSchedule ? (
          <View style={styles.noScheduleWrap}>
            <Feather name="clock" size={32} color="rgba(240,232,213,0.18)" />
            <Text style={styles.noScheduleTitle}>
              This provider hasn&apos;t set their availability yet.
            </Text>
            <Text style={styles.noScheduleSub}>
              Message them directly to arrange a time.
            </Text>
            <Pressable
              style={styles.messageBtn}
              onPress={async () => {
                if (!user || !providerId) return
                // Pre-booking contact is a message REQUEST — same centralized entry
                // as the provider-profile Message button (not a free open chat).
                await openMessageEntry(user.id, providerId, providerName)
              }}
            >
              <Feather name="message-circle" size={14} color="#080808" />
              <Text style={styles.messageBtnText}>Message provider</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Month navigation */}
            <View style={styles.monthNav}>
              <TouchableOpacity
                style={[styles.monthArrow, !canStepPrev() && styles.monthArrowDisabled]}
                onPress={prevMonth}
                disabled={!canStepPrev()}
                activeOpacity={0.7}
              >
                <Feather
                  name="chevron-left"
                  size={16}
                  color={canStepPrev() ? '#F0E8D5' : 'rgba(240,232,213,0.2)'}
                />
              </TouchableOpacity>
              <Text style={styles.monthLabel}>
                {MONTHS[currentMonth.getMonth()]} {currentMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                style={[styles.monthArrow, !canStepNext() && styles.monthArrowDisabled]}
                onPress={nextMonth}
                disabled={!canStepNext()}
                activeOpacity={0.7}
              >
                <Feather
                  name="chevron-right"
                  size={16}
                  color={canStepNext() ? '#F0E8D5' : 'rgba(240,232,213,0.2)'}
                />
              </TouchableOpacity>
            </View>

            {/* Day of week header */}
            <View style={styles.dayHeader}>
              {DAY_LABELS.map((d) => (
                <Text key={d} style={[styles.dayHeaderText, { width: cellSize }]}>
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
                    <TouchableOpacity
                      key={date}
                      style={[
                        styles.dayCell,
                        { width: cellSize, height: cellSize },
                        isToday && styles.dayCellToday,
                        isSelected && styles.dayCellSelected,
                      ]}
                      onPress={() => handleDateTap(dateStr)}
                      disabled={!isAvailable}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.dayNumber,
                          (!isAvailable || isPast) && styles.dayNumberUnavailable,
                          isToday && styles.dayNumberToday,
                          isSelected && styles.dayNumberSelected,
                          isBlocked && styles.dayNumberBlocked,
                        ]}
                      >
                        {date}
                      </Text>
                      {isAvailable && !isSelected && <View style={styles.availableDot} />}
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}

            {/* No availability this month */}
            {!loading && !monthHasAvailability && (
              <View style={styles.monthEmptyWrap}>
                <Text style={styles.monthEmptyText}>No availability in this period.</Text>
                <Text style={styles.monthEmptySub}>
                  Check back later or contact the provider directly.
                </Text>
              </View>
            )}

            {/* Separator */}
            <View style={styles.separator} />

            {/* Time slots */}
            <View style={styles.timeSlotsSection}>
              <Text style={styles.sectionLabel}>
                {selectedDateStr ? 'AVAILABLE TIMES' : 'AVAILABLE TIMES'}
              </Text>

              {!selectedDateStr ? (
                <Text style={styles.noDateText}>Select a date to see available times</Text>
              ) : timeSlots.length === 0 ? (
                <Text style={styles.noDateText}>
                  No time slots available for this date.
                </Text>
              ) : (
                <View style={styles.timeGrid}>
                  {timeSlots.map((slot) => {
                    const isSlotSelected = selectedTimeStr === slot.time
                    return (
                      <TouchableOpacity
                        key={slot.time}
                        style={[
                          styles.timeSlot,
                          isSlotSelected && styles.timeSlotSelected,
                        ]}
                        onPress={() => handleTimeTap(slot)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[
                            styles.timeSlotText,
                            isSlotSelected && styles.timeSlotTextSelected,
                          ]}
                        >
                          {slot.time}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        {selectedDateStr && selectedTimeStr && selectedService && (
          <Text style={styles.ctaSummary}>
            {selectedService.name} · {formatSummaryDate(selectedDateStr)} · {selectedTimeStr}
          </Text>
        )}
        <Pressable
          style={[styles.nextBtn, !canContinue && styles.nextBtnInactive]}
          onPress={() => canContinue && router.push('/book/message')}
        >
          <Text style={[styles.nextBtnText, !canContinue && styles.nextBtnTextInactive]}>
            Next: Your Request
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

function formatSummaryDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map((s) => parseInt(s, 10))
  return `${MONTHS[m - 1]} ${d}`
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
  providerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
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
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  providerMeta: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  serviceMeta: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 1,
  },
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
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthArrowDisabled: {
    opacity: 0.4,
  },
  monthLabel: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  dayHeader: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  dayHeaderText: {
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
  },
  dayCell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  dayCellToday: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.2)',
  },
  dayCellSelected: {
    backgroundColor: '#F0E8D5',
  },
  dayNumber: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  dayNumberUnavailable: {
    color: 'rgba(240,232,213,0.2)',
    fontFamily: 'Manrope_400Regular',
  },
  dayNumberBlocked: {
    textDecorationLine: 'line-through',
  },
  dayNumberToday: {
    fontFamily: 'Manrope_600SemiBold',
  },
  dayNumberSelected: {
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  availableDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#C8922A',
    marginTop: 2,
  },
  monthEmptyWrap: {
    paddingHorizontal: 24,
    paddingTop: 12,
    alignItems: 'center',
    gap: 4,
  },
  monthEmptyText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  monthEmptySub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginHorizontal: 20,
    marginTop: 16,
  },
  timeSlotsSection: {
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
    marginBottom: 12,
  },
  noDateText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    paddingVertical: 20,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeSlot: {
    width: '48%',
    paddingVertical: 12,
    borderRadius: 10,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    backgroundColor: 'rgba(240,232,213,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeSlotSelected: {
    borderColor: 'rgba(240,232,213,0.3)',
    backgroundColor: 'rgba(240,232,213,0.1)',
  },
  timeSlotText: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  timeSlotTextSelected: {
    fontFamily: 'Manrope_600SemiBold',
  },
  // No-schedule full takeover
  noScheduleWrap: {
    paddingHorizontal: 32,
    paddingTop: 64,
    alignItems: 'center',
    gap: 8,
  },
  noScheduleTitle: {
    marginTop: 12,
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  noScheduleSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  messageBtn: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 22,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
  },
  messageBtnText: {
    fontSize: 14,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
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
  ctaSummary: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginBottom: 8,
  },
  nextBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  nextBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  nextBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
})
