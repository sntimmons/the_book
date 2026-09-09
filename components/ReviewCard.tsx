import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { RevealedReview, formatReviewDate, initialsOf } from '../lib/reviews'

// A single client->provider review card.
//
// TAPPABLE, as of Correction 3 item U. It was deliberately static ("matches the
// Figma which shows a static card with no interactive affordance") — which was
// the right call while `/reviews/[id]` was a placeholder saying "Coming in the
// next update", because navigating into that was worse than not navigating at
// all. Now that the screen is real, the card is the only route to it, and a
// finished screen nothing can reach is not a delivered feature.
//
// `openable` defaults to true; a caller that renders a review with no id, or in a
// context where a full-screen push would be wrong, can opt out.
export default function ReviewCard({
  review,
  subtitle,
  openable = true,
}: {
  review: RevealedReview
  subtitle?: string
  openable?: boolean
}) {
  const stars = Math.round(review.rating)
  const canOpen = openable && !!review.id
  const Card = canOpen ? Pressable : View
  return (
    <Card
      style={s.card}
      {...(canOpen
        ? {
            accessibilityRole: 'button' as const,
            onPress: () =>
              router.push({ pathname: '/reviews/[id]', params: { id: review.id } }),
          }
        : {})}
    >
      <View style={s.topRow}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>{initialsOf(review.reviewerName)}</Text>
        </View>
        <View style={s.nameCol}>
          <Text style={s.name} numberOfLines={1}>
            {review.reviewerName}
          </Text>
          <Text style={s.date}>{subtitle ?? formatReviewDate(review.createdAt)}</Text>
        </View>
        <View style={s.stars}>
          {[0, 1, 2, 3, 4].map((i) => (
            <Ionicons
              key={i}
              name="star"
              size={10}
              color={i < stars ? '#C8922A' : 'rgba(240,232,213,0.15)'}
            />
          ))}
        </View>
      </View>

      {review.reviewText ? (
        <Text style={s.body}>&quot;{review.reviewText}&quot;</Text>
      ) : null}

      {review.tags && review.tags.length > 0 ? (
        <View style={s.tags}>
          {review.tags.map((t) => (
            <View key={t} style={s.tag}>
              <Text style={s.tagText}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

const s = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 20,
    marginBottom: 20,
  },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(200,146,42,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 14, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  nameCol: { flex: 1, marginLeft: 11 },
  name: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  date: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  stars: { flexDirection: 'row', gap: 2 },
  body: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.9)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 22,
    marginTop: 18,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(200,146,42,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.2)',
  },
  tagText: { fontSize: 12, color: '#C8922A', fontFamily: 'Manrope_500Medium' },
})
