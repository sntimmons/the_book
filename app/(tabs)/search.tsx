import { useRef, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
  Switch,
  Keyboard,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type FeatherIcon = keyof typeof Feather.glyphMap

interface Category {
  icon: FeatherIcon
  name: string
  count: string
}

interface Provider {
  name: string
  category: string
  location: string
  rating: number
  reviews: number
  bookings: number
  price: string
  verified: boolean
  live: boolean
  mobile: boolean
  available: string
}

const RECENT = ['Lash extensions', 'Barber fade', 'Knotless braids']

const TRENDING = [
  'Silk press',
  'Knotless braids',
  'Mobile barber',
  'Lash fills',
  'Event photographer',
  'Mobile massage',
]

const CATEGORIES: Category[] = [
  { icon: 'scissors', name: 'Hair', count: '240 providers' },
  { icon: 'eye', name: 'Lashes', count: '156 providers' },
  { icon: 'scissors', name: 'Barber', count: '203 providers' },
  { icon: 'droplet', name: 'Nails', count: '189 providers' },
  { icon: 'camera', name: 'Photography', count: '98 providers' },
  { icon: 'smile', name: 'Makeup', count: '134 providers' },
  { icon: 'wind', name: 'Massage', count: '67 providers' },
  { icon: 'more-horizontal', name: 'More', count: '180+ providers' },
]

const QUICK_FILTERS = ['Available today', '4.5+ stars', 'Near me', 'Mobile providers']

const SORT_OPTIONS = ['Relevance', 'Highest rated', 'Most booked', 'Price: low to high']

const AVAILABILITY_OPTIONS = ['Today', 'This week', 'Any time']
const RATING_OPTIONS = ['Any', '3+', '4+', '4.5+']

const PROVIDERS: Provider[] = [
  {
    name: 'Nia Laurent',
    category: 'Lash Tech',
    location: 'River Oaks',
    rating: 4.9,
    reviews: 127,
    bookings: 203,
    price: 'from $85',
    verified: true,
    live: false,
    mobile: false,
    available: 'Available today',
  },
  {
    name: 'Marcus Blade',
    category: 'Barber',
    location: 'Midtown',
    rating: 5.0,
    reviews: 89,
    bookings: 156,
    price: 'from $35',
    verified: true,
    live: true,
    mobile: true,
    available: 'Available today',
  },
  {
    name: 'Jade Williams',
    category: 'Lash & Brows',
    location: 'Montrose',
    rating: 4.8,
    reviews: 64,
    bookings: 98,
    price: 'from $95',
    verified: false,
    live: false,
    mobile: false,
    available: 'Next: Thu',
  },
  {
    name: 'Elena Ross',
    category: 'Hair Stylist',
    location: 'Heights',
    rating: 4.9,
    reviews: 201,
    bookings: 312,
    price: 'from $65',
    verified: true,
    live: false,
    mobile: false,
    available: 'Available today',
  },
  {
    name: 'Jordan Ellis',
    category: 'Nail Tech',
    location: 'EaDo',
    rating: 4.7,
    reviews: 43,
    bookings: 67,
    price: 'from $55',
    verified: false,
    live: true,
    mobile: true,
    available: 'Available today',
  },
  {
    name: 'Andre Watts',
    category: 'Photography',
    location: 'Museum District',
    rating: 4.9,
    reviews: 38,
    bookings: 52,
    price: 'from $150',
    verified: true,
    live: false,
    mobile: true,
    available: 'Next: Fri',
  },
]

export default function SearchScreen() {
  const insets = useSafeAreaInsets()
  const inputRef = useRef<TextInput>(null)

  const [query, setQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [activeFilters, setActiveFilters] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [showSort, setShowSort] = useState(false)
  const [sortBy, setSortBy] = useState('relevance')
  const [focused, setFocused] = useState(false)

  // Filter sheet local selections
  const [sheetCategory, setSheetCategory] = useState<string | null>(null)
  const [availability, setAvailability] = useState<string | null>(null)
  const [minRating, setMinRating] = useState('Any')
  const [mobileOnly, setMobileOnly] = useState(false)

  const isSearching =
    query.length > 0 || activeCategory !== null || activeFilters.length > 0

  function toggleFilter(filter: string) {
    setActiveFilters((prev) =>
      prev.includes(filter) ? prev.filter((f) => f !== filter) : [...prev, filter],
    )
  }

  function handleCancel() {
    setQuery('')
    setActiveCategory(null)
    setActiveFilters([])
    Keyboard.dismiss()
  }

  function resetFilters() {
    setActiveFilters([])
    setSheetCategory(null)
    setAvailability(null)
    setMinRating('Any')
    setMobileOnly(false)
  }

  const results = PROVIDERS.filter((p) => {
    if (query.length > 0) {
      const q = query.toLowerCase()
      const haystack = `${p.name} ${p.category} ${p.location}`.toLowerCase()
      if (!haystack.includes(q)) return false
    }
    if (activeCategory) {
      const cat = activeCategory.toLowerCase()
      const matches =
        p.category.toLowerCase().includes(cat) ||
        (cat === 'hair' && p.category.toLowerCase().includes('hair')) ||
        (cat === 'lashes' && p.category.toLowerCase().includes('lash')) ||
        (cat === 'makeup' && p.category.toLowerCase().includes('makeup')) ||
        (cat === 'nails' && p.category.toLowerCase().includes('nail'))
      if (!matches) return false
    }
    if (activeFilters.includes('Available today') && p.available !== 'Available today') {
      return false
    }
    if (activeFilters.includes('4.5+ stars') && p.rating < 4.5) return false
    if (activeFilters.includes('Mobile providers') && !p.mobile) return false
    return true
  })

  return (
    <View style={styles.root}>
      <StatusBar style="light" />

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <View style={styles.searchRow}>
          <View style={[styles.searchContainer, focused && styles.searchContainerFocused]}>
            <Feather name="search" size={18} color="rgba(240,232,213,0.35)" />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search providers, services..."
              placeholderTextColor="rgba(240,232,213,0.25)"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setQuery('')
                  inputRef.current?.focus()
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather name="x" size={16} color="rgba(240,232,213,0.35)" />
              </TouchableOpacity>
            )}
          </View>
          {isSearching && (
            <TouchableOpacity activeOpacity={0.7} onPress={handleCancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Filter row */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.controlBtn, activeFilters.length > 0 && styles.controlBtnActive]}
            activeOpacity={0.7}
            onPress={() => setShowFilters(true)}
          >
            <Feather
              name="sliders"
              size={13}
              color={activeFilters.length > 0 ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
            />
            <Text style={activeFilters.length > 0 ? styles.controlTextActive : styles.controlText}>
              {activeFilters.length > 0 ? `Filters (${activeFilters.length})` : 'Filters'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.controlBtn}
            activeOpacity={0.7}
            onPress={() => setShowSort(true)}
          >
            <Feather name="bar-chart" size={13} color="rgba(240,232,213,0.4)" />
            <Text style={styles.controlText}>Sort</Text>
          </TouchableOpacity>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.quickScroll}
            contentContainerStyle={styles.quickContent}
          >
            {QUICK_FILTERS.map((filter) => {
              const active = activeFilters.includes(filter)
              return (
                <TouchableOpacity
                  key={filter}
                  style={[styles.quickChip, active ? styles.quickChipActive : styles.quickChipInactive]}
                  activeOpacity={0.7}
                  onPress={() => toggleFilter(filter)}
                >
                  <Text style={active ? styles.quickChipTextActive : styles.quickChipTextInactive}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      </View>

      {isSearching ? (
        <ResultsState
          query={query}
          activeCategory={activeCategory}
          activeFilters={activeFilters}
          results={results}
          onRemoveFilter={toggleFilter}
          onBrowse={() => {
            setQuery('')
            setActiveCategory(null)
          }}
        />
      ) : (
        <EmptyState
          onRecent={(term) => setQuery(term)}
          onCategory={(cat) => setActiveCategory(cat)}
          onTrending={(term) => setQuery(term)}
        />
      )}

      {/* Filter sheet */}
      <Modal visible={showFilters} animationType="slide" transparent>
        <Pressable style={styles.overlay} onPress={() => setShowFilters(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.dragHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Filters</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={resetFilters}>
              <Text style={styles.resetText}>Reset</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.sheetLabel, styles.sheetLabelFirst]}>CATEGORY</Text>
            <View style={styles.pillWrap}>
              {CATEGORIES.map((c) => {
                const selected = sheetCategory === c.name
                return (
                  <SheetPill
                    key={c.name}
                    label={c.name}
                    selected={selected}
                    onPress={() => setSheetCategory(selected ? null : c.name)}
                  />
                )
              })}
            </View>

            <Text style={styles.sheetLabel}>AVAILABILITY</Text>
            <View style={styles.pillWrap}>
              {AVAILABILITY_OPTIONS.map((a) => (
                <SheetPill
                  key={a}
                  label={a}
                  selected={availability === a}
                  onPress={() => setAvailability(availability === a ? null : a)}
                />
              ))}
            </View>

            <Text style={styles.sheetLabel}>MINIMUM RATING</Text>
            <View style={styles.pillWrap}>
              {RATING_OPTIONS.map((r) => (
                <SheetPill key={r} label={r} selected={minRating === r} onPress={() => setMinRating(r)} />
              ))}
            </View>

            <Text style={styles.sheetLabel}>PROVIDER TYPE</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Mobile providers only</Text>
              <Switch
                value={mobileOnly}
                onValueChange={setMobileOnly}
                trackColor={{ false: 'rgba(240,232,213,0.12)', true: '#F0E8D5' }}
                thumbColor={mobileOnly ? '#080808' : '#F0E8D5'}
                ios_backgroundColor="rgba(240,232,213,0.12)"
              />
            </View>

            <TouchableOpacity
              style={styles.applyBtn}
              activeOpacity={0.85}
              onPress={() => setShowFilters(false)}
            >
              <Text style={styles.applyBtnText}>Apply Filters</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Sort sheet */}
      <Modal visible={showSort} animationType="slide" transparent>
        <Pressable style={styles.overlay} onPress={() => setShowSort(false)} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.dragHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Sort by</Text>
          </View>
          <View style={styles.sortList}>
            {SORT_OPTIONS.map((option) => {
              const selected = sortBy === option.toLowerCase()
              return (
                <TouchableOpacity
                  key={option}
                  style={styles.sortRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    setSortBy(option.toLowerCase())
                    setShowSort(false)
                  }}
                >
                  <Text style={styles.sortLabel}>{option}</Text>
                  <View style={[styles.radio, selected && styles.radioSelected]}>
                    {selected && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>
      </Modal>
    </View>
  )
}

function EmptyState({
  onRecent,
  onCategory,
  onTrending,
}: {
  onRecent: (term: string) => void
  onCategory: (cat: string) => void
  onTrending: (term: string) => void
}) {
  const [recent, setRecent] = useState(RECENT)

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.emptyContent}
    >
      {recent.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.sectionLabel}>RECENT</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => setRecent([])}>
              <Text style={styles.clearText}>Clear</Text>
            </TouchableOpacity>
          </View>
          {recent.map((term) => (
            <TouchableOpacity
              key={term}
              style={styles.recentRow}
              activeOpacity={0.7}
              onPress={() => onRecent(term)}
            >
              <Feather name="clock" size={15} color="rgba(240,232,213,0.2)" />
              <Text style={styles.recentTerm}>{term}</Text>
              <Feather name="chevron-right" size={13} color="rgba(240,232,213,0.15)" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.separator} />

      <View style={styles.categorySection}>
        <Text style={styles.sectionLabel}>BROWSE BY CATEGORY</Text>
        <View style={styles.categoryGrid}>
          {CATEGORIES.map((c) => (
            <TouchableOpacity
              key={c.name}
              style={styles.categoryTile}
              activeOpacity={0.7}
              onPress={() => onCategory(c.name)}
            >
              <Feather name={c.icon} size={18} color="rgba(240,232,213,0.5)" />
              <View style={styles.categoryTileText}>
                <Text style={styles.categoryName}>{c.name}</Text>
                <Text style={styles.categoryCount}>{c.count}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.trendingSection}>
        <Text style={styles.sectionLabel}>TRENDING IN HOUSTON</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.trendingContent}
        >
          {TRENDING.map((term) => (
            <TouchableOpacity
              key={term}
              style={styles.trendingChip}
              activeOpacity={0.7}
              onPress={() => onTrending(term)}
            >
              <Feather name="trending-up" size={11} color="#C8922A" />
              <Text style={styles.trendingTerm}>{term}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  )
}

function ResultsState({
  query,
  activeCategory,
  activeFilters,
  results,
  onRemoveFilter,
  onBrowse,
}: {
  query: string
  activeCategory: string | null
  activeFilters: string[]
  results: Provider[]
  onRemoveFilter: (filter: string) => void
  onBrowse: () => void
}) {
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      keyboardDismissMode="on-drag"
      contentContainerStyle={styles.resultsContent}
    >
      <View style={styles.resultsHeader}>
        {query.length > 0 ? (
          <Text style={styles.resultsTitle}>Results for "{query}"</Text>
        ) : activeCategory ? (
          <Text style={styles.resultsTitle}>{activeCategory} providers</Text>
        ) : (
          <Text style={styles.resultsTitle}>All providers</Text>
        )}
        <Text style={styles.resultsCount}>{results.length} found</Text>
      </View>

      {activeFilters.length > 0 && (
        <View style={styles.activeFilterRow}>
          {activeFilters.map((filter) => (
            <TouchableOpacity
              key={filter}
              style={styles.activeFilterChip}
              activeOpacity={0.7}
              onPress={() => onRemoveFilter(filter)}
            >
              <Text style={styles.activeFilterText}>{filter}</Text>
              <Feather name="x" size={10} color="rgba(240,232,213,0.4)" />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {results.length === 0 ? (
        <View style={styles.noResults}>
          <Feather name="search" size={40} color="rgba(240,232,213,0.1)" />
          <Text style={styles.noResultsTitle}>No results for "{query}"</Text>
          <Text style={styles.noResultsSub}>
            Try a different search or browse by category below.
          </Text>
          <TouchableOpacity style={styles.browseBtn} activeOpacity={0.7} onPress={onBrowse}>
            <Text style={styles.browseBtnText}>Browse Categories</Text>
          </TouchableOpacity>
        </View>
      ) : (
        results.map((p) => <ProviderCard key={p.name} provider={p} />)
      )}
    </ScrollView>
  )
}

function ProviderCard({ provider: p }: { provider: Provider }) {
  const availableToday = p.available === 'Available today'
  return (
    <TouchableOpacity
      style={styles.providerCard}
      activeOpacity={0.7}
      onPress={() => router.push('/providers/1')}
    >
      <View style={styles.avatarWrap}>
        <View style={styles.avatar}>
          <Feather name="user" size={22} color="rgba(240,232,213,0.2)" />
        </View>
        {p.verified && (
          <View style={styles.verifiedBadge}>
            <Feather name="check" size={8} color="#080808" />
          </View>
        )}
        {p.live && <View style={styles.liveDot} />}
      </View>

      <View style={styles.cardCenter}>
        <View style={styles.cardTopRow}>
          <Text style={styles.cardName}>{p.name}</Text>
          {p.mobile && (
            <View style={styles.mobilePill}>
              <Text style={styles.mobilePillText}>Mobile</Text>
            </View>
          )}
        </View>
        <Text style={styles.cardMeta}>
          {p.category} · {p.location}
        </Text>
        <View style={styles.cardRatingRow}>
          <Feather name="star" size={11} color="#C8922A" />
          <Text style={styles.cardRating}>{p.rating.toFixed(1)}</Text>
          <Text style={styles.cardReviews}>({p.reviews})</Text>
          <View style={styles.dot} />
          <Text style={styles.cardBookings}>{p.bookings} bookings</Text>
        </View>
      </View>

      <View style={styles.cardRight}>
        <Text style={styles.cardPrice}>{p.price}</Text>
        <Text style={availableToday ? styles.availableGreen : styles.availableNeutral}>
          {p.available}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

function SheetPill({
  label,
  selected,
  onPress,
}: {
  label: string
  selected: boolean
  onPress: () => void
}) {
  return (
    <TouchableOpacity
      style={[styles.sheetPill, selected ? styles.sheetPillSelected : styles.sheetPillUnselected]}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <Text style={selected ? styles.sheetPillTextSelected : styles.sheetPillTextUnselected}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchContainer: {
    flex: 1,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 14,
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 10,
  },
  searchContainerFocused: {
    borderColor: 'rgba(240,232,213,0.25)',
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
  },
  cancelText: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_500Medium',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  controlBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'transparent',
    borderColor: 'rgba(240,232,213,0.1)',
  },
  controlBtnActive: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.25)',
  },
  controlText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  controlTextActive: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  quickScroll: {
    flex: 1,
  },
  quickContent: {
    alignItems: 'center',
    gap: 6,
  },
  quickChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  quickChipActive: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.25)',
  },
  quickChipInactive: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(240,232,213,0.07)',
  },
  quickChipTextActive: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  quickChipTextInactive: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  // Empty state
  emptyContent: {
    paddingBottom: 100,
  },
  recentSection: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  recentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  clearText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  recentTerm: {
    flex: 1,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    marginHorizontal: 20,
    marginTop: 4,
  },
  categorySection: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 12,
  },
  categoryTile: {
    width: '48%',
    paddingVertical: 16,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryTileText: {
    flex: 1,
  },
  categoryName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  categoryCount: {
    marginTop: 2,
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  trendingSection: {
    paddingHorizontal: 20,
    marginTop: 24,
  },
  trendingContent: {
    gap: 8,
    marginTop: 12,
  },
  trendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    backgroundColor: 'rgba(240,232,213,0.03)',
  },
  trendingTerm: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  // Results state
  resultsContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 14,
  },
  resultsTitle: {
    flex: 1,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  resultsCount: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginLeft: 10,
  },
  activeFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  activeFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderColor: 'rgba(240,232,213,0.2)',
  },
  activeFilterText: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  avatarWrap: {
    position: 'relative',
    width: 56,
    height: 56,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#C8922A',
    borderWidth: 1.5,
    borderColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  liveDot: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#C8922A',
    borderWidth: 1.5,
    borderColor: '#080808',
  },
  cardCenter: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  cardName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  mobilePill: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  mobilePillText: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  cardMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  cardRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  cardRating: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  cardReviews: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(240,232,213,0.2)',
    marginHorizontal: 2,
  },
  cardBookings: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  cardRight: {
    alignItems: 'flex-end',
  },
  cardPrice: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  availableGreen: {
    marginTop: 3,
    fontSize: 10,
    color: '#4CAF50',
    fontFamily: 'Manrope_400Regular',
  },
  availableNeutral: {
    marginTop: 3,
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  // No results
  noResults: {
    paddingTop: 60,
    alignItems: 'center',
  },
  noResultsTitle: {
    marginTop: 16,
    fontSize: 16,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  noResultsSub: {
    marginTop: 6,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  browseBtn: {
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
  },
  browseBtnText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  // Sheets
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(240,232,213,0.15)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 4,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 14,
  },
  sheetTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  resetText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
  },
  sheetScroll: {
    paddingHorizontal: 24,
  },
  sheetLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 16,
  },
  sheetLabelFirst: {
    marginTop: 4,
  },
  pillWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sheetPill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  sheetPillSelected: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.3)',
  },
  sheetPillUnselected: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(240,232,213,0.08)',
  },
  sheetPillTextSelected: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  sheetPillTextUnselected: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleLabel: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  applyBtn: {
    marginTop: 20,
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  // Sort sheet
  sortList: {
    paddingHorizontal: 24,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  sortLabel: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#F0E8D5',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F0E8D5',
  },
})
