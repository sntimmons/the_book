import { useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  Image,
  TextInput,
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

function ratingValue(p: Provider): number | null {
  return p.average_rating ?? p.rating
}

function providerHood(p: Provider): string {
  return p.neighborhood ?? p.location ?? ''
}

// useCategories may be a stub in this codebase; guard against a non-array result.
function categoryName(
  categoryId: number | null,
  categories: Category[],
): string {
  if (categoryId == null) return ''
  return categories.find((c) => c.id === categoryId)?.name ?? ''
}

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
    <View style={{ gap: 12 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <Animated.View key={i} style={[s.card, s.skeletonCard, { opacity }]}>
          <View style={[s.avatar, s.skeletonBlock]} />
          <View style={{ flex: 1, justifyContent: 'center', gap: 8 }}>
            <View style={[s.skeletonLine, { width: '55%' }]} />
            <View style={[s.skeletonLine, { width: '40%' }]} />
            <View style={[s.skeletonLine, { width: '32%' }]} />
          </View>
        </Animated.View>
      ))}
    </View>
  )
}

// ── Provider card ─────────────────────────────────────────────────────────────

function NearbyCard({
  provider,
  categories,
}: {
  provider: Provider
  categories: Category[]
}) {
  const role = categoryName(provider.category_id, categories)
  const hood = providerHood(provider)
  const rating = ratingValue(provider)

  function goToProvider() {
    router.push('/providers/' + provider.id)
  }

  return (
    <TouchableOpacity style={s.card} activeOpacity={0.8} onPress={goToProvider}>
      <View style={s.avatar}>
        {provider.profile_photo_url ? (
          <Image source={{ uri: provider.profile_photo_url }} style={s.avatarImg} />
        ) : (
          <Text style={s.avatarInitials}>{getInitials(provider.display_name)}</Text>
        )}
      </View>

      <View style={s.cardBody}>
        <Text style={s.name} numberOfLines={1}>
          {provider.display_name}
        </Text>
        {role ? (
          <Text style={s.role} numberOfLines={1}>
            {role}
          </Text>
        ) : null}
        <View style={s.metaRow}>
          <Ionicons name="location" size={12} color="rgba(240,232,213,0.45)" />
          <Text style={s.metaText} numberOfLines={1}>
            {hood || 'Houston'}
          </Text>
        </View>
      </View>

      <View style={s.cardRight}>
        {rating != null ? (
          <View style={s.ratingRow}>
            <Ionicons name="star" size={11} color="#C8922A" />
            <Text style={s.ratingText}>{rating.toFixed(1)}</Text>
          </View>
        ) : (
          <View />
        )}
        <TouchableOpacity style={s.bookBtn} activeOpacity={0.85} onPress={goToProvider}>
          <Text style={s.bookText}>Book</Text>
        </TouchableOpacity>
      </View>
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

  const [query, setQuery] = useState('')
  const [activeHood, setActiveHood] = useState<string | null>(null)

  const neighborhoods = useMemo(() => {
    const set = new Set<string>()
    providers.forEach((p) => {
      const hood = providerHood(p)
      if (hood) set.add(hood)
    })
    return Array.from(set).sort()
  }, [providers])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return providers.filter((p) => {
      const hood = providerHood(p)
      if (activeHood && hood !== activeHood) return false
      if (q) {
        const haystack = (p.display_name + ' ' + hood).toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [providers, activeHood, query])

  return (
    <View style={s.root}>
      {/* Header */}
      <View style={[s.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={s.backBtn}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          onPress={() => router.back()}
        >
          <Ionicons name="chevron-back" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <View style={s.headerText}>
          <Text style={s.title}>Nearby</Text>
          <Text style={s.subtitle}>Providers near you in Houston</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          s.scrollContent,
          { paddingBottom: insets.bottom + 100 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Search bar */}
        <View style={s.searchBar}>
          <Ionicons name="search" size={18} color="rgba(240,232,213,0.4)" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search neighborhoods"
            placeholderTextColor="rgba(240,232,213,0.4)"
            style={s.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>

        {/* Filter chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
          style={s.chipsScroll}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveHood(null)}
            style={[s.chip, activeHood === null ? s.chipActive : s.chipInactive]}
          >
            <Text style={activeHood === null ? s.chipTextActive : s.chipTextInactive}>
              All
            </Text>
          </TouchableOpacity>
          {neighborhoods.map((hood) => {
            const active = hood === activeHood
            return (
              <TouchableOpacity
                key={hood}
                activeOpacity={0.8}
                onPress={() => setActiveHood(hood)}
                style={[s.chip, active ? s.chipActive : s.chipInactive]}
              >
                <Text style={active ? s.chipTextActive : s.chipTextInactive}>
                  {hood}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* List */}
        <View style={s.list}>
          {loading ? (
            <Skeleton />
          ) : filtered.length === 0 ? (
            <View style={s.emptyWrap}>
              <Ionicons
                name="location-outline"
                size={40}
                color="rgba(240,232,213,0.25)"
              />
              <Text style={s.emptyTitle}>No providers nearby.</Text>
              <Text style={s.emptySub}>
                Try a different neighborhood or clear your search.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 12 }}>
              {filtered.map((p) => (
                <NearbyCard key={p.id} provider={p} categories={categories} />
              ))}
            </View>
          )}
        </View>
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
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },

  // Scroll content
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 8,
  },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
  },

  // Filter chips
  chipsScroll: {
    marginTop: 16,
  },
  chipsRow: {
    gap: 8,
    paddingRight: 8,
  },
  chip: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: '#C8922A',
  },
  chipInactive: {
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  chipTextActive: {
    fontSize: 13,
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
  },
  chipTextInactive: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },

  // List
  list: {
    marginTop: 20,
  },

  // Card
  card: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderCurve: 'continuous',
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 64,
    height: 64,
  },
  avatarInitials: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  cardBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  name: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: -0.1,
  },
  role: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  metaText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    flexShrink: 1,
  },
  cardRight: {
    alignSelf: 'stretch',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 13,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },
  bookBtn: {
    height: 32,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookText: {
    fontSize: 13,
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
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
  skeletonCard: {
    alignItems: 'center',
  },
  skeletonBlock: {
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  skeletonLine: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
})
