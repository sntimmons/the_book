import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Animated,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { cacheBustedPhoto } from '../../lib/image'
import { useAuth } from '../../context/AuthContext'
import { getOrCreateConversation } from '../../hooks/useMessaging'

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

function ClientMe() {
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
          name: user.email?.split('@')[0] ?? 'New Member',
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

// ── Preview entries (coming-soon screens) ───────────────────────────────────
// Featured client card that opens the Care Hub — the client's home base for
// appointments, saved providers, spending, and rebook reminders. Amber-accented
// so it reads as the live, high-value entry it is.
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

// Featured provider-only card for the provider community Hub. Deliberately
// distinct from the solid-cream My Studio card: a dark, cream-bordered card so
// it reads as its own thing while still carrying real weight beside My Studio.
function CommunityHubCard() {
  return (
    <TouchableOpacity
      style={styles.hubCard}
      activeOpacity={0.85}
      onPress={() => router.push('/community' as never)}
    >
      <View style={styles.hubIcon}>
        <Feather name="users" size={20} color="#F0E8D5" />
      </View>
      <View style={styles.flex1}>
        <View style={styles.hubTitleRow}>
          <Text style={styles.hubTitle}>Community</Text>
          <View style={styles.comingSoonTag}>
            <Text style={styles.comingSoonTagText}>Coming soon</Text>
          </View>
        </View>
        <Text style={styles.hubSub}>
          Connect with other providers. Trade services, swap advice, and share
          what works.
        </Text>
      </View>
      <Feather name="chevron-right" size={20} color="rgba(240,232,213,0.3)" />
    </TouchableOpacity>
  )
}

// Modest, lower-weight entry that opens a single preview screen. Used for the
// universal Posts preview (both Me tabs) and the client Available Today preview;
// the featured Community hub card above carries the real visual weight.
function PreviewEntryRow({
  icon,
  title,
  sub,
  href,
  style,
}: {
  icon: any
  title: string
  sub: string
  href: string
  style?: any
}) {
  return (
    <TouchableOpacity
      style={[styles.postsEntry, style]}
      activeOpacity={0.8}
      onPress={() => router.push(href as never)}
    >
      <View style={styles.postsEntryIcon}>
        <Feather name={icon} size={17} color="rgba(240,232,213,0.7)" />
      </View>
      <View style={styles.flex1}>
        <Text style={styles.postsEntryTitle}>{title}</Text>
        <Text style={styles.postsEntrySub}>{sub}</Text>
      </View>
      <View style={styles.comingSoonTag}>
        <Text style={styles.comingSoonTagText}>Coming soon</Text>
      </View>
      <Feather name="chevron-right" size={18} color="rgba(240,232,213,0.25)" />
    </TouchableOpacity>
  )
}

type PreviewItem = { key: string; icon: any; title: string; sub: string; href: string }
// A cluster is one or more groups. An unlabeled group renders as a plain list
// (provider side, unchanged); labeled groups get a small sub-header so a longer
// list scans easily instead of being one undifferentiated block (client side).
type PreviewGroup = { label?: string; items: PreviewItem[] }

// The provider-side "maybe" previews — one unlabeled group, low on the Me tab
// and deliberately less prominent than the Community hub card.
const PROVIDER_GROUPS: PreviewGroup[] = [
  {
    items: [
      { key: 'analytics', icon: 'bar-chart-2', title: 'Money & Analytics', sub: 'Earnings and business health', href: '/preview/analytics' },
      { key: 'learning', icon: 'book-open', title: 'Learn the Business', sub: 'Taxes, pricing, and growth', href: '/preview/learning' },
      { key: 'contracts', icon: 'file-text', title: 'Contracts', sub: 'Simple service agreements', href: '/preview/contracts' },
      { key: 'safety', icon: 'shield', title: 'Safety & Verification', sub: 'Know who you are booking', href: '/preview/safety' },
    ],
  },
]

// The client-side previews, folded into one tidy Coming Soon cluster low on the
// client Me tab and broken into small sub-groups so the list scans easily. The
// urgent-booking concept is a single entry (Find Me Someone Today) that covers
// both request-based and browse-based framing on its preview screen.
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

// Grouped Coming Soon cluster, shared by both Me tabs.
function ComingSoonCluster({ groups }: { groups: PreviewGroup[] }) {
  return (
    <>
      <Text style={styles.clusterLabel}>Coming soon</Text>
      {groups.map((group, gi) => (
        <View key={group.label ?? `group-${gi}`}>
          {group.label ? <Text style={styles.clusterSubLabel}>{group.label}</Text> : null}
          <View style={styles.rowsGroup}>
            {group.items.map((p, idx) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.clusterRow, idx < group.items.length - 1 && styles.studioRowBorder]}
                activeOpacity={0.7}
                onPress={() => router.push(p.href as never)}
              >
                <View style={styles.clusterIcon}>
                  <Feather name={p.icon} size={16} color="rgba(240,232,213,0.6)" />
                </View>
                <View style={styles.flex1}>
                  <Text style={styles.clusterTitle}>{p.title}</Text>
                  <Text style={styles.clusterSub}>{p.sub}</Text>
                </View>
                <Feather name="chevron-right" size={16} color="rgba(240,232,213,0.2)" />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}
    </>
  )
}

// ── Role-aware entry ────────────────────────────────────────────────────────
// Clients get the existing ClientMe (unchanged). Providers get ProviderMe with
// the My Studio entrance. A provider can preview the client profile via the
// quiet "Switch to Client Profile" link; a floating pill brings them back.
export default function MeScreen() {
  const { isProvider, roleLoading } = useAuth()
  const insets = useSafeAreaInsets()
  const [viewAsClient, setViewAsClient] = useState(false)

  if (roleLoading) {
    return (
      <View style={[styles.root, styles.loaderWrap]}>
        <StatusBar style="light" />
        <ActivityIndicator color="rgba(240,232,213,0.5)" />
      </View>
    )
  }

  if (isProvider && !viewAsClient) {
    return <ProviderMe onSwitchToClient={() => setViewAsClient(true)} />
  }

  return (
    <View style={{ flex: 1 }}>
      <ClientMe />
      {isProvider && (
        <View
          style={[styles.returnPillWrap, { bottom: insets.bottom + 80 }]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.returnPill}
            activeOpacity={0.85}
            onPress={() => setViewAsClient(false)}
          >
            <Feather name="briefcase" size={13} color="#080808" />
            <Text style={styles.returnPillText}>Return to Studio</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

interface ProviderMeData {
  displayName: string
  category: string
  neighborhood: string | null
  photoUrl: string | null
  rating: number
  reviewCount: number
  completed: number
}

function ProviderMe({ onSwitchToClient }: { onSwitchToClient: () => void }) {
  const insets = useSafeAreaInsets()
  const { user, providerId } = useAuth()
  const [data, setData] = useState<ProviderMeData | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!user) return
    ;(async () => {
      const { data: prov } = await supabase
        .from('providers')
        .select(
          'id, display_name, category_id, neighborhood, profile_photo_url, average_rating, review_count, completed_count',
        )
        .eq('user_id', user.id)
        .maybeSingle()
      if (cancelled) return
      let categoryName = ''
      if (prov?.category_id != null) {
        const { data: cat } = await supabase
          .from('categories')
          .select('name')
          .eq('id', prov.category_id)
          .maybeSingle()
        if (cat?.name) categoryName = cat.name
      }
      if (cancelled) return
      setData({
        displayName:
          prov?.display_name?.trim() || user.email?.split('@')[0] || 'Provider',
        category: categoryName,
        neighborhood: prov?.neighborhood ?? null,
        photoUrl: prov?.profile_photo_url ?? null,
        rating: Number(prov?.average_rating ?? 0),
        reviewCount: Number(prov?.review_count ?? 0),
        completed: Number(prov?.completed_count ?? 0),
      })
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  const displayName = data?.displayName ?? 'Provider'
  const avatarInitial = displayName.charAt(0).toUpperCase()
  const metaLine = [data?.category, data?.neighborhood]
    .filter((s): s is string => !!s && s.length > 0)
    .join(' · ')

  // Reviews & Feedback needs the provider id; hide the row if we lack it
  // (rather than ship a dead control).
  const reviewsHref = providerId ? `/reviews/all/${providerId}` : null
  const rows: { icon: any; label: string; href: string }[] = [
    { icon: 'image', label: 'My Portfolio', href: '/dashboard/provider/portfolio' },
    ...(reviewsHref
      ? [{ icon: 'star' as const, label: 'Reviews & Feedback', href: reviewsHref }]
      : []),
    { icon: 'settings', label: 'Account Settings', href: '/settings' },
  ]

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.headerTitle}>Me</Text>
        <View style={styles.headerActions}>
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
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.photoWrap}>
            {data?.photoUrl ? (
              <Image source={{ uri: data.photoUrl }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.photoFallback]}>
                <Text style={styles.photoInitial}>{avatarInitial}</Text>
              </View>
            )}
          </View>
          <Text style={styles.name}>{displayName}</Text>
          {metaLine.length > 0 && <Text style={styles.location}>{metaLine}</Text>}
        </View>

        {/* Stats — real provider columns only */}
        <View style={styles.statsRow}>
          <View style={styles.statCol}>
            <View style={styles.ratingValueRow}>
              <Text style={styles.statValue}>
                {data && data.rating > 0 ? data.rating.toFixed(1) : 'New'}
              </Text>
              {data && data.rating > 0 && (
                <Feather name="star" size={13} color="#C8922A" />
              )}
            </View>
            <Text style={styles.statLabel}>Rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statValue}>{data?.reviewCount ?? 0}</Text>
            <Text style={styles.statLabel}>Reviews</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCol}>
            <Text style={styles.statValue}>{data?.completed ?? 0}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>

        {/* My Studio — the door into the existing provider dashboard. The one
            intentional amber accent (icon chip); card itself is cream. */}
        <TouchableOpacity
          style={styles.studioCard}
          activeOpacity={0.85}
          onPress={() => router.push('/dashboard/provider' as never)}
        >
          <View style={styles.studioIcon}>
            <Feather name="grid" size={20} color="#080808" />
          </View>
          <View style={styles.flex1}>
            <Text style={styles.studioTitle}>My Studio</Text>
            <Text style={styles.studioSub}>
              Bookings, services, analytics & payouts
            </Text>
          </View>
          <Feather name="chevron-right" size={20} color="rgba(8,8,8,0.5)" />
        </TouchableOpacity>

        {/* Community Hub — featured provider-only preview, sits beside My Studio */}
        <CommunityHubCard />

        {/* Rows */}
        <View style={styles.rowsGroup}>
          {rows.map((row, idx) => (
            <TouchableOpacity
              key={row.label}
              style={[styles.studioRow, idx < rows.length - 1 && styles.studioRowBorder]}
              activeOpacity={0.7}
              onPress={() => router.push(row.href as never)}
            >
              <Feather name={row.icon} size={18} color="rgba(240,232,213,0.7)" />
              <Text style={styles.studioRowLabel}>{row.label}</Text>
              <Feather name="chevron-right" size={18} color="rgba(240,232,213,0.25)" />
            </TouchableOpacity>
          ))}
        </View>

        {/* Posts preview entry (universal) */}
        <PreviewEntryRow
          icon="image"
          title="Posts"
          sub="Share your work and results"
          href="/preview/posts"
          style={styles.postsEntryProvider}
        />

        {/* Grouped Coming Soon cluster — modest, less prominent than the hub card */}
        <ComingSoonCluster groups={PROVIDER_GROUPS} />

        {/* Quiet escape hatch */}
        <TouchableOpacity
          style={styles.switchLink}
          activeOpacity={0.7}
          onPress={onSwitchToClient}
        >
          <Feather name="repeat" size={13} color="rgba(240,232,213,0.4)" />
          <Text style={styles.switchLinkText}>Switch to Client Profile</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
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
  savedRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  savedRatingText: {
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

  // ── Provider Me ──
  studioCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F0E8D5',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 20,
  },
  studioIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studioTitle: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  studioSub: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(8,8,8,0.6)',
    fontFamily: 'Manrope_400Regular',
  },
  // Community Hub featured card (provider)
  hubCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.16)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginHorizontal: 20,
    marginBottom: 20,
  },
  hubIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  hubTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  hubSub: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
  },

  // Shared "Coming soon" tag
  comingSoonTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    backgroundColor: 'rgba(240,232,213,0.04)',
  },
  comingSoonTagText: {
    fontSize: 9.5,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.4,
  },

  // Posts preview entry (universal, modest)
  postsEntry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    backgroundColor: 'rgba(240,232,213,0.03)',
  },
  postsEntryProvider: {
    marginTop: 12,
  },
  postsEntryIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: 'rgba(240,232,213,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postsEntryTitle: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  postsEntrySub: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },

  // Coming Soon cluster (grouped, low-prominence) — shared by both Me tabs
  clientClusterWrap: {
    marginTop: 8,
  },
  clusterLabel: {
    marginTop: 24,
    marginBottom: 10,
    marginHorizontal: 20,
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  // Small sub-group header inside the cluster (one level below clusterLabel).
  clusterSubLabel: {
    marginTop: 14,
    marginBottom: 8,
    marginHorizontal: 20,
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.2,
  },
  clusterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  clusterIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterTitle: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.92)',
    fontFamily: 'Manrope_500Medium',
  },
  clusterSub: {
    marginTop: 1,
    fontSize: 11.5,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },

  rowsGroup: {
    marginHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.03)',
    overflow: 'hidden',
  },
  studioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  studioRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  studioRowLabel: {
    flex: 1,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  switchLink: {
    marginTop: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  switchLinkText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
  },
  returnPillWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  returnPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0E8D5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  returnPillText: {
    fontSize: 13,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
})
