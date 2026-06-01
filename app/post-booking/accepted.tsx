import { useCallback, useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Alert,
  ScrollView,
  Platform,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Calendar from 'expo-calendar'
import { supabase } from '../../lib/supabase'

interface BookingRow {
  id: string
  provider_id: string
  service_name: string | null
  service_id: string | null
  requested_date: string | null
  requested_time: string | null
  payment_amount: number | null
}

interface ProviderRow {
  id: string
  display_name: string | null
  neighborhood: string | null
  location: string | null
  profile_photo_url: string | null
  average_rating: number | null
  category_id: number | null
}

interface ServiceRow {
  id: string
  name: string
  price: number
  duration_minutes: number
}

interface AcceptedData {
  providerName: string
  providerCategory: string | null
  providerLocation: string | null
  rating: number | null
  serviceName: string
  servicePrice: number | null
  serviceDurationMinutes: number | null
  dateLabel: string | null
  timeLabel: string | null
  requestedDateIso: string | null
  depositAmount: number
  balanceAmount: number | null
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

function money(n: number | null | undefined): string {
  const v = Number(n ?? 0)
  return '$' + v.toFixed(2)
}

// Parse the booking flow's time strings ("1:00 PM", "1 PM", "13:00") into
// minutes-since-midnight. Returns null if the format is unrecognized so the
// calendar handler can fall back to noon.
function parseTimeToMinutes(timeStr: string | null): number | null {
  if (!timeStr) return null
  const trimmed = timeStr.trim()
  const m = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i)
  if (!m) return null
  let hours = parseInt(m[1], 10)
  const minutes = m[2] ? parseInt(m[2], 10) : 0
  const period = m[3] ? m[3].toLowerCase() : null
  if (period === 'pm' && hours !== 12) hours += 12
  if (period === 'am' && hours === 12) hours = 0
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

export default function BookingAccepted() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id?: string }>()
  const scale = useRef(new Animated.Value(0.5)).current

  const [data, setData] = useState<AcceptedData | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [providerDbId, setProviderDbId] = useState<string | null>(null)

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      tension: 65,
      friction: 8,
      useNativeDriver: true,
    }).start()
  }, [scale])

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: booking, error } = await supabase
        .from('bookings')
        .select(
          'id, provider_id, service_name, service_id, requested_date, requested_time, payment_amount',
        )
        .eq('id', id)
        .maybeSingle<BookingRow>()

      if (error || !booking) {
        setNotFound(true)
        return
      }

      const { data: provider } = await supabase
        .from('providers')
        .select(
          'id, display_name, neighborhood, location, profile_photo_url, average_rating, category_id',
        )
        .eq('id', booking.provider_id)
        .maybeSingle<ProviderRow>()

      if (!provider) {
        setNotFound(true)
        return
      }

      setProviderDbId(provider.id)

      let categoryName: string | null = null
      if (provider.category_id != null) {
        const { data: cat } = await supabase
          .from('categories')
          .select('name')
          .eq('id', provider.category_id)
          .maybeSingle()
        categoryName = (cat?.name as string) ?? null
      }

      let servicePrice: number | null = null
      let serviceDurationMinutes: number | null = null
      if (booking.service_id) {
        const { data: service } = await supabase
          .from('provider_services')
          .select('id, name, price, duration_minutes')
          .eq('id', booking.service_id)
          .maybeSingle<ServiceRow>()
        servicePrice = service?.price ?? null
        serviceDurationMinutes = service?.duration_minutes ?? null
      }

      const deposit = Number(booking.payment_amount ?? 0)
      const balance =
        servicePrice != null && servicePrice > deposit ? servicePrice - deposit : null

      setData({
        providerName: provider.display_name ?? 'Provider',
        providerCategory: categoryName,
        providerLocation: provider.neighborhood ?? provider.location ?? null,
        rating: provider.average_rating,
        serviceName: booking.service_name ?? 'Service',
        servicePrice,
        serviceDurationMinutes,
        dateLabel: formatDate(booking.requested_date),
        timeLabel: booking.requested_time,
        requestedDateIso: booking.requested_date,
        depositAmount: deposit,
        balanceAmount: balance,
      })
    } catch (err) {
      console.log('Accepted load error:', err)
      setNotFound(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  function handleMessageProvider() {
    if (providerDbId) {
      router.push(('/providers/' + providerDbId) as never)
      return
    }
    router.push('/(tabs)/messages' as never)
  }

  async function handleAddToCalendar() {
    if (!data || !data.requestedDateIso) {
      Alert.alert(
        'Date not set',
        'This booking has no scheduled date yet.',
        [{ text: 'OK' }],
      )
      return
    }
    try {
      const { status } = await Calendar.requestCalendarPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert(
          'Calendar access needed',
          'To add this booking to your calendar, allow calendar access in Settings.',
          [{ text: 'OK' }],
        )
        return
      }

      const calendars = await Calendar.getCalendarsAsync(
        Calendar.EntityTypes.EVENT,
      )
      const defaultCal =
        (Platform.OS === 'ios'
          ? (await Calendar.getDefaultCalendarAsync().catch(() => null))
          : null) ??
        calendars.find((c) => c.allowsModifications) ??
        calendars[0]

      if (!defaultCal) {
        Alert.alert(
          'No calendar available',
          'We could not find a writable calendar on this device.',
          [{ text: 'OK' }],
        )
        return
      }

      const startMinutes = parseTimeToMinutes(data.timeLabel) ?? 12 * 60
      const startDate = new Date(data.requestedDateIso + 'T00:00:00')
      startDate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0)

      const durationMinutes = data.serviceDurationMinutes ?? 60
      const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000)

      await Calendar.createEventAsync(defaultCal.id, {
        title: data.serviceName + ' with ' + data.providerName,
        startDate,
        endDate,
        location: data.providerLocation ?? undefined,
        notes:
          'Booked on The Book.' +
          (data.depositAmount > 0
            ? ' Deposit charged: ' + money(data.depositAmount) + '.'
            : ''),
      })

      Alert.alert(
        'Added to calendar',
        'This booking is on your calendar.',
        [{ text: 'OK' }],
      )
    } catch (err) {
      console.log('Add to calendar error:', err)
      Alert.alert(
        'Could not add event',
        'Something went wrong adding this booking to your calendar.',
        [{ text: 'OK' }],
      )
    }
  }

  // --- Missing-id state: screen opened directly without a booking ref ---
  if (!loading && !id) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.emptyWrap}>
            <Feather name="check-circle" size={36} color="rgba(240,232,213,0.2)" />
            <Text style={styles.emptyTitle}>Booking Confirmed</Text>
            <Text style={styles.emptyBody}>
              Open this screen from a booking notification to see the details.
            </Text>
          </View>
        </SafeAreaView>
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={styles.homeBtn}
            activeOpacity={0.7}
            onPress={() => router.push('/(tabs)/')}
          >
            <Text style={styles.homeBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // --- Not-found state ---
  if (!loading && notFound) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.emptyWrap}>
            <Feather name="alert-circle" size={36} color="rgba(240,232,213,0.2)" />
            <Text style={styles.emptyTitle}>Booking not found</Text>
            <Text style={styles.emptyBody}>
              We could not load this booking. It may have been cancelled or removed.
            </Text>
          </View>
        </SafeAreaView>
        <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
          <TouchableOpacity
            style={styles.homeBtn}
            activeOpacity={0.7}
            onPress={() => router.push('/(tabs)/')}
          >
            <Text style={styles.homeBtnText}>Back to Home</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  // --- Loading state: shimmer skeleton ---
  if (loading || !data) {
    return (
      <View style={styles.root}>
        <SafeAreaView style={styles.safe}>
          <View style={styles.content}>
            <View style={styles.skeletonRing} />
            <View style={styles.skeletonBadge} />
            <View style={[styles.skeletonLine, { width: 180, marginTop: 20 }]} />
            <View style={[styles.skeletonLine, { width: 240, marginTop: 10, height: 12 }]} />
            <View style={styles.skeletonCard} />
          </View>
        </SafeAreaView>
      </View>
    )
  }

  const providerMeta =
    [data.providerCategory, data.providerLocation].filter(Boolean).join(' · ') || null

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={[styles.outerRing, { transform: [{ scale }] }]}>
            <View style={styles.innerCircle}>
              <Feather name="check" size={32} color="#4CAF50" />
            </View>
          </Animated.View>

          <View style={styles.statusBadge}>
            <Text style={styles.statusBadgeText}>BOOKING CONFIRMED</Text>
          </View>

          <Text style={styles.headline}>You're in.</Text>

          <Text style={styles.subtext}>
            {data.providerName.split(' ')[0]} confirmed your booking.{'\n'}
            Your {money(data.depositAmount)} deposit has been charged.
          </Text>

          <View style={styles.card}>
            <View style={styles.providerRow}>
              <View style={styles.avatar}>
                <Feather name="user" size={18} color="rgba(240,232,213,0.4)" />
              </View>
              <View style={styles.providerStack}>
                <Text style={styles.providerName} numberOfLines={1}>
                  {data.providerName}
                </Text>
                {providerMeta != null && (
                  <Text style={styles.providerMeta} numberOfLines={1}>
                    {providerMeta}
                  </Text>
                )}
              </View>
              {data.rating != null && (
                <View style={styles.ratingRow}>
                  <Feather name="star" size={11} color="#C8922A" />
                  <Text style={styles.ratingText}>{data.rating.toFixed(1)}</Text>
                </View>
              )}
            </View>

            <View style={styles.separator} />

            <View style={styles.detailRow}>
              <Feather name="scissors" size={13} color="rgba(240,232,213,0.45)" />
              <Text style={styles.detailLabel}>{data.serviceName}</Text>
              {data.servicePrice != null && (
                <Text style={styles.detailValueBold}>{money(data.servicePrice)}</Text>
              )}
            </View>
            {data.dateLabel != null && (
              <View style={styles.detailRow}>
                <Feather name="calendar" size={13} color="rgba(240,232,213,0.45)" />
                <Text style={styles.detailLabel}>{data.dateLabel}</Text>
                {data.timeLabel != null && (
                  <Text style={styles.detailValue}>{data.timeLabel}</Text>
                )}
              </View>
            )}
            {data.providerLocation != null && (
              <View style={styles.detailRow}>
                <Feather name="map-pin" size={13} color="rgba(240,232,213,0.45)" />
                <Text style={styles.detailLabel}>{data.providerLocation}</Text>
              </View>
            )}

            <View style={[styles.separator, styles.separatorBottom]} />

            <View style={styles.depositRow}>
              <View style={styles.depositLeft}>
                <Feather name="check-circle" size={13} color="#4CAF50" />
                <Text style={styles.depositText}>
                  {money(data.depositAmount)} deposit charged
                </Text>
              </View>
              {data.balanceAmount != null && (
                <Text style={styles.balanceText}>
                  Balance: {money(data.balanceAmount)} at appointment
                </Text>
              )}
            </View>
          </View>

          <TouchableOpacity
            style={styles.calendarBtn}
            activeOpacity={0.7}
            onPress={handleAddToCalendar}
          >
            <Feather name="calendar" size={15} color="#C8922A" />
            <Text style={styles.calendarBtnText}>Add to Calendar</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.messageBtn}
          activeOpacity={0.8}
          onPress={handleMessageProvider}
        >
          <Feather name="message-circle" size={18} color="#F0E8D5" />
          <Text style={styles.messageBtnText}>Message Provider</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.homeBtn}
          activeOpacity={0.7}
          onPress={() => router.push('/(tabs)/')}
        >
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  safe: { flex: 1 },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 24,
  },
  outerRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    borderColor: 'rgba(76,175,80,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(76,175,80,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBadge: {
    marginTop: 16,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  statusBadgeText: {
    fontSize: 11,
    color: '#4CAF50',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.8,
  },
  headline: {
    marginTop: 20,
    fontSize: 34,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  subtext: {
    marginTop: 8,
    paddingHorizontal: 40,
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    marginTop: 28,
    marginHorizontal: 24,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 16,
    padding: 16,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerStack: { flex: 1 },
  providerName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  providerMeta: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  ratingText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginBottom: 14,
  },
  separatorBottom: {
    marginTop: 14,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 5,
  },
  detailLabel: {
    flex: 1,
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  detailValue: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  detailValueBold: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  depositRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  depositLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  depositText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  balanceText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  calendarBtn: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  calendarBtnText: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  bottomBar: {
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  messageBtn: {
    marginBottom: 10,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 14,
    height: 52,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  messageBtnText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  homeBtn: {
    height: 44,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    marginTop: 18,
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  emptyBody: {
    marginTop: 10,
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  skeletonRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  skeletonBadge: {
    marginTop: 16,
    width: 160,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  skeletonLine: {
    height: 16,
    borderRadius: 4,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  skeletonCard: {
    marginTop: 28,
    marginHorizontal: 24,
    alignSelf: 'stretch',
    height: 180,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
})
