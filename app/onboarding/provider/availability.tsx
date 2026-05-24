import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

interface DaySchedule {
  enabled: boolean
  startTime: Date
  endTime: Date
}

type Schedule = Record<string, DaySchedule>

function makeTime(h: number, m: number): Date {
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return d
}

function formatTime(d: Date): string {
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`
}

function formatDate(s: string): string {
  const [y, mo, d] = s.split('-')
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[parseInt(mo) - 1]} ${parseInt(d)}`
}

const DEFAULT_SCHEDULE: Schedule = {
  Monday:    { enabled: true,  startTime: makeTime(9, 0),  endTime: makeTime(18, 0) },
  Tuesday:   { enabled: true,  startTime: makeTime(9, 0),  endTime: makeTime(18, 0) },
  Wednesday: { enabled: true,  startTime: makeTime(9, 0),  endTime: makeTime(18, 0) },
  Thursday:  { enabled: true,  startTime: makeTime(9, 0),  endTime: makeTime(18, 0) },
  Friday:    { enabled: true,  startTime: makeTime(9, 0),  endTime: makeTime(18, 0) },
  Saturday:  { enabled: true,  startTime: makeTime(10, 0), endTime: makeTime(16, 0) },
  Sunday:    { enabled: false, startTime: makeTime(9, 0),  endTime: makeTime(18, 0) },
}

const BUFFER_OPTIONS = [0, 15, 30, 45, 60, 90, 120]

export default function ProviderAvailability() {
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)

  const [schedule, setSchedule] = useState<Schedule>(DEFAULT_SCHEDULE)
  const [bufferTime, setBufferTime] = useState(15)
  const [instantBooking, setInstantBooking] = useState(false)
  const [blackoutDates, setBlackoutDates] = useState<string[]>([])

  // Time picker modal
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [editingDay, setEditingDay] = useState<string | null>(null)
  const [editingField, setEditingField] = useState<'startTime' | 'endTime'>('startTime')
  const [pendingTime, setPendingTime] = useState<Date>(new Date())

  // Date picker modal
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pendingDate, setPendingDate] = useState<Date>(new Date())

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    }, 0)
    return () => clearTimeout(t)
  }, [])

  function toggleDay(day: string) {
    setSchedule((prev) => ({
      ...prev,
      [day]: { ...prev[day], enabled: !prev[day].enabled },
    }))
  }

  function openTimePicker(day: string, field: 'startTime' | 'endTime') {
    setEditingDay(day)
    setEditingField(field)
    setPendingTime(schedule[day][field])
    setShowTimePicker(true)
  }

  function confirmTime() {
    if (!editingDay) return
    setSchedule((prev) => ({
      ...prev,
      [editingDay]: { ...prev[editingDay], [editingField]: pendingTime },
    }))
    setShowTimePicker(false)
  }

  function stepBuffer(dir: 1 | -1) {
    const idx = BUFFER_OPTIONS.indexOf(bufferTime)
    const next = idx + dir
    if (next < 0 || next >= BUFFER_OPTIONS.length) return
    setBufferTime(BUFFER_OPTIONS[next])
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

  function confirmDate() {
    const iso = pendingDate.toISOString().split('T')[0]
    if (!blackoutDates.includes(iso)) {
      setBlackoutDates((prev) => [...prev, iso].sort())
    }
    setShowDatePicker(false)
  }

  function removeBlackoutDate(iso: string) {
    setBlackoutDates((prev) => prev.filter((d) => d !== iso))
  }

  return (
    <View style={styles.root}>
      {/* Progress bar — 62.5% */}
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
        <Text style={styles.topBarLabel}>Your availability</Text>
        <Text style={styles.topBarStep}>Step 5 of 8</Text>
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
        <Text style={styles.headline}>Set your schedule.</Text>
        <Text style={styles.subtext}>
          Clients will only see time slots that fit your availability. You can always change this later.
        </Text>

        {/* Weekly schedule */}
        <Text style={styles.sectionLabel}>WEEKLY HOURS</Text>
        <View style={styles.card}>
          {DAYS.map((day, i) => {
            const s = schedule[day]
            return (
              <View key={day} style={[styles.dayRow, i < DAYS.length - 1 && styles.dayRowBorder]}>
                <Switch
                  value={s.enabled}
                  onValueChange={() => toggleDay(day)}
                  trackColor={{ false: 'rgba(240,232,213,0.1)', true: 'rgba(240,232,213,0.35)' }}
                  thumbColor={s.enabled ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
                  ios_backgroundColor="rgba(240,232,213,0.1)"
                />
                <Text style={[styles.dayName, !s.enabled && styles.dayNameOff]}>
                  {day.slice(0, 3)}
                </Text>
                {s.enabled ? (
                  <View style={styles.timePills}>
                    <Pressable
                      style={styles.timePill}
                      onPress={() => openTimePicker(day, 'startTime')}
                    >
                      <Text style={styles.timePillText}>{formatTime(s.startTime)}</Text>
                    </Pressable>
                    <Text style={styles.timeSep}>–</Text>
                    <Pressable
                      style={styles.timePill}
                      onPress={() => openTimePicker(day, 'endTime')}
                    >
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
        <Text style={styles.sectionLabel}>BUFFER TIME</Text>
        <View style={styles.card}>
          <View style={styles.bufferRow}>
            <View style={styles.bufferInfo}>
              <Text style={styles.bufferTitle}>Time between bookings</Text>
              <Text style={styles.bufferSub}>Give yourself a break between clients.</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                style={[styles.stepBtn, bufferTime === BUFFER_OPTIONS[0] && styles.stepBtnDisabled]}
                onPress={() => stepBuffer(-1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name="minus"
                  size={14}
                  color={bufferTime === BUFFER_OPTIONS[0] ? 'rgba(240,232,213,0.2)' : 'rgba(240,232,213,0.7)'}
                />
              </Pressable>
              <Text style={styles.stepValue}>{formatBuffer(bufferTime)}</Text>
              <Pressable
                style={[styles.stepBtn, bufferTime === BUFFER_OPTIONS[BUFFER_OPTIONS.length - 1] && styles.stepBtnDisabled]}
                onPress={() => stepBuffer(1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name="plus"
                  size={14}
                  color={bufferTime === BUFFER_OPTIONS[BUFFER_OPTIONS.length - 1] ? 'rgba(240,232,213,0.2)' : 'rgba(240,232,213,0.7)'}
                />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Instant booking */}
        <Text style={styles.sectionLabel}>BOOKING PREFERENCES</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Instant booking</Text>
              <Text style={styles.toggleSub}>
                {instantBooking
                  ? 'Clients book directly — no approval needed.'
                  : 'You review and approve each request.'}
              </Text>
            </View>
            <Switch
              value={instantBooking}
              onValueChange={setInstantBooking}
              trackColor={{ false: 'rgba(240,232,213,0.1)', true: 'rgba(240,232,213,0.35)' }}
              thumbColor={instantBooking ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
              ios_backgroundColor="rgba(240,232,213,0.1)"
            />
          </View>
        </View>

        {/* Blackout dates */}
        <Text style={styles.sectionLabel}>BLACKOUT DATES</Text>
        <View style={styles.card}>
          <Text style={styles.blackoutSub}>Block specific dates you're unavailable.</Text>
          {blackoutDates.length > 0 && (
            <View style={styles.chipWrap}>
              {blackoutDates.map((iso) => (
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
            <Feather name="plus" size={14} color="rgba(240,232,213,0.45)" />
            <Text style={styles.addDateText}>Add a date</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.continueBtn} onPress={() => router.push('/onboarding/provider/policy')}>
          <Text style={styles.continueBtnText}>Continue</Text>
        </Pressable>
        <Text style={styles.ctaNote}>You can update your availability anytime from settings.</Text>
      </View>

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
              {editingDay} · {editingField === 'startTime' ? 'Start' : 'End'}
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
    width: '62.5%',
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
    marginBottom: 28,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
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
    borderCurve: 'continuous',
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

  // Instant booking toggle
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
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
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
  ctaNote: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 10,
  },

  // Modal
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
