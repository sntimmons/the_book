import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { cacheBustedPhoto } from '../lib/image'
import { useAuth } from '../context/AuthContext'
import { getOrCreateConversation } from '../hooks/useMessaging'
import { styles } from './me/meStyles'
import { ComingSoonCluster, PreviewGroup } from './me/MeShared'

type MeTab = 'bookings' | 'saved' | 'following'

interface ClientProfile {
  id: string
  name: string | null
  notes: string | null
  avatar_url: string | null
  neighborhood: string | null
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
  // Houston-local (Central) date, not UTC. UTC rolls over several hours early,
  // so a UTC "today" would drop/keep bookings on the wrong calendar day.
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
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

export function ClientMe() {
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
      // Client profile.
      const { data: clientData } = await supabase
        .from('clients')
        .select('id, name, notes, avatar_url, neighborhood, created_at')
        .eq('id', user.id)
        .maybeSingle()

      if (clientData) {
        setProfile(clientData as ClientProfile)
      } else {
        // No clients row yet (happens when DEV_MODE bypassed onboarding
        // or the user dropped off mid-flow). Fall back to auth metadata.
        setProfile({
          id: user.id,
          name: 'Member',
          notes: null,
          avatar_url: null,
          neighborhood: null,
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
        .eq('follower_user_id', user.id)
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

  // Re-fetch on focus so an edited name/photo/neighborhood shows immediately
  // when returning from the edit screen, not just on first mount.
  useFocusEffect(
    useCallback(() => {
      fetchProfileData()
    }, [fetchProfileData]),
  )

  const displayName = profile?.name?.trim() || 'Member'
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
            onPress={() => router.push('/notifications' as never)}
          >
            <Feather name="bell" size={15} color="rgba(240,232,213,0.6)" />
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
                {profile?.avatar_url ? (
                  <Image
                    source={{ uri: cacheBustedPhoto(profile.avatar_url) }}
                    style={styles.photo}
                  />
                ) : (
                  <View style={[styles.photo, styles.photoFallback]}>
                    <Text style={styles.photoInitial}>{avatarInitial}</Text>
                  </View>
                )}
                {phoneVerified && (
                  <View style={styles.verifiedBadge}>
                    <Feather name="check" size={10} color="#080808" />
                  </View>
                )}
              </View>

              <Text style={styles.name}>{displayName}</Text>
              <Text style={styles.location}>
                {profile?.neighborhood?.trim() || 'Houston'}
              </Text>
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

        {/* Care Hub — client home base for appointments, saved pros, rebooking */}
        <CareHubCard />

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

        {/* Grouped Coming Soon cluster — all client previews in one tidy list,
            kept low on the page so the working core stays the star. */}
        <View style={styles.clientClusterWrap}>
          <ComingSoonCluster groups={CLIENT_GROUPS} />
        </View>
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
  const { user } = useAuth()
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
                  onPress={async () => {
                    if (!user) return
                    const convoId = await getOrCreateConversation(
                      user.id,
                      nextBooking.provider_id,
                      nextBooking.id,
                    )
                    if (convoId) {
                      router.push(`/messages/${convoId}` as never)
                    }
                  }}
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

interface SavedRow {
  id: string
  name: string
  category: string
  photo: string | null
  rating: number
}

function SavedTab() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState<SavedRow[]>([])

  useEffect(() => {
    let cancelled = false
    if (!user) {
      setSaved([])
      setLoading(false)
      return
    }
    ;(async () => {
      setLoading(true)
      // Own saved rows joined to providers (+ category name) for display.
      const { data, error } = await supabase
        .from('saved_providers')
        .select(
          'provider_id, created_at, providers(id, display_name, profile_photo_url, average_rating, rating, categories(name))',
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) {
        console.log('Saved list error:', error)
        setSaved([])
        setLoading(false)
        return
      }
      const rows: SavedRow[] = (data ?? [])
        .map((r: any) => r.providers)
        .filter(Boolean)
        .map((p: any) => ({
          id: p.id,
          name: p.display_name ?? 'Provider',
          category: p.categories?.name ?? 'Provider',
          photo: p.profile_photo_url ?? null,
          rating: p.average_rating ?? p.rating ?? 0,
        }))
      setSaved(rows)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  return (
    <View style={styles.tabContent}>
      <Text style={styles.sectionLabel}>SAVED PROVIDERS</Text>
      {loading ? (
        <View style={styles.tabEmpty}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : saved.length === 0 ? (
        <View style={styles.tabEmpty}>
          <Feather name="bookmark" size={28} color="rgba(240,232,213,0.1)" />
          <Text style={styles.tabEmptyText}>No saved providers yet</Text>
          <Text style={styles.tabEmptySub}>
            Tap the bookmark on a provider's profile to save them here.
          </Text>
        </View>
      ) : (
        saved.map((p) => (
          <TouchableOpacity
            key={p.id}
            style={styles.apptRow}
            activeOpacity={0.7}
            onPress={() => router.push(`/providers/${p.id}` as never)}
          >
            {p.photo ? (
              <Image source={{ uri: p.photo }} style={styles.avatar40} />
            ) : (
              <View style={styles.avatar40}>
                <Text style={styles.avatarText}>
                  {p.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.flex1}>
              <Text style={styles.apptWho}>{p.name}</Text>
              <Text style={styles.apptWhen}>{p.category}</Text>
            </View>
            {p.rating > 0 && (
              <View style={styles.savedRatingRow}>
                <Feather name="star" size={12} color="#C8922A" />
                <Text style={styles.savedRatingText}>{p.rating.toFixed(1)}</Text>
              </View>
            )}
          </TouchableOpacity>
        ))
      )}
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

function CareHubCard() {
  return (
    <TouchableOpacity
      style={[styles.hubCard, { marginTop: 8 }]}
      activeOpacity={0.85}
      onPress={() => router.push('/care' as never)}
    >
      <View style={[styles.hubIcon, { backgroundColor: 'rgba(200,146,42,0.14)' }]}>
        <Feather name="heart" size={20} color="#C8922A" />
      </View>
      <View style={styles.flex1}>
        <Text style={styles.hubTitle}>Care Hub</Text>
        <Text style={styles.hubSub}>
          Your appointments, saved providers, spending, and rebook reminders.
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color="rgba(240,232,213,0.3)" />
    </TouchableOpacity>
  )
}

const CLIENT_GROUPS: PreviewGroup[] = [
  {
    label: 'Safety & Trust',
    items: [
      { key: 'safety_client', icon: 'shield', title: 'Safety', sub: 'Share your appointment and check in', href: '/preview/safety-client' },
      { key: 'provider_verification', icon: 'user-check', title: 'Verified Providers', sub: 'IDs, real reviews, and booking counts', href: '/preview/provider-verification' },
      { key: 'protection_center', icon: 'umbrella', title: 'Protection Center', sub: 'Coverage, claims, and real support', href: '/preview/protection-center' },
    ],
  },
  {
    label: 'Booking',
    items: [
      { key: 'find_today', icon: 'search', title: 'Find Me Someone Today', sub: 'Get matched or browse who is open now', href: '/preview/find-today' },
    ],
  },
  {
    label: 'Inspiration & Sharing',
    items: [
      { key: 'lookbook', icon: 'bookmark', title: 'Lookbook', sub: 'Save looks and build boards', href: '/preview/lookbook' },
      { key: 'posts', icon: 'image', title: 'Posts', sub: 'Share your results and shoutouts', href: '/preview/posts' },
    ],
  },
]
