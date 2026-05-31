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

interface SvcPerf {
  name: string
  bookingCount: number
  completedCount: number
  cancelCount: number
  noShowCount: number
  totalRevenue: number
  cancelRate: number
  noShowRate: number
  avgRevenuePerBooking: number
  durationMinutes: number | null
  revenuePerHour: number | null
  bestSlot: string | null
}

interface SPData {
  serviceCount: number
  bestPerHour: number
  overallCancelRate: number
  ranked: SvcPerf[]
  problems: SvcPerf[]
}

export default function ServicePerformance() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<SPData | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const pid = await getProviderDbId(user?.id)
      if (!pid) {
        setData(null)
        setLoading(false)
        return
      }

      const [bRes, sRes] = await Promise.all([
        supabase.from('bookings').select('*').eq('provider_id', pid),
        supabase.from('provider_services').select('*').eq('provider_id', pid),
      ])
      const bookings = (bRes.data ?? []) as BookingRow[]
      const services = (sRes.data ?? []) as ServiceRow[]
      const durByName = new Map<string, number>()
      services.forEach((s) => {
        if (s.name && s.duration_minutes) durByName.set(s.name, s.duration_minutes)
      })

      const names = Array.from(
        new Set([
          ...services.map((s) => s.name).filter(Boolean),
          ...bookings.map((b) => b.service_name).filter(Boolean),
        ]),
      ) as string[]

      // TODO: revert to completed only
      // before production launch
      const allServicesRevenue = bookings
        .filter((b) => isEarning(b.status))
        .reduce((s, b) => s + (b.payment_amount || 0), 0)

      const ranked: SvcPerf[] = names
        .map((name) => {
          const sb = bookings.filter((b) => b.service_name === name)
          // TODO: revert to completed only
          // before production launch
          const completed = sb.filter((b) => isEarning(b.status))
          const cancel = sb.filter((b) => CANCEL_STATUSES.includes(b.status || ''))
          const noShow = sb.filter((b) => b.status === 'no_show')
          const totalRevenue = completed.reduce((s, b) => s + (b.payment_amount || 0), 0)
          const bookingCount = sb.length
          const cancelRate = bookingCount > 0 ? (cancel.length / bookingCount) * 100 : 0
          const noShowRate = bookingCount > 0 ? (noShow.length / bookingCount) * 100 : 0
          const avgRevenuePerBooking =
            completed.length > 0 ? totalRevenue / completed.length : 0
          const durationMinutes = durByName.get(name) ?? null
          const revenuePerHour =
            durationMinutes && durationMinutes > 0
              ? avgRevenuePerBooking / (durationMinutes / 60)
              : null

          // Best slot: most-booked day+block with lowest cancel
          const slotMap = new Map<string, { count: number; cancel: number }>()
          sb.forEach((b) => {
            if (!b.requested_date || !b.requested_time) return
            const day = getDayOfWeek(b.requested_date)
            const block = getTimeBlock(parseHour(b.requested_time))
            const key = day + ':' + block
            const cur = slotMap.get(key) || { count: 0, cancel: 0 }
            cur.count += 1
            if (CANCEL_STATUSES.includes(b.status || '')) cur.cancel += 1
            slotMap.set(key, cur)
          })
          let bestSlot: string | null = null
          let bestScore = -1
          slotMap.forEach((v, key) => {
            const score = v.count - v.cancel * 2
            if (score > bestScore) {
              bestScore = score
              const [d, bl] = key.split(':').map(Number)
              bestSlot = `${DAY_LABELS[d]} ${TIME_BLOCK_LABELS[bl]}`
            }
          })

          return {
            name,
            bookingCount,
            completedCount: completed.length,
            cancelCount: cancel.length,
            noShowCount: noShow.length,
            totalRevenue,
            cancelRate,
            noShowRate,
            avgRevenuePerBooking,
            durationMinutes,
            revenuePerHour,
            bestSlot,
          }
        })
        .filter((s) => s.bookingCount > 0)
        .sort((a, b) => (b.revenuePerHour ?? 0) - (a.revenuePerHour ?? 0))

      const bestPerHour = ranked.length > 0 ? ranked[0].revenuePerHour ?? 0 : 0
      const totalBookings = ranked.reduce((s, r) => s + r.bookingCount, 0)
      const totalCancels = ranked.reduce((s, r) => s + r.cancelCount, 0)
      const overallCancelRate = totalBookings > 0 ? (totalCancels / totalBookings) * 100 : 0
      const problems = ranked.filter((r) => r.cancelRate > 15 || r.noShowRate > 10)

      setData({
        serviceCount: ranked.length,
        bestPerHour,
        overallCancelRate,
        ranked,
        problems,
      })
    } catch (err) {
      console.log('Service performance load error:', err)
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const maxPerHour = data ? Math.max(...data.ranked.map((r) => r.revenuePerHour ?? 0), 1) : 1
  const maxCancel = data ? Math.max(...data.ranked.map((r) => r.cancelRate), 1) : 1
  const slotServices = data ? data.ranked.filter((r) => r.bestSlot).slice(0, 4) : []

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={s.backBtn} activeOpacity={0.7} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Services</Text>
        <View style={s.backBtn} />
      </View>

      {loading ? (
        <View style={s.pad}>
          <Shimmer style={[s.card, { height: 120 }]} />
        </View>
      ) : !data || data.serviceCount === 0 ? (
        <View style={s.empty}>
          <Feather name="tag" size={40} color="rgba(240,232,213,0.1)" />
          <Text style={s.emptyTitle}>No data yet</Text>
          <Text style={s.emptySub}>Complete bookings to see service performance.</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.pad}>
          {/* Stat triple */}
          <View style={s.statTriple}>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Services</Text>
              <Text style={s.statValue}>{data.serviceCount}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Best $/hr</Text>
              <Text style={s.statValue}>{money(data.bestPerHour)}</Text>
            </View>
            <View style={s.statBox}>
              <Text style={s.statLabel}>Cancels</Text>
              <Text style={s.statValue}>{pct(data.overallCancelRate)}</Text>
            </View>
          </View>

          {/* Revenue per hour ranked */}
          <Text style={s.sectionTitle}>Revenue Per Hour</Text>
          <View style={s.card}>
            {data.ranked.map((r, i) => (
              <View key={r.name} style={s.barRow}>
                <View style={s.barTop}>
                  <View style={s.rankNameRow}>
                    <Text style={s.rank}>{i + 1}</Text>
                    <View>
                      <Text style={s.svcName}>{r.name}</Text>
                      <Text style={s.svcMeta}>
                        {r.durationMinutes
                          ? `Average time: ${(r.durationMinutes / 60).toFixed(1)} hours`
                          : `${r.bookingCount} bookings`}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.perHr}>
                    {r.revenuePerHour != null ? `${money(r.revenuePerHour)}/hr` : 'n/a'}
                  </Text>
                </View>
                <View style={s.barTrack}>
                  <View
                    style={[
                      s.barFill,
                      { width: `${((r.revenuePerHour ?? 0) / maxPerHour) * 100}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
          </View>

          {/* Optimization tip */}
          {data.ranked.length > 0 && (
            <View style={[s.card, s.tipCard]}>
              <View style={s.tipRow}>
                <Feather name="zap" size={16} color="#C8922A" />
                <View style={s.flex1}>
                  <Text style={s.tipTitle}>Optimization Tip</Text>
                  <Text style={s.tipText}>
                    {data.ranked[0].name} is currently your most profitable service per hour.
                    Consider opening more slots for it on peak days to maximize revenue.
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Cancellations by service */}
          <Text style={s.sectionTitle}>Cancellations by Service</Text>
          <View style={s.card}>
            {data.ranked.map((r) => (
              <View key={r.name} style={s.barRow}>
                <View style={s.barTop}>
                  <Text style={s.barLabel}>{r.name}</Text>
                  <Text style={s.barAmount}>{pct(r.cancelRate)}</Text>
                </View>
                <View style={s.barTrack}>
                  <View
                    style={[
                      s.barFillRed,
                      { width: `${(r.cancelRate / maxCancel) * 100}%` },
                    ]}
                  />
                </View>
              </View>
            ))}
            {data.problems.length > 0 && (
              <Text style={s.problemNote}>
                {data.problems[0].name} has the highest cancellation risk.
              </Text>
            )}
          </View>

          {/* When they book */}
          {slotServices.length > 0 && (
            <>
              <Text style={s.sectionTitle}>When They Book</Text>
              <View style={s.slotGrid}>
                {slotServices.map((r) => (
                  <View key={r.name} style={s.slotCard}>
                    <Text style={s.slotService}>{r.name}</Text>
                    <Text style={s.slotTime}>{r.bestSlot}</Text>
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
  tipCard: { borderColor: 'rgba(200,146,42,0.2)' },
  statTriple: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 14,
  },
  statLabel: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  statValue: { fontSize: 22, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginTop: 6 },
  sectionTitle: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginBottom: 12 },
  barRow: { marginBottom: 14 },
  barTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  rankNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, flex: 1 },
  rank: { fontSize: 16, color: '#C8922A', fontFamily: 'Manrope_700Bold', width: 16 },
  svcName: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  svcMeta: { fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular', marginTop: 2 },
  perHr: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  barLabel: { fontSize: 13, color: '#F0E8D5', fontFamily: 'Manrope_500Medium' },
  barAmount: { fontSize: 13, color: 'rgba(240,232,213,0.7)', fontFamily: 'Manrope_500Medium' },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: 'rgba(240,232,213,0.08)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3, backgroundColor: '#C8922A' },
  barFillRed: { height: 6, borderRadius: 3, backgroundColor: '#E05C5C' },
  tipRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  flex1: { flex: 1 },
  tipTitle: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold', marginBottom: 6 },
  tipText: { fontSize: 13, color: 'rgba(240,232,213,0.7)', fontFamily: 'Manrope_400Regular', lineHeight: 19 },
  problemNote: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  slotCard: {
    width: '47%',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 16,
  },
  slotService: { fontSize: 13, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  slotTime: { fontSize: 12, color: '#C8922A', fontFamily: 'Manrope_500Medium', marginTop: 8 },
})
