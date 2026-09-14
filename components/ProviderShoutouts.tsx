import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { CommunityPostView, fetchShoutoutsForProvider, timeAgo } from '@/lib/community'
import { useTheme } from '@/context/ThemeContext'

// ── RECOMMENDED BY CLIENTS ────────────────────────────────────────────────
//
// Shoutouts naming this provider, on their profile — and kept VISIBLY APART
// from the reviews section directly below it, because they are different things
// and a reader who conflates them has been misled:
//
//   A REVIEW is transaction reputation. It requires a completed booking, it is
//   blind for seven days, it cannot be edited or deleted, and it moves the star
//   rating.
//
//   A SHOUTOUT is a recommendation. Anyone may write one about any approved
//   provider, it is public immediately, its author can remove it, and it moves
//   NOTHING. There is no rating on it and no path from it into
//   provider_reputation_canonical().
//
// So this section carries no stars, no average, and no count presented as a
// score. "Worked together" appears only where the SERVER verified a completed
// booking between that author and this provider — never because the author said
// so, and never as a substitute for a review.
//
// It renders nothing at all when there are none. An empty "Recommendations (0)"
// header on a new provider's profile is a small, daily untruth about how they
// are doing.

export default function ProviderShoutouts({ providerId }: { providerId: string }) {
  // Phase 3B: renders inside the provider profile, so it answers the profile's
  // appearance rather than assuming the old dark-only screen.
  const { colors } = useTheme()
  const [posts, setPosts] = useState<CommunityPostView[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await fetchShoutoutsForProvider(providerId, 3)
      if (!cancelled) {
        setPosts(list)
        setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [providerId])

  if (!loaded || posts.length === 0) return null

  return (
    <View style={s.wrap}>
      <Text style={[s.heading, { color: colors.textPrimary }]}>Recommended by clients</Text>
      <Text style={[s.sub, { color: colors.textSecondary }]}>
        Community recommendations. These are not reviews and do not affect the rating.
      </Text>
      {posts.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={[s.card, { backgroundColor: colors.bgSurface }]}
          activeOpacity={0.85}
          onPress={() => router.push(`/community/${p.id}` as never)}
        >
          <View style={s.head}>
            <Feather name="award" size={13} color={colors.statusLocal} />
            <Text style={[s.author, { color: colors.textPrimary }]} numberOfLines={1}>
              {p.author.name}
            </Text>
            {p.bookingBacked ? (
              <View style={[s.chip, { backgroundColor: colors.bgSubtle }]}>
                <Text style={[s.chipText, { color: colors.textSecondary }]}>Booked on Third</Text>
              </View>
            ) : null}
            <Text style={[s.time, { color: colors.textSecondary }]}>{timeAgo(p.createdAt)}</Text>
          </View>
          <Text style={[s.body, { color: colors.textPrimary }]} numberOfLines={3}>
            {p.content}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 24, gap: 8 },
  heading: { fontSize: 16, fontWeight: '600' },
  sub: { fontSize: 11, lineHeight: 16, marginBottom: 4 },
  card: {
    padding: 12,
    borderRadius: 12,
    gap: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  author: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  chipText: { fontSize: 9, fontWeight: '600' },
  time: { fontSize: 10, marginLeft: 'auto' },
  body: { fontSize: 13, lineHeight: 18 },
})
