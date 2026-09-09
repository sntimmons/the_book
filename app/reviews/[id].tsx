import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather, Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { fetchRevealedReviewById, RevealedReviewDetail } from '@/lib/reviews'

// ITEM U (Correction 3) — the review detail screen, finished.
//
// ── WHAT WAS HERE ─────────────────────────────────────────────────────────
//
// A placeholder: a star outline, the word "Review", and "Coming in the next
// update." It was reachable, it was listed as a real route, and it told anyone
// who landed on it that a feature was arriving — a promise nothing in the roadmap
// had made. A screen that exists to say it does not exist is worse than no screen
// at all, because navigation into it looks like a product with a broken part.
//
// ── WHAT IT IS NOW, AND WHAT IT DELIBERATELY IS NOT ───────────────────────
//
// One review, exactly as the CURRENT review model already stores it: a rating, the
// reviewer's display name, when they wrote it, their words and their tags. It
// reads through the same policy every other review read goes through and adds no
// new read path.
//
// It is NOT Reviews Phase 2. There is no reply, no helpful vote, no report
// control, no owner response and no editing, because none of those exist in the
// model and inventing one here would be the same mistake in a nicer font. What is
// shown is what is stored.
export default function ReviewDetail() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id?: string }>()

  const [review, setReview] = useState<RevealedReviewDetail | null>(null)
  const [loading, setLoading] = useState(true)
  // Three outcomes, not two. "Not found" and "could not load" are different
  // things to tell a person: one is final and one is worth retrying, and
  // collapsing them would either offer a pointless retry or assert an absence the
  // client never established.
  const [failed, setFailed] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const load = useCallback(async () => {
    if (!id) {
      setLoading(false)
      return
    }
    setLoading(true)
    setFailed(false)
    try {
      setReview(await fetchRevealedReviewById(id))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load, reloadKey])

  function formatDate(iso: string): string {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backBtn}
          activeOpacity={0.8}
          onPress={() => router.back()}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Review</Text>
        <View style={styles.headerSpacer} />
      </View>

      {loading ? (
        <View style={styles.body}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : failed ? (
        <View style={styles.body}>
          <Feather name="wifi-off" size={30} color="rgba(240,232,213,0.15)" />
          <Text style={styles.title}>Could not load this review</Text>
          {/* Says what it is — a connection problem — rather than implying the
              review is gone. Asserting absence from a failed read is how a screen
              tells someone their review was deleted when it was not. */}
          <Text style={styles.subtitle}>
            This is a connection problem, not a change to the review.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.85}
            onPress={() => setReloadKey((k) => k + 1)}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !review ? (
        <View style={styles.body}>
          <Feather name="star" size={30} color="rgba(240,232,213,0.15)" />
          <Text style={styles.title}>This review isn&apos;t available</Text>
          {/* ONE state for "no such review" and "not visible to you", on purpose.
              Reviews are blind until both sides have written or the window
              closes; saying "this one is hidden from you" would announce that an
              unrevealed review exists, which is exactly what the blind window is
              for. */}
          <Text style={styles.subtitle}>
            It may have been removed, or it may not be visible yet.
          </Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.starsRow}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Ionicons
                key={i}
                name="star"
                size={20}
                color={i < review.rating ? '#C8922A' : 'rgba(240,232,213,0.15)'}
              />
            ))}
            <Text style={styles.ratingValue}>{review.rating}.0</Text>
          </View>

          <Text style={styles.byline}>
            {review.reviewerName}
            {review.createdAt ? ` · ${formatDate(review.createdAt)}` : ''}
          </Text>

          {review.reviewText ? (
            <Text style={styles.reviewText}>{review.reviewText}</Text>
          ) : (
            // A rating with no words is a complete review, not a broken one.
            <Text style={styles.noText}>This client left a rating without a written review.</Text>
          )}

          {review.tags && review.tags.length > 0 ? (
            <View style={styles.tagsRow}>
              {review.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* The one place worth going from here: the provider this is about.
              Rendered only when the name actually resolved, so the row never
              reads "View" with nothing after it. */}
          {review.providerName ? (
            <TouchableOpacity
              style={styles.providerRow}
              activeOpacity={0.8}
              onPress={() =>
                router.push({ pathname: '/providers/[id]', params: { id: review.providerId } })
              }
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.providerLabel}>REVIEW OF</Text>
                <Text style={styles.providerName}>{review.providerName}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#C8922A" />
            </TouchableOpacity>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerSpacer: { width: 36, height: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
    marginTop: 14,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 20,
    minHeight: 46,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
  content: { paddingHorizontal: 20, paddingTop: 24 },
  starsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ratingValue: {
    marginLeft: 8,
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  byline: {
    marginTop: 10,
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
  reviewText: {
    marginTop: 18,
    fontSize: 16,
    color: 'rgba(240,232,213,0.9)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 25,
  },
  noText: {
    marginTop: 18,
    fontSize: 14,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  tagText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_500Medium',
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 28,
    paddingTop: 18,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.08)',
  },
  providerLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
  },
  providerName: {
    marginTop: 3,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
})
