import { View, Text, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { RevealedReview, formatReviewDate, initialsOf } from '../lib/reviews'

// A single client->provider review card. Not tappable: matches the Figma which
// shows a static card with no interactive affordance.
export default function ReviewCard({
  review,
  subtitle,
}: {
  review: RevealedReview
  subtitle?: string
}) {
  const stars = Math.round(review.rating)
  return (
    <View style={s.card}>
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
    </View>
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
