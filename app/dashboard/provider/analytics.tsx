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
import { usePanelContext } from '@/context/PanelContext'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import {
  money,
  pct,
  parseHour,
  getTimeBlock,
  getDayOfWeek,
  CANCEL_STATUSES,
  BookingRow,
  ServiceRow,
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

type Period = '7d' | '30d' | 'all'
const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'all', label: 'All time' },
]

interface DayBar {
  label: string
  amount: number
}
interface ServiceRank {
  name: string
  revenue: number
  bookingCount: number
  revenuePerHour: number | null
}
interface HubData {
  periodRevenue: number
  prevPeriodRevenue: number
  weekly: DayBar[]
  repeatPct: number
  avgResponseMins: number | null
  services: ServiceRank[]
  topClientName: string | null
  topClientVisits: number
  topClientLtv: number
  dueCount: number
  returningPct: number
  newPct: number
  // Heatmap: 7 days x 6 two-hour blocks (8am..8pm)
  heatmap: number[][]
}

// Busy-times heatmap uses six 2-hour columns: 8,10,12,2pm,4pm,6pm.
function heatBlock(hour: number): number {
  if (hour >= 8 && hour < 10) return 0
  if (hour >= 10 && hour < 12) return 1
  if (hour >= 12 && hour < 14) return 2
  if (hour >= 14 && hour < 16) return 3
  if (hour >= 16 && hour < 18) return 4
  if (hour >= 18 && hour < 20) return 5
  return -1
}
const HEAT_COLORS = [
  'rgba(240,232,213,0.04)',
  'rgba(200,146,42,0.25)',
  'rgba(200,146,42,0.5)',
  'rgba(200,146,42,0.75)',
  '#C8922A',
]
function heatLevel(n: number): number {
  if (n === 0) return 0
  if (n === 1) return 1
  if (n === 2) return 2
  if (n <= 4) return 3
  return 4
}

function periodStart(period: Period): number {
  if (period === 'all') return 0
  const now = new Date()
  const days = period === '7d' ? 7 : 30
  return now.getTime() - days * 24 * 60 * 60 * 1000
}

export default function ProviderAnalytics() {
  const { openPanel } = usePanelContext()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<HubData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const providerDbId = await getProviderDbId(user?.id)
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
      const durByName = new Map<string, number>()
      services.forEach((s) => {
        if (s.name && s.duration_minutes) durByName.set(s.name, s.duration_minutes)
      })

      const startMs = periodStart(period)
      const periodLenMs = period === 'all' ? 0 : Date.now() - startMs
      const inPeriod = (b: BookingRow) =>
        period === 'all' ||
        (b.created_at != null && new Date(b.created_at).getTime() >= startMs)
      const inPrevPeriod = (b: BookingRow) => {
        if (period === 'all' || !b.created_at) return false
        const t = new Date(b.created_at).getTime()
        return t >= startMs - periodLenMs && t < startMs
      }

      const earning = bookings.filter((b) => isEarning(b.status))
      const periodEarning = earning.filter(inPeriod)
      const periodRevenue = periodEarning.reduce((s, b) => s + (b.payment_amount || 0), 0)
      const prevPeriodRevenue = earning
        .filter(inPrevPeriod)
        .reduce((s, b) => s + (b.payment_amount || 0), 0)

      // Weekly revenue (last 7 days, Mon..Sun ordering by weekday)
      const last7Start = Date.now() - 7 * 24 * 60 * 60 * 1000
      const dayTotals = new Array(7).fill(0)
      earning.forEach((b) => {
        if (!b.created_at) return
        const t = new Date(b.created_at).getTime()
        if (t < last7Start) return
        dayTotals[getDayOfWeek(b.created_at)] += b.payment_amount || 0
      })
      const weekOrder = [1, 2, 3, 4, 5, 6, 0]
      const weekLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
      const weekly: DayBar[] = weekOrder.map((d, i) => ({
        label: weekLabels[i],
        amount: dayTotals[d],
      }))

      // Repeat clients
      const visitsByClient = new Map<string, number>()
      earning.forEach((b) => {
        if (!b.user_id) return
        visitsByClient.set(b.user_id, (visitsByClient.get(b.user_id) || 0) + 1)
      })
      const totalClients = visitsByClient.size
      const repeatClients = Array.from(visitsByClient.values()).filter((v) => v > 1).length
      const repeatPct = totalClients > 0 ? (repeatClients / totalClients) * 100 : 0

      // Response time (hours -> minutes)
      const responded = bookings.filter(
        (b) => b.provider_first_response_at && b.created_at,
      )
      const avgResponseMins =
        responded.length > 0
          ? (responded.reduce((s, b) => {
              const diff =
                new Date(b.provider_first_response_at as string).getTime() -
                new Date(b.created_at as string).getTime()
              return s + diff / (1000 * 60)
            }, 0) / responded.length)
          : null

      // Services ranked by revenue
      const svcMap = new Map<string, { revenue: number; count: number }>()
      periodEarning.forEach((b) => {
        const name = b.service_name || 'Other'
        const cur = svcMap.get(name) || { revenue: 0, count: 0 }
        cur.revenue += b.payment_amount || 0
        cur.count += 1
        svcMap.set(name, cur)
      })
      const servicesRanked: ServiceRank[] = Array.from(svcMap.entries())
        .map(([name, v]) => {
          const dur = durByName.get(name)
          const avgPer = v.count > 0 ? v.revenue / v.count : 0
          return {
            name,
            revenue: v.revenue,
            bookingCount: v.count,
            revenuePerHour: dur && dur > 0 ? avgPer / (dur / 60) : null,
          }
        })
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 4)

      // Top client + LTV
      const spentByClient = new Map<string, { spent: number; visits: number }>()
      earning.forEach((b) => {
        if (!b.user_id) return
        const cur = spentByClient.get(b.user_id) || { spent: 0, visits: 0 }
        cur.spent += b.payment_amount || 0
        cur.visits += 1
        spentByClient.set(b.user_id, cur)
      })
      let topClientId: string | null = null
      let topSpent = -1
      spentByClient.forEach((v, id) => {
        if (v.spent > topSpent) {
          topSpent = v.spent
          topClientId = id
        }
      })
      let topClientName: string | null = null
      if (topClientId) {
        const { data: c } = await supabase
          .from('clients')
          .select('name')
          .eq('id', topClientId)
          .maybeSingle()
        topClientName = (c?.name as string) || 'Client'
      }
      const topClientVisits = topClientId ? spentByClient.get(topClientId)!.visits : 0
      const topClientLtv = topClientId ? spentByClient.get(topClientId)!.spent : 0

      // Returning vs new (within period, by first-ever booking)
      const firstBookingById = new Map<string, number>()
      bookings.forEach((b) => {
        if (!b.user_id || !b.created_at) return
        const t = new Date(b.created_at).getTime()
        const cur = firstBookingById.get(b.user_id)
        if (cur == null || t < cur) firstBookingById.set(b.user_id, t)
      })
      let newCount = 0
      let returningCount = 0
      const seenClients = new Set<string>()
      periodEarning.forEach((b) => {
        if (!b.user_id || seenClients.has(b.user_id)) return
        seenClients.add(b.user_id)
        const first = firstBookingById.get(b.user_id)
        if (first != null && first >= startMs) newCount++
        else returningCount++
      })
      const totalSplit = newCount + returningCount
      const returningPct = totalSplit > 0 ? (returningCount / totalSplit) * 100 : 0
      const newPct = totalSplit > 0 ? (newCount / totalSplit) * 100 : 0

      // Due for rebook count (overdue vs avg cadence, 20% buffer)
      let dueCount = 0
      spentByClient.forEach((_, id) => {
        const cb = earning
          .filter((b) => b.user_id === id && b.requested_date)
          .sort(
            (a, b) =>
              new Date(a.requested_date as string).getTime() -
              new Date(b.requested_date as string).getTime(),
          )
        if (cb.length < 2) return
        const first = new Date(cb[0].requested_date as string).getTime()
        const last = new Date(cb[cb.length - 1].requested_date as string).getTime()
        const avgDays = last - first > 0 ? (last - first) / (1000 * 60 * 60 * 24) / (cb.length - 1) : 0
        const sinceLast = (Date.now() - last) / (1000 * 60 * 60 * 24)
        if (avgDays > 0 && sinceLast > avgDays * 1.2) dueCount++
      })

      // Busy-times heatmap (7 x 6)
      const heatmap: number[][] = Array.from({ length: 7 }, () => new Array(6).fill(0))
      bookings.forEach((b) => {
        if (!b.requested_date || !b.requested_time) return
        const day = getDayOfWeek(b.requested_date)
        const block = heatBlock(parseHour(b.requested_time))
        if (block >= 0) heatmap[day][block] += 1
      })

      setData({
        periodRevenue,
        prevPeriodRevenue,
        weekly,
        repeatPct,
        avgResponseMins,
        services: servicesRanked,
        topClientName,
        topClientVisits,
        topClientLtv,
        dueCount,
        returningPct,
        newPct,
        heatmap,
      })
    } catch (err) {
      console.log('Analytics hub load error:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [user, period])

  useEffect(() => {
    load()
  }, [load])

  const revDelta =
    data && data.prevPeriodRevenue > 0
      ? ((data.periodRevenue - data.prevPeriodRevenue) / data.prevPeriodRevenue) * 100
      : null
  const maxWeekly = data ? Math.max(...data.weekly.map((d) => d.amount), 1) : 1
  const maxSvc = data ? Math.max(...data.services.map((s) => s.revenue), 1) : 1
  const maxHeat = data
    ? Math.max(...data.heatmap.flatMap((row) => row), 1)
    : 1
  const heatDayOrder = [0, 6, 5, 4, 3, 2, 1] // Sun, Sat, Fri ... Mon (Figma top-to-bottom)
  const heatDayLabels = ['Sun', 'Sat', 'Fri', 'Thu', 'Wed', 'Tue', 'Mon']
  const hasAnyData =
    data &&
    (data.periodRevenue > 0 ||
      data.services.length > 0 ||
      data.weekly.some((d) => d.amount > 0))

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={s.menuBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Analytics</Text>
        <View style={s.menuBtnSpacer} />
      </View>

      {/* Period toggle */}
      <View style={s.periodRow}>
        {PERIODS.map((p) => {
          const active = p.key === period
          return (
            <TouchableOpacity
              key={p.key}
              activeOpacity={0.8}
              onPress={() => setPeriod(p.key)}
              style={[s.periodBtn, active ? s.periodActive : s.periodInactive]}
            >
              <Text style={active ? s.periodTextActive : s.periodTextInactive}>
                {p.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {loading ? (
        <View style={s.scrollPad}>
          <Shimmer style={[s.card, { height: 96, marginBottom: 16 }]} />
          <Shimmer style={[s.card, { height: 200, marginBottom: 16 }]} />
          <Shimmer style={[s.card, { height: 160 }]} />
        </View>
      ) : !hasAnyData ? (
        <View style={s.empty}>
          <Feather name="bar-chart-2" size={40} color="rgba(240,232,213,0.1)" />
          <Text style={s.emptyTitle}>No data yet</Text>
          <Text style={s.emptySub}>Complete your first booking to see analytics.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollPad}>
          {/* This period */}
          <Text style={s.periodLabel}>This Period</Text>
          <View style={s.periodHeadRow}>
            <Text style={s.bigValue}>{money(data!.periodRevenue)}</Text>
            {revDelta != null && (
              <Text style={revDelta >= 0 ? s.deltaUp : s.deltaDown}>
                {revDelta >= 0 ? '+' : ''}
                {pct(revDelta)} vs last period
              </Text>
            )}
          </View>

          {/* Weekly revenue bars */}
          <Text style={s.sectionLabel}>Weekly Revenue</Text>
          <View style={s.card}>
            <View style={s.weeklyRow}>
              {data!.weekly.map((d, i) => (
                <View key={i} style={s.weeklyCol}>
                  <View style={s.weeklyBarTrack}>
                    <View
                      style={[
                        s.weeklyBarFill,
                        { height: `${Math.max((d.amount / maxWeekly) * 100, 2)}%` },
                      ]}
                    />
                  </View>
                  <Text style={s.weeklyLabel}>{d.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* 2x2 stat grid */}
          <View style={s.statGrid}>
            <View style={s.statCell}>
              <Text style={s.statValueStub}>Coming soon</Text>
              <Text style={s.statName}>Profile Views</Text>
              <Text style={s.statHint}>Tracking not wired yet</Text>
            </View>
            <View style={s.statCell}>
              <Text style={s.statValueStub}>Coming soon</Text>
              <Text style={s.statName}>Booking Conversion</Text>
              <Text style={s.statHint}>Tracking not wired yet</Text>
            </View>
            <View style={s.statCell}>
              <Text style={s.statValue}>{pct(data!.repeatPct)}</Text>
              <Text style={s.statName}>Repeat Clients</Text>
              <Text style={s.statHint}>Industry avg: 60%</Text>
            </View>
            <View style={s.statCell}>
              <Text style={s.statValue}>
                {data!.avgResponseMins != null
                  ? `~${Math.round(data!.avgResponseMins)} min`
                  : 'n/a'}
              </Text>
              <Text style={s.statName}>Response Time</Text>
              <Text style={s.statHint}>From request to first reply</Text>
            </View>
          </View>

          {/* Top content (stub - no data source) */}
          <View style={s.sectionHead}>
            <Text style={[s.sectionLabel, { marginBottom: 0 }]}>Top Content</Text>
          </View>
          <View style={[s.card, s.stubCard]}>
            <Feather name="image" size={22} color="rgba(240,232,213,0.2)" />
            <Text style={s.stubText}>
              Post and reel insights are coming soon. View counts are not tracked yet.
            </Text>
          </View>

          {/* Busy times heatmap */}
          <Text style={s.sectionLabel}>Busy Times</Text>
          <View style={s.card}>
            {heatDayOrder.map((day, rowIdx) => (
              <View key={day} style={s.heatRow}>
                <Text style={s.heatDayLabel}>{heatDayLabels[rowIdx]}</Text>
                <View style={s.heatCells}>
                  {data!.heatmap[day].map((n, col) => (
                    <View
                      key={col}
                      style={[s.heatCell, { backgroundColor: HEAT_COLORS[heatLevel(n)] }]}
                    />
                  ))}
                </View>
              </View>
            ))}
            <View style={s.heatLabelsRow}>
              <View style={s.heatDayLabel} />
              <View style={s.heatCells}>
                {['8a', '10a', '12p', '2p', '4p', '6p'].map((t) => (
                  <Text key={t} style={s.heatTimeLabel}>
                    {t}
                  </Text>
                ))}
              </View>
            </View>
          </View>

          {/* Services ranked */}
          <View style={s.sectionHead}>
            <Text style={s.sectionLabelInline}>Services</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/dashboard/provider/service-performance' as any)}
            >
              <Text style={s.link}>See all</Text>
            </TouchableOpacity>
          </View>
          <View style={s.card}>
            {data!.services.map((svc, i) => (
              <View key={svc.name} style={[s.svcRow, i < data!.services.length - 1 && s.rowBorder]}>
                <Text style={s.svcRank}>#{i + 1}</Text>
                <View style={s.flex1}>
                  <View style={s.svcTopRow}>
                    <Text style={s.svcName}>{svc.name}</Text>
                    <Text style={s.svcRevenue}>{money(svc.revenue)}</Text>
                  </View>
                  <View style={s.svcMetaRow}>
                    <Text style={s.svcMeta}>
                      {svc.bookingCount} bookings
                      {svc.revenuePerHour != null ? ` · ${money(svc.revenuePerHour)}/hr` : ''}
                    </Text>
                    {i === 0 && (
                      <View style={s.topEarnerPill}>
                        <Text style={s.topEarnerText}>Top earner</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={s.viewAllRow}
              activeOpacity={0.7}
              onPress={() => router.push('/dashboard/provider/service-performance' as any)}
            >
              <Text style={s.viewAllText}>View all services</Text>
            </TouchableOpacity>
          </View>

          {/* Clients */}
          <View style={s.sectionHead}>
            <Text style={s.sectionLabelInline}>Clients</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/dashboard/provider/client-intelligence' as any)}
            >
              <Text style={s.link}>See all</Text>
            </TouchableOpacity>
          </View>

          {data!.topClientName && (
            <View style={s.card}>
              <View style={s.clientRow}>
                <View style={s.avatar}>
                  <Text style={s.avatarText}>
                    {data!.topClientName
                      .split(/\s+/)
                      .slice(0, 2)
                      .map((p) => p.charAt(0).toUpperCase())
                      .join('')}
                  </Text>
                </View>
                <View style={s.flex1}>
                  <Text style={s.clientName}>{data!.topClientName}</Text>
                  <Text style={s.clientMeta}>
                    {data!.topClientVisits} visits · {money(data!.topClientLtv)} lifetime value
                  </Text>
                </View>
              </View>
            </View>
          )}

          {data!.dueCount > 0 && (
            <TouchableOpacity
              style={s.card}
              activeOpacity={0.85}
              onPress={() => router.push('/dashboard/provider/client-intelligence' as any)}
            >
              <View style={s.rowBetween}>
                <View style={s.flex1}>
                  <Text style={s.dueTitle}>{data!.dueCount} clients due for rebook</Text>
                  <Text style={s.dueSub}>Based on their usual visit pattern</Text>
                </View>
                <View style={s.sendRow}>
                  <Text style={s.link}>Send reminders</Text>
                  <Feather name="chevron-right" size={14} color="#C8922A" />
                </View>
              </View>
            </TouchableOpacity>
          )}

          {/* Returning vs new split */}
          <View style={s.card}>
            <View style={s.splitRow}>
              <View>
                <Text style={s.splitValue}>{pct(data!.returningPct)}</Text>
                <Text style={s.splitLabel}>Returning</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.splitValue}>{pct(data!.newPct)}</Text>
                <Text style={s.splitLabel}>New Clients</Text>
              </View>
            </View>
            <View style={s.splitTrack}>
              <View style={[s.splitReturning, { width: `${data!.returningPct}%` }]} />
              <View style={[s.splitNew, { width: `${data!.newPct}%` }]} />
            </View>
          </View>
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
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },

  // Period toggle
  periodRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 8,
  },
  periodBtn: {
    flex: 1,
    height: 37,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodActive: { backgroundColor: '#F0E8D5' },
  periodInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  periodTextActive: { fontSize: 14, color: '#080808', fontFamily: 'Manrope_600SemiBold' },
  periodTextInactive: { fontSize: 14, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_500Medium' },

  scrollPad: { padding: 24, paddingBottom: 120 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  emptyTitle: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold', marginTop: 14 },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },

  // This period
  periodLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 2,
    lineHeight: 15,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  periodHeadRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginBottom: 24 },
  bigValue: { fontSize: 48, lineHeight: 60, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', letterSpacing: 0.19 },
  deltaUp: { fontSize: 12, lineHeight: 18, color: '#C8922A', fontFamily: 'Manrope_600SemiBold', marginBottom: 12 },
  deltaDown: { fontSize: 12, lineHeight: 18, color: '#E05C5C', fontFamily: 'Manrope_600SemiBold', marginBottom: 12 },

  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  stubCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stubText: { flex: 1, fontSize: 13, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', lineHeight: 19 },

  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 2,
    lineHeight: 15,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sectionLabelInline: { fontSize: 20, lineHeight: 30, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', letterSpacing: 0.16 },
  link: { fontSize: 13, lineHeight: 19.5, color: '#C8922A', fontFamily: 'Manrope_500Medium' },

  // Weekly bars
  weeklyRow: { flexDirection: 'row', alignItems: 'flex-end', height: 160, gap: 8 },
  weeklyCol: { flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end' },
  weeklyBarTrack: { width: '100%', flex: 1, justifyContent: 'flex-end' },
  weeklyBarFill: {
    width: '100%',
    backgroundColor: '#C8922A',
    borderRadius: 6,
    minHeight: 4,
  },
  weeklyLabel: {
    fontSize: 10,
    lineHeight: 15,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 8,
  },

  // Stat grid
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 16 },
  statCell: {
    width: '50%',
    paddingVertical: 18,
    paddingRight: 12,
  },
  statValue: { fontSize: 24, lineHeight: 36, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', letterSpacing: 0.45 },
  statValueStub: { fontSize: 16, color: 'rgba(240,232,213,0.35)', fontFamily: 'Manrope_600SemiBold' },
  statName: { fontSize: 11, lineHeight: 16.5, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_500Medium', marginTop: 6 },
  statHint: { fontSize: 10, lineHeight: 15, color: '#C8922A', fontFamily: 'Manrope_700Bold', marginTop: 5 },

  // Heatmap
  heatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  heatDayLabel: { width: 36, fontSize: 10, lineHeight: 15, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', textAlign: 'right', paddingRight: 12 },
  heatCells: { flex: 1, flexDirection: 'row', gap: 2 },
  heatCell: { flex: 1, height: 24, borderRadius: 2 },
  heatLabelsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  heatTimeLabel: {
    flex: 1,
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },

  // Services
  svcRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(240,232,213,0.06)' },
  svcRank: { fontSize: 14, lineHeight: 21, color: '#C8922A', fontFamily: 'Manrope_700Bold', width: 32 },
  flex1: { flex: 1 },
  svcTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  svcName: { fontSize: 14, lineHeight: 17.5, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  svcRevenue: { fontSize: 14, lineHeight: 21, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  svcMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  svcMeta: { fontSize: 12, lineHeight: 18, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  topEarnerPill: {
    backgroundColor: 'rgba(76,175,80,0.1)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 9999,
  },
  topEarnerText: { fontSize: 10, lineHeight: 15, color: '#4CAF50', fontFamily: 'Manrope_700Bold' },
  viewAllRow: { alignItems: 'center', paddingTop: 14 },
  viewAllText: { fontSize: 13, lineHeight: 19.5, color: '#C8922A', fontFamily: 'Manrope_500Medium' },

  // Clients
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(200,146,42,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, lineHeight: 21, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  clientName: { fontSize: 14, lineHeight: 21, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  clientMeta: { fontSize: 12, lineHeight: 18, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dueTitle: { fontSize: 14, lineHeight: 21, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  dueSub: { fontSize: 12, lineHeight: 18, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 2 },
  sendRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

  // Split bar
  splitRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  splitValue: { fontSize: 18, lineHeight: 27, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', letterSpacing: 0.28 },
  splitLabel: { fontSize: 10, lineHeight: 15, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_700Bold', letterSpacing: 0.5, textTransform: 'uppercase', marginTop: 2 },
  splitTrack: { height: 8, borderRadius: 9999, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(240,232,213,0.1)' },
  splitReturning: { height: 8, backgroundColor: 'rgba(200,146,42,0.7)' },
  splitNew: { height: 8, backgroundColor: 'transparent' },
})
