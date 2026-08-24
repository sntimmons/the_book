import { useEffect, useState, useRef, useCallback } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Animated,
  Modal,
  Pressable,
  TextInput,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import {
  money,
  currentMonthRange,
  monthRange,
  goalKey,
  BookingRow,
  inMonth,
  isEarning,
  getProviderDbId,
} from './analytics-utils'
import { DoneAccessory, DONE_ACCESSORY_ID } from '../../../components/DoneAccessory'

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

interface MonthBar {
  label: string
  amount: number
}
interface WeekBar {
  label: string
  amount: number
}
interface GoalData {
  goalAmount: number
  thisMonthRevenue: number
  pendingRevenue: number
  pendingCount: number
  thisMonthBookings: number
  daysLeft: number
  onTrack: boolean
  months: MonthBar[]
  weeks: WeekBar[]
}

export default function GoalDetail() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<GoalData | null>(null)
  const [editing, setEditing] = useState(false)
  const [goalInput, setGoalInput] = useState('')
  const [providerDbId, setProviderDbIdState] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const providerDbId = await getProviderDbId(user?.id)
      if (!providerDbId) {
        setProviderDbIdState(null)
        setData(null)
        setLoading(false)
        return
      }
      setProviderDbIdState(providerDbId)

      const { data: bRows } = await supabase
        .from('bookings')
        .select('*')
        .eq('provider_id', providerDbId)
      const bookings = (bRows ?? []) as BookingRow[]

      const goalStr =
        (await AsyncStorage.getItem(goalKey(user?.id ?? providerDbId))) || '2000'
      const goalAmount = parseFloat(goalStr) || 2000

      const cur = currentMonthRange()
      // TODO: revert to completed only
      // before production launch
      const completed = bookings.filter((b) => isEarning(b.status))
      const thisMonthCompleted = completed.filter((b) =>
        inMonth(b.created_at, cur.start, cur.end),
      )
      const thisMonthRevenue = thisMonthCompleted.reduce(
        (s, b) => s + (b.payment_amount || 0),
        0,
      )
      const pending = bookings.filter((b) => b.status === 'pending')
      const pendingRevenue = pending.reduce((s, b) => s + (b.payment_amount || 0), 0)

      const now = new Date()
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const daysLeft = daysInMonth - now.getDate()
      const projected = (thisMonthRevenue / now.getDate()) * daysInMonth
      const onTrack = projected >= goalAmount

      // Past 6 months
      const months: MonthBar[] = []
      for (let i = 5; i >= 1; i--) {
        const r = monthRange(i)
        const amount = completed
          .filter((b) => inMonth(b.created_at, r.start, r.end))
          .reduce((s, b) => s + (b.payment_amount || 0), 0)
        months.push({ label: r.shortLabel, amount })
      }

      // Weekly breakdown of current month
      const weeks: WeekBar[] = [0, 1, 2, 3].map((w) => ({
        label: 'W' + (w + 1),
        amount: 0,
      }))
      thisMonthCompleted.forEach((b) => {
        if (!b.created_at) return
        const day = new Date(b.created_at).getDate()
        const wi = Math.min(Math.floor((day - 1) / 7), 3)
        weeks[wi].amount += b.payment_amount || 0
      })

      setData({
        goalAmount,
        thisMonthRevenue,
        pendingRevenue,
        pendingCount: pending.length,
        thisMonthBookings: thisMonthCompleted.length,
        daysLeft,
        onTrack,
        months,
        weeks,
      })
    } catch (err) {
      console.log('Goal detail load error:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function saveGoal() {
    const keyOwner = user?.id ?? providerDbId
    if (!keyOwner) return
    const parsed = parseFloat(goalInput)
    if (Number.isNaN(parsed) || parsed <= 0) {
      setEditing(false)
      return
    }
    await AsyncStorage.setItem(goalKey(keyOwner), String(parsed))
    setEditing(false)
    load()
  }

  const progressPct = data ? Math.min((data.thisMonthRevenue / data.goalAmount) * 100, 100) : 0
  const toGo = data ? Math.max(data.goalAmount - data.thisMonthRevenue, 0) : 0
  const perWeek = data && data.daysLeft > 0 ? Math.ceil(toGo / (data.daysLeft / 7) / 95) : 0
  const maxMonth = data ? Math.max(...data.months.map((m) => m.amount), 1) : 1
  const maxWeek = data ? Math.max(...data.weeks.map((w) => w.amount), 1) : 1

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Goal Tracker</Text>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => {
            setGoalInput(data ? String(data.goalAmount) : '')
            setEditing(true)
          }}
        >
          <Text style={s.editLink}>Edit</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.pad}>
          <Shimmer style={[s.card, { height: 220 }]} />
        </View>
      ) : !data ? (
        <View style={s.empty}>
          <Feather name="target" size={40} color="rgba(240,232,213,0.1)" />
          <Text style={s.emptyTitle}>No data yet</Text>
          <Text style={s.emptySub}>Complete your first booking to track your goal.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.pad}>
          {/* Goal progress card */}
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.monthLabel}>
                {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
              <View style={[s.pill, data.onTrack ? s.pillGreen : s.pillAmber]}>
                <Text style={data.onTrack ? s.pillGreenText : s.pillAmberText}>
                  {data.onTrack ? 'On track' : 'Behind'}
                </Text>
              </View>
            </View>
            <Text style={s.bigValue}>
              {money(data.thisMonthRevenue)}
              <Text style={s.bigValueSub}> of {money(data.goalAmount)}</Text>
            </Text>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${progressPct}%` }]} />
            </View>
            <View style={s.quadRow}>
              <View style={s.quad}>
                <Text style={s.quadValue}>{money(toGo)}</Text>
                <Text style={s.quadLabel}>to go</Text>
              </View>
              <View style={s.quad}>
                <Text style={s.quadValue}>{data.daysLeft} days</Text>
                <Text style={s.quadLabel}>left</Text>
              </View>
            </View>
            <View style={s.quadRow}>
              <View style={s.quad}>
                <Text style={s.quadValue}>{data.thisMonthBookings}</Text>
                <Text style={s.quadLabel}>bookings</Text>
              </View>
              <View style={s.quad}>
                <Text style={[s.quadValue, s.quadValueAmber]}>{perWeek} more</Text>
                <Text style={s.quadLabel}>per week</Text>
              </View>
            </View>
          </View>

          {/* Gap analysis */}
          <View style={s.card}>
            <Text style={s.cardTitle}>To hit {money(data.goalAmount)} this month</Text>
            {data.pendingCount > 0 && (
              <TouchableOpacity
                style={s.actionRow}
                activeOpacity={0.7}
                onPress={() => router.push('/(tabs)/business/' as any)}
              >
                <Feather name="check-circle" size={14} color="#C8922A" />
                <Text style={s.actionText}>
                  Accept your {data.pendingCount} pending requests
                </Text>
                <Text style={s.actionValue}>+{money(data.pendingRevenue)}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.actionRow}
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/business/client-intelligence' as any)}
            >
              <Feather name="send" size={14} color="#C8922A" />
              <Text style={s.actionText}>Send rebook reminders to due clients</Text>
              <Feather name="chevron-right" size={14} color="rgba(240,232,213,0.45)" />
            </TouchableOpacity>
          </View>

          {/* Past 6 months */}
          <Text style={s.sectionLabel}>Past 6 Months</Text>
          <View style={s.card}>
            {data.months.map((m) => (
              <View key={m.label} style={s.barRow}>
                <View style={s.barTop}>
                  <Text style={s.barLabel}>{m.label}</Text>
                  <Text style={s.barAmount}>{money(m.amount)}</Text>
                </View>
                <View style={s.barTrack}>
                  <View
                    style={[s.barFill, { width: `${(m.amount / maxMonth) * 100}%` }]}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* This month week by week */}
          <Text style={s.sectionLabel}>This Month Week by Week</Text>
          <View style={s.card}>
            {data.weeks.map((w) => (
              <View key={w.label} style={s.barRow}>
                <View style={s.barTop}>
                  <Text style={s.barLabel}>{w.label}</Text>
                  <Text style={s.barAmount}>{money(w.amount)}</Text>
                </View>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${(w.amount / maxWeek) * 100}%` }]} />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}

      {/* Edit goal modal */}
      <Modal visible={editing} animationType="slide" transparent>
        <Pressable style={s.overlay} onPress={() => setEditing(false)} />
        <View style={[s.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={s.dragHandle} />
          <Text style={s.sheetTitle}>Monthly Goal</Text>
          <View style={s.inputWrap}>
            <Text style={s.inputPrefix}>$</Text>
            <TextInput
              value={goalInput}
              onChangeText={(t) => setGoalInput(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="2000"
              placeholderTextColor="rgba(240,232,213,0.25)"
              style={s.input}
              inputAccessoryViewID={DONE_ACCESSORY_ID}
              autoFocus
            />
          </View>
          <TouchableOpacity style={s.saveBtn} activeOpacity={0.85} onPress={saveGoal}>
            <Text style={s.saveBtnText}>Save Goal</Text>
          </TouchableOpacity>
        </View>
        <DoneAccessory />
      </Modal>
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
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, lineHeight: 20, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  editLink: { fontSize: 16, lineHeight: 24, color: '#C8922A', fontFamily: 'Manrope_600SemiBold', letterSpacing: 0.33, textAlign: 'right' },
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
    padding: 20,
    marginBottom: 16,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  monthLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  bigValue: { fontSize: 48, lineHeight: 48, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', letterSpacing: -1.2 },
  bigValueSub: { fontSize: 16, lineHeight: 24, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_500Medium' },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(240,232,213,0.1)',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: { height: 10, borderRadius: 5, backgroundColor: '#C8922A' },
  quadRow: { flexDirection: 'row', marginTop: 20, gap: 16 },
  quad: { flex: 1 },
  quadValue: { fontSize: 16, lineHeight: 24, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  quadValueAmber: { color: '#C8922A' },
  quadLabel: { fontSize: 12, lineHeight: 18, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 2 },
  cardTitle: { fontSize: 15, lineHeight: 22, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginBottom: 12 },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  actionText: { flex: 1, fontSize: 14, lineHeight: 18, color: 'rgba(240,232,213,0.9)', fontFamily: 'Manrope_400Regular' },
  actionValue: { fontSize: 14, lineHeight: 21, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  sectionLabel: {
    fontSize: 12,
    lineHeight: 18,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  barRow: { marginBottom: 20 },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8 },
  barLabel: { fontSize: 14, lineHeight: 21, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  barAmount: { fontSize: 14, lineHeight: 21, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(240,232,213,0.05)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#C8922A' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(240,232,213,0.15)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 18, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginBottom: 16 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
  },
  inputPrefix: { fontSize: 22, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_600SemiBold' },
  input: { flex: 1, fontSize: 22, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold', marginLeft: 6, padding: 0 },
  saveBtn: {
    marginTop: 16,
    backgroundColor: '#C8922A',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: 16, color: '#080808', fontFamily: 'Manrope_700Bold' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillGreen: { backgroundColor: 'rgba(76,175,80,0.12)' },
  pillAmber: { backgroundColor: 'rgba(200,146,42,0.12)' },
  pillGreenText: { fontSize: 12, lineHeight: 18, color: '#4CAF50', fontFamily: 'Manrope_700Bold', letterSpacing: 0.6, textTransform: 'uppercase' },
  pillAmberText: { fontSize: 12, lineHeight: 18, color: '#C8922A', fontFamily: 'Manrope_700Bold', letterSpacing: 0.6, textTransform: 'uppercase' },
})
