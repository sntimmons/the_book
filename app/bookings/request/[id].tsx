import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import {
  fetchRevealedClientReviews,
  fetchClientCompletionRate,
  RevealedReview,
  initialsOf,
  aggregateClientDimensions,
  ClientDimensionStat,
} from '../../../lib/reviews'

// Screen 2: Booking Request (PROVIDER-ONLY). Surfaces the client's reputation
// (provider->client reviews, revealed only) plus the booking details, with real
// Accept / Decline that transition the existing booking via the proven
// bookings UPDATE path (the same mechanism the booking detail screen uses).

interface RequestBooking {
  id: string
  user_id: string
  provider_id: string
  service_name: string | null
  requested_date: string | null
  requested_time: string | null
  message: string | null
  status: string
}

export default function BookingRequestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const insets = useSafeAreaInsets()

  const [booking, setBooking] = useState<RequestBooking | null>(null)
  const [clientName, setClientName] = useState('Client')
  const [clientSince, setClientSince] = useState<string | null>(null)
  const [reviews, setReviews] = useState<RevealedReview[]>([])
  const [completionRate, setCompletionRate] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [notProvider, setNotProvider] = useState(false)
  const [reviewsBlocked, setReviewsBlocked] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)

  const load = useCallback(async () => {
    if (!id || !user) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: b } = await supabase
        .from('bookings')
        .select('id, user_id, provider_id, service_name, requested_date, requested_time, message, status')
        .eq('id', id)
        .maybeSingle()
      if (!b) {
        setBooking(null)
        setLoading(false)
        return
      }
      setBooking(b as RequestBooking)

      // Provider-only guard: confirm the current user owns this provider.
      const { data: prov } = await supabase
        .from('providers')
        .select('user_id')
        .eq('id', (b as RequestBooking).provider_id)
        .maybeSingle()
      if (!prov || prov.user_id !== user.id) {
        setNotProvider(true)
        setLoading(false)
        return
      }

      const clientUserId = (b as RequestBooking).user_id

      const [{ data: c }, repRes, completion] = await Promise.all([
        supabase
          .from('clients')
          .select('name, created_at')
          .eq('id', clientUserId)
          .maybeSingle(),
        fetchRevealedClientReviews(clientUserId),
        fetchClientCompletionRate(clientUserId),
      ])

      if (c) {
        setClientName((c.name as string) || 'Client')
        if (c.created_at) {
          setClientSince(
            new Date(c.created_at as string).toLocaleDateString('en-US', {
              month: 'short',
              year: 'numeric',
            }),
          )
        }
      }
      setReviews(repRes.reviews)
      setReviewsBlocked(repRes.rlsBlocked)
      setCompletionRate(completion)
    } catch (err) {
      console.log('Booking request load error:', err)
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    load()
  }, [load])

  // Accept / Decline reuse the proven bookings UPDATE path. Optimistic state
  // with revert-on-error and an honest alert; route away with replace to avoid
  // the duplicate-mount issue fixed elsewhere.
  async function transition(newStatus: string, extra: Record<string, unknown> = {}) {
    if (!booking || actionLoading) return
    const prevStatus = booking.status
    setActionLoading(true)
    setBooking({ ...booking, status: newStatus })

    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus, ...extra })
      .eq('id', booking.id)

    if (error) {
      setBooking({ ...booking, status: prevStatus })
      setActionLoading(false)
      console.log('Booking request transition error:', error.message)
      Alert.alert('Something went wrong', 'Could not update this request. Please try again.')
      return
    }
    setActionLoading(false)
    router.replace('/(tabs)/business/bookings' as never)
  }

  function handleAccept() {
    // Confirm so an accidental tap doesn't instantly accept (there's no
    // un-accept; Cancel/Decline is the off-ramp). Mirrors the Decline confirm.
    Alert.alert(
      'Accept Booking',
      `Accept this booking for ${clientName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Accept',
          onPress: () =>
            transition('accepted', {
              provider_first_response_at: new Date().toISOString(),
            }),
        },
      ],
    )
  }

  function handleDecline() {
    Alert.alert('Decline Request', 'Decline this booking request? The client will be notified.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Decline',
        style: 'destructive',
        onPress: () =>
          transition('cancelled_by_provider', {
            cancelled_at: new Date().toISOString(),
            cancelled_by: user?.id ?? null,
            cancellation_actor: 'provider',
          }),
      },
    ])
  }

  const headerNode = (
    <View style={[s.header, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity
        style={s.backBtn}
        activeOpacity={0.7}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        onPress={() => router.back()}
      >
        <Ionicons name="chevron-back" size={22} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={s.headerTitle}>Booking Request</Text>
      {/* This screen is provider-only and lives outside the provider drawer, so
          give a one-tap route back to the dashboard (and its drawer). Hidden in
          the not-a-provider guard state. */}
      {!notProvider ? (
        <TouchableOpacity
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.replace('/(tabs)/business' as never)}
        >
          <Ionicons name="home-outline" size={20} color="#F0E8D5" />
        </TouchableOpacity>
      ) : (
        <View style={s.backBtn} />
      )}
    </View>
  )

  if (loading) {
    return (
      <View style={s.root}>
        {headerNode}
        <View style={s.center}>
          <ActivityIndicator color="#C8922A" />
        </View>
      </View>
    )
  }

  if (notProvider) {
    return (
      <View style={s.root}>
        {headerNode}
        <View style={s.center}>
          <Text style={s.notFound}>This view is only available to the provider.</Text>
        </View>
      </View>
    )
  }

  if (!booking) {
    return (
      <View style={s.root}>
        {headerNode}
        <View style={s.center}>
          <Text style={s.notFound}>Request not found</Text>
        </View>
      </View>
    )
  }

  const isPending = booking.status === 'pending'
  const dimStats = aggregateClientDimensions(reviews)

  return (
    <View style={s.root}>
      {headerNode}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollPad, { paddingBottom: insets.bottom + 180 }]}
      >
        {/* Client identity */}
        <View style={s.identity}>
          <View style={s.bigAvatar}>
            <Text style={s.bigAvatarText}>{initialsOf(clientName)}</Text>
          </View>
          <Text style={s.clientName}>{clientName}</Text>
          {clientSince ? (
            <Text style={s.clientSince}>Client since {clientSince}</Text>
          ) : null}
        </View>

        {/* Booking details */}
        <View style={s.card}>
          <View style={s.detailRow}>
            <View style={s.detailCol}>
              <Text style={s.detailLabel}>Service</Text>
              <Text style={s.detailValue}>{booking.service_name ?? 'Service'}</Text>
            </View>
            <View style={[s.detailCol, { alignItems: 'flex-end' }]}>
              <Text style={s.detailLabel}>Time</Text>
              <Text style={s.detailValue}>
                {[booking.requested_date, booking.requested_time]
                  .filter(Boolean)
                  .join(', ') || 'TBD'}
              </Text>
            </View>
          </View>
          {booking.message ? (
            <View style={s.noteRow}>
              <Ionicons name="chatbubble-outline" size={15} color="rgba(240,232,213,0.45)" />
              <Text style={s.noteText}>{booking.message}</Text>
            </View>
          ) : null}
        </View>

        {/* Provider feedback (client reputation) */}
        <View style={s.feedbackHead}>
          <Text style={s.feedbackTitle}>Provider Feedback</Text>
          {/* "See all history" intentionally hidden: full client-review-history
              screen is not designed yet (no dead controls). */}
        </View>

        {reviewsBlocked ? (
          <View style={s.card}>
            <Text style={s.blockedText}>
              Client feedback is unavailable right now.
            </Text>
          </View>
        ) : !dimStats.hasAny ? (
          <View style={s.card}>
            <Text style={s.blockedText}>No history yet.</Text>
          </View>
        ) : (
          <View style={s.card}>
            <DimStatRow label="Showed up" stat={dimStats.showedUp} />
            <DimStatRow label="On time" stat={dimStats.onTime} />
            <DimStatRow label="Followed policy" stat={dimStats.followedPolicy} />
            <DimStatRow label="Payment" stat={dimStats.paymentCompleted} />
          </View>
        )}

        {/* Stats: Completion Rate is real. Late Arrivals is hidden (not tracked). */}
        {completionRate != null ? (
          <View style={s.statsRow}>
            <View style={s.statBox}>
              <Text style={s.statValue}>{Math.round(completionRate)}%</Text>
              <Text style={s.statLabel}>Completion Rate</Text>
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* Accept / Decline (only while pending) */}
      {isPending ? (
        <View style={[s.actionBar, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={[s.acceptBtn, actionLoading && s.btnDisabled]}
            disabled={actionLoading}
            onPress={handleAccept}
          >
            <Text style={s.acceptText}>Accept Booking</Text>
          </Pressable>
          <Pressable
            style={[s.declineBtn, actionLoading && s.btnDisabled]}
            disabled={actionLoading}
            onPress={handleDecline}
          >
            <Text style={s.declineText}>Decline Request</Text>
          </Pressable>
        </View>
      ) : (
        <View style={[s.actionBar, { paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            style={s.acceptBtn}
            onPress={() => router.replace('/(tabs)/business/bookings' as never)}
          >
            <Text style={s.acceptText}>Back to Bookings</Text>
          </Pressable>
        </View>
      )}
    </View>
  )
}

function DimStatRow({ label, stat }: { label: string; stat: ClientDimensionStat }) {
  if (stat.total === 0) {
    return (
      <View style={s.dimStatRow}>
        <Text style={s.dimStatLabel}>{label}</Text>
        <Text style={s.dimStatEmpty}>—</Text>
      </View>
    )
  }
  const allGood = stat.yes === stat.total
  return (
    <View style={s.dimStatRow}>
      <Text style={s.dimStatLabel}>{label}</Text>
      <View style={s.dimStatRight}>
        <Ionicons
          name={allGood ? 'checkmark-circle' : 'alert-circle'}
          size={16}
          color={allGood ? '#4CAF50' : '#C8922A'}
        />
        <Text style={s.dimStatCount}>
          {stat.yes}/{stat.total}
        </Text>
      </View>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  dimStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  dimStatLabel: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  dimStatRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dimStatCount: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_600SemiBold',
  },
  dimStatEmpty: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 20, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  notFound: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  scrollPad: { paddingHorizontal: 24, paddingTop: 8 },

  identity: { alignItems: 'center', marginBottom: 24 },
  bigAvatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(200,146,42,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(200,146,42,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bigAvatarText: { fontSize: 32, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  clientName: { fontSize: 24, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', marginTop: 16 },
  clientSince: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },

  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 20,
    marginBottom: 24,
  },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailCol: { flex: 1 },
  detailLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailValue: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold', marginTop: 6 },
  noteRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(240,232,213,0.8)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },

  feedbackHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  feedbackTitle: { fontSize: 18, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  blockedText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },

  statsRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  statBox: {
    flex: 1,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 26, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  statLabel: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
  },

  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,8,8,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
  },
  btnDisabled: { opacity: 0.5 },
  acceptBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptText: { fontSize: 16, color: '#080808', fontFamily: 'Manrope_700Bold' },
  declineBtn: {
    height: 53,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineText: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
})
