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
  currentMonthRange,
  monthRange,
  BookingRow,
  ServiceRow,
  inMonth,
  isEarning,
  getProviderDbId,
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

interface ServiceAgg {
  name: string
  totalRevenue: number
  bookingCount: number
  revenuePerHour: number | null
}
interface ClientAgg {
  id: string
  name: string
  totalSpent: number
  visitCount: number
}
interface MonthBar {
  label: string
  amount: number
}
interface RevData {
  totalRevenue: number
  thisMonthRevenue: number
  lastMonthRevenue: number
  perBookingAvg: number
  services: ServiceAgg[]
  clients: ClientAgg[]
  months: MonthBar[]
  pendingRevenue: number
  pendingCount: number
}

export default function RevenueDetail() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<RevData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const providerDbId = await getProviderDbId(user?.id)
      if (!providerDbId) {
        setData(null)
        setLoading(false)
        return
      }

      const [bRes, sRes] = await Promise.all([
        supabase.from('bookings').select('*').eq('provider_id', providerDbId),
        supabase
          .from('provider_services')
          .select('*')
          .eq('provider_id', providerDbId),
      ])
      const bookings = (bRes.data ?? []) as BookingRow[]
      const services = (sRes.data ?? []) as ServiceRow[]
      const durByName = new Map<string, number>()
      services.forEach((s) => {
        if (s.name && s.duration_minutes) durByName.set(s.name, s.duration_minutes)
      })

      // TODO: revert to completed only
      // before production launch
      const completed = bookings.filter((b) => isEarning(b.status))
      const totalRevenue = completed.reduce((s, b) => s + (b.payment_amount || 0), 0)

      const cur = currentMonthRange()
      const last = monthRange(1)
      const thisMonthRevenue = completed
        .filter((b) => inMonth(b.created_at, cur.start, cur.end))
        .reduce((s, b) => s + (b.payment_amount || 0), 0)
      const lastMonthRevenue = completed
        .filter((b) => inMonth(b.created_at, last.start, last.end))
        .reduce((s, b) => s + (b.payment_amount || 0), 0)
      const perBookingAvg = completed.length > 0 ? totalRevenue / completed.length : 0

      // By service
      const svcMap = new Map<string, { revenue: number; count: number }>()
      completed.forEach((b) => {
        const name = b.service_name || 'Other'
        const cur2 = svcMap.get(name) || { revenue: 0, count: 0 }
        cur2.revenue += b.payment_amount || 0
        cur2.count += 1
        svcMap.set(name, cur2)
      })
      const servicesAgg: ServiceAgg[] = Array.from(svcMap.entries())
        .map(([name, v]) => {
          const dur = durByName.get(name)
          const avgPer = v.count > 0 ? v.revenue / v.count : 0
          const revenuePerHour = dur && dur > 0 ? avgPer / (dur / 60) : null
          return {
            name,
            totalRevenue: v.revenue,
            bookingCount: v.count,
            revenuePerHour,
          }
        })
        .sort((a, b) => b.totalRevenue - a.totalRevenue)

      // By client
      const cliMap = new Map<string, { spent: number; count: number }>()
      completed.forEach((b) => {
        if (!b.user_id) return
        const cur2 = cliMap.get(b.user_id) || { spent: 0, count: 0 }
        cur2.spent += b.payment_amount || 0
        cur2.count += 1
        cliMap.set(b.user_id, cur2)
      })
      const clientIds = Array.from(cliMap.keys())
      const nameById = new Map<string, string>()
      if (clientIds.length > 0) {
        const { data: clientRows } = await supabase
          .from('clients')
          .select('id, name')
          .in('id', clientIds)
        ;(clientRows ?? []).forEach((c: { id: string; name: string | null }) => {
          nameById.set(c.id, c.name || 'Client')
        })
      }
      const clientsAgg: ClientAgg[] = clientIds
        .map((id) => ({
          id,
          name: nameById.get(id) || 'Client',
          totalSpent: cliMap.get(id)!.spent,
          visitCount: cliMap.get(id)!.count,
        }))
        .sort((a, b) => b.totalSpent - a.totalSpent)
        .slice(0, 5)

      // 6 month history
      const months: MonthBar[] = []
      for (let i = 5; i >= 0; i--) {
        const r = monthRange(i)
        const amount = completed
          .filter((b) => inMonth(b.created_at, r.start, r.end))
          .reduce((s, b) => s + (b.payment_amount || 0), 0)
        months.push({ label: r.shortLabel, amount })
      }

      const pending = bookings.filter((b) => b.status === 'pending')
      const pendingRevenue = pending.reduce((s, b) => s + (b.payment_amount || 0), 0)

      setData({
        totalRevenue,
        thisMonthRevenue,
        lastMonthRevenue,
        perBookingAvg,
        services: servicesAgg,
        clients: clientsAgg,
        months,
        pendingRevenue,
        pendingCount: pending.length,
      })
    } catch (err) {
      console.log('Revenue detail load error:', err)
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
  const maxSvc = data ? Math.max(...data.services.map((s) => s.totalRevenue), 1) : 1
  const maxMonth = data ? Math.max(...data.months.map((m) => m.amount), 1) : 1
  const topClientsCombined = data ? data.clients.reduce((s, c) => s + c.totalSpent, 0) : 0

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.backBtn} activeOpacity={0.7} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Revenue</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.pad}>
          <Shimmer style={[s.card, { height: 160 }]} />
        </View>
      ) : !data || data.totalRevenue === 0 ? (
        <View style={s.empty}>
          <Feather name="dollar-sign" size={40} color="rgba(240,232,213,0.1)" />
          <Text style={s.emptyTitle}>No data yet</Text>
          <Text style={s.emptySub}>Complete your first booking to see revenue.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.pad}>
          {/* Total revenue card */}
          <View style={s.card}>
            <View style={s.rowBetween}>
              <Text style={s.cardLabel}>TOTAL REVENUE</Text>
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
                <Text style={s.statLabel}>Last month</Text>
                <Text style={s.statValue}>{money(data.lastMonthRevenue)}</Text>
              </View>
              <View style={s.statCol}>
                <Text style={s.statLabel}>Per booking avg</Text>
                <Text style={s.statValue}>{money(data.perBookingAvg)}</Text>
              </View>
            </View>
          </View>

          {/* Monthly revenue chart */}
          <Text style={s.sectionLabel}>Monthly Revenue</Text>
          <View style={s.card}>
            {data.months.map((m) => (
              <View key={m.label} style={s.barRow}>
                <View style={s.barTop}>
                  <Text style={s.barLabel}>{m.label}</Text>
                  <Text style={s.barAmount}>{money(m.amount)}</Text>
                </View>
                <View style={s.barTrack}>
                  <View style={[s.barFill, { width: `${(m.amount / maxMonth) * 100}%` }]} />
                </View>
              </View>
            ))}
          </View>

          {/* By service */}
          <View style={s.sectionHead}>
            <Text style={s.sectionLabelInline}>By Service</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/dashboard/provider/service-performance' as any)}
            >
              <Text style={s.link}>Details</Text>
            </TouchableOpacity>
          </View>
          <View style={s.card}>
            {data.services.map((svc) => (
              <View key={svc.name} style={s.barRow}>
                <View style={s.barTop}>
                  <View>
                    <Text style={s.svcName}>{svc.name}</Text>
                    <Text style={s.svcMeta}>
                      {svc.bookingCount} bookings
                      {svc.revenuePerHour != null
                        ? ` · ${money(svc.revenuePerHour)}/hr`
                        : ''}
                    </Text>
                  </View>
                  <Text style={s.barAmount}>{money(svc.totalRevenue)}</Text>
                </View>
                <View style={s.barTrack}>
                  <View
                    style={[s.barFill, { width: `${(svc.totalRevenue / maxSvc) * 100}%` }]}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Top clients */}
          <View style={s.sectionHead}>
            <Text style={s.sectionLabelInline}>Top Clients</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/dashboard/provider/client-intelligence' as any)}
            >
              <Text style={s.link}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={s.card}>
            {data.clients.map((c) => (
              <View key={c.id} style={s.clientRow}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>
                    {c.name
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((p) => p.charAt(0).toUpperCase())
                      .join('')}
                  </Text>
                </View>
                <View style={s.flex1}>
                  <Text style={s.clientName}>{c.name}</Text>
                  <Text style={s.clientMeta}>{c.visitCount} visits</Text>
                </View>
                <Text style={s.ltv}>{money(c.totalSpent)} LTV</Text>
              </View>
            ))}
            {data.clients.length > 0 && (
              <Text style={s.combined}>
                Top {data.clients.length} clients: {money(topClientsCombined)} combined
              </Text>
            )}
          </View>

          {/* Revenue at risk */}
          {data.pendingCount > 0 && (
            <View style={[s.card, s.riskCard]}>
              <Text style={s.cardLabel}>REVENUE AT RISK</Text>
              <Text style={s.riskValue}>{money(data.pendingRevenue)}</Text>
              <Text style={s.riskSub}>
                {data.pendingCount} pending requests sitting unanswered.
              </Text>
              <TouchableOpacity
                style={s.riskBtn}
                activeOpacity={0.7}
                onPress={() => router.push('/dashboard/provider/' as any)}
              >
                <Text style={s.riskBtnText}>View pending requests</Text>
                <Feather name="chevron-right" size={14} color="#C8922A" />
              </TouchableOpacity>
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
  riskCard: { borderColor: 'rgba(224,92,92,0.2)' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  bigValue: { fontSize: 34, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', letterSpacing: -0.5 },
  statRow: { flexDirection: 'row', marginTop: 16, gap: 16 },
  statCol: { flex: 1 },
  statValue: { fontSize: 18, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginTop: 2 },
  statLabel: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  sectionLabelInline: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  link: { fontSize: 13, color: '#C8922A', fontFamily: 'Manrope_500Medium' },
  barRow: { marginBottom: 14 },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  barLabel: { fontSize: 13, color: '#F0E8D5', fontFamily: 'Manrope_500Medium' },
  barAmount: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(240,232,213,0.08)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#C8922A' },
  svcName: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  svcMeta: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 2 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(200,146,42,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  flex1: { flex: 1 },
  clientName: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  clientMeta: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 2 },
  ltv: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  combined: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 10,
  },
  riskValue: { fontSize: 28, color: '#E05C5C', fontFamily: 'Manrope_700Bold', marginTop: 8 },
  riskSub: { fontSize: 13, color: 'rgba(240,232,213,0.7)', fontFamily: 'Manrope_400Regular', marginTop: 6 },
  riskBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 14 },
  riskBtnText: { fontSize: 13, color: '#C8922A', fontFamily: 'Manrope_500Medium' },
  deltaUp: { fontSize: 12, color: '#4CAF50', fontFamily: 'Manrope_500Medium' },
  deltaDown: { fontSize: 12, color: '#E05C5C', fontFamily: 'Manrope_500Medium' },
})
