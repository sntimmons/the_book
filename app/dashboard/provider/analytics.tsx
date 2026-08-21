import { useCallback, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePanelContext } from '@/context/PanelContext'
import { useAuth } from '@/context/AuthContext'
import { fetchProviderAnalytics, fetchRecentBookings } from '@/lib/analytics'
// Type-only import: `ProviderAnalytics` (the type) collides by name with the
// `ProviderAnalytics` component below. `import type` makes Babel elide it, so
// the two don't clash at transform time (tsc tolerates it, Babel does not).
import type { ProviderAnalytics, RecentBooking } from '@/lib/analytics'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "$1,234" — thousands-separated, whole dollars, no Intl dependency.
function money(n: number): string {
  const rounded = Math.round(n)
  const grouped = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `$${rounded < 0 ? '-' : ''}${grouped}`
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

// Status badge styling: completed=green, pending/accepted=amber,
// cancelled/declined=muted, no_show=red.
function statusStyle(status: string): { bg: string; fg: string; label: string } {
  switch (status) {
    case 'completed':
      return { bg: 'rgba(76,175,80,0.14)', fg: '#4CAF50', label: 'Completed' }
    case 'pending':
      return { bg: 'rgba(200,146,42,0.14)', fg: '#C8922A', label: 'Pending' }
    case 'accepted':
      return { bg: 'rgba(200,146,42,0.14)', fg: '#C8922A', label: 'Confirmed' }
    case 'no_show':
      return { bg: 'rgba(224,92,92,0.14)', fg: '#E05C5C', label: 'No show' }
    case 'cancelled':
      return { bg: 'rgba(240,232,213,0.08)', fg: 'rgba(240,232,213,0.5)', label: 'Cancelled' }
    case 'declined':
      return { bg: 'rgba(240,232,213,0.08)', fg: 'rgba(240,232,213,0.5)', label: 'Declined' }
    default:
      return { bg: 'rgba(240,232,213,0.08)', fg: 'rgba(240,232,213,0.5)', label: status }
  }
}

export default function ProviderAnalytics() {
  const { openPanel } = usePanelContext()
  const insets = useSafeAreaInsets()
  const { providerId } = useAuth()

  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<ProviderAnalytics | null>(null)
  const [recent, setRecent] = useState<RecentBooking[]>([])

  const load = useCallback(async () => {
    if (!providerId) {
      setLoading(false)
      return
    }
    const [analytics, recentBookings] = await Promise.all([
      fetchProviderAnalytics(providerId),
      fetchRecentBookings(providerId, 10),
    ])
    setData(analytics)
    setRecent(recentBookings)
    setLoading(false)
  }, [providerId])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  const header = (
    <View style={[s.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={s.menuBtn} onPress={openPanel} activeOpacity={0.8}>
        <Feather name="menu" size={18} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Analytics</Text>
      <View style={s.menuBtnSpacer} />
    </View>
  )

  if (loading) {
    return (
      <View style={s.root}>
        {header}
        <View style={s.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      </View>
    )
  }

  if (!data || data.totalBookings === 0) {
    return (
      <View style={s.root}>
        {header}
        <View style={s.centerBody}>
          <Feather name="bar-chart-2" size={40} color="rgba(240,232,213,0.1)" />
          <Text style={s.emptyTitle}>No booking data yet</Text>
          <Text style={s.emptySub}>
            Your analytics will appear here once you start getting bookings.
          </Text>
        </View>
      </View>
    )
  }

  const maxServiceCount = Math.max(...data.topServices.map((svc) => svc.count), 1)

  const STATS: { label: string; value: string }[] = [
    { label: 'Pending', value: `${data.pendingCount}` },
    { label: 'Cancelled', value: `${data.cancelledCount}` },
    { label: 'No Shows', value: `${data.noShowCount}` },
    { label: 'Disputes', value: `${data.disputeCount}` },
    { label: 'Repeat Rate', value: `${Math.round(data.repeatClientRate)}%` },
  ]

  return (
    <View style={s.root}>
      {header}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollPad}>
        {/* SECTION 1 — Key metrics (2x2) */}
        <View style={s.metricGrid}>
          <MetricCard label="Total Earned" value={money(data.totalEarned)} />
          <MetricCard label="This Month" value={money(data.earnedThisMonth)} />
          <MetricCard label="Completed" value={`${data.completedCount}`} sub="bookings" />
          <MetricCard label="Clients Served" value={`${data.uniqueClients}`} sub="unique" />
        </View>

        {/* SECTION 2 — Booking stats pills */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.pillScroll}
          contentContainerStyle={s.pillRow}
        >
          {STATS.map((stat) => (
            <View key={stat.label} style={s.statPill}>
              <Text style={s.statPillValue}>{stat.value}</Text>
              <Text style={s.statPillLabel}>{stat.label}</Text>
            </View>
          ))}
        </ScrollView>

        {/* SECTION 3 — Earnings chart (placeholder) */}
        <Text style={s.sectionLabel}>EARNINGS</Text>
        <View style={s.card}>
          <View style={s.chartPlaceholder}>
            <Feather name="trending-up" size={22} color="rgba(240,232,213,0.2)" />
            <Text style={s.chartPlaceholderText}>Earnings over time — requires development build</Text>
          </View>
          <View style={s.chartStatsRow}>
            <View style={s.chartStat}>
              <Text style={s.chartStatValue}>{money(data.earnedThisMonth)}</Text>
              <Text style={s.chartStatLabel}>This month</Text>
            </View>
            <View style={s.chartStatDivider} />
            <View style={s.chartStat}>
              <Text style={s.chartStatValue}>{money(data.earnedThisWeek)}</Text>
              <Text style={s.chartStatLabel}>This week</Text>
            </View>
          </View>
          <Text style={s.chartNote}>Last 6 months data ready — chart visible in development build</Text>
        </View>

        {/* SECTION 4 — Top services */}
        <Text style={s.sectionLabel}>TOP SERVICES</Text>
        {data.topServices.length === 0 ? (
          <View style={s.card}>
            <Text style={s.mutedText}>No completed bookings yet.</Text>
          </View>
        ) : (
          <View style={s.card}>
            {data.topServices.map((svc, i) => (
              <View
                key={svc.name}
                style={[s.svcRow, i < data.topServices.length - 1 && s.rowBorder]}
              >
                <View style={s.svcTopRow}>
                  <Text style={s.svcName} numberOfLines={1}>
                    {svc.name}
                  </Text>
                  <Text style={s.svcEarned}>{money(svc.earned)}</Text>
                </View>
                <View style={s.svcBarTrack}>
                  <View style={[s.svcBarFill, { width: `${(svc.count / maxServiceCount) * 100}%` }]} />
                </View>
                <Text style={s.svcCount}>
                  {svc.count} booking{svc.count === 1 ? '' : 's'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* SECTION 5 — Recent bookings */}
        <Text style={s.sectionLabel}>RECENT BOOKINGS</Text>
        {recent.length === 0 ? (
          <View style={s.card}>
            <Text style={s.mutedText}>No bookings yet.</Text>
          </View>
        ) : (
          <View style={s.card}>
            {recent.map((b, i) => {
              const st = statusStyle(b.status)
              return (
                <TouchableOpacity
                  key={b.id}
                  style={[s.recentRow, i < recent.length - 1 && s.rowBorder]}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/bookings/${b.id}` as never)}
                >
                  <View style={s.flex1}>
                    <Text style={s.recentName} numberOfLines={1}>
                      {b.serviceName ?? 'Booking'}
                    </Text>
                    <Text style={s.recentDate}>{formatDate(b.requestedDate)}</Text>
                  </View>
                  <View style={[s.badge, { backgroundColor: st.bg }]}>
                    <Text style={[s.badgeText, { color: st.fg }]}>{st.label}</Text>
                  </View>
                  <Text style={s.recentAmount}>
                    {b.paymentAmount != null ? money(b.paymentAmount) : '—'}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        )}

        {/* SECTION 6 — Activity chart (placeholder) */}
        <Text style={s.sectionLabel}>ACTIVITY</Text>
        <View style={s.card}>
          <View style={s.chartPlaceholder}>
            <Feather name="activity" size={22} color="rgba(240,232,213,0.2)" />
            <Text style={s.chartPlaceholderText}>Booking activity — requires development build</Text>
          </View>
          <Text style={s.chartNote}>
            {data.bookingsLast30Days} booking{data.bookingsLast30Days === 1 ? '' : 's'} in the last 30 days
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={s.metricCard}>
      <Text style={s.metricValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={s.metricLabel}>{label}</Text>
      {sub ? <Text style={s.metricSub}>{sub}</Text> : null}
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
  centerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold', marginTop: 14 },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  scrollPad: { padding: 20, paddingBottom: 120 },
  flex1: { flex: 1 },

  // Section 1 — metric grid
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  metricCard: {
    width: '47.8%',
    flexGrow: 1,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
  },
  metricValue: { fontSize: 26, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  metricLabel: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 6,
  },
  metricSub: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },

  // Section 2 — stat pills
  pillScroll: { marginTop: 16, marginHorizontal: -20 },
  pillRow: { paddingHorizontal: 20, gap: 10 },
  statPill: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    alignItems: 'center',
    minWidth: 84,
  },
  statPillValue: { fontSize: 20, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  statPillLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 4,
  },

  // Shared
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 28,
    marginBottom: 10,
  },
  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 16,
    padding: 16,
  },
  mutedText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Section 3 & 6 — chart placeholders
  chartPlaceholder: {
    height: 150,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(240,232,213,0.02)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 20,
  },
  chartPlaceholderText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  chartStatsRow: { flexDirection: 'row', alignItems: 'center', marginTop: 16 },
  chartStat: { flex: 1, alignItems: 'center' },
  chartStatDivider: { width: 1, height: 32, backgroundColor: 'rgba(240,232,213,0.08)' },
  chartStatValue: { fontSize: 20, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  chartStatLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 4,
  },
  chartNote: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 14,
    lineHeight: 16,
  },

  // Section 4 — top services
  svcRow: { paddingVertical: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: 'rgba(240,232,213,0.06)' },
  svcTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  svcName: { flex: 1, fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold', marginRight: 12 },
  svcEarned: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  svcBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginTop: 10,
    overflow: 'hidden',
  },
  svcBarFill: { height: 6, borderRadius: 3, backgroundColor: '#C8922A', minWidth: 6 },
  svcCount: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
  },

  // Section 5 — recent bookings
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  recentName: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  recentDate: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  badgeText: { fontSize: 10, fontFamily: 'Manrope_700Bold', letterSpacing: 0.3 },
  recentAmount: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', minWidth: 52, textAlign: 'right' },
})
