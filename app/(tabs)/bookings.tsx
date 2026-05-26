import { useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Status = 'upcoming' | 'pending' | 'past' | 'cancelled'

interface Booking {
  provider: string
  service: string
  date: string
  location?: string
  price: string
  timer?: string
  rated?: number
  cancelNote?: string
}

const UPCOMING: Booking[] = [
  {
    provider: 'Elena Ross',
    service: 'Silk Press',
    date: 'Today · 2:30 PM',
    location: 'Midtown Studio',
    price: '$130',
  },
  {
    provider: 'Marcus Blade',
    service: 'Fade + Lineup',
    date: 'May 30 · 11:00 AM',
    location: 'Blade Cuts Studio',
    price: '$65',
  },
]

const PENDING: Booking[] = [
  {
    provider: 'Nia Laurent',
    service: 'Classic Full Set',
    date: 'May 28 · 1:00 PM',
    location: 'River Oaks Studio',
    price: '$145',
    timer: 'Nia has 18 hours to respond',
  },
]

const PAST: Booking[] = [
  {
    provider: 'Jade Williams',
    service: 'Volume Full Set',
    date: 'May 15 · 10:00 AM',
    price: '$185',
    rated: 5,
  },
  {
    provider: 'Camille Brooks',
    service: 'Knotless Braids',
    date: 'May 8 · 9:00 AM',
    price: '$220',
  },
]

const CANCELLED: Booking[] = [
  {
    provider: 'Sienna James',
    service: 'Soft Glam Makeup',
    date: 'May 20 · 3:00 PM',
    price: '$150',
    cancelNote: 'Cancelled by you · May 18',
  },
]

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

export default function BookingsScreen() {
  const insets = useSafeAreaInsets()
  const [activeStatus, setActiveStatus] = useState<Status>('upcoming')

  const data =
    activeStatus === 'upcoming'
      ? UPCOMING
      : activeStatus === 'pending'
        ? PENDING
        : activeStatus === 'past'
          ? PAST
          : CANCELLED

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>My Bookings</Text>
      </View>

      {/* Status tabs */}
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
              <Text style={active ? styles.tabTextActive : styles.tabTextInactive}>{tab.label}</Text>
              {tab.key === 'pending' && <View style={styles.pendingDot} />}
            </TouchableOpacity>
          )
        })}
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {data.length === 0 ? (
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

            {data.map((b, i) => (
              <BookingCard key={`${b.provider}-${i}`} booking={b} status={activeStatus} />
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  )
}

function BookingCard({ booking, status }: { booking: Booking; status: Status }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.avatar}>
          <Feather name="user" size={18} color="rgba(240,232,213,0.4)" />
        </View>
        <View style={styles.cardCenter}>
          <Text style={styles.cardProvider}>
            {booking.provider} · {booking.service}
          </Text>
          <Text style={styles.cardDate}>{booking.date}</Text>
          {booking.location && <Text style={styles.cardLocation}>{booking.location}</Text>}
          {booking.timer && (
            <View style={styles.timerRow}>
              <Feather name="clock" size={11} color="#C8922A" />
              <Text style={styles.timerText}>{booking.timer}</Text>
            </View>
          )}
          {booking.rated != null && (
            <View style={styles.ratedRow}>
              {Array.from({ length: booking.rated }).map((_, i) => (
                <Feather key={i} name="star" size={10} color="#C8922A" />
              ))}
              <Text style={styles.ratedText}>You rated {booking.rated} stars</Text>
            </View>
          )}
          {booking.cancelNote && <Text style={styles.cancelNote}>{booking.cancelNote}</Text>}
        </View>
        <View style={styles.cardRight}>
          <Text style={styles.cardPrice}>{booking.price}</Text>
          <StatusPill status={status} />
        </View>
      </View>

      <View style={styles.cardSeparator} />

      <View style={styles.actionRow}>
        <CardActions status={status} />
      </View>
    </View>
  )
}

function StatusPill({ status }: { status: Status }) {
  if (status === 'upcoming') {
    return (
      <View style={[styles.pill, styles.pillGreen]}>
        <Text style={styles.pillTextGreen}>Confirmed</Text>
      </View>
    )
  }
  if (status === 'pending') {
    return (
      <View style={[styles.pill, styles.pillAmber]}>
        <Text style={styles.pillTextAmber}>Pending</Text>
      </View>
    )
  }
  if (status === 'past') {
    return (
      <View style={[styles.pill, styles.pillNeutral]}>
        <Text style={styles.pillTextNeutral}>Completed</Text>
      </View>
    )
  }
  return (
    <View style={[styles.pill, styles.pillRed]}>
      <Text style={styles.pillTextRed}>Cancelled</Text>
    </View>
  )
}

function handleReschedule() {
  Alert.alert(
    'Reschedule',
    'To reschedule message your provider directly and they can adjust your appointment.',
    [
      {
        text: 'Message Provider',
        onPress: () => router.push('/messages/1'),
      },
      { text: 'Cancel', style: 'cancel' },
    ],
  )
}

function handleCancelBooking() {
  Alert.alert(
    'Cancel Booking',
    "Cancellation fees may apply per your provider's policy. Are you sure you want to cancel?",
    [
      { text: 'Keep Booking', style: 'cancel' },
      {
        text: 'Cancel Booking',
        style: 'destructive',
        onPress: () => console.log('cancel booking'),
      },
    ],
  )
}

function handleCancelRequest() {
  Alert.alert(
    'Cancel Request',
    'Your booking request will be cancelled. No charge has been made.',
    [
      { text: 'Keep Request', style: 'cancel' },
      {
        text: 'Cancel Request',
        style: 'destructive',
        onPress: () => console.log('cancel request'),
      },
    ],
  )
}

function CardActions({ status }: { status: Status }) {
  if (status === 'upcoming') {
    return (
      <>
        <ActionButton label="Message" onPress={() => router.push('/messages/1')} />
        <ActionButton label="Reschedule" onPress={handleReschedule} />
        <ActionButton label="Cancel" muted onPress={handleCancelBooking} />
      </>
    )
  }
  if (status === 'pending') {
    return (
      <>
        <ActionButton label="Message" onPress={() => router.push('/messages/1')} />
        <ActionButton label="Cancel Request" muted onPress={handleCancelRequest} />
      </>
    )
  }
  if (status === 'past') {
    return (
      <>
        <ActionButton label="Book Again" onPress={() => router.push('/book/service')} />
        <ActionButton label="Leave Review" onPress={() => router.push('/post-booking/satisfaction')} />
      </>
    )
  }
  return (
    <>
      <ActionButton label="Find Similar" onPress={() => router.push('/(tabs)/search')} />
      <ActionButton label="Book Again" onPress={() => router.push('/book/service')} />
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
  cardLocation: {
    marginTop: 1,
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  timerRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timerText: {
    fontSize: 11,
    color: '#C8922A',
    fontFamily: 'Manrope_400Regular',
  },
  ratedRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratedText: {
    marginLeft: 4,
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  cancelNote: {
    marginTop: 4,
    fontSize: 11,
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
