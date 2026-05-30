import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePanelContext } from '@/context/PanelContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { useNotifications } from '@/hooks/useNotifications'

interface BookingRequest {
  id: string
  user_id: string
  service_name: string | null
  requested_date: string | null
  requested_time: string | null
  message: string | null
  status: string
  payment_amount: number | null
  created_at: string
  client_name?: string
}

interface TodayBooking {
  id: string
  service_name: string | null
  requested_time: string | null
  user_id: string
  payment_amount: number | null
  status: string
}

interface Earnings {
  total: number
  month: number
  completedCount: number
  pendingCount: number
}

const ZERO_EARNINGS: Earnings = {
  total: 0,
  month: 0,
  completedCount: 0,
  pendingCount: 0,
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0]
}

const QUICK_ACTIONS = [
  { icon: 'plus-circle', label: 'Add Service', route: '/dashboard/provider/services' },
  { icon: 'clock', label: 'Set Hours', route: '/dashboard/provider/availability' },
  { icon: 'image', label: 'Add Photos', route: '/dashboard/provider/portfolio' },
  { icon: 'share-2', label: 'Share Profile', route: null as string | null },
]

function timeRemaining(createdAt: string): string {
  const created = new Date(createdAt).getTime()
  const deadline = created + 24 * 60 * 60 * 1000
  const diff = deadline - Date.now()
  if (diff <= 0) return 'Expired'
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
  if (hours > 0) return `${hours}h left`
  return `${minutes}m left`
}

function SkeletonCard({ index }: { index: number }) {
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
  return (
    <Animated.View
      style={[
        styles.skeletonCard,
        index < 1 && styles.skeletonCardBorder,
        { opacity },
      ]}
    />
  )
}

export default function ProviderDashboard() {
  const insets = useSafeAreaInsets()
  const { openPanel } = usePanelContext()
  const { user } = useAuth()
  const { unreadCount: notifUnreadCount } = useNotifications()

  const [providerDbId, setProviderDbId] = useState<string | null>(null)
  const [providerName, setProviderName] = useState('')
  const [pendingRequests, setPendingRequests] = useState<BookingRequest[]>([])
  const [todayBookings, setTodayBookings] = useState<TodayBooking[]>([])
  const [earnings, setEarnings] = useState<Earnings>(ZERO_EARNINGS)
  const [requestsLoading, setRequestsLoading] = useState(true)

  const fetchAllDashboardData = useCallback(async () => {
    if (!user) {
      setRequestsLoading(false)
      return
    }
    try {
      const { data: provider } = await supabase
        .from('providers')
        .select('id, display_name')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!provider) {
        setRequestsLoading(false)
        return
      }
      setProviderDbId(provider.id)
      if (provider.display_name) setProviderName(provider.display_name)

      // All bookings for this provider, used to derive pending list,
      // earnings totals, and today's schedule from a single query.
      const { data: allBookings, error } = await supabase
        .from('bookings')
        .select(
          'id, user_id, service_name, requested_date, requested_time, message, status, payment_amount, created_at',
        )
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.log('Fetch bookings error:', error)
        setRequestsLoading(false)
        return
      }

      const rows = (allBookings ?? []) as BookingRequest[]

      // Pending list with looked-up client names.
      const pendingRows = rows.filter((b) => b.status === 'pending')
      const pendingWithNames = await Promise.all(
        pendingRows.map(async (b) => {
          const { data: client } = await supabase
            .from('clients')
            .select('name')
            .eq('id', b.user_id)
            .maybeSingle()
          return { ...b, client_name: client?.name || 'New Client' }
        }),
      )
      setPendingRequests(pendingWithNames)

      // Earnings: completed bookings only. payment_amount is dollars,
      // not cents (per schema confirmation in the audit).
      const completed = rows.filter((b) => b.status === 'completed')
      const totalEarnings = completed.reduce(
        (sum, b) => sum + (b.payment_amount ?? 0),
        0,
      )
      const now = new Date()
      const thisMonthEarnings = completed.reduce((sum, b) => {
        const d = new Date(b.created_at)
        if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) {
          return sum
        }
        return sum + (b.payment_amount ?? 0)
      }, 0)
      setEarnings({
        total: totalEarnings,
        month: thisMonthEarnings,
        completedCount: completed.length,
        pendingCount: pendingRows.length,
      })

      // Today's schedule: accepted / arriving / checked_in for today.
      const todayStr = todayIsoDate()
      const todayRows = rows
        .filter(
          (b) =>
            b.requested_date === todayStr &&
            (b.status === 'accepted' ||
              b.status === 'arriving' ||
              b.status === 'checked_in'),
        )
        .sort((a, b) => (a.requested_time ?? '').localeCompare(b.requested_time ?? ''))
        .map((b) => ({
          id: b.id,
          service_name: b.service_name,
          requested_time: b.requested_time,
          user_id: b.user_id,
          payment_amount: b.payment_amount,
          status: b.status,
        }))
      setTodayBookings(todayRows)
    } catch (err) {
      console.log('Dashboard fetch error:', err)
    } finally {
      setRequestsLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchAllDashboardData()

    // Realtime: refetch on any INSERT into bookings. The fetch itself
    // filters by provider_id so spurious events for other providers are
    // cheap. Realtime must be enabled for the bookings table in Supabase
    // for this to fire.
    const channel = supabase
      .channel('provider-bookings')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bookings' },
        () => {
          fetchAllDashboardData()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [fetchAllDashboardData])

  function handleAccept(booking: BookingRequest) {
    Alert.alert(
      'Accept Booking',
      `Accept ${booking.service_name ?? 'this booking'} for ${booking.client_name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: async () => {
            const nowIso = new Date().toISOString()
            const { error } = await supabase
              .from('bookings')
              .update({
                status: 'accepted',
                provider_confirmed_at: nowIso,
                provider_first_response_at: nowIso,
              })
              .eq('id', booking.id)
            if (error) {
              Alert.alert('Error', 'Could not accept booking. Please try again.')
              return
            }
            setPendingRequests((prev) => prev.filter((r) => r.id !== booking.id))
            // Pull again so Today's Schedule + earnings counts catch up.
            fetchAllDashboardData()
          },
        },
      ],
    )
  }

  function handleDecline(booking: BookingRequest) {
    Alert.alert(
      'Decline Booking',
      'Are you sure? The client will be notified and no charge will be made.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Decline',
          style: 'destructive',
          onPress: async () => {
            const nowIso = new Date().toISOString()
            const { error } = await supabase
              .from('bookings')
              .update({
                status: 'cancelled_by_provider',
                cancelled_at: nowIso,
                cancelled_by: user?.id,
                cancellation_actor: 'provider',
                provider_first_response_at: nowIso,
              })
              .eq('id', booking.id)
            if (error) {
              Alert.alert('Error', 'Could not decline booking. Please try again.')
              return
            }
            setPendingRequests((prev) => prev.filter((r) => r.id !== booking.id))
          },
        },
      ],
    )
  }

  const hour = new Date().getHours()
  const greeting =
    hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const greetingName = providerName || 'there'
  const pendingCount = pendingRequests.length

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Dashboard</Text>
        <TouchableOpacity
          style={styles.menuBtn}
          activeOpacity={0.8}
          onPress={() => router.push('/notifications' as never)}
        >
          <Feather name="bell" size={18} color="#F0E8D5" />
          {notifUnreadCount > 0 && <View style={styles.notifDot} />}
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
      >
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>
            {greeting}, {greetingName}.
          </Text>
          <Text style={styles.greetingSubtext}>
            {requestsLoading
              ? ' '
              : pendingCount === 0
                ? 'Your schedule is clear today.'
                : `You have ${pendingCount} pending request${pendingCount === 1 ? '' : 's'}.`}
          </Text>
        </View>

        <View style={styles.earningsCard}>
          <Text style={styles.earningsLabel}>LIFETIME EARNINGS</Text>
          <Text style={styles.earningsAmount}>${earnings.total.toFixed(2)}</Text>
          <View style={styles.earningsStats}>
            <View style={styles.earningStat}>
              <Text style={styles.earningStatValue}>{earnings.completedCount}</Text>
              <Text style={styles.earningStatLabel}>completed</Text>
            </View>
            <View style={styles.earningStat}>
              <Text style={styles.earningStatValue}>{earnings.pendingCount}</Text>
              <Text style={styles.earningStatLabel}>pending</Text>
            </View>
            <View style={styles.earningStat}>
              <Text style={styles.earningStatValue}>
                ${earnings.month.toFixed(0)}
              </Text>
              <Text style={styles.earningStatLabel}>this month</Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.payoutsLink}
            onPress={() => router.push('/dashboard/provider/payouts' as never)}
            activeOpacity={0.7}
          >
            <Text style={styles.payoutsLinkText}>View payouts</Text>
            <Feather name="chevron-right" size={11} color="#C8922A" />
          </TouchableOpacity>
        </View>

        {/* Pending requests */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.pendingHeaderLeft}>
              <View style={styles.pulseDot} />
              <Text style={styles.sectionTitle}>Pending Requests</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/dashboard/provider/bookings' as never)}
            >
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>

          {requestsLoading ? (
            <>
              <SkeletonCard index={0} />
              <SkeletonCard index={1} />
            </>
          ) : pendingCount === 0 ? (
            <View style={styles.emptyRequests}>
              <Feather name="check-circle" size={28} color="rgba(240,232,213,0.18)" />
              <Text style={styles.emptyRequestsTitle}>No pending requests</Text>
              <Text style={styles.emptyRequestsSub}>New requests will appear here.</Text>
            </View>
          ) : (
            pendingRequests.map((req, i) => (
              <View
                key={req.id}
                style={[
                  styles.requestCard,
                  i < pendingRequests.length - 1 && styles.requestCardBorder,
                ]}
              >
                <View style={styles.requestAvatar}>
                  <Text style={styles.requestAvatarText}>
                    {(req.client_name ?? 'C').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.requestInfo}
                  onPress={() => router.push(`/bookings/${req.id}` as never)}
                >
                  <Text style={styles.requestClient}>{req.client_name}</Text>
                  <Text style={styles.requestService}>{req.service_name ?? 'Booking'}</Text>
                  <Text style={styles.requestTime}>
                    {req.requested_date} · {req.requested_time}
                  </Text>
                  {req.message ? (
                    <Text style={styles.requestMessage} numberOfLines={1}>
                      {req.message}
                    </Text>
                  ) : null}
                  <View style={styles.timerPill}>
                    <Text style={styles.timerPillText}>{timeRemaining(req.created_at)}</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.requestRight}>
                  <Text style={styles.requestPrice}>
                    {req.payment_amount != null
                      ? '$' + Number(req.payment_amount).toFixed(0)
                      : '$0'}
                  </Text>
                  <View style={styles.requestActions}>
                    <Pressable
                      style={[styles.requestBtn, styles.requestBtnDecline]}
                      onPress={() => handleDecline(req)}
                    >
                      <Feather name="x" size={14} color="rgba(240,232,213,0.5)" />
                    </Pressable>
                    <Pressable
                      style={[styles.requestBtn, styles.requestBtnMessage]}
                      onPress={() => router.push(`/messages/${req.user_id}` as never)}
                    >
                      <Feather name="message-circle" size={14} color="rgba(240,232,213,0.7)" />
                    </Pressable>
                    <Pressable
                      style={[styles.requestBtn, styles.requestBtnAccept]}
                      onPress={() => handleAccept(req)}
                    >
                      <Feather name="check" size={14} color="#080808" />
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          )}
        </View>

        {/* Quick actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.quickGrid}>
            {QUICK_ACTIONS.map((action) => (
              <TouchableOpacity
                key={action.label}
                style={styles.quickTile}
                activeOpacity={0.75}
                onPress={() => action.route && router.push(action.route as never)}
              >
                <View style={styles.quickIconBox}>
                  <Feather name={action.icon as any} size={20} color="rgba(240,232,213,0.55)" />
                </View>
                <Text style={styles.quickLabel}>{action.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Today's schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today&apos;s Schedule</Text>
          {todayBookings.length === 0 ? (
            <View style={styles.emptySchedule}>
              <Feather name="calendar" size={28} color="rgba(240,232,213,0.1)" />
              <Text style={styles.emptyScheduleText}>No appointments today</Text>
              <Text style={styles.emptyScheduleSub}>Accepted bookings will appear here.</Text>
            </View>
          ) : (
            todayBookings.map((b, i) => {
              const pill =
                b.status === 'checked_in'
                  ? styles.statusPillGreen
                  : b.status === 'arriving'
                    ? styles.statusPillBlue
                    : styles.statusPillAmber
              const pillText =
                b.status === 'checked_in'
                  ? styles.statusPillTextGreen
                  : b.status === 'arriving'
                    ? styles.statusPillTextBlue
                    : styles.statusPillTextAmber
              return (
                <View
                  key={b.id}
                  style={[
                    styles.todayCard,
                    i < todayBookings.length - 1 && styles.todayCardBorder,
                  ]}
                >
                  <Text style={styles.todayTime}>{b.requested_time ?? '-'}</Text>
                  <View style={styles.todayCenter}>
                    <Text style={styles.todayService}>
                      {b.service_name ?? 'Booking'}
                    </Text>
                    <View style={[styles.statusPill, pill]}>
                      <Text style={[styles.statusPillText, pillText]}>
                        {b.status === 'checked_in' ? 'Checked in' : b.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.todayPrice}>
                    {b.payment_amount != null
                      ? '$' + Number(b.payment_amount).toFixed(0)
                      : '$0'}
                  </Text>
                </View>
              )
            })
          )}
        </View>

        {providerDbId == null && !requestsLoading && (
          <View style={styles.noProfileBanner}>
            <Feather name="alert-triangle" size={14} color="#C8922A" />
            <Text style={styles.noProfileText}>
              No provider profile found for this account.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
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
  notifDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  headerTitle: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  greeting: {
    marginTop: 20,
    marginBottom: 24,
  },
  greetingText: {
    fontSize: 26,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  greetingSubtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    minHeight: 18,
  },
  earningsCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 16,
    borderCurve: 'continuous',
    padding: 20,
    marginBottom: 24,
  },
  earningsLabel: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  earningsAmount: {
    fontSize: 36,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 40,
  },
  earningsStats: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
  },
  earningStat: {},
  earningStatValue: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  earningStatLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  payoutsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 14,
  },
  payoutsLinkText: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  pendingHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  sectionTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 14,
  },
  seeAll: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  skeletonCard: {
    height: 96,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginBottom: 10,
  },
  skeletonCardBorder: {},
  emptyRequests: {
    paddingVertical: 28,
    alignItems: 'center',
    gap: 6,
  },
  emptyRequestsTitle: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 6,
  },
  emptyRequestsSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
  requestCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  requestCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  requestAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  requestAvatarText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  requestInfo: {
    flex: 1,
  },
  requestClient: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  requestService: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  requestTime: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  requestMessage: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  timerPill: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    backgroundColor: 'rgba(200,146,42,0.1)',
  },
  timerPillText: {
    fontSize: 10,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
  requestRight: {
    alignItems: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  requestPrice: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  requestActions: {
    flexDirection: 'row',
    gap: 6,
  },
  requestBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestBtnDecline: {
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  requestBtnMessage: {
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  requestBtnAccept: {
    backgroundColor: '#F0E8D5',
  },
  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  quickTile: {
    width: '47.5%',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
    alignItems: 'flex-start',
  },
  quickIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  quickLabel: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  todayCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
  },
  todayCardBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  todayTime: {
    width: 78,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  todayCenter: {
    flex: 1,
    gap: 4,
  },
  todayService: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  todayPrice: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusPillAmber: {
    backgroundColor: 'rgba(200,146,42,0.12)',
  },
  statusPillBlue: {
    backgroundColor: 'rgba(73,143,225,0.12)',
  },
  statusPillGreen: {
    backgroundColor: 'rgba(76,175,80,0.12)',
  },
  statusPillText: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'capitalize',
  },
  statusPillTextAmber: {
    color: '#C8922A',
  },
  statusPillTextBlue: {
    color: '#7AB3F2',
  },
  statusPillTextGreen: {
    color: '#7CCB80',
  },
  emptySchedule: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyScheduleText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 10,
  },
  emptyScheduleSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },
  noProfileBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.25)',
    backgroundColor: 'rgba(200,146,42,0.05)',
    marginTop: 4,
  },
  noProfileText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
  },
})
