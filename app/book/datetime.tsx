import { useState, useRef } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'

// Calendar constants for May 2026
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// May 2026 starts on Friday (index 5), 31 days
const CALENDAR_MONTH = 4 // May = index 4
const CALENDAR_YEAR = 2026
const MONTH_START_DAY = 5 // Friday
const MONTH_DAYS = 31
const TODAY_DATE = 24

const AVAILABLE_DATES = [28, 29, 30, 31]

const TIME_SLOTS_MAP: Record<number, { time: string; booked: boolean }[]> = {
  28: [
    { time: '9:00 AM', booked: false },
    { time: '10:00 AM', booked: true },
    { time: '11:00 AM', booked: false },
    { time: '1:00 PM', booked: false },
    { time: '2:30 PM', booked: false },
    { time: '3:00 PM', booked: true },
    { time: '4:00 PM', booked: false },
  ],
  29: [
    { time: '10:00 AM', booked: false },
    { time: '12:00 PM', booked: false },
    { time: '2:00 PM', booked: false },
    { time: '4:00 PM', booked: true },
  ],
  30: [
    { time: '9:00 AM', booked: false },
    { time: '11:00 AM', booked: false },
    { time: '1:00 PM', booked: true },
    { time: '3:00 PM', booked: false },
  ],
  31: [
    { time: '10:00 AM', booked: false },
    { time: '2:00 PM', booked: false },
  ],
}

export default function BookDateTime() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const { providerName, providerCategory, providerLocation, selectedService, setSelectedDate, setSelectedTime } = useBookingStore()
  const [currentMonth, setCurrentMonth] = useState(CALENDAR_MONTH)
  const [currentYear, setCurrentYear] = useState(CALENDAR_YEAR)
  const [selectedDateNum, setSelectedDateNum] = useState<number | null>(null)
  const [selectedTimeStr, setSelectedTimeStr] = useState<string | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  function prevMonth() {
    if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear((y) => y - 1) }
    else setCurrentMonth((m) => m - 1)
    setSelectedDateNum(null); setSelectedTimeStr(null)
  }
  function nextMonth() {
    if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear((y) => y + 1) }
    else setCurrentMonth((m) => m + 1)
    setSelectedDateNum(null); setSelectedTimeStr(null)
  }

  function handleDateTap(date: number) {
    if (!AVAILABLE_DATES.includes(date) || date < TODAY_DATE) return
    setSelectedDateNum(date)
    setSelectedDate(`${MONTHS[currentMonth]} ${date}, ${currentYear}`)
    setSelectedTimeStr(null)
    setSelectedTime('')
    setTimeout(() => scrollRef.current?.scrollTo({ y: 420, animated: true }), 100)
  }

  function handleTimeTap(slot: { time: string; booked: boolean }) {
    if (slot.booked) return
    setSelectedTimeStr(slot.time)
    setSelectedTime(slot.time)
  }

  // Build calendar grid
  const calendarCells: (number | null)[] = []
  for (let i = 0; i < MONTH_START_DAY; i++) calendarCells.push(null)
  for (let d = 1; d <= MONTH_DAYS; d++) calendarCells.push(d)
  while (calendarCells.length % 7 !== 0) calendarCells.push(null)

  const cellSize = (width - 40) / 7
  const timeSlots = selectedDateNum ? TIME_SLOTS_MAP[selectedDateNum] ?? [] : []
  const canContinue = !!selectedDateNum && !!selectedTimeStr

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
          <Text style={styles.providerMeta}>{providerCategory} · {providerLocation}</Text>
          {selectedService && (
            <Text style={styles.serviceMeta}>{selectedService.name} · {selectedService.duration}</Text>
          )}
        </View>
        <View style={styles.ratingRow}>
          <Feather name="star" size={11} color="#C8922A" />
          <Text style={styles.ratingText}>4.9</Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 140 }}
      >
        {/* Month navigation */}
        <View style={styles.monthNav}>
          <TouchableOpacity style={styles.monthArrow} onPress={prevMonth} activeOpacity={0.7}>
            <Feather name="chevron-left" size={16} color="#F0E8D5" />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTHS[currentMonth]} {currentYear}</Text>
          <TouchableOpacity style={styles.monthArrow} onPress={nextMonth} activeOpacity={0.7}>
            <Feather name="chevron-right" size={16} color="#F0E8D5" />
          </TouchableOpacity>
        </View>

        {/* Day of week header */}
        <View style={styles.dayHeader}>
          {DAY_LABELS.map((d) => (
            <Text key={d} style={[styles.dayHeaderText, { width: cellSize }]}>{d}</Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.calendarGrid}>
          {calendarCells.map((date, i) => {
            if (!date) {
              return <View key={`empty-${i}`} style={{ width: cellSize, height: cellSize }} />
            }
            const isToday = date === TODAY_DATE && currentMonth === CALENDAR_MONTH && currentYear === CALENDAR_YEAR
            const isSelected = date === selectedDateNum
            const isAvailable = AVAILABLE_DATES.includes(date) && date >= TODAY_DATE && currentMonth === CALENDAR_MONTH
            const isPast = date < TODAY_DATE && currentMonth === CALENDAR_MONTH && currentYear === CALENDAR_YEAR

            return (
              <TouchableOpacity
                key={date}
                style={[
                  styles.dayCell,
                  { width: cellSize, height: cellSize },
                  isToday && styles.dayCellToday,
                  isSelected && styles.dayCellSelected,
                ]}
                onPress={() => handleDateTap(date)}
                disabled={!isAvailable}
                activeOpacity={0.7}
              >
                <Text style={[
                  styles.dayNumber,
                  (isPast || (!isAvailable && !isToday)) && styles.dayNumberUnavailable,
                  isToday && styles.dayNumberToday,
                  isSelected && styles.dayNumberSelected,
                ]}>
                  {date}
                </Text>
                {isAvailable && !isSelected && (
                  <View style={styles.availableDot} />
                )}
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Separator */}
        <View style={styles.separator} />

        {/* Time slots */}
        <View style={styles.timeSlotsSection}>
          <Text style={styles.sectionLabel}>
            {selectedDateNum
              ? `AVAILABLE TIMES — ${MONTHS[currentMonth].toUpperCase()} ${selectedDateNum}`
              : 'AVAILABLE TIMES'}
          </Text>

          {!selectedDateNum ? (
            <Text style={styles.noDateText}>Select a date to see available times</Text>
          ) : (
            <View style={styles.timeGrid}>
              {timeSlots.map((slot) => {
                const isSlotSelected = selectedTimeStr === slot.time
                return (
                  <TouchableOpacity
                    key={slot.time}
                    style={[
                      styles.timeSlot,
                      slot.booked && styles.timeSlotBooked,
                      isSlotSelected && styles.timeSlotSelected,
                    ]}
                    onPress={() => handleTimeTap(slot)}
                    disabled={slot.booked}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.timeSlotText,
                      slot.booked && styles.timeSlotTextBooked,
                      isSlotSelected && styles.timeSlotTextSelected,
                    ]}>
                      {slot.time}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        {selectedDateNum && selectedTimeStr && selectedService && (
          <Text style={styles.ctaSummary}>
            {selectedService.name} · {MONTHS[currentMonth]} {selectedDateNum} · {selectedTimeStr}
          </Text>
        )}
        <Pressable
          style={[styles.nextBtn, !canContinue && styles.nextBtnInactive]}
          onPress={() => canContinue && router.push('/book/policy')}
        >
          <Text style={[styles.nextBtnText, !canContinue && styles.nextBtnTextInactive]}>
            Next: Review Policy
          </Text>
        </Pressable>
      </View>
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
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
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
  timeSlotBooked: {
    borderColor: 'rgba(240,232,213,0.04)',
    backgroundColor: 'transparent',
  },
  timeSlotText: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  timeSlotTextSelected: {
    fontFamily: 'Manrope_600SemiBold',
  },
  timeSlotTextBooked: {
    color: 'rgba(240,232,213,0.2)',
    fontFamily: 'Manrope_400Regular',
    textDecorationLine: 'line-through',
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
