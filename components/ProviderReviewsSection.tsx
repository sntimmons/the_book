import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import {
  fetchRevealedProviderReviews,
  fetchProviderTrustStats,
  aggregateFromRevealed,
  sortAndFilter,
  RevealedReview,
} from '../lib/reviews'
import ReviewCard from './ReviewCard'

// Screen 1: the Client Reviews section embedded in the provider profile.
// Aggregate + a 3-review preview, all from REVEALED reviews only. "See all"
// routes to the real see-all page for this provider.
export default function ProviderReviewsSection({ providerId }: { providerId: string }) {
  const [reviews, setReviews] = useState<RevealedReview[]>([])
  const [rebookedPct, setRebookedPct] = useState<number | null>(null)
  const [avgResponseMins, setAvgResponseMins] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [list, stats] = await Promise.all([
        fetchRevealedProviderReviews(providerId),
        fetchProviderTrustStats(providerId),
      ])
      if (cancelled) return
      setReviews(list)
      setRebookedPct(stats.rebookedPct)
      setAvgResponseMins(stats.avgResponseMins)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [providerId])

  const agg = aggregateFromRevealed(reviews)
  const preview = sortAndFilter(reviews, 'top').slice(0, 3)
  const stars = Math.round(agg.average)

  if (loading) {
    return (
      <View style={s.section}>
        <View style={[s.skeleton, { height: 60, marginBottom: 16 }]} />
        <View style={[s.skeleton, { height: 160 }]} />
      </View>
    )
  }

  // Honest empty state when no revealed reviews exist yet.
  if (agg.count === 0) {
    return (
      <View style={s.section}>
        <View style={s.statRow}>
          {rebookedPct != null && (
            <Stat icon="repeat" value={`${Math.round(rebookedPct)}%`} label="Rebooked" />
          )}
          {avgResponseMins != null && (
            <Stat
              icon="time-outline"
              value={`~${Math.round(avgResponseMins)} min`}
              label="Response"
            />
          )}
        </View>
        <Text style={s.heading}>Client Reviews</Text>
        <View style={s.emptyWrap}>
          <Ionicons name="star-outline" size={28} color="rgba(240,232,213,0.15)" />
          <Text style={s.emptyText}>No reviews yet</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={s.section}>
      {/* Trust stats triple (rating shown in the aggregate block below) */}
      <View style={s.statRow}>
        <Stat icon="star" value={agg.average.toFixed(1)} label="Rating" />
        {rebookedPct != null && (
          <>
            <View style={s.statDivider} />
            <Stat icon="repeat" value={`${Math.round(rebookedPct)}%`} label="Rebooked" />
          </>
        )}
        {avgResponseMins != null && (
          <>
            <View style={s.statDivider} />
            <Stat
              icon="time-outline"
              value={`~${Math.round(avgResponseMins)} min`}
              label="Response"
            />
          </>
        )}
      </View>

      {/* Aggregate */}
      <Text style={s.heading}>Client Reviews</Text>
      <View style={s.aggRow}>
        <Text style={s.aggValue}>{agg.average.toFixed(1)}</Text>
        <View style={s.aggRight}>
          <View style={s.aggStars}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Ionicons
                key={i}
                name="star"
                size={14}
                color={i < stars ? '#C8922A' : 'rgba(240,232,213,0.15)'}
              />
            ))}
          </View>
          <Text style={s.aggCount}>
            Based on {agg.count} {agg.count === 1 ? 'review' : 'reviews'}
          </Text>
        </View>
      </View>

      {/* Preview cards */}
      {preview.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}

      {/* See all */}
      {agg.count > preview.length && (
        <TouchableOpacity
          style={s.seeAll}
          activeOpacity={0.7}
          onPress={() => router.push(`/reviews/all/${providerId}` as any)}
        >
          <Text style={s.seeAllText}>
            See all {agg.count} {agg.count === 1 ? 'review' : 'reviews'}
          </Text>
          <Ionicons name="chevron-forward" size={14} color="#C8922A" />
        </TouchableOpacity>
      )}
    </View>
  )
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap
  value: string
  label: string
}) {
  return (
    <View style={s.stat}>
      <View style={s.statValueRow}>
        <Ionicons name={icon} size={12} color="#C8922A" />
        <Text style={s.statValue}>{value}</Text>
      </View>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  section: { paddingHorizontal: 24, paddingTop: 24 },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.07)',
    marginBottom: 24,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32, backgroundColor: 'rgba(240,232,213,0.1)' },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  statLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 6,
  },
  heading: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  aggRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  aggValue: { fontSize: 40, color: '#F0E8D5', fontFamily: 'Manrope_700Bold', letterSpacing: -1 },
  aggRight: { marginLeft: 16 },
  aggStars: { flexDirection: 'row', gap: 2 },
  aggCount: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
  },
  seeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 16,
  },
  seeAllText: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_600SemiBold' },
  emptyWrap: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  skeleton: { backgroundColor: 'rgba(240,232,213,0.06)', borderRadius: 14 },
})
