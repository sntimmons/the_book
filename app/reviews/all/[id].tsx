import { useEffect, useMemo, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../../lib/supabase'
import { useBookingStore } from '@/store/bookingStore'
import {
  fetchRevealedProviderReviews,
  aggregateFromRevealed,
  sortAndFilter,
  ReviewSort,
  RevealedReview,
} from '../../../lib/reviews'
import ReviewCard from '../../../components/ReviewCard'

const CHIPS: { key: ReviewSort; label: string }[] = [
  { key: 'top', label: 'Top Rated' },
  { key: 'recent', label: 'Most Recent' },
  { key: '5star', label: '5 Star' },
  { key: '4star', label: '4 Star' },
]

export default function SeeAllReviews() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { setProvider } = useBookingStore()

  const [reviews, setReviews] = useState<RevealedReview[]>([])
  const [providerName, setProviderName] = useState('')
  const [providerCategory, setProviderCategory] = useState('')
  const [providerLocation, setProviderLocation] = useState('')
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<ReviewSort>('top')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!id) return
      setLoading(true)
      const [list, provRes] = await Promise.all([
        fetchRevealedProviderReviews(id as string),
        supabase
          .from('providers')
          .select('display_name, neighborhood, location, category_id')
          .eq('id', id as string)
          .maybeSingle(),
      ])
      if (cancelled) return
      setReviews(list)
      const prov = provRes.data as {
        display_name: string | null
        neighborhood: string | null
        location: string | null
        category_id: number | null
      } | null
      if (prov) {
        setProviderName(prov.display_name || 'Provider')
        setProviderLocation(prov.neighborhood ?? prov.location ?? '')
        if (prov.category_id != null) {
          const { data: cat } = await supabase
            .from('categories')
            .select('name')
            .eq('id', prov.category_id)
            .maybeSingle()
          if (!cancelled && cat?.name) setProviderCategory(cat.name)
        }
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const agg = useMemo(() => aggregateFromRevealed(reviews), [reviews])
  const visible = useMemo(() => sortAndFilter(reviews, sort), [reviews, sort])
  const stars = Math.round(agg.average)

  function handleBookNow() {
    if (!id) return
    setProvider(id as string, providerName, providerCategory, providerLocation)
    router.push('/book/service')
  }

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
          <Ionicons name="chevron-back" size={22} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Reviews</Text>
        <View style={s.headerAgg}>
          <Ionicons name="star" size={14} color="#C8922A" />
          <Text style={s.headerAggValue}>{agg.average.toFixed(1)}</Text>
        </View>
      </View>
      <Text style={s.totalLabel}>{agg.count} TOTAL</Text>

      {/* Filter / sort chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.chipsRow}
        style={s.chipsScroll}
      >
        {CHIPS.map((chip) => {
          const active = chip.key === sort
          return (
            <TouchableOpacity
              key={chip.key}
              activeOpacity={0.8}
              onPress={() => setSort(chip.key)}
              style={[s.chip, active ? s.chipActive : s.chipInactive]}
            >
              <Text style={active ? s.chipTextActive : s.chipTextInactive}>
                {chip.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color="#C8922A" />
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.listPad, { paddingBottom: insets.bottom + 120 }]}
        >
          {visible.length === 0 ? (
            <View style={s.empty}>
              <Ionicons name="star-outline" size={30} color="rgba(240,232,213,0.2)" />
              <Text style={s.emptyTitle}>
                {agg.count === 0 ? 'No more reviews to show' : 'No reviews match this filter'}
              </Text>
              <Text style={s.emptySub}>
                {agg.count === 0
                  ? 'Be the first to share your experience with this provider for your most recent booking.'
                  : 'Try a different filter to see more reviews.'}
              </Text>
            </View>
          ) : (
            visible.map((r) => <ReviewCard key={r.id} review={r} />)
          )}
        </ScrollView>
      )}

      {/* Sticky Book Now (reuses the real booking flow) */}
      {providerName ? (
        <View style={[s.bookBar, { paddingBottom: insets.bottom + 12 }]}>
          <TouchableOpacity style={s.bookBtn} activeOpacity={0.85} onPress={handleBookNow}>
            <Text style={s.bookText}>
              Book {providerName.split(/\s+/)[0]} Now
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  backBtn: { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 24, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', letterSpacing: -0.4 },
  headerAgg: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 60, justifyContent: 'flex-end' },
  headerAggValue: { fontSize: 20, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  totalLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 24,
    textAlign: 'right',
    marginTop: -8,
    marginBottom: 8,
  },
  chipsScroll: { flexGrow: 0 },
  chipsRow: { paddingHorizontal: 24, gap: 8, paddingVertical: 12 },
  chip: {
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: { backgroundColor: '#C8922A' },
  chipInactive: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  chipTextActive: { fontSize: 13, color: '#080808', fontFamily: 'Manrope_700Bold' },
  chipTextInactive: { fontSize: 13, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_600SemiBold' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  listPad: { paddingHorizontal: 24, paddingTop: 12 },
  empty: { alignItems: 'center', paddingTop: 80, gap: 12 },
  emptyTitle: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  bookBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(8,8,8,0.95)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 12,
  },
  bookBtn: {
    height: 54,
    borderRadius: 14,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bookText: { fontSize: 16, color: '#080808', fontFamily: 'Manrope_700Bold' },
})
