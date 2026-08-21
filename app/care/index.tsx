import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cacheBustedPhoto } from '@/lib/image'
import { fetchProviderInfoMap, initials } from '@/lib/community'
import {
  fetchActiveReminders,
  isDue,
  intervalLabel,
  CareReminder,
} from '@/lib/care'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Format an ISO date/timestamp string as "Aug 23".
function formatDate(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`
}

interface ReminderView extends CareReminder {
  providerName: string | null
}

interface UpcomingBooking {
  id: string
  serviceName: string | null
  date: string | null
  time: string | null
  status: string
  providerId: string
  providerName: string
}

interface SavedProvider {
  id: string
  name: string
  category: string
  neighborhood: string | null
  photo: string | null
}

interface CompletedBooking {
  id: string
  serviceName: string | null
  amount: number | null
  date: string | null
  providerName: string
}

const SAVED_LIMIT = 6

export default function CareHub() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  const [loading, setLoading] = useState(true)
  const [reminders, setReminders] = useState<ReminderView[]>([])
  const [upcoming, setUpcoming] = useState<UpcomingBooking[]>([])
  const [saved, setSaved] = useState<SavedProvider[]>([])
  const [savedTotal, setSavedTotal] = useState(0)
  const [completed, setCompleted] = useState<CompletedBooking[]>([])
  const [totalSpent, setTotalSpent] = useState(0)

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    // Houston-local (Central) date, not UTC, for the upcoming-bookings cutoff.
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

    const [remRows, upRes, savedRes, compRes] = await Promise.all([
      fetchActiveReminders(user.id),
      supabase
        .from('bookings')
        .select('id, service_name, requested_date, requested_time, provider_id, status')
        .eq('user_id', user.id)
        .in('status', ['pending', 'accepted'])
        .gte('requested_date', today)
        .order('requested_date', { ascending: true })
        .limit(5),
      supabase
        .from('saved_providers')
        .select(
          'provider_id, created_at, providers(id, display_name, profile_photo_url, neighborhood, categories(name))',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('bookings')
        .select('id, service_name, payment_amount, requested_date, created_at, provider_id')
        .eq('user_id', user.id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false }),
    ])

    const upRows =
      (upRes.data as
        | {
            id: string
            service_name: string | null
            requested_date: string | null
            requested_time: string | null
            provider_id: string
            status: string
          }[]
        | null) ?? []
    const compRows =
      (compRes.data as
        | {
            id: string
            service_name: string | null
            payment_amount: number | null
            requested_date: string | null
            created_at: string
            provider_id: string
          }[]
        | null) ?? []

    // One provider-name lookup across reminders, upcoming, and completed.
    const providerIds = [
      ...remRows.map((r) => r.providerId).filter((x): x is string => !!x),
      ...upRows.map((r) => r.provider_id),
      ...compRows.map((r) => r.provider_id),
    ]
    const infoMap = await fetchProviderInfoMap(providerIds)

    setReminders(
      remRows.map((r) => ({
        ...r,
        providerName: r.providerId ? infoMap.get(r.providerId)?.name ?? 'Provider' : null,
      })),
    )

    setUpcoming(
      upRows.map((r) => ({
        id: r.id,
        serviceName: r.service_name,
        date: r.requested_date,
        time: r.requested_time,
        status: r.status,
        providerId: r.provider_id,
        providerName: infoMap.get(r.provider_id)?.name ?? 'Provider',
      })),
    )

    // Saved providers: join rows to their provider record for display.
    const savedRows =
      (savedRes.data as
        | {
            providers: {
              id: string
              display_name: string | null
              profile_photo_url: string | null
              neighborhood: string | null
              categories: { name: string | null } | null
            } | null
          }[]
        | null) ?? []
    const savedMapped: SavedProvider[] = savedRows
      .map((r) => r.providers)
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        id: p.id,
        name: p.display_name ?? 'Provider',
        category: p.categories?.name ?? 'Provider',
        neighborhood: p.neighborhood,
        photo: p.profile_photo_url,
      }))
    setSavedTotal(savedMapped.length)
    setSaved(savedMapped.slice(0, SAVED_LIMIT))

    // Spending: total over ALL completed bookings; show the 10 most recent.
    const spent = compRows.reduce((sum, r) => sum + (Number(r.payment_amount) || 0), 0)
    setTotalSpent(spent)
    setCompleted(
      compRows.slice(0, 10).map((r) => ({
        id: r.id,
        serviceName: r.service_name,
        amount: r.payment_amount,
        date: r.requested_date ?? r.created_at,
        providerName: infoMap.get(r.provider_id)?.name ?? 'Provider',
      })),
    )

    setLoading(false)
  }, [user])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  async function removeReminder(id: string) {
    const prev = reminders
    setReminders((list) => list.filter((r) => r.id !== id))
    const { error } = await supabase
      .from('care_reminders')
      .update({ is_active: false })
      .eq('id', id)
    if (error) {
      console.log('Remove reminder error:', error)
      setReminders(prev)
      Alert.alert('Could not remove', 'Please try again.', [{ text: 'OK' }])
    }
  }

  function confirmRemove(r: ReminderView) {
    Alert.alert('Remove reminder', `Stop reminding you about ${r.serviceName}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeReminder(r.id) },
    ])
  }

  function book(providerId: string | null) {
    if (providerId) router.push(`/providers/${providerId}` as never)
    else router.push('/(tabs)/search' as never)
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Care Hub</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
        >
          {/* SECTION 1 — Rebook reminders */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Rebook Reminders</Text>
            {reminders.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="bell" size={24} color="rgba(240,232,213,0.15)" />
                <Text style={styles.emptyText}>Add a reminder to stay on schedule</Text>
              </View>
            ) : (
              reminders.map((r) => {
                const due = isDue(r)
                return (
                  <View key={r.id} style={styles.reminderCard}>
                    <View style={styles.reminderTop}>
                      <View style={styles.flex1}>
                        <Text style={styles.reminderService}>{r.serviceName}</Text>
                        <Text style={styles.reminderMeta}>
                          {r.providerName ? `${r.providerName} · ` : ''}
                          {intervalLabel(r.intervalDays)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => confirmRemove(r)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        <Feather name="x" size={16} color="rgba(240,232,213,0.35)" />
                      </TouchableOpacity>
                    </View>

                    {due ? (
                      <View style={styles.reminderDueRow}>
                        <View style={styles.dueBadge}>
                          <Feather name="clock" size={12} color="#C8922A" />
                          <Text style={styles.dueBadgeText}>Time to rebook!</Text>
                        </View>
                        <TouchableOpacity
                          style={styles.bookNowBtn}
                          activeOpacity={0.85}
                          onPress={() => book(r.providerId)}
                        >
                          <Text style={styles.bookNowText}>Book Now</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.reminderDueRow}>
                        <Text style={styles.nextText}>Next: {formatDate(r.nextReminderAt)}</Text>
                        <TouchableOpacity onPress={() => book(r.providerId)} activeOpacity={0.7}>
                          <Text style={styles.bookAgainText}>Book Again</Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                )
              })
            )}

            <TouchableOpacity
              style={styles.addReminderBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/care/add-reminder' as never)}
            >
              <Feather name="plus" size={16} color="#C8922A" />
              <Text style={styles.addReminderText}>Add Reminder</Text>
            </TouchableOpacity>
          </View>

          {/* SECTION 2 — Upcoming appointments */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Appointments</Text>
            {upcoming.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="calendar" size={24} color="rgba(240,232,213,0.15)" />
                <Text style={styles.emptyText}>No upcoming appointments</Text>
              </View>
            ) : (
              upcoming.map((b) => {
                const confirmed = b.status !== 'pending'
                return (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.apptRow}
                    activeOpacity={0.7}
                    onPress={() => router.push(`/bookings/${b.id}` as never)}
                  >
                    <View style={styles.flex1}>
                      <Text style={styles.apptWho} numberOfLines={1}>
                        {b.providerName} · {b.serviceName ?? 'Booking'}
                      </Text>
                      <Text style={styles.apptWhen}>
                        {[b.date, b.time].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, confirmed ? styles.statusGreen : styles.statusAmber]}>
                      <Text style={[styles.statusText, confirmed ? styles.statusTextGreen : styles.statusTextAmber]}>
                        {confirmed ? 'Confirmed' : 'Pending'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                )
              })
            )}
          </View>

          {/* SECTION 3 — Saved providers */}
          <View style={styles.section}>
            <View style={styles.sectionHeaderRow}>
              <Text style={styles.sectionTitle}>Saved Providers</Text>
              {savedTotal > SAVED_LIMIT ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push('/(tabs)/me' as never)}
                >
                  <Text style={styles.seeAll}>See all</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {saved.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="bookmark" size={24} color="rgba(240,232,213,0.15)" />
                <Text style={styles.emptyText}>Save providers to quickly rebook them</Text>
              </View>
            ) : (
              saved.map((p) => (
                <View key={p.id} style={styles.savedCard}>
                  {p.photo ? (
                    <Image source={{ uri: cacheBustedPhoto(p.photo) }} style={styles.savedAvatar} />
                  ) : (
                    <View style={[styles.savedAvatar, styles.avatarFallback]}>
                      <Text style={styles.avatarText}>{initials(p.name)}</Text>
                    </View>
                  )}
                  <View style={styles.flex1}>
                    <Text style={styles.savedName} numberOfLines={1}>
                      {p.name}
                    </Text>
                    <Text style={styles.savedMeta} numberOfLines={1}>
                      {[p.category, p.neighborhood].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.bookSmallBtn}
                    activeOpacity={0.85}
                    onPress={() => router.push(`/providers/${p.id}` as never)}
                  >
                    <Text style={styles.bookSmallText}>Book</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>

          {/* SECTION 4 — Spending history */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Spending History</Text>
            {completed.length === 0 ? (
              <View style={styles.emptyCard}>
                <Feather name="dollar-sign" size={24} color="rgba(240,232,213,0.15)" />
                <Text style={styles.emptyText}>Your completed bookings will appear here</Text>
              </View>
            ) : (
              <>
                <View style={styles.totalCard}>
                  <Text style={styles.totalLabel}>Total spent</Text>
                  <Text style={styles.totalValue}>${totalSpent.toFixed(2)}</Text>
                </View>
                {completed.map((b) => (
                  <View key={b.id} style={styles.spendRow}>
                    <View style={styles.flex1}>
                      <Text style={styles.spendWho} numberOfLines={1}>
                        {b.providerName} · {b.serviceName ?? 'Service'}
                      </Text>
                      <Text style={styles.spendWhen}>{formatDate(b.date)}</Text>
                    </View>
                    <Text style={styles.spendAmount}>
                      {b.amount != null ? `$${Number(b.amount).toFixed(2)}` : 'Arranged directly'}
                    </Text>
                  </View>
                ))}
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  flex1: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  centerBody: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80 },
  section: { paddingHorizontal: 16, paddingTop: 24 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 12,
  },
  seeAll: { fontSize: 13, color: '#C8922A', fontFamily: 'Manrope_600SemiBold', marginBottom: 12 },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.06)',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  // Reminders
  reminderCard: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    marginBottom: 10,
  },
  reminderTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  reminderService: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  reminderMeta: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  reminderDueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  dueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(200,146,42,0.14)',
  },
  dueBadgeText: { fontSize: 12, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  bookNowBtn: {
    paddingHorizontal: 18,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  bookNowText: { fontSize: 13, color: '#080808', fontFamily: 'Manrope_700Bold' },
  nextText: { fontSize: 13, color: 'rgba(240,232,213,0.55)', fontFamily: 'Manrope_500Medium' },
  bookAgainText: { fontSize: 13, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_600SemiBold' },
  addReminderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.4)',
    borderStyle: 'dashed',
    marginTop: 4,
  },
  addReminderText: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  // Upcoming
  apptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    marginBottom: 10,
  },
  apptWho: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  apptWhen: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusGreen: { backgroundColor: 'rgba(76,175,80,0.14)' },
  statusAmber: { backgroundColor: 'rgba(200,146,42,0.14)' },
  statusText: { fontSize: 11, fontFamily: 'Manrope_700Bold', letterSpacing: 0.3 },
  statusTextGreen: { color: '#4CAF50' },
  statusTextAmber: { color: '#C8922A' },
  // Saved
  savedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    marginBottom: 10,
  },
  savedAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1410' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  savedName: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  savedMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  bookSmallBtn: {
    paddingHorizontal: 16,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
  },
  bookSmallText: { fontSize: 13, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  // Spending
  totalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(200,146,42,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.2)',
    marginBottom: 12,
  },
  totalLabel: { fontSize: 13, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_600SemiBold' },
  totalValue: { fontSize: 22, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  spendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  spendWho: { fontSize: 14, color: 'rgba(240,232,213,0.9)', fontFamily: 'Manrope_500Medium' },
  spendWhen: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  spendAmount: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
})
