import { useEffect, useState } from 'react'
import {
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { styles } from './me/meStyles'
import { ComingSoonCluster, PreviewGroup } from './me/MeShared'

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

interface ProviderMeData {
  displayName: string
  category: string
  neighborhood: string | null
  photoUrl: string | null
  rating: number
  reviewCount: number
  completed: number
}

export function ProviderMe() {
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
    { icon: 'image', label: 'My Portfolio', href: '/(tabs)/business/portfolio' },
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
          onPress={() => router.push('/(tabs)/business' as never)}
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
      </ScrollView>
    </View>
  )
}
