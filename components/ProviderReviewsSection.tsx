import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import {
  fetchRevealedProviderReviews,
  fetchProviderTrustStats,
  fetchProviderReputation,
  sortAndFilter,
  RevealedReview,
  ProviderReputation,
} from '../lib/reviews'
import { ratingClientLabel, reviewTotalLabel } from '../lib/reputationLabel'
import { useTheme } from '@/context/ThemeContext'
import ReviewCard from './ReviewCard'

// Screen 1: the Client Reviews section embedded in the provider profile.
// Aggregate + a 3-review preview, all from REVEALED reviews only. "See all"
// routes to the real see-all page for this provider.
export default function ProviderReviewsSection({ providerId }: { providerId: string }) {
  // Phase 3B: this section sits inside the provider profile, so it has to answer
  // the appearance the profile is rendering in. The values below were the only
  // hardcoded colours left on that screen.
  const { colors } = useTheme()
  const [reviews, setReviews] = useState<RevealedReview[]>([])
  const [rep, setRep] = useState<ProviderReputation | null>(null)
  const [rebookedPct, setRebookedPct] = useState<number | null>(null)
  const [avgResponseMins, setAvgResponseMins] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const [list, stats, reputation] = await Promise.all([
        fetchRevealedProviderReviews(providerId),
        fetchProviderTrustStats(providerId),
        // PD-091/092: the rating is the DATABASE's, not an average of the rows
        // fetched beside it. See fetchProviderReputation.
        fetchProviderReputation(providerId),
      ])
      if (cancelled) return
      setReviews(list)
      setRep(reputation)
      setRebookedPct(stats.rebookedPct)
      setAvgResponseMins(stats.avgResponseMins)
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [providerId])

  // ONE rating on this screen, and it is the one the profile header shows. This
  // section used to average `reviews` in TypeScript — a second rule, and after
  // PD-091 a different number: twenty receipts from one loyal client averaged as
  // twenty voices, right below a header that correctly counted them as one.
  const preview = sortAndFilter(reviews, 'top').slice(0, 3)
  const reviewCount = rep?.reviewCount ?? reviews.length
  const stars = Math.round(rep?.average ?? 0)

  if (loading) {
    return (
      <View style={s.section}>
        <View style={[s.skeleton, { height: 60, marginBottom: 16, backgroundColor: colors.bgSubtle }]} />
        <View style={[s.skeleton, { height: 160, backgroundColor: colors.bgSubtle }]} />
      </View>
    )
  }

  // Honest empty state when no revealed reviews exist yet.
  if (reviewCount === 0) {
    return (
      <View style={s.section}>
        <View style={[s.statRow, { borderBottomColor: colors.borderSubtle }]}>
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
        <Text style={[s.heading, { color: colors.statusLocal }]}>Client Reviews</Text>
        <View style={s.emptyWrap}>
          <Ionicons name="star-outline" size={28} color={colors.borderSubtle} />
          <Text style={[s.emptyText, { color: colors.textSecondary }]}>No reviews yet</Text>
        </View>
      </View>
    )
  }

  return (
    <View style={s.section}>
      {/* Trust stats triple (rating shown in the aggregate block below) */}
      <View style={[s.statRow, { borderBottomColor: colors.borderSubtle }]}>
        {/* PD-091's display obligation: the denominator beside a rating is
            CLIENTS. A bare rating here invites the reader to assume it rests on
            however many reviews the list below shows. */}
        <Stat
          icon="star"
          value={rep != null && rep.average > 0 ? rep.average.toFixed(1) : 'New'}
          label={ratingClientLabel(rep?.clientCount) ?? 'Rating'}
        />
        {rebookedPct != null && (
          <>
            <View style={[s.statDivider, { backgroundColor: colors.borderSubtle }]} />
            <Stat icon="repeat" value={`${Math.round(rebookedPct)}%`} label="Rebooked" />
          </>
        )}
        {avgResponseMins != null && (
          <>
            <View style={[s.statDivider, { backgroundColor: colors.borderSubtle }]} />
            <Stat
              icon="time-outline"
              value={`~${Math.round(avgResponseMins)} min`}
              label="Response"
            />
          </>
        )}
      </View>

      {/* Aggregate */}
      <Text style={[s.heading, { color: colors.statusLocal }]}>Client Reviews</Text>
      <View style={s.aggRow}>
        <Text style={[s.aggValue, { color: colors.textPrimary }]}>
          {rep != null && rep.average > 0 ? rep.average.toFixed(1) : 'New'}
        </Text>
        <View style={s.aggRight}>
          <View style={s.aggStars}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Ionicons
                key={i}
                name="star"
                size={14}
                color={i < stars ? colors.textPrimary : colors.borderSubtle}
              />
            ))}
          </View>
          {/* "Based on N reviews" was the misleading half: the rating is not
              based on N reviews, it is based on N clients. Both numbers are
              true and they answer different questions, so both are shown and
              each is labelled with what it actually counts. */}
          <Text style={[s.aggCount, { color: colors.textSecondary }]}>
            {[ratingClientLabel(rep?.clientCount), reviewTotalLabel(reviewCount)]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </View>

      {/* Preview cards */}
      {preview.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}

      {/* See all */}
      {reviewCount > preview.length && (
        <TouchableOpacity
          style={s.seeAll}
          activeOpacity={0.7}
          onPress={() => router.push(`/reviews/all/${providerId}` as any)}
        >
          <Text style={[s.seeAllText, { color: colors.actionText }]}>
            See all {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
          </Text>
          <Ionicons name="chevron-forward" size={14} color={colors.actionText} />
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
  const { colors } = useTheme()
  return (
    <View style={s.stat}>
      <View style={s.statValueRow}>
        <Ionicons name={icon} size={12} color={colors.statusLocal} />
        <Text style={[s.statValue, { color: colors.textPrimary }]}>{value}</Text>
      </View>
      <Text style={[s.statLabel, { color: colors.textSecondary }]}>{label}</Text>
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
    marginBottom: 24,
  },
  stat: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 32 },
  statValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontSize: 20, fontFamily: 'Manrope_700Bold' },
  statLabel: {
    fontSize: 11,
    fontFamily: 'Manrope_500Medium',
    marginTop: 6,
  },
  heading: {
    fontSize: 10,
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  aggRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 24 },
  aggValue: { fontSize: 40, fontFamily: 'Manrope_700Bold', letterSpacing: -1 },
  aggRight: { marginLeft: 16 },
  aggStars: { flexDirection: 'row', gap: 2 },
  aggCount: {
    fontSize: 13,
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
  seeAllText: { fontSize: 14, fontFamily: 'Manrope_600SemiBold' },
  emptyWrap: { alignItems: 'center', paddingVertical: 32, gap: 10 },
  emptyText: {
    fontSize: 14,
    fontFamily: 'Manrope_400Regular',
  },
  skeleton: { borderRadius: 14 },
})
