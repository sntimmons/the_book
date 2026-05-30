import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

interface BookingDetail {
  id: string
  user_id: string
  provider_id: string
  service_name: string | null
  service_id: string | null
  requested_date: string | null
  requested_time: string | null
  appointment_time: string | null
  message: string | null
  status: string
  payment_status: string | null
  payment_amount: number | null
  created_at: string
  provider_first_response_at: string | null
  provider_confirmed_at: string | null
  client_checked_in_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  cancelled_by: string | null
}

type StatusBucket =
  | 'pending'
  | 'accepted'
  | 'arriving'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'no_show'

function statusBucket(status: string): StatusBucket {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'accepted':
      return 'accepted'
    case 'arriving':
      return 'arriving'
    case 'checked_in':
      return 'checked_in'
    case 'completed':
      return 'completed'
    case 'no_show':
      return 'no_show'
    default:
      return 'cancelled'
  }
}

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

// Distinct fg/bg/border per status keeps the pill readable on the dark
// background without relying on hex+alpha concatenation tricks that break
// for rgba() values.
function getStatusStyle(status: string): StatusStyle {
  switch (statusBucket(status)) {
    case 'pending':
      return { fg: '#C8922A', bg: 'rgba(200,146,42,0.12)', border: 'rgba(200,146,42,0.4)' }
    case 'accepted':
      return { fg: '#4CAF50', bg: 'rgba(76,175,80,0.12)', border: 'rgba(76,175,80,0.4)' }
    case 'arriving':
      return { fg: '#7AB3F2', bg: 'rgba(73,143,225,0.12)', border: 'rgba(73,143,225,0.4)' }
    case 'checked_in':
      return { fg: '#B789D1', bg: 'rgba(156,39,176,0.14)', border: 'rgba(156,39,176,0.4)' }
    case 'completed':
      return { fg: '#7CCB80', bg: 'rgba(76,175,80,0.1)', border: 'rgba(76,175,80,0.3)' }
    case 'no_show':
      return { fg: '#E05C5C', bg: 'rgba(224,92,92,0.12)', border: 'rgba(224,92,92,0.4)' }
    case 'cancelled':
    default:
      return {
        fg: 'rgba(240,232,213,0.55)',
        bg: 'rgba(240,232,213,0.05)',
        border: 'rgba(240,232,213,0.15)',
      }
  }
}

function money(n: number | null): string {
  if (n == null) return '$0.00'
  return '$' + Number(n).toFixed(2)
}

export default function BookingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const insets = useSafeAreaInsets()

  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [providerName, setProviderName] = useState('')
  const [providerCategory, setProviderCategory] = useState('')
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [isProvider, setIsProvider] = useState(false)

  const fetchBookingDetail = useCallback(async () => {
    if (!id || !user) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: bookingData, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error || !bookingData) {
        console.log('Booking fetch error:', error)
        setLoading(false)
        return
      }

      setBooking(bookingData as BookingDetail)

      const { data: providerRow } = await supabase
        .from('providers')
        .select('id, display_name, category_id, user_id')
        .eq('id', bookingData.provider_id)
        .maybeSingle()

      if (providerRow) {
        setProviderName(providerRow.display_name || 'Provider')
        if (providerRow.user_id === user.id) {
          setIsProvider(true)
        }
        if (providerRow.category_id != null) {
          const { data: cat } = await supabase
            .from('categories')
            .select('name')
            .eq('id', providerRow.category_id)
            .maybeSingle()
          if (cat) setProviderCategory(cat.name)
        }
      }

      const { data: clientRow } = await supabase
        .from('clients')
        .select('name')
        .eq('id', bookingData.user_id)
        .maybeSingle()
      setClientName(clientRow?.name || 'Client')
    } catch (err) {
      console.log('Booking detail error:', err)
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    fetchBookingDetail()
  }, [fetchBookingDetail])

  async function updateStatus(
    newStatus: string,
    extraFields: Record<string, unknown> = {},
  ) {
    if (!booking) return
    setActionLoading(true)
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus, ...extraFields })
      .eq('id', booking.id)
    if (error) {
      console.log('Status update error:', error)
      Alert.alert(
        'Something went wrong',
        'Could not update booking status. Please try again.',
        [{ text: 'OK' }],
      )
      setActionLoading(false)
      return
    }
    setBooking((prev) => (prev ? { ...prev, status: newStatus, ...extraFields } : null))
    setActionLoading(false)
  }

  function handleCancel() {
    const byProvider = isProvider
    Alert.alert(
      'Cancel Booking',
      byProvider
        ? 'Cancel this appointment? The client will be notified.'
        : 'Cancel this appointment? Your deposit protection terms apply.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: () =>
            updateStatus(
              byProvider ? 'cancelled_by_provider' : 'cancelled_by_client',
              {
                cancelled_at: new Date().toISOString(),
                cancelled_by: user?.id ?? null,
                cancellation_actor: byProvider ? 'provider' : 'client',
              },
            ),
        },
      ],
    )
  }

  function handleMarkArriving() {
    updateStatus('arriving', {
      provider_first_response_at:
        booking?.provider_first_response_at ?? new Date().toISOString(),
    })
  }

  function handleMarkCheckedIn() {
    updateStatus('checked_in', {
      client_checked_in_at: new Date().toISOString(),
    })
  }

  function handleMarkCompleted() {
    Alert.alert(
      'Mark as Completed',
      'Confirm this appointment is complete? The client will be prompted to leave a review.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Mark Complete',
          onPress: () =>
            updateStatus('completed', { completed_at: new Date().toISOString() }),
        },
      ],
    )
  }

  function handleMarkNoShow() {
    Alert.alert(
      'Mark as No Show',
      'The client did not show up? This will be recorded on their profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark No Show',
          style: 'destructive',
          onPress: () =>
            updateStatus('no_show', {
              no_show_flag: true,
              cancelled_at: new Date().toISOString(),
            }),
        },
      ],
    )
  }

  function messageOtherParty() {
    if (!booking) return
    if (isProvider) {
      router.push(`/messages/${booking.user_id}` as never)
    } else {
      router.push(`/messages/${booking.provider_id}` as never)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────
  const headerNode = (
    <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={styles.topBarTitle}>Booking Details</Text>
      <View style={{ width: 24 }} />
    </View>
  )

  if (loading) {
    return (
      <View style={styles.root}>
        {headerNode}
        <View style={styles.centerWrap}>
          <ActivityIndicator color="#C8922A" />
        </View>
      </View>
    )
  }

  if (!booking) {
    return (
      <View style={styles.root}>
        {headerNode}
        <View style={styles.centerWrap}>
          <Text style={styles.notFoundText}>Booking not found</Text>
          <Pressable
            style={styles.primaryBtn}
            onPress={() => router.back()}
          >
            <Text style={styles.primaryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </View>
    )
  }

  const statusStyle = getStatusStyle(booking.status)
  const bucket = statusBucket(booking.status)

  return (
    <View style={styles.root}>
      {headerNode}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 220 }]}
      >
        {/* Status pill */}
        <View
          style={[
            styles.statusPill,
            { backgroundColor: statusStyle.bg, borderColor: statusStyle.border },
          ]}
        >
          <Text style={[styles.statusPillText, { color: statusStyle.fg }]}>
            {getStatusLabel(booking.status)}
          </Text>
        </View>

        {/* Service card */}
        <View style={styles.card}>
          <Text style={styles.serviceName}>
            {booking.service_name ?? 'Service'}
          </Text>
          <Text style={styles.peerLine}>
            {isProvider
              ? `Client: ${clientName}`
              : `Provider: ${providerName}${providerCategory ? ' · ' + providerCategory : ''}`}
          </Text>

          <View style={styles.divider} />

          <View style={styles.detailRow}>
            <Ionicons
              name="calendar-outline"
              size={16}
              color="rgba(240,232,213,0.4)"
              style={styles.detailIcon}
            />
            <Text style={styles.detailText}>
              {booking.requested_date ?? '—'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons
              name="time-outline"
              size={16}
              color="rgba(240,232,213,0.4)"
              style={styles.detailIcon}
            />
            <Text style={styles.detailText}>
              {booking.requested_time ?? '—'}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Ionicons
              name="card-outline"
              size={16}
              color="rgba(240,232,213,0.4)"
              style={styles.detailIcon}
            />
            <Text style={styles.detailText}>{money(booking.payment_amount)}</Text>
            <PaymentBadge status={booking.payment_status} />
          </View>
        </View>

        {/* Message card */}
        {booking.message ? (
          <View style={styles.card}>
            <Text style={styles.smallLabel}>BOOKING NOTE</Text>
            <Text style={styles.noteText}>{booking.message}</Text>
          </View>
        ) : null}

        {/* Booking ID */}
        <View style={styles.idRow}>
          <Text style={styles.idLabel}>Booking ID</Text>
          <Text style={styles.idValue}>{booking.id.slice(0, 8)}</Text>
        </View>
      </ScrollView>

      {/* Fixed bottom action bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 16 }]}>
        <ActionButtons
          bucket={bucket}
          isProvider={isProvider}
          actionLoading={actionLoading}
          onCancel={handleCancel}
          onMarkArriving={handleMarkArriving}
          onMarkCheckedIn={handleMarkCheckedIn}
          onMarkCompleted={handleMarkCompleted}
          onMarkNoShow={handleMarkNoShow}
          onMessage={messageOtherParty}
          onBack={() => router.back()}
        />
      </View>
    </View>
  )
}

function PaymentBadge({ status }: { status: string | null }) {
  if (!status) return null
  if (status === 'not_charged') {
    return (
      <View style={[styles.payBadge, styles.payBadgeNeutral]}>
        <Text style={styles.payBadgeTextNeutral}>Not charged yet</Text>
      </View>
    )
  }
  if (status === 'captured') {
    return (
      <View style={[styles.payBadge, styles.payBadgePaid]}>
        <Text style={styles.payBadgeTextPaid}>Paid</Text>
      </View>
    )
  }
  if (status === 'authorized') {
    return (
      <View style={[styles.payBadge, styles.payBadgeAuthorized]}>
        <Text style={styles.payBadgeTextAuthorized}>Authorized</Text>
      </View>
    )
  }
  return null
}

interface ActionButtonsProps {
  bucket: StatusBucket
  isProvider: boolean
  actionLoading: boolean
  onCancel: () => void
  onMarkArriving: () => void
  onMarkCheckedIn: () => void
  onMarkCompleted: () => void
  onMarkNoShow: () => void
  onMessage: () => void
  onBack: () => void
}

function ActionButtons(props: ActionButtonsProps) {
  const { bucket, isProvider, actionLoading, onCancel, onMarkArriving, onMarkCheckedIn, onMarkCompleted, onMarkNoShow, onMessage, onBack } = props

  // Terminal states for both sides.
  if (bucket === 'cancelled' || bucket === 'completed' || bucket === 'no_show') {
    return (
      <Pressable style={styles.primaryBtnFull} onPress={onBack}>
        <Text style={styles.primaryBtnText}>Back to Bookings</Text>
      </Pressable>
    )
  }

  if (bucket === 'pending') {
    if (isProvider) {
      return (
        <Pressable
          style={styles.primaryBtnFull}
          onPress={() => router.replace('/dashboard/provider' as never)}
        >
          <Text style={styles.primaryBtnText}>View in Dashboard</Text>
        </Pressable>
      )
    }
    return (
      <View style={styles.row}>
        <Pressable
          style={[styles.secondaryBtnHalf, actionLoading && styles.btnDisabled]}
          onPress={onCancel}
          disabled={actionLoading}
        >
          <Text style={styles.secondaryBtnText}>Cancel Request</Text>
        </Pressable>
        <Pressable style={styles.primaryBtnHalf} onPress={onMessage}>
          <Text style={styles.primaryBtnText}>Message Provider</Text>
        </Pressable>
      </View>
    )
  }

  if (bucket === 'accepted') {
    if (isProvider) {
      return (
        <View>
          <View style={styles.row}>
            <Pressable
              style={[styles.secondaryBtnHalf, actionLoading && styles.btnDisabled]}
              onPress={onMarkArriving}
              disabled={actionLoading}
            >
              <Text style={styles.secondaryBtnText}>Mark Arriving</Text>
            </Pressable>
            <Pressable
              style={[styles.primaryBtnHalf, actionLoading && styles.btnDisabled]}
              onPress={onMarkCheckedIn}
              disabled={actionLoading}
            >
              <Text style={styles.primaryBtnText}>Mark Checked In</Text>
            </Pressable>
          </View>
          <View style={[styles.row, { marginTop: 10 }]}>
            <Pressable
              style={[styles.dangerBtnHalf, actionLoading && styles.btnDisabled]}
              onPress={onMarkNoShow}
              disabled={actionLoading}
            >
              <Text style={styles.dangerBtnText}>No Show</Text>
            </Pressable>
            <Pressable
              style={[styles.amberBtnHalf, actionLoading && styles.btnDisabled]}
              onPress={onMarkCompleted}
              disabled={actionLoading}
            >
              <Text style={styles.amberBtnText}>Mark Complete</Text>
            </Pressable>
          </View>
        </View>
      )
    }
    return (
      <View style={styles.row}>
        <Pressable
          style={[styles.dangerBtnHalf, actionLoading && styles.btnDisabled]}
          onPress={onCancel}
          disabled={actionLoading}
        >
          <Text style={styles.dangerBtnText}>Cancel</Text>
        </Pressable>
        <Pressable style={styles.primaryBtnHalf} onPress={onMessage}>
          <Text style={styles.primaryBtnText}>Message</Text>
        </Pressable>
      </View>
    )
  }

  // arriving + checked_in
  if (isProvider) {
    return (
      <View style={styles.row}>
        <Pressable
          style={[styles.dangerBtnHalf, actionLoading && styles.btnDisabled]}
          onPress={onMarkNoShow}
          disabled={actionLoading}
        >
          <Text style={styles.dangerBtnText}>Mark No Show</Text>
        </Pressable>
        <Pressable
          style={[styles.amberBtnHalf, actionLoading && styles.btnDisabled]}
          onPress={onMarkCompleted}
          disabled={actionLoading}
        >
          <Text style={styles.amberBtnText}>Mark Complete</Text>
        </Pressable>
      </View>
    )
  }
  return (
    <Pressable style={styles.primaryBtnFull} onPress={onMessage}>
      <Text style={styles.primaryBtnText}>Message Provider</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  notFoundText: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
  },
  scrollContent: {
    paddingHorizontal: 24,
  },

  // Status pill
  statusPill: {
    alignSelf: 'flex-start',
    marginTop: 8,
    marginBottom: 24,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 13,
    fontFamily: 'Manrope_600SemiBold',
  },

  // Card
  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 20,
    marginBottom: 16,
  },
  serviceName: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 4,
  },
  peerLine: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  detailIcon: {
    marginRight: 10,
  },
  detailText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  smallLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  noteText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.8)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
  },
  idRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  idLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  idValue: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },

  // Payment badge
  payBadge: {
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  payBadgeNeutral: {
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  payBadgeTextNeutral: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  payBadgePaid: {
    backgroundColor: 'rgba(76,175,80,0.1)',
  },
  payBadgeTextPaid: {
    fontSize: 10,
    color: '#4CAF50',
    fontFamily: 'Manrope_500Medium',
  },
  payBadgeAuthorized: {
    backgroundColor: 'rgba(200,146,42,0.1)',
  },
  payBadgeTextAuthorized: {
    fontSize: 10,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },

  // Action bar
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(240,232,213,0.08)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  primaryBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  primaryBtnFull: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnHalf: {
    flex: 1,
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  secondaryBtnHalf: {
    flex: 1,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
  },
  secondaryBtnText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  dangerBtnHalf: {
    flex: 1,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(220,50,50,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(220,50,50,0.4)',
  },
  dangerBtnText: {
    fontSize: 15,
    color: 'rgba(220,50,50,0.85)',
    fontFamily: 'Manrope_600SemiBold',
  },
  amberBtnHalf: {
    flex: 1,
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C8922A',
  },
  amberBtnText: {
    fontSize: 15,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
})
