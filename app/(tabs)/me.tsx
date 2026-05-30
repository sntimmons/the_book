import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Animated,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'

type MeTab = 'bookings' | 'saved' | 'following'

interface ClientProfile {
  id: string
  name: string | null
  notes: string | null
  created_at: string
}

interface ClientStats {
  totalBookings: number
  following: number
  rating: number
  reviewCount: number
}

interface NextBooking {
  id: string
  service_name: string | null
  requested_date: string | null
  requested_time: string | null
  provider_id: string
  provider_name?: string
  payment_amount: number | null
}

interface UpcomingRow {
  id: string
  service_name: string | null
  requested_date: string | null
  requested_time: string | null
  provider_id: string
  provider_name?: string
  payment_amount: number | null
}

const ZERO_STATS: ClientStats = {
  totalBookings: 0,
  following: 0,
  rating: 0,
  reviewCount: 0,
}

function todayIsoDate(): string {
  return new Date().toISOString().split('T')[0]
}

function memberSinceLabel(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

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
  return (
    <Animated.View
      style={[{ backgroundColor: 'rgba(240,232,213,0.06)', opacity }, style]}
    />
  )
}

export default function MeScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState<MeTab>('bookings')

  const [profile, setProfile] = useState<ClientProfile | null>(null)
  const [stats, setStats] = useState<ClientStats>(ZERO_STATS)
  const [nextBooking, setNextBooking] = useState<NextBooking | null>(null)
  const [upcoming, setUpcoming] = useState<UpcomingRow[]>([])
  const [loading, setLoading] = useState(true)

  const fetchProfileData = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      // Client profile. Note: clients.avatar_url column does not exist yet,
      // so we only select what we know is there. Always render initials.
      const { data: clientData } = await supabase
        .from('clients')
        .select('id, name, notes, created_at')
        .eq('id', user.id)
        .maybeSingle()

      if (clientData) {
        setProfile(clientData as ClientProfile)
      } else {
        // No clients row yet (happens when DEV_MODE bypassed onboarding
        // or the user dropped off mid-flow). Fall back to auth metadata.
        setProfile({
          id: user.id,
          name: user.email?.split('@')[0] ?? 'New Member',
          notes: null,
          created_at: user.created_at ?? new Date().toISOString(),
        })
      }

      // Booking stats
      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, status')
        .eq('user_id', user.id)
      const totalBookings = bookings?.length ?? 0

      // Following count. provider_follows may not exist yet; treat missing
      // table or query error as a zero count instead of bubbling up.
      let followingCount = 0
      const { count } = await supabase
        .from('provider_follows')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', user.id)
      if (count != null) followingCount = count

      setStats({
        totalBookings,
        following: followingCount,
        // TODO: wire to real review table when client rating schema confirmed.
        rating: 0,
        reviewCount: 0,
      })

      // Next upcoming booking
      const today = todayIsoDate()
      const { data: upcomingRows } = await supabase
        .from('bookings')
        .select(
          'id, service_name, requested_date, requested_time, provider_id, payment_amount, status',
        )
        .eq('user_id', user.id)
        .in('status', ['accepted', 'arriving'])
        .gte('requested_date', today)
        .order('requested_date', { ascending: true })
        .order('requested_time', { ascending: true })

      const rows = (upcomingRows ?? []) as Array<{
        id: string
        service_name: string | null
        requested_date: string | null
        requested_time: string | null
        provider_id: string
        payment_amount: number | null
      }>

      // Lookup provider display names for the rows we'll render.
      const providerIds = Array.from(new Set(rows.map((r) => r.provider_id))).filter(Boolean)
      const nameMap: Record<string, string> = {}
      if (providerIds.length > 0) {
        const { data: providers } = await supabase
          .from('providers')
          .select('id, display_name')
          .in('id', providerIds)
        for (const p of providers ?? []) {
          nameMap[p.id] = p.display_name ?? 'Provider'
        }
      }

      const enriched = rows.map((r) => ({ ...r, provider_name: nameMap[r.provider_id] ?? 'Provider' }))
      setNextBooking(enriched[0] ?? null)
      setUpcoming(enriched.slice(1, 5))
    } catch (err) {
      console.log('Me tab fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    fetchProfileData()
  }, [fetchProfileData])

  const displayName =
    profile?.name?.trim() || user?.email?.split('@')[0] || 'Member'
  const avatarInitial = displayName.charAt(0).toUpperCase()
  const memberSince = memberSinceLabel(profile?.created_at)

  // Trust badges. Only render badges that are actually true. If none, hide
  // the strip entirely. Today only Phone Verified is wire-able.
  const phoneVerified =
    !!user?.phone && !!(user as { phone_confirmed_at?: string }).phone_confirmed_at
  const showBadgesStrip = phoneVerified

  function handleShare() {
    Share.share({ message: 'Check out my profile on The Book' }).catch(() => {})
  }

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Me</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.7} onPress={handleShare}>
            <Feather name="share" size={15} color="rgba(240,232,213,0.6)" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.iconBtn}
            activeOpacity={0.7}
            onPress={() => router.push('/settings' as never)}
          >
            <Feather name="settings" size={15} color="rgba(240,232,213,0.6)" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Profile hero */}
        <View style={styles.hero}>
          {loading ? (
            <>
              <Shimmer style={styles.photoSkeleton} />
              <Shimmer style={styles.nameSkeleton} />
              <Shimmer style={styles.locSkeleton} />
            </>
          ) : (
            <>
              <View style={styles.photoWrap}>
                <View style={[styles.photo, styles.photoFallback]}>
                  <Text style={styles.photoInitial}>{avatarInitial}</Text>
                </View>
                {phoneVerified && (
                  <View style={styles.verifiedBadge}>
                    <Feather name="check" size={10} color="#080808" />
                  </View>
                )}
              </View>

              <Text style={styles.name}>{displayName}</Text>
              {/* TODO: store neighborhood on clients; for now default to Houston. */}
              <Text style={styles.location}>Houston</Text>
              {memberSince.length > 0 && (
                <View style={styles.memberRow}>
                  <Feather name="calendar" size={11} color="rgba(240,232,213,0.45)" />
                  <Text style={styles.memberText}>Member since {memberSince}</Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.editBtn}
                activeOpacity={0.8}
                onPress={() => router.push('/me/edit' as never)}
              >
                <Feather name="edit-2" size={12} color="rgba(240,232,213,0.5)" />
                <Text style={styles.editBtnText}>Edit Profile</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Stats row */}
        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            {loading ? (
              <Shimmer style={styles.statSkeleton} />
            ) : (
              <Text style={styles.statValue}>{stats.totalBookings}</Text>
            )}
            <Text style={styles.statLabel}>Bookings</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            {loading ? (
              <Shimmer style={styles.statSkeleton} />
            ) : (
              <Text style={styles.statValue}>{stats.following}</Text>
            )}
            <Text style={styles.statLabel}>Following</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            {loading ? (
              <Shimmer style={styles.statSkeleton} />
            ) : (
              <View style={styles.ratingValueRow}>
                <Text style={styles.statValue}>
                  {stats.rating > 0 ? stats.rating.toFixed(1) : 'New'}
                </Text>
                {stats.rating > 0 && (
                  <Feather name="star" size={13} color="#C8922A" />
                )}
              </View>
            )}
            <Text style={styles.statLabel}>My Rating</Text>
          </View>
        </View>

        {/* Trust badges - only render when we have at least one real signal */}
        {showBadgesStrip && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.badgesScroll}
            contentContainerStyle={styles.badgesContent}
          >
            {phoneVerified && (
              <View style={[styles.badge, styles.badgeGreen]}>
                <Feather name="check-circle" size={12} color="#4CAF50" />
                <Text style={styles.badgeTextPrimary}>Phone Verified</Text>
              </View>
            )}
          </ScrollView>
        )}

        <View style={styles.separator} />

        {/* Content tabs */}
        <View style={styles.tabs}>
          {(['bookings', 'saved', 'following'] as MeTab[]).map((tab) => {
            const active = activeTab === tab
            const label =
              tab === 'bookings' ? 'Bookings' : tab === 'saved' ? 'Saved' : 'Following'
            return (
              <TouchableOpacity
                key={tab}
                style={[styles.tab, active && styles.tabActive]}
                activeOpacity={0.7}
                onPress={() => setActiveTab(tab)}
              >
                <Text style={active ? styles.tabTextActive : styles.tabTextInactive}>
                  {label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {activeTab === 'bookings' && (
          <BookingsTab
            loading={loading}
            nextBooking={nextBooking}
            upcoming={upcoming}
          />
        )}
        {activeTab === 'saved' && <SavedTab />}
        {activeTab === 'following' && <FollowingTab followingCount={stats.following} />}
      </ScrollView>
    </View>
  )
}

function BookingsTab({
  loading,
  nextBooking,
  upcoming,
}: {
  loading: boolean
  nextBooking: NextBooking | null
  upcoming: UpcomingRow[]
}) {
  if (loading) {
    return (
      <View style={{ paddingHorizontal: 20, paddingTop: 16 }}>
        <Shimmer style={{ height: 200, borderRadius: 14 }} />
      </View>
    )
  }

  return (
    <>
      {/* Next appointment */}
      <View style={styles.nextSection}>
        <Text style={styles.sectionLabel}>NEXT UP</Text>
        {nextBooking ? (
          <View style={styles.nextCard}>
            <View style={styles.nextInfo}>
              <View style={styles.nextProviderRow}>
                <View style={styles.avatar36}>
                  <Text style={styles.avatarText}>
                    {(nextBooking.provider_name ?? 'P').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.nextProviderName}>
                    {nextBooking.provider_name} · {nextBooking.service_name ?? 'Booking'}
                  </Text>
                  <Text style={styles.nextProviderMeta}>
                    {[nextBooking.requested_date, nextBooking.requested_time]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                </View>
                <Text style={styles.nextPrice}>
                  {nextBooking.payment_amount != null
                    ? '$' + Number(nextBooking.payment_amount).toFixed(0)
                    : ''}
                </Text>
              </View>
              <View style={styles.nextActions}>
                <TouchableOpacity
                  style={styles.nextActionBtn}
                  activeOpacity={0.7}
                  onPress={() =>
                    router.push(`/messages/${nextBooking.provider_id}` as never)
                  }
                >
                  <Feather name="message-circle" size={14} color="#F0E8D5" />
                  <Text style={styles.nextActionText}>Message</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.nextActionBtn}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/bookings/${nextBooking.id}` as never)}
                >
                  <Text style={styles.nextActionText}>View Booking</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.emptyNextCard}>
            <Feather name="calendar" size={26} color="rgba(240,232,213,0.1)" />
            <Text style={styles.emptyNextTitle}>No upcoming appointments</Text>
            <Text style={styles.emptyNextSub}>
              Browse providers and book your next appointment.
            </Text>
            <TouchableOpacity
              style={styles.findBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/(tabs)/search' as never)}
            >
              <Text style={styles.findBtnText}>Find a provider</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Upcoming list */}
      {upcoming.length > 0 && (
        <View style={styles.upcomingSection}>
          <View style={styles.upcomingHeader}>
            <Text style={styles.upcomingTitle}>Upcoming</Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => router.push('/(tabs)/bookings' as never)}
            >
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          {upcoming.map((appt) => (
            <View key={appt.id} style={styles.apptRow}>
              <View style={styles.avatar40}>
                <Text style={styles.avatarText}>
                  {(appt.provider_name ?? 'P').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.flex1}>
                <Text style={styles.apptWho}>
                  {appt.provider_name} · {appt.service_name ?? 'Booking'}
                </Text>
                <Text style={styles.apptWhen}>
                  {[appt.requested_date, appt.requested_time].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Text style={styles.apptPrice}>
                {appt.payment_amount != null
                  ? '$' + Number(appt.payment_amount).toFixed(0)
                  : ''}
              </Text>
            </View>
          ))}
        </View>
      )}
    </>
  )
}

function SavedTab() {
  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionLabel}>SAVED PROVIDERS</Text>
      <View style={styles.tabEmpty}>
        <Feather name="bookmark" size={28} color="rgba(240,232,213,0.1)" />
        <Text style={styles.tabEmptyText}>No saved providers yet</Text>
        <Text style={styles.tabEmptySub}>
          Tap the bookmark on a provider's profile to save them here.
        </Text>
      </View>
    </View>
  )
}

function FollowingTab({ followingCount }: { followingCount: number }) {
  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionLabel}>FOLLOWING</Text>
      <View style={styles.tabEmpty}>
        <Feather name="users" size={28} color="rgba(240,232,213,0.1)" />
        <Text style={styles.tabEmptyText}>
          {followingCount > 0
            ? `Following ${followingCount}`
            : 'Not following anyone yet'}
        </Text>
        <Text style={styles.tabEmptySub}>
          {followingCount > 0
            ? 'Provider follow list is coming soon.'
            : 'Follow providers to see their latest posts and reels.'}
        </Text>
      </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  hero: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
  },

  // Skeleton placeholders
  photoSkeleton: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  nameSkeleton: {
    width: 160,
    height: 22,
    borderRadius: 4,
    marginTop: 14,
  },
  locSkeleton: {
    width: 100,
    height: 12,
    borderRadius: 4,
    marginTop: 8,
  },
  statSkeleton: {
    width: 36,
    height: 18,
    borderRadius: 4,
  },

  // Hero
  photoWrap: {
    width: 80,
    height: 80,
  },
  photo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFallback: {
    backgroundColor: '#1A1410',
  },
  photoInitial: {
    fontSize: 28,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 14,
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  location: {
    marginTop: 4,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  memberRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  memberText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  editBtn: {
    marginTop: 14,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  editBtnText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_500Medium',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(240,232,213,0.06)',
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  ratingValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  statLabel: {
    marginTop: 3,
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
  },

  // Badges
  badgesScroll: {
    paddingTop: 16,
    paddingBottom: 16,
  },
  badgesContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeGreen: {
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderColor: 'rgba(76,175,80,0.2)',
  },
  badgeTextPrimary: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },

  // Separator + tabs
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginHorizontal: 20,
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 20,
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
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  tabTextInactive: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  flex1: { flex: 1 },

  // Next appointment
  nextSection: {
    paddingHorizontal: 20,
    marginTop: 16,
    marginBottom: 16,
  },
  nextCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
  },
  nextInfo: { padding: 14 },
  nextProviderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar36: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  nextProviderName: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  nextProviderMeta: {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  nextPrice: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  nextActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  nextActionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 8,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  nextActionText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  emptyNextCard: {
    paddingVertical: 28,
    paddingHorizontal: 20,
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(240,232,213,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
  },
  emptyNextTitle: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 6,
  },
  emptyNextSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  findBtn: {
    marginTop: 14,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  findBtnText: {
    fontSize: 14,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },

  // Upcoming
  upcomingSection: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  upcomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  upcomingTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  seeAll: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  apptRow: {
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  avatar40: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
  },
  apptWho: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  apptWhen: {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  apptPrice: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Tab content shared
  tabContent: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  tabEmpty: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 6,
  },
  tabEmptyText: {
    marginTop: 10,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  tabEmptySub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    paddingHorizontal: 30,
  },
})
