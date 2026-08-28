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
import { getOrCreateConversation } from '../../../hooks/useMessaging'
import {
  money,
  daysSince,
  monthRange,
  BookingRow,
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

type ClientStatus = 'Active' | 'Due' | 'Quiet' | 'New'

interface ClientAgg {
  id: string
  name: string
  visitCount: number
  totalSpent: number
  lastVisitDate: string | null
  daysSinceLastVisit: number | null
  avgDaysBetween: number | null
  isOverdue: boolean
  daysOverdue: number
  status: ClientStatus
  neighborhood: string | null
}

interface MonthSplit {
  label: string
  newCount: number
  returningCount: number
}

interface CIData {
  total: number
  returningPct: number
  avgLtv: number
  due: ClientAgg[]
  all: ClientAgg[]
  monthly: MonthSplit[]
  neighborhoods: { name: string; count: number }[]
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join('')
}

export default function ClientIntelligence() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<CIData | null>(null)
  const [providerDbId, setProviderDbId] = useState<string | null>(null)
  const [sending, setSending] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const pid = await getProviderDbId(user?.id)
      setProviderDbId(pid)
      if (!pid) {
        setData(null)
        setLoading(false)
        return
      }

      const { data: bRows } = await supabase
        .from('bookings')
        .select('*')
        .eq('provider_id', pid)
      const bookings = (bRows ?? []) as BookingRow[]

      const clientIds = Array.from(
        new Set(bookings.map((b) => b.user_id).filter(Boolean)),
      ) as string[]

      const nameById = new Map<string, string>()
      const hoodById = new Map<string, string | null>()
      if (clientIds.length > 0) {
        // Provider-scoped identity: only the fields this screen uses.
        const { data: clientRows } = await supabase
          .from('clients_provider')
          .select('id, name, neighborhood')
          .in('id', clientIds)
        ;(clientRows ?? []).forEach((c: any) => {
          nameById.set(c.id, c.name || 'Client')
          hoodById.set(c.id, c.neighborhood ?? null)
        })
      }

      const aggs: ClientAgg[] = clientIds.map((id) => {
        const cb = bookings.filter((b) => b.user_id === id)
        // TODO: revert to completed only
        // before production launch
        const completed = cb
          .filter((b) => isEarning(b.status))
          .filter((b) => b.requested_date)
          .sort(
            (a, b) =>
              new Date(a.requested_date as string).getTime() -
              new Date(b.requested_date as string).getTime(),
          )
        const visitCount = completed.length
        const totalSpent = completed.reduce((s, b) => s + (b.payment_amount || 0), 0)
        const lastVisitDate =
          completed.length > 0 ? completed[completed.length - 1].requested_date : null
        const firstVisitDate = completed.length > 0 ? completed[0].requested_date : null

        let avgDaysBetween: number | null = null
        if (visitCount > 1 && firstVisitDate && lastVisitDate) {
          const span =
            (new Date(lastVisitDate).getTime() - new Date(firstVisitDate).getTime()) /
            (1000 * 60 * 60 * 24)
          avgDaysBetween = span / (visitCount - 1)
        }
        const daysSinceLastVisit = lastVisitDate ? daysSince(lastVisitDate) : null
        const isOverdue =
          avgDaysBetween != null &&
          daysSinceLastVisit != null &&
          daysSinceLastVisit > avgDaysBetween * 1.2
        const daysOverdue =
          isOverdue && avgDaysBetween != null && daysSinceLastVisit != null
            ? Math.round(daysSinceLastVisit - avgDaysBetween)
            : 0

        let status: ClientStatus = 'New'
        if (visitCount <= 1) status = visitCount === 1 ? 'Active' : 'New'
        if (daysSinceLastVisit != null) {
          if (daysSinceLastVisit > 84) status = 'Quiet'
          else if (isOverdue) status = 'Due'
          else if (daysSinceLastVisit <= 56) status = 'Active'
        }

        return {
          id,
          name: nameById.get(id) || 'Client',
          visitCount,
          totalSpent,
          lastVisitDate,
          daysSinceLastVisit,
          avgDaysBetween,
          isOverdue,
          daysOverdue,
          status,
          neighborhood: hoodById.get(id) ?? null,
        }
      })

      const withVisits = aggs.filter((a) => a.visitCount > 0)
      const total = withVisits.length
      const returning = withVisits.filter((a) => a.visitCount > 1).length
      const returningPct = total > 0 ? (returning / total) * 100 : 0
      const avgLtv =
        total > 0 ? withVisits.reduce((s, a) => s + a.totalSpent, 0) / total : 0

      const due = aggs
        .filter((a) => a.isOverdue)
        .sort((a, b) => b.daysOverdue - a.daysOverdue)
      const all = [...withVisits].sort((a, b) => b.totalSpent - a.totalSpent)

      // New vs returning per month (based on first-ever booking date)
      const firstBookingById = new Map<string, number>()
      bookings.forEach((b) => {
        if (!b.user_id || !b.created_at) return
        const t = new Date(b.created_at).getTime()
        const cur = firstBookingById.get(b.user_id)
        if (cur == null || t < cur) firstBookingById.set(b.user_id, t)
      })
      const monthly: MonthSplit[] = []
      for (let i = 5; i >= 0; i--) {
        const r = monthRange(i)
        let newCount = 0
        let returningCount = 0
        const seen = new Set<string>()
        bookings
          .filter((b) => inMonth(b.created_at, r.start, r.end) && b.user_id)
          .forEach((b) => {
            const uid = b.user_id as string
            if (seen.has(uid)) return
            seen.add(uid)
            const first = firstBookingById.get(uid)
            if (
              first != null &&
              first >= new Date(r.start).getTime() &&
              first < new Date(r.end).getTime()
            ) {
              newCount++
            } else {
              returningCount++
            }
          })
        monthly.push({ label: r.shortLabel, newCount, returningCount })
      }

      // Neighborhoods
      const hoodMap = new Map<string, number>()
      withVisits.forEach((a) => {
        if (a.neighborhood) hoodMap.set(a.neighborhood, (hoodMap.get(a.neighborhood) || 0) + 1)
      })
      const neighborhoods = Array.from(hoodMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)

      setData({ total, returningPct, avgLtv, due, all, monthly, neighborhoods })
    } catch (err) {
      console.log('Client intelligence load error:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  async function sendReminder(clientId: string) {
    if (!providerDbId || sending) return
    setSending(clientId)
    try {
      const convoId = await getOrCreateConversation(clientId, providerDbId)
      if (convoId) router.push(('/messages/' + convoId) as any)
    } finally {
      setSending(null)
    }
  }

  const maxMonthTotal = data
    ? Math.max(...data.monthly.map((m) => m.newCount + m.returningCount), 1)
    : 1
  const maxHood = data ? Math.max(...data.neighborhoods.map((h) => h.count), 1) : 1

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.backBtn} activeOpacity={0.7} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Clients</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.pad}>
          <Shimmer style={[s.card, { height: 80 }]} />
        </View>
      ) : !data || data.total === 0 ? (
        <View style={s.empty}>
          <Feather name="users" size={40} color="rgba(240,232,213,0.1)" />
          <Text style={s.emptyTitle}>No data yet</Text>
          <Text style={s.emptySub}>Complete your first booking to see clients.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.pad}>
          {/* Stat row */}
          <View style={s.statTriple}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Total</Text>
              <Text style={s.statValue}>{data.total}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Returning</Text>
              <Text style={s.statValue}>{Math.round(data.returningPct)}%</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Avg LTV</Text>
              <Text style={s.statValue}>{money(data.avgLtv)}</Text>
            </View>
          </View>

          {/* Due for rebook */}
          {data.due.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Due for Rebook</Text>
              {data.due.map((c) => (
                <View key={c.id} style={s.card}>
                  <View style={s.dueRow}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{initials(c.name)}</Text>
                    </View>
                    <View style={s.flex1}>
                      <Text style={s.clientName}>{c.name}</Text>
                      <Text style={s.clientMeta}>
                        {c.avgDaysBetween != null
                          ? `${Math.round(c.avgDaysBetween / 7)} week pattern`
                          : 'Returning client'}
                      </Text>
                    </View>
                    <View style={s.dueRight}>
                      <Text style={s.overdueText}>
                        {Math.max(Math.round(c.daysOverdue / 7), 1)} wk overdue
                      </Text>
                      <TouchableOpacity
                        style={s.remindBtn}
                        activeOpacity={0.85}
                        disabled={sending === c.id}
                        onPress={() => sendReminder(c.id)}
                      >
                        <Text style={s.remindText}>
                          {sending === c.id ? '...' : 'Remind'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </>
          )}

          {/* All clients */}
          <Text style={s.sectionTitle}>All Clients</Text>
          <View style={s.card}>
            {data.all.map((c, i) => (
              <View key={c.id} style={[s.tableRow, i < data.all.length - 1 && s.tableBorder]}>
                <View style={s.avatarSm}>
                  <Text style={s.avatarSmText}>{initials(c.name)}</Text>
                </View>
                <View style={s.flex1}>
                  <Text style={s.rowName}>{c.name}</Text>
                  <Text style={s.rowMeta}>
                    {c.lastVisitDate
                      ? new Date(c.lastVisitDate).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                        })
                      : 'No visits'}
                  </Text>
                </View>
                <View style={s.visitsCol}>
                  <Text style={s.visitsValue}>{c.visitCount}</Text>
                  <View style={[s.statusPill, statusStyle(c.status)]}>
                    <Text style={[s.statusText, statusTextStyle(c.status)]}>{c.status}</Text>
                  </View>
                </View>
                <Text style={s.ltv}>{money(c.totalSpent)}</Text>
              </View>
            ))}
          </View>

          {/* New vs returning trend */}
          <Text style={s.sectionTitle}>New vs Returning</Text>
          <View style={s.card}>
            {data.monthly.map((m) => {
              const tot = m.newCount + m.returningCount
              return (
                <View key={m.label} style={s.barRow}>
                  <View style={s.barTop}>
                    <Text style={s.barLabel}>{m.label}</Text>
                    <Text style={s.barAmount}>
                      {m.newCount} new · {m.returningCount} returning
                    </Text>
                  </View>
                  <View style={s.stackTrack}>
                    <View
                      style={[
                        s.stackNew,
                        { width: `${(m.newCount / maxMonthTotal) * 100}%` },
                      ]}
                    />
                    <View
                      style={[
                        s.stackReturning,
                        { width: `${(m.returningCount / maxMonthTotal) * 100}%` },
                      ]}
                    />
                  </View>
                </View>
              )
            })}
            <View style={s.legendRow}>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: '#C8922A' }]} />
                <Text style={s.legendText}>New</Text>
              </View>
              <View style={s.legendItem}>
                <View style={[s.legendDot, { backgroundColor: 'rgba(240,232,213,0.4)' }]} />
                <Text style={s.legendText}>Returning</Text>
              </View>
            </View>
          </View>

          {/* Neighborhoods */}
          {data.neighborhoods.length > 0 && (
            <>
              <Text style={s.sectionTitle}>Client Neighborhoods</Text>
              <View style={s.card}>
                {data.neighborhoods.map((h) => (
                  <View key={h.name} style={s.barRow}>
                    <View style={s.barTop}>
                      <Text style={s.barLabel}>{h.name}</Text>
                      <Text style={s.barAmount}>{h.count}</Text>
                    </View>
                    <View style={s.barTrack}>
                      <View style={[s.barFill, { width: `${(h.count / maxHood) * 100}%` }]} />
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>
      )}
    </View>
  )
}

function statusStyle(status: ClientStatus) {
  if (status === 'Active') return { backgroundColor: 'rgba(76,175,80,0.12)' }
  if (status === 'Due') return { backgroundColor: 'rgba(200,146,42,0.12)' }
  return { backgroundColor: 'rgba(240,232,213,0.08)' }
}
function statusTextStyle(status: ClientStatus) {
  if (status === 'Active') return { color: '#4CAF50' }
  if (status === 'Due') return { color: '#C8922A' }
  return { color: 'rgba(240,232,213,0.45)' }
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
  headerTitle: { fontSize: 18, lineHeight: 28, letterSpacing: -0.45, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
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
  statTriple: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 10,
    lineHeight: 15,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  statValue: { fontSize: 20, lineHeight: 28, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', textAlign: 'center' },
  sectionTitle: {
    fontSize: 14,
    lineHeight: 20,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 16,
  },
  dueRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: 'rgba(200,146,42,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, lineHeight: 20, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  flex1: { flex: 1 },
  clientName: { fontSize: 14, lineHeight: 20, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  clientMeta: { fontSize: 11, lineHeight: 16.5, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  dueRight: { alignItems: 'flex-end', gap: 8 },
  overdueText: { fontSize: 10, lineHeight: 15, color: '#E05C5C', fontFamily: 'Manrope_700Bold' },
  remindBtn: {
    backgroundColor: '#F0E8D5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
  },
  remindText: { fontSize: 11, lineHeight: 16.5, color: '#080808', fontFamily: 'Manrope_700Bold' },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12 },
  tableBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(240,232,213,0.06)' },
  avatarSm: {
    width: 28,
    height: 28,
    borderRadius: 9999,
    backgroundColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSmText: { fontSize: 10, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  rowName: { fontSize: 12, lineHeight: 15, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  rowMeta: { fontSize: 10, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 2 },
  visitsCol: { alignItems: 'center', gap: 4, width: 56 },
  visitsValue: { fontSize: 12, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  statusPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  statusText: { fontSize: 9, fontFamily: 'Manrope_700Bold' },
  ltv: { fontSize: 12, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', width: 60, textAlign: 'right' },
  barRow: { marginBottom: 14 },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  barLabel: { fontSize: 13, color: '#F0E8D5', fontFamily: 'Manrope_500Medium' },
  barAmount: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(240,232,213,0.08)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#C8922A' },
  stackTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(240,232,213,0.08)', flexDirection: 'row', overflow: 'hidden' },
  stackNew: { height: 8, backgroundColor: '#C8922A' },
  stackReturning: { height: 8, backgroundColor: 'rgba(240,232,213,0.4)' },
  legendRow: { flexDirection: 'row', gap: 16, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
})
