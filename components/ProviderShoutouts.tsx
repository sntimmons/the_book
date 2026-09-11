import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { CommunityPostView, fetchShoutoutsForProvider, timeAgo } from '@/lib/community'

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
      <Text style={s.heading}>Recommended by clients</Text>
      <Text style={s.sub}>
        Community recommendations. These are not reviews and do not affect the rating.
      </Text>
      {posts.map((p) => (
        <TouchableOpacity
          key={p.id}
          style={s.card}
          activeOpacity={0.85}
          onPress={() => router.push(`/community/${p.id}` as never)}
        >
          <View style={s.head}>
            <Feather name="award" size={13} color="#C8922A" />
            <Text style={s.author} numberOfLines={1}>
              {p.author.name}
            </Text>
            {p.bookingBacked ? (
              <View style={s.chip}>
                <Text style={s.chipText}>Booked on The Book</Text>
              </View>
            ) : null}
            <Text style={s.time}>{timeAgo(p.createdAt)}</Text>
          </View>
          <Text style={s.body} numberOfLines={3}>
            {p.content}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 24, gap: 8 },
  heading: { color: '#F0E8D5', fontSize: 16, fontWeight: '600' },
  sub: { color: 'rgba(240,232,213,0.4)', fontSize: 11, lineHeight: 16, marginBottom: 4 },
  card: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.04)',
    gap: 6,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  author: { color: '#F0E8D5', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  chip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  chipText: { color: 'rgba(240,232,213,0.55)', fontSize: 9, fontWeight: '600' },
  time: { color: 'rgba(240,232,213,0.3)', fontSize: 10, marginLeft: 'auto' },
  body: { color: 'rgba(240,232,213,0.8)', fontSize: 13, lineHeight: 18 },
})
