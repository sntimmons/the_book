import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { getOrCreateConversation } from '@/hooks/useMessaging'
import { bookingTab, bookingStatusLabel, bookingStatusTone } from '@/lib/bookingStatus'

type Status = 'upcoming' | 'pending' | 'past' | 'cancelled'

interface BookingRow {
  id: string
  service_name: string | null
  requested_date: string | null
  requested_time: string | null
  status: string
  payment_amount: number | null
  provider_id: string
  message: string | null
  created_at: string
}

const STATUS_TABS: { key: Status; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'pending', label: 'Pending' },
  { key: 'past', label: 'Past' },
  { key: 'cancelled', label: 'Cancelled' },
]

const EMPTY_CONFIG: Record<Status, { icon: keyof typeof Feather.glyphMap; sub: string }> = {
  upcoming: { icon: 'calendar', sub: 'Your confirmed appointments will appear here.' },
  pending: { icon: 'clock', sub: 'Booking requests waiting for provider confirmation.' },
  past: { icon: 'check-circle', sub: 'Your completed appointments and reviews.' },
  cancelled: { icon: 'x-circle', sub: 'Cancelled bookings.' },
}

function money(n: number | null): string {
  if (n == null) return '$0'
  return '$' + Number(n).toFixed(0)
}

function SkeletonCard() {
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
  return <Animated.View style={[styles.skeletonCard, { opacity }]} />
}

export default function BookingsScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [activeStatus, setActiveStatus] = useState<Status>('upcoming')
  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [providerNames, setProviderNames] = useState<Record<string, string>>({})

  const fetchBookings = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    try {
      const { data, error } = await supabase
        .from('bookings')
        .select(
          'id, service_name, requested_date, requested_time, status, payment_amount, provider_id, message, created_at',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.log('Bookings fetch error:', error)
        return
      }

      const rows = (data ?? []) as BookingRow[]
      setBookings(rows)

      // Lazy-fetch provider display names.
      // TODO: replace with a joined select once we know foreign-key
      // names are configured for the embed.
      const ids = Array.from(new Set(rows.map((b) => b.provider_id))).filter(Boolean)
      if (ids.length > 0) {
        const { data: providers } = await supabase
          .from('providers')
          .select('id, display_name')
          .in('id', ids)
        const next: Record<string, string> = {}
        for (const p of providers ?? []) {
          next[p.id] = p.display_name ?? 'Provider'
        }
        setProviderNames(next)
      }
    } catch (err) {
      console.log('Bookings error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchBookings()
  }, [fetchBookings])

  const upcomingBookings = bookings.filter((b) => bookingTab(b.status) === 'upcoming')
  const pendingBookings = bookings.filter((b) => bookingTab(b.status) === 'pending')
  const pastBookings = bookings.filter((b) => bookingTab(b.status) === 'past')
  const cancelledBookings = bookings.filter((b) => bookingTab(b.status) === 'cancelled')

  const data =
    activeStatus === 'upcoming'
      ? upcomingBookings
      : activeStatus === 'pending'
        ? pendingBookings
        : activeStatus === 'past'
          ? pastBookings
          : cancelledBookings

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>My Bookings</Text>
      </View>

      <View style={styles.tabs}>
        {STATUS_TABS.map((tab) => {
          const active = activeStatus === tab.key
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
              {tab.key === 'pending' && pendingBookings.length > 0 && (
                <View style={styles.pendingDot} />
              )}
            </TouchableOpacity>
          )
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {loading ? (
          <View style={styles.list}>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </View>
        ) : data.length === 0 ? (
          <EmptyState status={activeStatus} />
        ) : (
          <View style={styles.list}>
            {activeStatus === 'pending' && (
              <View style={styles.pendingBanner}>
                <Feather name="clock" size={14} color="#C8922A" style={styles.pendingBannerIcon} />
                <Text style={styles.pendingBannerText}>
                  Pending requests are waiting for provider confirmation. Your card will only be charged when confirmed.
                </Text>
              </View>
            )}

            {activeStatus === 'past' && (
              <Text style={styles.sectionLabel}>COMPLETED APPOINTMENTS</Text>
            )}

            {data.map((b) => (
              <BookingCard
                key={b.id}
                booking={b}
                status={activeStatus}
                providerName={providerNames[b.provider_id]}
                userId={user?.id ?? ''}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function BookingCard({
  booking,
  status,
  providerName,
  userId,
}: {
  booking: BookingRow
  status: Status
  providerName?: string
  userId: string
}) {
  const dateLine = [booking.requested_date, booking.requested_time].filter(Boolean).join(' · ')
  return (
    <View style={styles.card}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push(`/bookings/${booking.id}` as never)}
      >
        <View style={styles.cardTop}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(providerName ?? 'P').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.cardCenter}>
            <Text style={styles.cardProvider}>
              {(providerName ?? 'Provider') + ' · ' + (booking.service_name ?? 'Service')}
            </Text>
            {dateLine.length > 0 && <Text style={styles.cardDate}>{dateLine}</Text>}
            {booking.message ? (
              <Text style={styles.cardMessage} numberOfLines={1}>
                {booking.message}
              </Text>
            ) : null}
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.cardPrice}>{money(booking.payment_amount)}</Text>
            <StatusPill status={booking.status} />
          </View>
        </View>
      </TouchableOpacity>

      <View style={styles.cardSeparator} />

      <View style={styles.actionRow}>
        <CardActions
          status={status}
          bookingId={booking.id}
          providerId={booking.provider_id}
          userId={userId}
        />
      </View>
    </View>
  )
}

// Pill reflects the booking's REAL status (via the shared label + tone), not
// the active tab — so e.g. a "No show" in the Past tab reads correctly instead
// of showing "Completed".
function StatusPill({ status }: { status: string }) {
  const tone = bookingStatusTone(status)
  const pillStyle =
    tone === 'confirmed'
      ? styles.pillGreen
      : tone === 'pending'
        ? styles.pillAmber
        : tone === 'completed'
          ? styles.pillNeutral
          : styles.pillRed
  const textStyle =
    tone === 'confirmed'
      ? styles.pillTextGreen
      : tone === 'pending'
        ? styles.pillTextAmber
        : tone === 'completed'
          ? styles.pillTextNeutral
          : styles.pillTextRed
  return (
    <View style={[styles.pill, pillStyle]}>
      <Text style={textStyle}>{bookingStatusLabel(status)}</Text>
    </View>
  )
}

async function openChat(
  userId: string,
  providerId: string,
  bookingId: string,
) {
  if (!userId) return
  const convoId = await getOrCreateConversation(userId, providerId, bookingId)
  if (convoId) router.push(`/messages/${convoId}` as never)
}

function handleReschedule(
  userId: string,
  providerId: string,
  bookingId: string,
) {
  Alert.alert(
    'Reschedule',
    'To reschedule message your provider directly and they can adjust your appointment.',
    [
      {
        text: 'Message Provider',
        onPress: () => openChat(userId, providerId, bookingId),
      },
      { text: 'Cancel', style: 'cancel' },
    ],
  )
}

function CardActions({
  status,
  providerId,
  bookingId,
  userId,
}: {
  status: Status
  bookingId: string
  providerId: string
  userId: string
}) {
  if (status === 'upcoming') {
    return (
      <>
        <ActionButton
          label="Message"
          onPress={() => openChat(userId, providerId, bookingId)}
        />
        <ActionButton
          label="Reschedule"
          onPress={() => handleReschedule(userId, providerId, bookingId)}
        />
        <ActionButton
          label="Cancel"
          muted
          onPress={() => router.push('/bookings/' + bookingId)}
        />
      </>
    )
  }
  if (status === 'pending') {
    return (
      <>
        <ActionButton
          label="Message"
          onPress={() => openChat(userId, providerId, bookingId)}
        />
        <ActionButton
          label="Cancel Request"
          muted
          onPress={() => router.push('/bookings/' + bookingId)}
        />
      </>
    )
  }
  if (status === 'past') {
    return (
      <>
        <ActionButton label="Book Again" onPress={() => router.push(`/providers/${providerId}` as never)} />
        <ActionButton label="Leave Review" onPress={() => router.push(`/post-booking/satisfaction?id=${bookingId}` as never)} />
      </>
    )
  }
  return (
    <>
      <ActionButton label="Find Similar" onPress={() => router.push('/(tabs)/search' as never)} />
      <ActionButton label="Book Again" onPress={() => router.push(`/providers/${providerId}` as never)} />
    </>
  )
}

function ActionButton({
  label,
  onPress,
  muted,
}: {
  label: string
  onPress: () => void
  muted?: boolean
}) {
  return (
    <TouchableOpacity style={styles.actionBtn} activeOpacity={0.7} onPress={onPress}>
      <Text style={muted ? styles.actionBtnTextMuted : styles.actionBtnText}>{label}</Text>
    </TouchableOpacity>
  )
}

function EmptyState({ status }: { status: Status }) {
  const cfg = EMPTY_CONFIG[status]
  const name = STATUS_TABS.find((t) => t.key === status)?.label ?? ''
  return (
    <View style={styles.emptyState}>
      <Feather name={cfg.icon} size={36} color="rgba(240,232,213,0.1)" />
      <Text style={styles.emptyTitle}>No {name} bookings</Text>
      <Text style={styles.emptySub}>{cfg.sub}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  headerTitle: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  tabActive: {
    borderBottomWidth: 2,
    borderBottomColor: '#F0E8D5',
  },
  tabTextActive: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  tabTextInactive: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  pendingDot: {
    position: 'absolute',
    top: 8,
    right: 4,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  list: {
    marginTop: 16,
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  pendingBanner: {
    paddingVertical: 12,
    backgroundColor: 'rgba(200,146,42,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.15)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  pendingBannerIcon: {
    marginTop: 1,
  },
  pendingBannerText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 16,
  },
  skeletonCard: {
    height: 124,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardTop: {
    padding: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  cardCenter: {
    flex: 1,
  },
  cardProvider: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  cardDate: {
    marginTop: 3,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  cardMessage: {
    marginTop: 4,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  cardPrice: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  pill: {
    marginTop: 4,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  pillGreen: {
    backgroundColor: 'rgba(76,175,80,0.1)',
  },
  pillTextGreen: {
    fontSize: 10,
    color: '#4CAF50',
    fontFamily: 'Manrope_500Medium',
  },
  pillAmber: {
    backgroundColor: 'rgba(200,146,42,0.1)',
  },
  pillTextAmber: {
    fontSize: 10,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  pillNeutral: {
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  pillTextNeutral: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  pillRed: {
    backgroundColor: 'rgba(224,92,92,0.1)',
  },
  pillTextRed: {
    fontSize: 10,
    color: '#E05C5C',
    fontFamily: 'Manrope_500Medium',
  },
  cardSeparator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  actionRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  actionBtnTextMuted: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  emptyState: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    marginTop: 14,
    fontSize: 15,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  emptySub: {
    marginTop: 6,
    fontSize: 13,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
})
