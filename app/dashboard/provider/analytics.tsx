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
import AsyncStorage from '@react-native-async-storage/async-storage'
import { usePanelContext } from '@/context/PanelContext'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import {
  money,
  pct,
  currentMonthRange,
  monthRange,
  goalKey,
  BookingRow,
  ServiceRow,
  inMonth,
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

interface HubData {
  totalRevenue: number
  thisMonthRevenue: number
  lastMonthRevenue: number
  completedCount: number
  pendingCount: number
  pendingRevenue: number
  noShowCount: number
  noShowRate: number
  avgResponseTime: number | null
  clientCount: number
  serviceCount: number
  goalAmount: number
  progressPct: number
  onTrack: boolean
}

export default function ProviderAnalytics() {
  const { openPanel } = usePanelContext()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<HubData | null>(null)

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
      const providerDbId = prov?.id
      if (!providerDbId) {
        setData(null)
        setLoading(false)
        return
      }

      const [bookingsRes, servicesRes] = await Promise.all([
        supabase.from('bookings').select('*').eq('provider_id', providerDbId),
        supabase
          .from('provider_services')
          .select('*')
          .eq('provider_id', providerDbId)
          .eq('is_active', true),
      ])

      const bookings = (bookingsRes.data ?? []) as BookingRow[]
      const services = (servicesRes.data ?? []) as ServiceRow[]

      const cur = currentMonthRange()
      const last = monthRange(1)

      const completed = bookings.filter((b) => b.status === 'completed')
      const totalRevenue = completed.reduce((s, b) => s + (b.payment_amount || 0), 0)
      const thisMonthRevenue = completed
        .filter((b) => inMonth(b.created_at, cur.start, cur.end))
        .reduce((s, b) => s + (b.payment_amount || 0), 0)
      const lastMonthRevenue = completed
        .filter((b) => inMonth(b.created_at, last.start, last.end))
        .reduce((s, b) => s + (b.payment_amount || 0), 0)

      const pending = bookings.filter((b) => b.status === 'pending')
      const pendingRevenue = pending.reduce((s, b) => s + (b.payment_amount || 0), 0)
      const noShow = bookings.filter((b) => b.status === 'no_show')
      const noShowRate = bookings.length > 0 ? (noShow.length / bookings.length) * 100 : 0

      const responded = bookings.filter(
        (b) => b.provider_first_response_at && b.created_at,
      )
      const avgResponseTime =
        responded.length > 0
          ? responded.reduce((s, b) => {
              const diff =
                new Date(b.provider_first_response_at as string).getTime() -
                new Date(b.created_at as string).getTime()
              return s + diff / (1000 * 60 * 60)
            }, 0) / responded.length
          : null

      const clientIds = new Set(bookings.map((b) => b.user_id).filter(Boolean))

      const goalStr = (await AsyncStorage.getItem(goalKey(user.id))) || '2000'
      const goalAmount = parseFloat(goalStr) || 2000
      const progressPct = Math.min((thisMonthRevenue / goalAmount) * 100, 100)

      // On track if current daily pace projects to hit goal by month end.
      const now = new Date()
      const dayOfMonth = now.getDate()
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
      const projected =
        dayOfMonth > 0 ? (thisMonthRevenue / dayOfMonth) * daysInMonth : 0
      const onTrack = projected >= goalAmount

      setData({
        totalRevenue,
        thisMonthRevenue,
        lastMonthRevenue,
        completedCount: completed.length,
        pendingCount: pending.length,
        pendingRevenue,
        noShowCount: noShow.length,
        noShowRate,
        avgResponseTime,
        clientCount: clientIds.size,
        serviceCount: services.length,
        goalAmount,
        progressPct,
        onTrack,
      })
    } catch (err) {
      console.log('Analytics hub load error:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const monthDelta =
    data && data.lastMonthRevenue > 0
      ? ((data.thisMonthRevenue - data.lastMonthRevenue) / data.lastMonthRevenue) * 100
      : null

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.menuBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Analytics</Text>
        <View style={s.menuBtnSpacer} />
      </View>

      {loading ? (
        <View style={s.scrollPad}>
          {[0, 1, 2, 3].map((i) => (
            <Shimmer key={i} style={[s.card, { height: 96, marginBottom: 16 }]} />
          ))}
        </View>
      ) : !data || data.completedCount === 0 ? (
        <View style={s.empty}>
          <Feather name="bar-chart-2" size={40} color="rgba(240,232,213,0.1)" />
          <Text style={s.emptyTitle}>No data yet</Text>
          <Text style={s.emptySub}>
            Complete your first booking to see analytics.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scrollPad}
        >
          {/* Goal tracker */}
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => router.push('/dashboard/provider/goal-detail' as any)}
          >
            <View style={s.cardHeadRow}>
              <Text style={s.cardLabel}>MONTHLY GOAL</Text>
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
              <View style={[s.progressFill, { width: `${data.progressPct}%` }]} />
            </View>
            <View style={s.detailLink}>
              <Text style={s.detailLinkText}>View goal detail</Text>
              <Feather name="chevron-right" size={14} color="#C8922A" />
            </View>
          </TouchableOpacity>

          {/* Revenue */}
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => router.push('/dashboard/provider/revenue-detail' as any)}
          >
            <View style={s.cardHeadRow}>
              <Text style={s.cardLabel}>REVENUE</Text>
              {monthDelta != null && (
                <Text style={monthDelta >= 0 ? s.deltaUp : s.deltaDown}>
                  {monthDelta >= 0 ? '+' : ''}
                  {pct(monthDelta)} vs last month
                </Text>
              )}
            </View>
            <Text style={s.bigValue}>{money(data.totalRevenue)}</Text>
            <View style={s.statRow}>
              <View style={s.statCol}>
                <Text style={s.statValue}>{money(data.thisMonthRevenue)}</Text>
                <Text style={s.statLabel}>This month</Text>
              </View>
              <View style={s.statCol}>
                <Text style={s.statValue}>{money(data.lastMonthRevenue)}</Text>
                <Text style={s.statLabel}>Last month</Text>
              </View>
            </View>
            <View style={s.detailLink}>
              <Text style={s.detailLinkText}>Revenue breakdown</Text>
              <Feather name="chevron-right" size={14} color="#C8922A" />
            </View>
          </TouchableOpacity>

          {/* Clients */}
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => router.push('/dashboard/provider/client-intelligence' as any)}
          >
            <View style={s.cardHeadRow}>
              <Text style={s.cardLabel}>CLIENTS</Text>
              <Feather name="users" size={16} color="rgba(240,232,213,0.45)" />
            </View>
            <Text style={s.bigValue}>{data.clientCount}</Text>
            <Text style={s.statLabel}>Total clients served</Text>
            <View style={s.detailLink}>
              <Text style={s.detailLinkText}>Client intelligence</Text>
              <Feather name="chevron-right" size={14} color="#C8922A" />
            </View>
          </TouchableOpacity>

          {/* Services */}
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => router.push('/dashboard/provider/service-performance' as any)}
          >
            <View style={s.cardHeadRow}>
              <Text style={s.cardLabel}>SERVICES</Text>
              <Feather name="tag" size={16} color="rgba(240,232,213,0.45)" />
            </View>
            <Text style={s.bigValue}>{data.serviceCount}</Text>
            <Text style={s.statLabel}>Active services</Text>
            <View style={s.detailLink}>
              <Text style={s.detailLinkText}>Service performance</Text>
              <Feather name="chevron-right" size={14} color="#C8922A" />
            </View>
          </TouchableOpacity>

          {/* Schedule */}
          <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => router.push('/dashboard/provider/schedule-detail' as any)}
          >
            <View style={s.cardHeadRow}>
              <Text style={s.cardLabel}>SCHEDULE</Text>
              <Feather name="calendar" size={16} color="rgba(240,232,213,0.45)" />
            </View>
            <View style={s.statRow}>
              <View style={s.statCol}>
                <Text style={s.statValue}>{data.completedCount}</Text>
                <Text style={s.statLabel}>Completed</Text>
              </View>
              <View style={s.statCol}>
                <Text style={s.statValue}>{pct(data.noShowRate)}</Text>
                <Text style={s.statLabel}>No show rate</Text>
              </View>
            </View>
            <View style={s.detailLink}>
              <Text style={s.detailLinkText}>Heatmap and capacity</Text>
              <Feather name="chevron-right" size={14} color="#C8922A" />
            </View>
          </TouchableOpacity>

          {/* Response time */}
          {data.avgResponseTime != null && (
            <View style={s.card}>
              <Text style={s.cardLabel}>AVG RESPONSE TIME</Text>
              <Text style={s.bigValue}>{data.avgResponseTime.toFixed(1)}h</Text>
              <Text style={s.statLabel}>From request to first reply</Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnSpacer: { width: 36, height: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  scrollPad: { padding: 24, paddingBottom: 120 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 14,
  },
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
  cardHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bigValue: {
    fontSize: 28,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.5,
  },
  bigValueSub: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(240,232,213,0.08)',
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C8922A',
  },
  statRow: { flexDirection: 'row', marginTop: 12, gap: 16 },
  statCol: { flex: 1 },
  statValue: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  statLabel: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  detailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 14,
  },
  detailLinkText: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  deltaUp: { fontSize: 12, color: '#4CAF50', fontFamily: 'Manrope_500Medium' },
  deltaDown: { fontSize: 12, color: '#E05C5C', fontFamily: 'Manrope_500Medium' },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  pillGreen: { backgroundColor: 'rgba(76,175,80,0.12)' },
  pillAmber: { backgroundColor: 'rgba(200,146,42,0.12)' },
  pillGreenText: { fontSize: 11, color: '#4CAF50', fontFamily: 'Manrope_600SemiBold' },
  pillAmberText: { fontSize: 11, color: '#C8922A', fontFamily: 'Manrope_600SemiBold' },
})
