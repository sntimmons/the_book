import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  RefreshControl,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePanelContext } from '@/context/PanelContext'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

interface BookingRow {
  id: string
  user_id: string
  service_name: string | null
  requested_date: string | null
  requested_time: string | null
  status: string
  payment_amount: number | null
  created_at: string
}

type BucketKey = 'pending' | 'upcoming' | 'past' | 'cancelled'

const TABS: Array<{ key: BucketKey; label: string }> = [
  { key: 'pending', label: 'Pending' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
]

const UPCOMING_STATUSES = new Set(['accepted', 'arriving', 'checked_in'])
const PAST_STATUSES = new Set(['completed', 'no_show'])
const CANCELLED_STATUSES = new Set([
  'cancelled',
  'cancelled_by_client',
  'cancelled_by_provider',
  'late_cancelled',
])

// Mirror app/bookings/[id].tsx exactly. Do not invent new labels.
function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return 'Pending'
    case 'accepted':
      return 'Confirmed'
    case 'arriving':
      return 'Arriving'
    case 'checked_in':
      return 'Checked In'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    case 'cancelled_by_client':
      return 'Cancelled by Client'
    case 'cancelled_by_provider':
      return 'Cancelled by Provider'
    case 'late_cancelled':
      return 'Late Cancellation'
    case 'no_show':
      return 'No Show'
    default:
      return status
  }
}

interface StatusStyle {
  fg: string
  bg: string
  border: string
}

function getStatusStyle(status: string): StatusStyle {
  if (status === 'pending') {
    return { fg: '#C8922A', bg: 'rgba(200,146,42,0.12)', border: 'rgba(200,146,42,0.4)' }
  }
  if (status === 'accepted') {
    return { fg: '#4CAF50', bg: 'rgba(76,175,80,0.12)', border: 'rgba(76,175,80,0.4)' }
  }
  if (status === 'arriving') {
    return { fg: '#7AB3F2', bg: 'rgba(73,143,225,0.12)', border: 'rgba(73,143,225,0.4)' }
  }
  if (status === 'checked_in') {
    return { fg: '#B789D1', bg: 'rgba(156,39,176,0.14)', border: 'rgba(156,39,176,0.4)' }
  }
  if (status === 'completed') {
    return { fg: '#7CCB80', bg: 'rgba(76,175,80,0.1)', border: 'rgba(76,175,80,0.3)' }
  }
  if (status === 'no_show') {
    return { fg: '#E05C5C', bg: 'rgba(224,92,92,0.12)', border: 'rgba(224,92,92,0.4)' }
  }
  return {
    fg: 'rgba(240,232,213,0.55)',
    bg: 'rgba(240,232,213,0.05)',
    border: 'rgba(240,232,213,0.15)',
  }
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function money(n: number | null): string {
  if (n == null) return '$0'
  return '$' + Number(n).toFixed(0)
}

function Shimmer({ style }: { style: object }) {
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

export default function ProviderBookings() {
  const { openPanel } = usePanelContext()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [activeStatus, setActiveStatus] = useState<BucketKey>('pending')
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [clientNames, setClientNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    if (!user) {
      setBookings([])
      setLoading(false)
      return
    }
    try {
      const { data: provider } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!provider) {
        setBookings([])
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('bookings')
        .select(
          'id, user_id, service_name, requested_date, requested_time, status, payment_amount, created_at',
        )
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.log('Provider bookings fetch error:', error)
        setBookings([])
        setLoading(false)
        return
      }

      const rows = (data ?? []) as BookingRow[]
      setBookings(rows)

      const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter(Boolean)))
      if (userIds.length > 0) {
        const { data: clientRows } = await supabase
          .from('clients')
          .select('id, name')
          .in('id', userIds)
        const next: Record<string, string> = {}
        for (const c of (clientRows ?? []) as Array<{ id: string; name: string | null }>) {
          next[c.id] = c.name || 'Client'
        }
        setClientNames(next)
      }
    } catch (err) {
      console.log('Provider bookings error:', err)
      setBookings([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  async function handleRefresh() {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const pendingRows = bookings.filter((b) => b.status === 'pending')
  const upcomingRows = bookings.filter((b) => UPCOMING_STATUSES.has(b.status))
  const pastRows = bookings.filter((b) => PAST_STATUSES.has(b.status))
  const cancelledRows = bookings.filter((b) => CANCELLED_STATUSES.has(b.status))

  const visibleRows =
    activeStatus === 'pending'
      ? pendingRows
      : activeStatus === 'upcoming'
        ? upcomingRows
        : activeStatus === 'past'
          ? pastRows
          : cancelledRows

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bookings</Text>
        <View style={styles.menuBtnSpacer} />
      </View>

      <View style={styles.tabs}>
        {TABS.map((tab) => {
          const active = activeStatus === tab.key
          const count =
            tab.key === 'pending'
              ? pendingRows.length
              : tab.key === 'upcoming'
                ? upcomingRows.length
                : tab.key === 'past'
                  ? pastRows.length
                  : cancelledRows.length
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, active && styles.tabActive]}
              activeOpacity={0.7}
              onPress={() => setActiveStatus(tab.key)}
            >
              <Text style={active ? styles.tabTextActive : styles.tabTextInactive}>
                {tab.label}
              </Text>
              {tab.key === 'pending' && count > 0 && <View style={styles.pendingDot} />}
            </TouchableOpacity>
          )
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="rgba(240,232,213,0.5)"
          />
        }
      >
        {loading ? (
          <>
            <Shimmer style={styles.skeletonCard} />
            <Shimmer style={styles.skeletonCard} />
            <Shimmer style={styles.skeletonCard} />
          </>
        ) : visibleRows.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="calendar" size={36} color="rgba(240,232,213,0.1)" />
            <Text style={styles.emptyTitle}>
              {activeStatus === 'pending'
                ? 'No pending requests'
                : activeStatus === 'upcoming'
                  ? 'No upcoming bookings'
                  : activeStatus === 'past'
                    ? 'No past bookings yet'
                    : 'No cancelled bookings'}
            </Text>
            <Text style={styles.emptyBody}>
              {activeStatus === 'pending'
                ? 'New requests will appear here when clients book.'
                : 'Bookings you confirm will show up here.'}
            </Text>
          </View>
        ) : (
          visibleRows.map((b) => {
            const sty = getStatusStyle(b.status)
            const clientName = clientNames[b.user_id] || 'Client'
            const dateLabel = formatDate(b.requested_date)
            return (
              <TouchableOpacity
                key={b.id}
                style={styles.card}
                activeOpacity={0.7}
                onPress={() =>
                  router.push(
                    (b.status === 'pending'
                      ? '/bookings/request/' + b.id
                      : '/bookings/' + b.id) as never,
                  )
                }
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.clientName} numberOfLines={1}>
                    {clientName}
                  </Text>
                  <View
                    style={[
                      styles.pill,
                      { backgroundColor: sty.bg, borderColor: sty.border },
                    ]}
                  >
                    <Text style={[styles.pillText, { color: sty.fg }]}>
                      {getStatusLabel(b.status)}
                    </Text>
                  </View>
                </View>

                {b.service_name != null && (
                  <Text style={styles.serviceText}>{b.service_name}</Text>
                )}

                <View style={styles.cardBottomRow}>
                  <View style={styles.metaRow}>
                    <Feather name="calendar" size={11} color="rgba(240,232,213,0.45)" />
                    <Text style={styles.metaText}>
                      {dateLabel ?? 'Date pending'}
                      {b.requested_time ? ' · ' + b.requested_time : ''}
                    </Text>
                  </View>
                  {b.payment_amount != null && b.payment_amount > 0 && (
                    <Text style={styles.amountText}>{money(b.payment_amount)}</Text>
                  )}
                </View>
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    paddingHorizontal: 20,
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
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    gap: 6,
  },
  tabActive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
    borderColor: 'rgba(240,232,213,0.2)',
  },
  tabTextActive: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  tabTextInactive: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
  pendingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  scroll: { flex: 1 },
  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  clientName: {
    flex: 1,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginRight: 12,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  pillText: {
    fontSize: 11,
    fontFamily: 'Manrope_600SemiBold',
  },
  serviceText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 8,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  metaText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  amountText: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  skeletonCard: {
    height: 96,
    borderRadius: 14,
    marginBottom: 12,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 6,
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 18,
  },
})
