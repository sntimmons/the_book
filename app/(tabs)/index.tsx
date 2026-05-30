import { useState, useRef, useEffect, useMemo } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Animated,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import {
  useProviders,
  useCategories,
  getTodayBookingCount,
  Provider,
  Category,
} from '../../hooks/useProviders'
import { useNotifications } from '../../hooks/useNotifications'

// ── Animated pulse dot ────────────────────────────────────────────────────────

function PulseDot({ size = 6 }: { size?: number }) {
  const opacity = useRef(new Animated.Value(1)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ])
    ).start()
    return () => opacity.stopAnimation()
  }, [opacity])

  return (
    <Animated.View
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: '#C8922A', opacity }}
    />
  )
}

// ── Shimmer skeleton ──────────────────────────────────────────────────────────

function Shimmer({ style }: { style: any }) {
  const opacity = useRef(new Animated.Value(0.4)).current

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.8, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ])
    ).start()
    return () => opacity.stopAnimation()
  }, [opacity])

  return (
    <Animated.View
      style={[{ backgroundColor: 'rgba(240,232,213,0.06)', opacity }, style]}
    />
  )
}

// ── Person silhouette placeholder ─────────────────────────────────────────────

function Silhouette({ size = 36 }: { size?: number }) {
  const head = size * 0.36
  const bodyW = size * 0.52
  const bodyH = size * 0.27
  const c = 'rgba(240,232,213,0.12)'
  return (
    <View style={{ alignItems: 'center', gap: size * 0.06 }}>
      <View style={{ width: head, height: head, borderRadius: head / 2, backgroundColor: c }} />
      <View style={{
        width: bodyW, height: bodyH,
        borderTopLeftRadius: bodyH, borderTopRightRadius: bodyH,
        backgroundColor: c,
      }} />
    </View>
  )
}

// ── Rating row ────────────────────────────────────────────────────────────────

function RatingRow({ rating, category }: { rating: string; category: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 10, color: '#C8922A' }}>★</Text>
      <Text style={{ fontSize: 12, color: '#F0E8D5', fontFamily: 'Manrope_500Medium' }}>{rating}</Text>
      <View style={{ width: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(240,232,213,0.4)' }} />
      <Text style={{ fontSize: 12, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_400Regular' }}>{category}</Text>
    </View>
  )
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, onSeeAll }: { title: string; onSeeAll?: () => void }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionTitle}>{title}</Text>
      {onSeeAll && (
        <TouchableOpacity activeOpacity={0.7} onPress={onSeeAll}>
          <Text style={s.seeAll}>See all</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function categoryName(categoryId: number | null | undefined, categories: Category[]) {
  if (categoryId == null) return ''
  return categories.find((c) => c.id === categoryId)?.name ?? ''
}

function ratingLabel(p: Provider): string {
  const r = p.average_rating ?? p.rating
  return r != null ? r.toFixed(1) : 'New'
}

function firstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name
}

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

// No boolean availability field on Provider; derive from next_available slot.
function isAvailableNow(p: Provider): boolean {
  return p.next_available != null
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DiscoveryFeed() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null)
  const [currentFeatured, setCurrentFeatured] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const heroRef = useRef<ScrollView>(null)

  const { providers, loading } = useProviders(activeCategoryId ?? undefined)
  const { categories } = useCategories()
  const { unreadCount } = useNotifications()

  useEffect(() => {
    getTodayBookingCount().then(setTodayCount)
  }, [])

  const heroW = width - 48
  const colW = (width - 48 - 16) / 2

  const forYou = useMemo(() => providers.slice(0, 5), [providers])

  const storyProviders = useMemo(() => providers.slice(0, 8), [providers])

  const liveNow = useMemo(
    () =>
      [...providers]
        .sort(
          (a, b) =>
            new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
        )
        .slice(0, 4),
    [providers]
  )

  const trending = useMemo(() => {
    const flagged = providers.filter((p) => p.is_trending)
    if (flagged.length > 0) return flagged.slice(0, 4)
    return [...providers]
      .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
      .slice(0, 4)
  }, [providers])

  const topRated = useMemo(() => {
    return [...providers].sort((a, b) => {
      const ar = a.average_rating ?? a.rating ?? 0
      const br = b.average_rating ?? b.rating ?? 0
      if (br !== ar) return br - ar
      return (b.review_count ?? 0) - (a.review_count ?? 0)
    })
  }, [providers])

  // Hero showcase: one slide each for Featured, Top Rated, Trending.
  // Featured and Trending open the provider; Top Rated opens the Top Rated page.
  const heroSlides = useMemo(() => {
    const slides: {
      key: string
      label: string
      provider: Provider
      onPress: () => void
    }[] = []
    const feat = providers.find((p) => p.is_featured) ?? providers[0]
    if (feat) {
      slides.push({
        key: 'featured',
        label: 'Featured',
        provider: feat,
        onPress: () => router.push(`/providers/${feat.id}` as any),
      })
    }
    const top = topRated[0]
    if (top) {
      slides.push({
        key: 'top-rated',
        label: 'Top Rated',
        provider: top,
        onPress: () => router.push('/top-rated' as any),
      })
    }
    const trend = providers.find((p) => p.is_trending) ?? trending[0]
    if (trend) {
      slides.push({
        key: 'trending',
        label: 'Trending',
        provider: trend,
        onPress: () => router.push(`/providers/${trend.id}` as any),
      })
    }
    return slides
  }, [providers, topRated, trending])

  const showEmptyState = !loading && providers.length === 0

  return (
    <View style={s.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingTop: insets.top }]}
      >
        {/* ── Top bar ────────────────────────────────────────────────────── */}
        <View style={s.topBar}>
          <Text style={s.wordmark}>The Book</Text>
          <View style={s.topRight}>
            <TouchableOpacity
              activeOpacity={0.7}
              style={s.iconBtn}
              onPress={() => router.push('/(tabs)/search' as any)}
            >
              <Ionicons name="search" size={20} color="rgba(240,232,213,0.8)" />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              style={s.iconBtn}
              onPress={() => router.push('/notifications' as any)}
            >
              <Ionicons name="notifications" size={20} color="rgba(240,232,213,0.8)" />
              {unreadCount > 0 && <View style={s.notifDot} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Live ticker ─────────────────────────────────────────────────── */}
        <View style={s.ticker}>
          <PulseDot />
          <Text style={s.tickerText}>
            {todayCount} booked in Houston today
          </Text>
        </View>

        {showEmptyState ? (
          <View style={s.emptyWrap}>
            <Silhouette size={56} />
            <Text style={s.emptyTitle}>No providers yet in Houston.</Text>
            <Text style={s.emptySub}>Be the first to join.</Text>
            <TouchableOpacity
              style={s.emptyBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/onboarding/provider')}
            >
              <Text style={s.emptyBtnText}>Become a provider</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* ── Story rings ────────────────────────────────────────────── */}
            {storyProviders.length > 0 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.storyRow}
                style={s.storyScroll}
              >
                {storyProviders.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    activeOpacity={0.8}
                    onPress={() => router.push(`/providers/${p.id}` as any)}
                    style={s.storyItem}
                  >
                    <View
                      style={[
                        s.storyRing,
                        isAvailableNow(p) ? s.storyRingActive : s.storyRingInactive,
                      ]}
                    >
                      <View style={s.storyAvatar}>
                        {p.profile_photo_url ? (
                          <Image
                            source={{ uri: p.profile_photo_url }}
                            style={s.storyAvatarImg}
                          />
                        ) : (
                          <Text style={s.storyInitials}>
                            {getInitials(p.display_name)}
                          </Text>
                        )}
                      </View>
                    </View>
                    <Text style={s.storyName} numberOfLines={1}>
                      {firstName(p.display_name)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            {/* ── Featured hero carousel ─────────────────────────────────── */}
            <View style={s.heroOuter}>
              {loading ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 12 }}
                  style={{ width: heroW }}
                >
                  {[0, 1, 2].map((i) => (
                    <Shimmer key={i} style={[s.heroCard, { width: heroW }]} />
                  ))}
                </ScrollView>
              ) : (
                <>
                  <ScrollView
                    ref={heroRef}
                    horizontal
                    pagingEnabled
                    showsHorizontalScrollIndicator={false}
                    style={{ width: heroW }}
                    onMomentumScrollEnd={(e) => {
                      const idx = Math.round(e.nativeEvent.contentOffset.x / heroW)
                      setCurrentFeatured(Math.max(0, Math.min(idx, heroSlides.length - 1)))
                    }}
                  >
                    {heroSlides.map((slide) => {
                      const p = slide.provider
                      return (
                        <TouchableOpacity
                          key={slide.key}
                          activeOpacity={0.9}
                          onPress={slide.onPress}
                          style={[s.heroCard, { width: heroW }]}
                        >
                          {p.profile_photo_url ? (
                            <Image
                              source={{ uri: p.profile_photo_url }}
                              style={StyleSheet.absoluteFill}
                              resizeMode="cover"
                            />
                          ) : null}
                          <LinearGradient
                            colors={['transparent', 'rgba(8,8,8,0.85)']}
                            style={StyleSheet.absoluteFill}
                          />
                          <View style={s.heroInner}>
                            <View style={s.featuredPill}>
                              <Text style={s.featuredPillText}>{slide.label}</Text>
                            </View>
                            <Text style={s.heroName} numberOfLines={1}>
                              {p.display_name}
                            </Text>
                            <View style={s.heroMeta}>
                              <Text style={s.heroRole} numberOfLines={1}>
                                {categoryName(p.category_id, categories) ||
                                  (p.neighborhood ?? p.location ?? '')}
                              </Text>
                              {(p.average_rating ?? p.rating) != null && (
                                <View style={s.heroRatingWrap}>
                                  <Text style={s.heroStar}>★</Text>
                                  <Text style={s.heroRating}>{ratingLabel(p)}</Text>
                                </View>
                              )}
                              {isAvailableNow(p) && (
                                <View style={s.heroAvail}>
                                  <View style={s.heroAvailDot} />
                                  <Text style={s.heroAvailText}>Available now</Text>
                                </View>
                              )}
                            </View>
                          </View>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>

                  {/* Pagination dots */}
                  <View style={s.dots}>
                    {heroSlides.map((_, i) => (
                      <TouchableOpacity
                        key={i}
                        activeOpacity={0.7}
                        onPress={() => {
                          heroRef.current?.scrollTo({ x: i * heroW, animated: true })
                          setCurrentFeatured(i)
                        }}
                      >
                        <View style={[s.dot, i === currentFeatured ? s.dotActive : s.dotInactive]} />
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}
            </View>

            {/* ── Category nav ───────────────────────────────────────────── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.categoryRow}
              style={s.categoryScroll}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveCategoryId(null)}
                style={s.categoryBtn}
              >
                <Text style={[s.categoryText, activeCategoryId === null ? s.catActive : s.catInactive]}>
                  All
                </Text>
                {activeCategoryId === null && <View style={s.catUnderline} />}
              </TouchableOpacity>
              {categories.map((cat) => {
                const active = cat.id === activeCategoryId
                return (
                  <TouchableOpacity
                    key={cat.id}
                    activeOpacity={0.8}
                    onPress={() => setActiveCategoryId(cat.id)}
                    style={s.categoryBtn}
                  >
                    <Text style={[s.categoryText, active ? s.catActive : s.catInactive]}>
                      {cat.name}
                    </Text>
                    {active && <View style={s.catUnderline} />}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>

            {/* ── Near You entry ─────────────────────────────────────────── */}
            <TouchableOpacity
              style={s.nearbyBtn}
              activeOpacity={0.85}
              onPress={() => router.push('/nearby' as any)}
            >
              <View style={s.nearbyIcon}>
                <Ionicons name="location" size={18} color="#C8922A" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.nearbyTitle}>Near You</Text>
                <Text style={s.nearbySub}>Providers in your area</Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color="rgba(240,232,213,0.45)"
              />
            </TouchableOpacity>

            {/* ── For You ────────────────────────────────────────────────── */}
            <View style={s.section}>
              <SectionHeader title="For you" onSeeAll={() => {}} />
              {loading ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
                  {[0, 1, 2].map((i) => (
                    <Shimmer key={i} style={s.forYouCard} />
                  ))}
                </ScrollView>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
                  {forYou.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.8}
                      onPress={() => router.push(`/providers/${p.id}` as any)}
                      style={s.forYouCard}
                    >
                      {p.profile_photo_url ? (
                        <Image
                          source={{ uri: p.profile_photo_url }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={s.absCenter}>
                          <Silhouette size={40} />
                        </View>
                      )}
                      <LinearGradient
                        colors={['transparent', 'rgba(8,8,8,0.7)']}
                        start={{ x: 0, y: 0.6 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      {p.identity_verified && (
                        <View style={s.verifiedBadge}>
                          <Text style={s.verifiedCheck}>✓</Text>
                        </View>
                      )}
                      <View style={s.cardInfo}>
                        <Text style={s.cardName} numberOfLines={1}>{p.display_name}</Text>
                        <RatingRow rating={ratingLabel(p)} category={categoryName(p.category_id, categories)} />
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* ── Live Right Now ──────────────────────────────────────────── */}
            <View style={s.section}>
              <View style={s.sectionHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <PulseDot />
                  <Text style={s.sectionTitle}>Available Right Now</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => router.push('/nearby' as any)}
                >
                  <Text style={s.seeAll}>See all</Text>
                </TouchableOpacity>
              </View>
              {loading ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
                  {[0, 1, 2].map((i) => (
                    <Shimmer key={i} style={s.liveCard} />
                  ))}
                </ScrollView>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.hRow}>
                  {liveNow.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.8}
                      onPress={() => router.push(`/providers/${p.id}` as any)}
                      style={s.liveCard}
                    >
                      {p.profile_photo_url ? (
                        <Image
                          source={{ uri: p.profile_photo_url }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={s.absCenter}>
                          <Silhouette size={36} />
                        </View>
                      )}
                      <LinearGradient
                        colors={['transparent', 'rgba(8,8,8,0.7)']}
                        start={{ x: 0, y: 0.6 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={s.liveBadge}>
                        <Text style={s.liveBadgeText}>LIVE</Text>
                      </View>
                      <View style={s.cardInfo}>
                        <Text style={s.liveCardName} numberOfLines={1}>{p.display_name}</Text>
                        <Text style={s.liveCardDetail}>New provider</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* ── Trending in Houston ─────────────────────────────────────── */}
            <View style={[s.section, s.padded]}>
              <SectionHeader title="Trending Now" onSeeAll={() => {}} />
              {loading ? (
                <View style={s.grid}>
                  {[0, 1, 2].map((i) => (
                    <Shimmer key={i} style={[s.trendCard, { width: colW }]} />
                  ))}
                </View>
              ) : (
                <View style={s.grid}>
                  {trending.map((p, i) => (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.8}
                      onPress={() => router.push(`/providers/${p.id}` as any)}
                      style={[s.trendCard, { width: colW }]}
                    >
                      {i === 0 && (
                        <View style={s.hotBadge}>
                          <Text style={s.hotText}>HOT</Text>
                        </View>
                      )}
                      {p.profile_photo_url ? (
                        <Image
                          source={{ uri: p.profile_photo_url }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={s.absCenter}>
                          <Silhouette size={48} />
                        </View>
                      )}
                      <LinearGradient
                        colors={['transparent', 'rgba(8,8,8,0.8)']}
                        start={{ x: 0, y: 0.5 }}
                        end={{ x: 0, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                      <View style={s.trendInfo}>
                        <Text style={s.trendName}>{p.display_name}</Text>
                        <RatingRow rating={ratingLabel(p)} category={categoryName(p.category_id, categories)} />
                        {p.neighborhood || p.location ? (
                          <Text style={s.trendTag}>{p.neighborhood ?? p.location}</Text>
                        ) : null}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* ── Top Rated ───────────────────────────────────────────────── */}
            {topRated.length > 0 && (
              <View style={[s.section, s.padded]}>
                <View style={s.topRatedHead}>
                  <Text style={s.sectionTitle}>Top Rated</Text>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => router.push('/top-rated' as any)}
                  >
                    <Text style={s.seeAll}>View all</Text>
                  </TouchableOpacity>
                </View>
                <View style={{ gap: 12, marginTop: 16 }}>
                  {topRated.slice(0, 3).map((p, i) => (
                    <TouchableOpacity
                      key={p.id}
                      activeOpacity={0.8}
                      onPress={() => router.push(`/providers/${p.id}` as any)}
                      style={s.topRatedCard}
                    >
                      <Text style={s.topRatedRank}>{i + 1}</Text>
                      <View style={s.topRatedAvatar}>
                        {p.profile_photo_url ? (
                          <Image
                            source={{ uri: p.profile_photo_url }}
                            style={s.topRatedAvatarImg}
                          />
                        ) : (
                          <Text style={s.topRatedInitials}>
                            {getInitials(p.display_name)}
                          </Text>
                        )}
                      </View>
                      <View style={s.topRatedBody}>
                        <Text style={s.topRatedName} numberOfLines={1}>
                          {p.display_name}
                        </Text>
                        <Text style={s.topRatedMeta} numberOfLines={1}>
                          {[
                            categoryName(p.category_id, categories),
                            p.neighborhood ?? p.location ?? '',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </Text>
                      </View>
                      <View style={s.topRatedRating}>
                        <Text style={s.heroStar}>★</Text>
                        <Text style={s.topRatedRatingText}>{ratingLabel(p)}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* ── Browse by category ──────────────────────────────────────── */}
            <View style={[s.section, s.padded]}>
              <Text style={s.sectionTitle}>Browse by category</Text>
              <View style={[s.grid, { marginTop: 16 }]}>
                {categories.map((c) => (
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.8}
                    onPress={() => router.push('/(tabs)/search' as any)}
                    style={[s.browseCard, { width: colW }]}
                  >
                    <Text style={s.browseIcon}>◈</Text>
                    <View>
                      <Text style={s.browseName}>{c.name}</Text>
                      <Text style={s.browseCount}>{c.name} providers</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        )}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  scrollContent: {
    paddingBottom: 32,
  },

  // Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    height: 52,
  },
  wordmark: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.5,
  },
  topRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  notifDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C8922A',
    borderWidth: 1.5,
    borderColor: '#080808',
  },

  // Live ticker
  ticker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    height: 28,
    marginBottom: 12,
    backgroundColor: 'rgba(200,146,42,0.1)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(200,146,42,0.2)',
  },
  tickerText: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 0.275,
    textTransform: 'uppercase',
  },

  // Story rings
  storyScroll: {
    marginBottom: 20,
  },
  storyRow: {
    paddingHorizontal: 24,
    gap: 16,
    paddingTop: 4,
  },
  storyItem: {
    alignItems: 'center',
    width: 62,
  },
  storyRing: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 2,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyRingActive: {
    borderColor: '#C8922A',
  },
  storyRingInactive: {
    borderColor: 'rgba(240,232,213,0.15)',
  },
  storyAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    overflow: 'hidden',
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatarImg: {
    width: 54,
    height: 54,
    borderRadius: 27,
  },
  storyInitials: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  storyName: {
    fontSize: 10,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    marginTop: 6,
    maxWidth: 62,
    textAlign: 'center',
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  emptyBtn: {
    marginTop: 20,
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    paddingHorizontal: 20,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: {
    fontSize: 14,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },

  // Hero carousel
  heroOuter: {
    paddingHorizontal: 24,
    marginBottom: 12,
  },
  heroCard: {
    height: 200,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  heroInner: {
    alignItems: 'flex-start',
    padding: 16,
  },
  featuredPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#C8922A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 8,
  },
  featuredPillText: {
    fontSize: 10,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.5,
    textTransform: 'uppercase',
  },

  // Top Rated section (bottom of discovery)
  topRatedHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topRatedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  topRatedRank: {
    width: 20,
    fontSize: 18,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  topRatedAvatar: {
    width: 48,
    height: 48,
    borderRadius: 12,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRatedAvatarImg: {
    width: 48,
    height: 48,
  },
  topRatedInitials: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  topRatedBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  topRatedName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.1,
  },
  topRatedMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  topRatedRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: 'rgba(200,146,42,0.12)',
  },
  topRatedRatingText: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },
  heroName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  heroMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroRole: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    flexShrink: 1,
  },
  heroRatingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroStar: {
    fontSize: 12,
    color: '#C8922A',
  },
  heroRating: {
    fontSize: 14,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },
  heroAvail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroAvailDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#C8922A',
  },
  heroAvailText: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },

  // Pagination dots
  dots: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginTop: 16,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: '#F0E8D5',
  },
  dotInactive: {
    backgroundColor: 'rgba(240,232,213,0.25)',
  },

  // Category nav
  categoryScroll: {
    marginTop: 12,
    marginBottom: 32,
    height: 44,
  },
  categoryRow: {
    paddingHorizontal: 24,
    gap: 24,
    alignItems: 'center',
    height: 44,
  },
  categoryBtn: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryText: {
    fontSize: 14,
    fontFamily: 'Manrope_500Medium',
    letterSpacing: -0.05,
  },
  catActive: {
    color: '#F0E8D5',
  },
  catInactive: {
    color: 'rgba(240,232,213,0.5)',
  },
  catUnderline: {
    position: 'absolute',
    bottom: 7,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: '#F0E8D5',
    borderRadius: 1,
  },

  // Section structure
  section: {
    marginBottom: 40,
  },
  padded: {
    paddingHorizontal: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.2,
  },
  nearbyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 24,
    marginBottom: 40,
    padding: 14,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  nearbyIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(200,146,42,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyTitle: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.1,
  },
  nearbySub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 1,
  },
  seeAll: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: -0.05,
  },
  hRow: {
    paddingHorizontal: 24,
    gap: 12,
  },

  // For You cards
  forYouCard: {
    width: 160,
    height: 220,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  absCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  verifiedCheck: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
  },
  cardInfo: {
    padding: 10,
    gap: 4,
  },
  cardName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.05,
  },

  // Live cards
  liveCard: {
    width: 140,
    height: 180,
    borderRadius: 14,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  liveBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: '#C8922A',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    zIndex: 2,
  },
  liveBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1,
  },
  liveCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.05,
    marginBottom: 3,
  },
  liveCardDetail: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    letterSpacing: -0.05,
  },

  // Grid layout
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },

  // Trending cards
  trendCard: {
    height: 230,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  hotBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#C8922A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    zIndex: 2,
  },
  hotText: {
    fontSize: 10,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  trendInfo: {
    padding: 12,
    gap: 4,
  },
  trendName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.05,
  },
  trendTag: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    letterSpacing: -0.05,
    marginTop: 2,
  },

  // Browse cards
  browseCard: {
    height: 112,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    padding: 14,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  browseIcon: {
    fontSize: 20,
    color: '#F0E8D5',
  },
  browseName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: -0.05,
    marginBottom: 2,
  },
  browseCount: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: -0.05,
  },
})
