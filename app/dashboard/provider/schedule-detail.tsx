import { useEffect, useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import {
  money,
  pct,
  parseHour,
  getTimeBlock,
  getDayOfWeek,
  TIME_BLOCK_LABELS,
  DAY_LABELS,
  DAY_LABELS_FULL,
  CANCEL_STATUSES,
  BookingRow,
} from './analytics-utils'

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
  return <Animated.View style={[{ backgroundColor: 'rgba(240,232,213,0.06)', opacity }, style]} />
}

interface Cell {
  bookings: number
  cancels: number
  noShows: number
}
interface BestSlot {
  label: string
  bookings: number
  cancelRate: number
}
interface ProblemSlot {
  label: string
  rate: number
  kind: string
}
interface DayBreak {
  day: string
  count: number
  revenue: number
  cancelRate: number
}
interface SchedData {
  heatmap: Cell[][] // [day 0-6][block 0-4]
  closedDays: number[]
  best: BestSlot[]
  problems: ProblemSlot[]
  days: DayBreak[]
  availableHours: number
  bookedHours: number
  utilization: number
}

function intensity(n: number): number {
  if (n === 0) return 0
  if (n <= 2) return 1
  if (n <= 4) return 2
  if (n <= 6) return 3
  return 4
}
const CELL_COLORS = [
  'rgba(240,232,213,0.04)',
  'rgba(200,146,42,0.2)',
  'rgba(200,146,42,0.4)',
  'rgba(200,146,42,0.65)',
  '#C8922A',
]

export default function ScheduleDetail() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SchedData | null>(null)

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: prov } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .single()
      const pid = prov?.id
      if (!pid) {
        setData(null)
        setLoading(false)
        return
      }

      const [bRes, availRes] = await Promise.all([
        supabase.from('bookings').select('*').eq('provider_id', pid),
        supabase.from('provider_availability').select('*').eq('provider_id', pid),
      ])
      const bookings = (bRes.data ?? []) as BookingRow[]
      const availability = (availRes.data ?? []) as any[]

      // Heatmap 7 x 5
      const heatmap: Cell[][] = Array.from({ length: 7 }, () =>
        Array.from({ length: 5 }, () => ({ bookings: 0, cancels: 0, noShows: 0 })),
      )
      bookings.forEach((b) => {
        if (!b.requested_date || !b.requested_time) return
        const day = getDayOfWeek(b.requested_date)
        const block = getTimeBlock(parseHour(b.requested_time))
        const cell = heatmap[day][block]
        cell.bookings += 1
        if (CANCEL_STATUSES.includes(b.status || '')) cell.cancels += 1
        if (b.status === 'no_show') cell.noShows += 1
      })

      const closedDays = availability
        .filter((a) => a.is_available === false)
        .map((a) => a.weekday)
        .filter((d): d is number => typeof d === 'number')

      // Best + problem slots
      const flat: { day: number; block: number; cell: Cell }[] = []
      heatmap.forEach((row, day) =>
        row.forEach((cell, block) => {
          if (cell.bookings > 0) flat.push({ day, block, cell })
        }),
      )
      const best: BestSlot[] = [...flat]
        .sort((a, b) => {
          const acr = a.cell.cancels / a.cell.bookings
          const bcr = b.cell.cancels / b.cell.bookings
          if (b.cell.bookings !== a.cell.bookings) return b.cell.bookings - a.cell.bookings
          return acr - bcr
        })
        .slice(0, 5)
        .map((f) => ({
          label: `${DAY_LABELS[f.day]} ${TIME_BLOCK_LABELS[f.block]}`,
          bookings: f.cell.bookings,
          cancelRate: (f.cell.cancels / f.cell.bookings) * 100,
        }))

      const problems: ProblemSlot[] = flat
        .map((f) => {
          const cr = (f.cell.cancels / f.cell.bookings) * 100
          const nr = (f.cell.noShows / f.cell.bookings) * 100
          return {
            label: `${DAY_LABELS_FULL[f.day]} ${TIME_BLOCK_LABELS[f.block]}`,
            cr,
            nr,
          }
        })
        .filter((f) => f.cr > 20 || f.nr > 20)
        .sort((a, b) => Math.max(b.cr, b.nr) - Math.max(a.cr, a.nr))
        .slice(0, 3)
        .map((f) =>
          f.cr >= f.nr
            ? { label: f.label, rate: f.cr, kind: 'cancel' }
            : { label: f.label, rate: f.nr, kind: 'no-show' },
        )

      // Day of week breakdown
      const HOURS_PER_BOOKING = 1.5 // approximation (no per-service hours joined here)
      const days: DayBreak[] = DAY_LABELS_FULL.map((dayName, d) => {
        const db = bookings.filter(
          (b) => b.requested_date && getDayOfWeek(b.requested_date) === d,
        )
        const completed = db.filter((b) => b.status === 'completed')
        const revenue = completed.reduce((s, b) => s + (b.payment_amount || 0), 0)
        const cancels = db.filter((b) => CANCEL_STATUSES.includes(b.status || '')).length
        const cancelRate = db.length > 0 ? (cancels / db.length) * 100 : 0
        return { day: dayName, count: db.length, revenue, cancelRate }
      }).filter((d) => d.count > 0)

      // Capacity: bookedHours from accepted + completed; availableHours from open days.
      const bookedBookings = bookings.filter(
        (b) => b.status === 'completed' || b.status === 'accepted',
      )
      const bookedHours = bookedBookings.length * HOURS_PER_BOOKING
      // Available hours: open days * estimated 8h window (no start/end columns confirmed).
      const openDayCount =
        availability.length > 0
          ? availability.filter((a) => a.is_available !== false).length
          : 5
      const availableHours = openDayCount * 8
      const utilization =
        availableHours > 0 ? Math.min((bookedHours / availableHours) * 100, 100) : 0

      setData({
        heatmap,
        closedDays,
        best,
        problems,
        days,
        availableHours,
        bookedHours,
        utilization,
      })
    } catch (err) {
      console.log('Schedule detail load error:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  // Heatmap is rendered day-columns Mon..Sun to match the Figma (M T W T F S S).
  const dayOrder = [1, 2, 3, 4, 5, 6, 0]
  const dayHeaders = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  const maxDayRevenue = data ? Math.max(...data.days.map((d) => d.revenue), 1) : 1

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.backBtn} activeOpacity={0.7} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Schedule</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.pad}>
          <Shimmer style={[s.card, { height: 200 }]} />
        </View>
      ) : !data || data.days.length === 0 ? (
        <View style={s.empty}>
          <Feather name="calendar" size={40} color="rgba(240,232,213,0.1)" />
          <Text style={s.emptyTitle}>No data yet</Text>
          <Text style={s.emptySub}>Complete bookings to see your schedule patterns.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.pad}>
          {/* Capacity stat triple */}
          <View style={s.statTriple}>
            <View style={s.statBox}>
              <Text style={s.statValue}>{Math.round(data.availableHours)}</Text>
              <Text style={s.statLabel}>Hours open</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statValue}>{pct(data.utilization)}</Text>
              <Text style={s.statLabel}>Utilization</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statValue}>{Math.round(data.bookedHours)}</Text>
              <Text style={s.statLabel}>Hours booked</Text>
            </View>
          </View>

          {/* Heatmap */}
          <Text style={s.sectionTitle}>Booking Heatmap</Text>
          <Text style={s.sectionSub}>Darker means more bookings.</Text>
          <View style={s.card}>
            <View style={s.heatHeaderRow}>
              <View style={s.heatLabelCol} />
              {dayHeaders.map((d, i) => (
                <Text key={i} style={s.heatDayLabel}>
                  {d}
                </Text>
              ))}
            </View>
            {TIME_BLOCK_LABELS.map((blockLabel, block) => (
              <View key={blockLabel} style={s.heatRow}>
                <Text style={s.heatBlockLabel}>{blockLabel}</Text>
                {dayOrder.map((day) => {
                  const closed = data.closedDays.includes(day)
                  const cell = data.heatmap[day][block]
                  const lvl = intensity(cell.bookings)
                  return (
                    <View
                      key={day}
                      style={[
                        s.heatCell,
                        {
                          backgroundColor: closed
                            ? 'rgba(240,232,213,0.02)'
                            : CELL_COLORS[lvl],
                        },
                      ]}
                    >
                      {closed && <Text style={s.heatClosed}>·</Text>}
                    </View>
                  )
                })}
              </View>
            ))}
            <View style={s.legendRow}>
              <Text style={s.legendText}>Less</Text>
              {CELL_COLORS.map((c, i) => (
                <View key={i} style={[s.legendCell, { backgroundColor: c }]} />
              ))}
              <Text style={s.legendText}>More</Text>
            </View>
          </View>

          {/* Best slots */}
          {data.best.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Your Best Slots</Text>
              <View style={s.card}>
                {data.best.map((b, i) => (
                  <View key={b.label} style={[s.slotRow, i < data.best.length - 1 && s.rowBorder]}>
                    <Text style={s.slotRank}>#{i + 1}</Text>
                    <View style={s.flex1}>
                      <Text style={s.slotLabel}>{b.label}</Text>
                      <Text style={s.slotMeta}>{b.bookings} bookings</Text>
                    </View>
                    <Text style={s.slotPct}>{pct(100 - b.cancelRate)}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* Problem slots */}
          {data.problems.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Slots Worth Reconsidering</Text>
              {data.problems.map((p) => (
                <View key={p.label} style={[s.card, s.problemCard]}>
                  <View style={s.rowBetween}>
                    <Text style={s.problemLabel}>{p.label}</Text>
                    <Text style={s.problemRate}>
                      {pct(p.rate)} {p.kind}
                    </Text>
                  </View>
                  <Text style={s.problemNote}>
                    This slot has a high {p.kind} rate. Consider a deposit requirement to
                    protect it.
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* Capacity breakdown */}
          <Text style={s.sectionTitle}>Capacity This Month</Text>
          <View style={s.card}>
            <Text style={s.capPct}>
              {pct(data.utilization)}
              <Text style={s.capPctSub}> of available hours booked</Text>
            </Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${data.utilization}%` }]} />
            </View>
            <View style={s.capRow}>
              <Text style={s.capLabel}>Available hours</Text>
              <Text style={s.capValue}>{Math.round(data.availableHours)} hrs</Text>
            </View>
            <View style={s.capRow}>
              <Text style={s.capLabel}>Hours booked</Text>
              <Text style={s.capValue}>{Math.round(data.bookedHours)} hrs</Text>
            </View>
          </View>

          {/* Day of week breakdown */}
          <Text style={s.sectionTitle}>By Day of Week</Text>
          <View style={s.card}>
            {data.days.map((d) => (
              <View key={d.day} style={s.barRow}>
                <View style={s.barTop}>
                  <View>
                    <Text style={s.barLabel}>{d.day}</Text>
                    <Text style={s.dayMeta}>
                      {d.count} bookings · {pct(d.cancelRate)} cancel
                    </Text>
                  </View>
                  <Text style={s.barAmount}>{money(d.revenue)}</Text>
                </View>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${(d.revenue / maxDayRevenue) * 100}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 18, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  pad: { padding: 24, paddingBottom: 120 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold', marginTop: 14 },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  problemCard: { borderColor: 'rgba(224,92,92,0.2)' },
  statTriple: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 14,
    alignItems: 'center',
  },
  statValue: { fontSize: 20, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  statLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  sectionTitle: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginBottom: 6 },
  sectionSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 12,
  },
  heatHeaderRow: { flexDirection: 'row', marginBottom: 6 },
  heatLabelCol: { width: 64 },
  heatDayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  heatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  heatBlockLabel: {
    width: 64,
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  heatCell: {
    flex: 1,
    height: 32,
    borderRadius: 6,
    marginHorizontal: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heatClosed: { fontSize: 12, color: 'rgba(240,232,213,0.2)' },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 10 },
  legendText: { fontSize: 11, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  legendCell: { width: 12, height: 12, borderRadius: 3 },
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(240,232,213,0.06)' },
  slotRank: { fontSize: 16, color: '#C8922A', fontFamily: 'Manrope_700Bold', width: 28 },
  flex1: { flex: 1 },
  slotLabel: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  slotMeta: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 2 },
  slotPct: { fontSize: 14, color: '#4CAF50', fontFamily: 'Manrope_700Bold' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  problemLabel: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  problemRate: { fontSize: 13, color: '#E05C5C', fontFamily: 'Manrope_700Bold' },
  problemNote: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 8,
    lineHeight: 19,
  },
  capPct: { fontSize: 28, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  capPctSub: { fontSize: 14, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(240,232,213,0.08)',
    marginTop: 12,
    marginBottom: 14,
    overflow: 'hidden',
  },
  progressFill: { height: 10, borderRadius: 5, backgroundColor: '#C8922A' },
  capRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  capLabel: { fontSize: 13, color: 'rgba(240,232,213,0.7)', fontFamily: 'Manrope_400Regular' },
  capValue: { fontSize: 13, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  barRow: { marginBottom: 14 },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  barLabel: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  dayMeta: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 2 },
  barAmount: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(240,232,213,0.08)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#C8922A' },
})
