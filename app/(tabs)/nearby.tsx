import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProviders, useCategories, Provider, Category } from '../../hooks/useProviders'

// ── Helpers ───────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('')
}

function firstName(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] ?? name
}

function ratingValue(p: Provider): number | null {
  return p.average_rating ?? p.rating
}

function providerHood(p: Provider): string {
  return p.neighborhood ?? p.location ?? ''
}

// No boolean availability field on Provider; derive it from the next_available slot.
function isAvailableNow(p: Provider): boolean {
  return p.next_available != null
}

function categoryName(categoryId: number | null, categories: Category[]): string {
  if (categoryId == null) return ''
  return categories.find((c) => c.id === categoryId)?.name ?? ''
}

// Distance radius chips are decorative; no geolocation data is available.
const DISTANCE_CHIPS = ['1 mi', '5 mi', '10 mi', '25 mi']

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
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
    <View>
      {[0, 1, 2, 3, 4].map((i) => (
        <Animated.View key={i} style={[s.row, { opacity }]}>
          <View style={[s.rowAvatar, s.skeletonBlock]} />
          <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
            <View style={[s.skeletonLine, { width: '50%' }]} />
            <View style={[s.skeletonLine, { width: '38%' }]} />
            <View style={[s.skeletonLine, { width: '30%' }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  )
}

// ── Available-now story (avatar carousel item) ────────────────────────────────

function StoryItem({
  provider,
  categories,
}: {
  provider: Provider
  categories: Category[]
}) {
  const role = categoryName(provider.category_id, categories)
  return (
    <TouchableOpacity
      style={s.story}
      activeOpacity={0.85}
      onPress={() => router.push('/providers/' + provider.id)}
    >
      <View style={s.storyRing}>
        <View style={s.storyAvatar}>
          {provider.profile_photo_url ? (
            <Image source={{ uri: provider.profile_photo_url }} style={s.storyAvatarImg} />
          ) : (
            <Text style={s.storyInitials}>{getInitials(provider.display_name)}</Text>
          )}
        </View>
      </View>
      <Text style={s.storyName} numberOfLines={1}>
        {firstName(provider.display_name)}
      </Text>
      {role ? (
        <Text style={s.storyRole} numberOfLines={1}>
          {role}
        </Text>
      ) : null}
    </TouchableOpacity>
  )
}

// ── Provider row ──────────────────────────────────────────────────────────────

function ProviderRow({
  provider,
  categories,
}: {
  provider: Provider
  categories: Category[]
}) {
  const role = categoryName(provider.category_id, categories)
  const hood = providerHood(provider)
  const rating = ratingValue(provider)
  const available = isAvailableNow(provider)

  const subtitle = [role, hood].filter(Boolean).join(' · ')

  return (
    <TouchableOpacity
      style={s.row}
      activeOpacity={0.8}
      onPress={() => router.push('/providers/' + provider.id)}
    >
      <View style={s.rowAvatarWrap}>
        <View style={s.rowAvatar}>
          {provider.profile_photo_url ? (
            <Image source={{ uri: provider.profile_photo_url }} style={s.rowAvatarImg} />
          ) : (
            <Text style={s.rowInitials}>{getInitials(provider.display_name)}</Text>
          )}
        </View>
        {available && <View style={s.statusDot} />}
      </View>

      <View style={s.rowBody}>
        <Text style={s.rowName} numberOfLines={1}>
          {provider.display_name}
        </Text>
        {subtitle ? (
          <Text style={s.rowSub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
        {available && (
          <View style={s.rowMeta}>
            <View style={s.metaDot} />
            <Text style={s.metaText}>Available now</Text>
          </View>
        )}
      </View>

      {rating != null && (
        <View style={s.rowRating}>
          <Ionicons name="star" size={11} color="#C8922A" />
          <Text style={s.ratingText}>{rating.toFixed(1)}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function NearbyScreen() {
  const insets = useSafeAreaInsets()
  const { providers, loading } = useProviders()
  const categoriesResult = useCategories() as { categories?: Category[] }
  const categories = Array.isArray(categoriesResult?.categories)
    ? categoriesResult.categories
    : []

  const [activeDistance, setActiveDistance] = useState('5 mi')

  const availableNow = useMemo(
    () => providers.filter(isAvailableNow).slice(0, 10),
    [providers],
  )

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 4 }]}>
        <TouchableOpacity
          style={s.headerSide}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={22} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Near You</Text>
        <View style={[s.headerSide, s.headerSideRight]}>
          <Ionicons name="location" size={20} color="#C8922A" />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
      >
        {/* Location row */}
        <View style={s.locationRow}>
          <View style={s.locationLeft}>
            <Ionicons name="location" size={14} color="#C8922A" />
            <Text style={s.locationText}>Houston, TX · Midtown</Text>
          </View>
          <TouchableOpacity activeOpacity={0.7}>
            <Text style={s.changeLink}>Change</Text>
          </TouchableOpacity>
        </View>

        <View style={s.divider} />

        {/* Distance chips (decorative; no geolocation data) */}
        <View style={s.distanceRow}>
          <Text style={s.withinLabel}>Within</Text>
          <View style={s.chipsRow}>
            {DISTANCE_CHIPS.map((d) => {
              const active = d === activeDistance
              return (
                <TouchableOpacity
                  key={d}
                  activeOpacity={0.8}
                  onPress={() => setActiveDistance(d)}
                  style={[s.chip, active ? s.chipActive : s.chipInactive]}
                >
                  <Text style={active ? s.chipTextActive : s.chipTextInactive}>{d}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={s.divider} />

        {loading ? (
          <View style={{ marginTop: 8 }}>
            <Skeleton />
          </View>
        ) : providers.length === 0 ? (
          <View style={s.emptyWrap}>
            <Ionicons name="location-outline" size={40} color="rgba(240,232,213,0.25)" />
            <Text style={s.emptyTitle}>No providers nearby.</Text>
            <Text style={s.emptySub}>Check back soon as more providers join in Houston.</Text>
          </View>
        ) : (
          <>
            {/* Available now carousel */}
            {availableNow.length > 0 && (
              <View style={s.section}>
                <View style={s.sectionHead}>
                  <View style={s.sectionHeadLeft}>
                    <Text style={s.sectionTitle}>Available Now</Text>
                    <View style={s.titleDot} />
                  </View>
                  <Text style={s.sectionCount}>
                    {availableNow.length}{' '}
                    {availableNow.length === 1 ? 'provider' : 'providers'}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={s.storyRowContent}
                >
                  {availableNow.map((p) => (
                    <StoryItem key={p.id} provider={p} categories={categories} />
                  ))}
                </ScrollView>
                <View style={s.divider} />
              </View>
            )}

            {/* Providers near you list */}
            <Text style={s.listLabel}>Providers Near You</Text>
            <View>
              {providers.map((p, i) => (
                <View key={p.id}>
                  <ProviderRow provider={p} categories={categories} />
                  {i < providers.length - 1 && <View style={s.rowDivider} />}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </View>
  )
}

const s = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  headerSide: {
    width: 40,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  headerTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.1,
  },

  scrollContent: {
    paddingHorizontal: 24,
  },

  // Location row
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 44,
  },
  locationLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 1,
  },
  locationText: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    flexShrink: 1,
  },
  changeLink: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },

  // Distance chips
  distanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    height: 64,
  },
  withinLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  chip: {
    height: 32,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#F0E8D5',
  },
  chipInactive: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  chipTextActive: {
    fontSize: 12,
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
  },
  chipTextInactive: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },

  // Sections
  section: {
    marginTop: 16,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sectionHeadLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.1,
  },
  titleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#C8922A',
  },
  sectionCount: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },

  // Available-now story
  storyRowContent: {
    gap: 16,
    paddingBottom: 16,
  },
  story: {
    alignItems: 'center',
    width: 72,
  },
  storyRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: '#C8922A',
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyAvatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  storyInitials: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  storyName: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    marginTop: 7,
    maxWidth: 72,
    textAlign: 'center',
  },
  storyRole: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 1,
    maxWidth: 72,
    textAlign: 'center',
  },

  // List
  listLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 8,
    marginBottom: 4,
  },

  // Provider row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 14,
  },
  rowAvatarWrap: {
    width: 52,
    height: 52,
    position: 'relative',
  },
  rowAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: 'hidden',
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowAvatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  rowInitials: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  statusDot: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#C8922A',
    borderWidth: 2,
    borderColor: '#080808',
  },
  rowBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  rowName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  rowSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 1,
  },
  metaDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#C8922A',
  },
  metaText: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  rowRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    opacity: 0.8,
  },
  rowDivider: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.05)',
    marginLeft: 68,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 64,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },

  // Skeleton
  skeletonBlock: {
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
})
