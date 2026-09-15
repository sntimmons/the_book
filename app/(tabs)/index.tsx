import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
  ActivityIndicator,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  useProviders,
  useCategories,
  fetchDiscoveryPool,
  fetchOpenTodayProviderIds,
  Provider,
  Category,
} from '../../hooks/useProviders'
import { supabase } from '../../lib/supabase'
import DiscoveryLanes from '../../components/DiscoveryLanes'
import DiscoverCommunity from '../../components/DiscoverCommunity'
import { FollowedActivityRow, ReelsEntryRow } from '../../components/DiscoverSocialRows'
import ProviderCard from '../../components/ui/ProviderCard'
import EmptyState from '../../components/ui/EmptyState'
import ErrorState from '../../components/ui/ErrorState'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { fetchDueReminder, CareReminder } from '../../lib/care'

// DISCOVER — the screen everyone lands on.
//
// Phase 4B migrated it onto the Third semantic theme, so Light / Dark / System
// all work from one tree. It was the last primary surface still painted in the
// legacy dark palette, and the only one that could not render in Light at all.
//
// ── WHY THE GRID IS UNIFORM ───────────────────────────────────────────────
//
// It was a two-column MASONRY with tile heights of 380 / 300 / 240 / 220 chosen
// by list position, and the tall tiles were visibly more important — a bigger
// photo, a 24pt name, a label pill. That is unearned prominence handed out by
// array index. The lanes above work hard to rank nobody (lib/discovery.ts sorts
// on a meaningless hash precisely so ties favour nobody), and a grid that made
// the first provider look like the best one quietly undid it. Every card in the
// browse surface now has the same structural weight.
//
// ── WHAT IS NOT HERE ANY MORE ─────────────────────────────────────────────
//
// The "Featured" and "Trending" badges: both columns are DEFAULT false, pinned
// immutable by the providers UPDATE policy, and written by nothing in the
// product — so the badges could never appear, and if they ever could, "Trending"
// is a popularity claim the beta does not make. The "Our Philosophy" block: a
// centred marketing stack in the middle of a browse surface. The human
// silhouette placeholder: see ProviderCard.

const GUTTER = 20
const COLUMN_GAP = 12

// ── A rebook nudge, kept quiet ────────────────────────────────────────────
//
// Real and useful: it fires from a due care reminder the client set, it is
// dismissable for 24 hours, and it opens /care. It is also personal rather than
// marketplace, so it reads as one plain row — no accent colour, no card, no
// icon tile. A shortcut, not an advertisement.
function RebookBanner() {
  const { user } = useAuth()
  const { colors, type } = useTheme()
  const [reminder, setReminder] = useState<CareReminder | null>(null)

  useEffect(() => {
    if (!user) {
      setReminder(null)
      return
    }
    let cancelled = false
    ;(async () => {
      const due = await fetchDueReminder(user.id)
      if (cancelled || !due) {
        if (!cancelled) setReminder(null)
        return
      }
      const raw = await AsyncStorage.getItem(`care_banner_dismissed_${due.id}`)
      if (raw) {
        const ts = Number(raw)
        if (Number.isFinite(ts) && Date.now() - ts < 24 * 3600 * 1000) {
          if (!cancelled) setReminder(null)
          return
        }
      }
      if (!cancelled) setReminder(due)
    })()
    return () => {
      cancelled = true
    }
  }, [user])

  if (!reminder) return null
  const active = reminder

  async function dismiss() {
    await AsyncStorage.setItem(`care_banner_dismissed_${active.id}`, String(Date.now()))
    setReminder(null)
  }

  return (
    <View style={[s.rebook, { borderColor: colors.borderSubtle }]}>
      <Pressable
        style={s.rebookMain}
        onPress={() => router.push('/care' as never)}
        accessibilityRole="button"
        accessibilityLabel={`Time to rebook ${active.serviceName}`}
        testID="discover-rebook"
      >
        <Feather name="clock" size={14} color={colors.textSecondary} />
        <Text
          numberOfLines={1}
          style={[type.bodySmall, s.rebookText, { color: colors.textPrimary }]}
        >
          Time to rebook {active.serviceName}
        </Text>
      </Pressable>
      <TouchableOpacity
        onPress={dismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss rebook reminder"
      >
        <Feather name="x" size={15} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  )
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string
  active: boolean
  onPress: () => void
}) {
  const { colors, type } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[
        s.pill,
        {
          backgroundColor: active ? colors.actionPrimary : 'transparent',
          borderColor: active ? colors.actionPrimary : colors.borderSubtle,
        },
      ]}
    >
      <Text style={[type.labelMeta, { color: active ? colors.textOnAction : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  )
}

function tradeName(p: Provider, categories: Category[]): string | null {
  return categories.find((c) => c.id === p.category_id)?.name ?? p.custom_category ?? null
}

export default function DiscoveryFeed() {
  const insets = useSafeAreaInsets()
  const { colors, type } = useTheme()
  const { width } = useWindowDimensions()
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)
  const { user } = useAuth()

  // The viewer's own area, for Near You and for the header. A missing value
  // drops that one lane — the module never guesses a location, because a
  // "Near You" row built on a guess is worse than no row.
  const [viewerNeighborhood, setViewerNeighborhood] = useState<string | null>(null)
  // NULL IS NOT "NOBODY". Null means the server was not asked or could not
  // answer, and the Open Today lane is then absent rather than claiming nobody
  // is open.
  const [openToday, setOpenToday] = useState<Set<string> | null>(null)
  // The lanes' own provider set, separate from the grid's current page.
  const [lanePool, setLanePool] = useState<Provider[]>([])
  // Distinct from an empty pool: the read FAILED. Collapsing the two rendered a
  // network failure as a marketplace with nobody in it.
  const [poolFailed, setPoolFailed] = useState(false)

  const { categories } = useCategories()
  const { providers, loading, loadingMore, hasMore, error, fetchMore, refetch } = useProviders(
    activeCategoryId ?? undefined,
    20,
  )

  const loadLanes = useCallback(async () => {
    const [ids, pool] = await Promise.all([fetchOpenTodayProviderIds(), fetchDiscoveryPool()])
    setOpenToday(ids)
    if (pool === null) {
      setPoolFailed(true)
      setLanePool([])
      return
    }
    setPoolFailed(false)
    setLanePool(pool)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (cancelled) return
      await loadLanes()
    })()
    return () => {
      cancelled = true
    }
  }, [loadLanes])

  useEffect(() => {
    let cancelled = false
    if (!user?.id) {
      setViewerNeighborhood(null)
      return
    }
    ;(async () => {
      const { data } = await supabase
        .from('clients')
        .select('neighborhood')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled) {
        setViewerNeighborhood((data as { neighborhood: string | null } | null)?.neighborhood ?? null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  const cardWidth = useMemo(
    () => Math.floor((width - GUTTER * 2 - COLUMN_GAP) / 2),
    [width],
  )
  const [leftCol, rightCol] = useMemo(() => {
    const l: Provider[] = []
    const r: Provider[] = []
    providers.forEach((p, i) => (i % 2 === 0 ? l : r).push(p))
    return [l, r]
  }, [providers])

  // A FAILURE IS NOT AN EMPTY MARKETPLACE. Only claim nobody is here when the
  // reads actually succeeded and returned nothing.
  const failed = !loading && (!!error || (poolFailed && providers.length === 0))
  const isEmpty = !loading && !failed && providers.length === 0

  function retry() {
    setPoolFailed(false)
    void loadLanes()
    refetch()
  }

  function renderCard(p: Provider) {
    return (
      <ProviderCard
        key={p.id}
        variant="grid"
        width={cardWidth}
        testID="discover-grid-card"
        provider={{
          id: p.id,
          displayName: p.display_name,
          businessName: p.business_name,
          trade: tradeName(p, categories),
          neighborhood: p.neighborhood,
          image: p.heroImage ?? p.profile_photo_url,
          averageRating: p.average_rating,
          rating: p.rating,
          openToday: openToday === null ? null : openToday.has(p.id),
        }}
      />
    )
  }

  return (
    <View style={[s.root, { backgroundColor: colors.bgCanvas }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scroll, { paddingTop: insets.top + 8 }]}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <View style={s.header}>
          <View style={s.headerText}>
            <Text style={[type.displayScreen, { color: colors.textPrimary }]}>Discover</Text>
            {/* AREA CONTEXT, AND A REAL CONTROL. "Near You" is meaningless if
                the viewer cannot see or change what "near" means. When they have
                not set one this reads "Set your area" and opens the SAME profile
                editor that owns clients.neighborhood — no second flow, no GPS,
                no invented value. */}
            <Pressable
              onPress={() => router.push('/me/edit' as never)}
              accessibilityRole="button"
              accessibilityLabel={
                viewerNeighborhood ? `Your area: ${viewerNeighborhood}. Change it.` : 'Set your area'
              }
              style={s.areaRow}
              testID="discover-area"
            >
              <Feather name="map-pin" size={12} color={colors.statusLocal} />
              <Text style={[type.bodySmall, { color: colors.statusLocal }]}>
                {viewerNeighborhood ?? 'Set your area'}
              </Text>
            </Pressable>
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity
              style={[s.iconBtn, { borderColor: colors.borderSubtle }]}
              onPress={() => router.push('/notifications' as never)}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
            >
              <Feather name="bell" size={17} color={colors.textPrimary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.iconBtn, { borderColor: colors.borderSubtle }]}
              onPress={() => router.push('/(tabs)/me' as never)}
              accessibilityRole="button"
              accessibilityLabel="Your profile"
            >
              <Feather name="user" size={17} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Search ─────────────────────────────────────────────────────── */}
        {/* A field, not an icon: finding someone is the first thing this screen
            is for, and it used to cost an icon-hunt in a four-action header.
            Tapping opens the EXISTING search screen — this is an entry point,
            not a second search implementation. */}
        <Pressable
          onPress={() => router.push('/(tabs)/search' as never)}
          accessibilityRole="search"
          accessibilityLabel="Search providers"
          testID="discover-search-entry"
          style={[
            s.search,
            { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle },
          ]}
        >
          <Feather name="search" size={16} color={colors.textSecondary} />
          <Text style={[type.bodyDefault, { color: colors.textSecondary }]}>
            Search braiders, barbers, nails…
          </Text>
        </Pressable>

        <RebookBanner />

        {/* ── Categories ─────────────────────────────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.pillRow}
          style={s.pillScroll}
        >
          <Pill
            label="All"
            active={activeCategoryId === null}
            onPress={() => setActiveCategoryId(null)}
          />
          {categories.map((cat) => (
            <Pill
              key={cat.id}
              label={cat.name}
              active={cat.id === activeCategoryId}
              onPress={() => setActiveCategoryId(cat.id)}
            />
          ))}
        </ScrollView>

        {/* ── Lanes ──────────────────────────────────────────────────────── */}
        {/* Above the complete grid, never instead of it. Hidden inside a
            category filter: the viewer has already said what they want, and a
            second set of rows would re-sort a set they narrowed on purpose. */}
        {!loading && !failed && activeCategoryId === null && lanePool.length > 0 ? (
          <DiscoveryLanes
            providers={lanePool}
            openTodayIds={openToday}
            viewerNeighborhood={viewerNeighborhood}
            // The picker stores a "Midtown, Houston"-shaped value, so the same
            // string carries the city fallback. Passed explicitly rather than
            // derived inside the module: the module does not get to invent a
            // location for a viewer who has not given one.
            viewerLocation={viewerNeighborhood}
            categories={categories}
          />
        ) : null}

        {/* ── From people you follow ─────────────────────────────────────
            AFTER the four marketplace lanes and before the grid, which is the
            honest position for it. Above them it would read as the primary way
            Discover works and imply that following someone moves them up the
            marketplace — it does not, anywhere. Below the paginated grid it
            would be unreachable in practice.

            It is viewer-specific, it is hidden entirely when empty, and it
            reorders nothing above or below it: the lanes and the grid are built
            from `lib/discovery.ts`, which cannot see a follow. */}
        {!loading && !failed && activeCategoryId === null ? (
          <FollowedActivityRow userId={user?.id} />
        ) : null}

        {/* ── Browse ─────────────────────────────────────────────────────── */}
        <View style={s.browseHead}>
          <Text style={[type.titleCard, { color: colors.textPrimary }]}>
            {activeCategoryId === null ? 'Everyone on Third' : 'In this category'}
          </Text>
        </View>

        {loading ? (
          <View style={s.grid}>
            {[0, 1].map((col) => (
              <View key={col} style={[s.col, { width: cardWidth }]}>
                {[0, 1, 2].map((i) => (
                  <View
                    key={i}
                    style={[
                      s.skeleton,
                      { width: cardWidth, height: cardWidth * 0.92 + 44, backgroundColor: colors.bgSubtle },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        ) : failed ? (
          <ErrorState
            title="Couldn't load providers"
            body="Something went wrong reaching Third. Your connection may have dropped."
            onRetry={retry}
            testID="discover-error"
          />
        ) : isEmpty ? (
          <EmptyState
            title={
              activeCategoryId === null
                ? 'No providers on Third yet'
                : 'No providers in this category yet'
            }
            body={
              activeCategoryId === null
                ? 'Houston is just getting started.'
                : 'Try another category, or browse everyone.'
            }
            action={
              activeCategoryId !== null ? (
                <Pressable
                  onPress={() => setActiveCategoryId(null)}
                  accessibilityRole="button"
                  style={[s.emptyBtn, { backgroundColor: colors.actionPrimary }]}
                >
                  <Text style={[type.labelAction, { color: colors.textOnAction }]}>Show all</Text>
                </Pressable>
              ) : null
            }
            testID="discover-empty"
          />
        ) : (
          <View style={s.grid}>
            <View style={[s.col, { width: cardWidth }]}>{leftCol.map(renderCard)}</View>
            <View style={[s.col, { width: cardWidth }]}>{rightCol.map(renderCard)}</View>
          </View>
        )}

        {!loading && !failed && !isEmpty && hasMore ? (
          <Pressable
            onPress={fetchMore}
            disabled={loadingMore}
            accessibilityRole="button"
            accessibilityLabel="Load more providers"
            style={[s.loadMore, { borderColor: colors.borderSubtle }]}
            testID="discover-load-more"
          >
            {loadingMore ? (
              <ActivityIndicator color={colors.textSecondary} />
            ) : (
              <Text style={[type.labelAction, { color: colors.textPrimary }]}>Load more</Text>
            )}
          </Pressable>
        ) : null}

        {/* ── See the work ───────────────────────────────────────────────
            A doorway into the Reels experience that already exists, kept BELOW
            the complete grid so provider discovery stays the page. Ordered by
            recency alone — no like count, no engagement, no provider signal. */}
        {!loading && !failed && !isEmpty && activeCategoryId === null ? <ReelsEntryRow /> : null}

        {/* ── Community ──────────────────────────────────────────────────── */}
        {/* BELOW the grid and capped. A doorway onto the marketplace, not a
            replacement for it — and it reorders nothing above it, because social
            activity is not a marketplace ranking input anywhere in this product
            (lib/discovery.ts). Hidden inside a category filter for the same
            reason the lanes are. */}
        {!loading && !failed && !isEmpty && activeCategoryId === null ? <DiscoverCommunity /> : null}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingBottom: 120 },
  header: {
    paddingHorizontal: GUTTER,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: { flex: 1, gap: 4 },
  areaRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  headerActions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    marginTop: 20,
    marginHorizontal: GUTTER,
    height: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth * 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  rebook: {
    marginTop: 12,
    marginHorizontal: GUTTER,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
  },
  rebookMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  rebookText: { flex: 1 },
  pillScroll: { marginTop: 18 },
  pillRow: { paddingHorizontal: GUTTER, gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  browseHead: { paddingHorizontal: GUTTER, marginTop: 32, marginBottom: 14 },
  grid: { flexDirection: 'row', paddingHorizontal: GUTTER, gap: COLUMN_GAP },
  col: { gap: 20 },
  skeleton: { borderRadius: 14, borderCurve: 'continuous' },
  emptyBtn: {
    height: 44,
    paddingHorizontal: 22,
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadMore: {
    marginTop: 28,
    marginHorizontal: GUTTER,
    height: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
