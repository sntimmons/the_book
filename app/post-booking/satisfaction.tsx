import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import { reviewOpportunityCopy } from '../../lib/reviews'
import ReviewStateScreen from '../../components/ReviewStateScreen'
import { useReviewOpportunity } from '../../hooks/useReviewOpportunity'

const RATING_RESPONSE: Record<number, string> = {
  5: 'Amazing!',
  4: 'Really good!',
  3: 'It was okay',
  2: 'Not great',
  1: 'Not good',
}

// Short date label ("May 28"), matching the post-booking sibling screens.
function formatShortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function SatisfactionCheck() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const [rating, setRating] = useState(0)
  const [providerName, setProviderName] = useState<string | null>(null)
  const [serviceName, setServiceName] = useState<string | null>(null)
  const [requestedDate, setRequestedDate] = useState<string | null>(null)
  // Proactive entry gate (QA-JOURNEY-001). Server-authoritative; `loading` keeps the
  // star picker off screen until the state is known (CODE-STATE-002).
  const { opportunity: reviewOpp, loading: oppLoading } = useReviewOpportunity(
    id,
    'client_to_provider',
  )

  // Resolve the real provider name + service/date from the booking
  // (bookings -> provider_id -> providers.display_name). Mirrors the
  // submitted.tsx pattern. Data only.
  const loadProvider = useCallback(async () => {
    if (!id) return
    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('provider_id, service_name, requested_date')
        .eq('id', id)
        .maybeSingle<{
          provider_id: string
          service_name: string | null
          requested_date: string | null
        }>()
      if (!booking) return
      if (booking.service_name) setServiceName(booking.service_name)
      if (booking.requested_date) setRequestedDate(booking.requested_date)
      if (!booking.provider_id) return

      const { data: prov } = await supabase
        .from('providers')
        .select('display_name')
        .eq('id', booking.provider_id)
        .maybeSingle<{ display_name: string | null }>()
      if (prov?.display_name) setProviderName(prov.display_name)
    } catch (err) {
      console.log('Satisfaction load provider error:', err)
    }
  }, [id])

  useEffect(() => {
    loadProvider()
  }, [loadProvider])

  const providerFirstName = providerName
    ? providerName.split(' ')[0]
    : 'your provider'

  // Real service + date from the booking, e.g. "Classic Full Set · May 28".
  const serviceLine = [serviceName, formatShortDate(requestedDate)]
    .filter(Boolean)
    .join(' · ')

  const canContinue = rating > 0

  // Thread the booking id + the star chosen here into the review screen.
  // Param-only change, no UI edits.
  function reviewHref() {
    const parts: string[] = []
    if (id) parts.push('id=' + id)
    if (rating > 0) parts.push('rating=' + rating)
    return '/post-booking/review' + (parts.length ? '?' + parts.join('&') : '')
  }

  // Reporting is a separate system (reports), not a review path — it takes no
  // rating. Ordinary negative feedback must NOT be routed here.
  function issueHref() {
    return id ? '/post-booking/issue?id=' + id : '/post-booking/issue'
  }

  // Not eligible to review → show the truthful terminal state instead of the star
  // picker, with a safe exit and no retry. `terminal` covers already_submitted /
  // window_closed / under_review AND the impossible-state arrivals reachable by a
  // stale deep link or notification: not_completed (includes no_show — a no-show is
  // not a completed service, so there is no service-quality review to leave) and
  // not_participant. 'eligible' and 'unknown' (transient read failure) fall through
  // to the normal flow; the DB stays authoritative on the actual submit.
  const oppCopy = reviewOpportunityCopy(reviewOpp, 'client_to_provider')
  if (oppLoading) return <View style={styles.root} />
  if (oppCopy.terminal) {
    return (
      <ReviewStateScreen
        title={oppCopy.title}
        body={oppCopy.body}
        onExit={() => router.replace('/(tabs)/bookings' as never)}
      />
    )
  }

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Provider summary */}
          <View style={styles.avatar}>
            <Feather name="user" size={26} color="rgba(240,232,213,0.4)" />
          </View>
          <Text style={styles.title}>How was your appointment with {providerFirstName}?</Text>
          <Text style={styles.serviceDate}>{serviceLine}</Text>

          {/* Star rating */}
          <View style={styles.ratingSection}>
            <Text style={styles.tapToRate}>Tap to rate</Text>
            <View style={styles.starRow}>
              {[0, 1, 2, 3, 4].map((i) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  onPress={() => setRating(i + 1)}
                >
                  <Feather
                    name="star"
                    size={44}
                    color={i < rating ? '#C8922A' : 'rgba(240,232,213,0.15)'}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {rating > 0 && (
              <Text style={styles.ratingResponse}>{RATING_RESPONSE[rating]}</Text>
            )}
          </View>

          {/* Action buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, !canContinue && styles.primaryBtnInactive]}
              activeOpacity={canContinue ? 0.85 : 1}
              disabled={!canContinue}
              onPress={() => router.push(reviewHref() as never)}
            >
              <Text
                style={[
                  styles.primaryBtnText,
                  !canContinue && styles.primaryBtnTextInactive,
                ]}
              >
                {/* Rating-neutral, and the path EVERY rating takes. A negative
                    service experience is still a normal review: 1-5 stars all
                    continue here, with the rating carried in the route param.
                    The label must never make a client affirm a positive
                    experience to leave a negative review (QA-UX-001). */}
                Continue to review
              </Text>
            </TouchableOpacity>

            {/* Reporting a problem is a SEPARATE action from reviewing, not the
                negative-review branch. It previously read "Something wasn't right",
                which captured ordinary dissatisfaction into the incident/report
                system (app/post-booking/issue.tsx writes `reports`, incl. safety and
                billing) and silently discarded the star rating. Ordinary negative
                feedback now stays in the normal review flow above; this remains only
                for genuine problems that need follow-up, and the review opportunity
                is untouched either way — the booking stays reviewable. */}
            <TouchableOpacity
              style={styles.secondaryBtn}
              activeOpacity={0.7}
              onPress={() => router.push(issueHref() as never)}
            >
              <Text style={styles.secondaryBtnText}>Report a problem</Text>
            </TouchableOpacity>
          </View>

          {/* Skip link */}
          <TouchableOpacity
            style={styles.skipBtn}
            activeOpacity={0.7}
            onPress={() => router.push('/(tabs)/')}
          >
            <Text style={styles.skipText}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 14,
    paddingHorizontal: 32,
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
    lineHeight: 28,
  },
  serviceDate: {
    marginTop: 8,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  ratingSection: {
    marginTop: 36,
    alignItems: 'center',
  },
  tapToRate: {
    marginBottom: 16,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  starRow: {
    flexDirection: 'row',
    gap: 12,
  },
  ratingResponse: {
    marginTop: 12,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  actions: {
    marginTop: 40,
    width: '100%',
    paddingHorizontal: 24,
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  primaryBtnText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  primaryBtnTextInactive: {
    color: 'rgba(240,232,213,0.3)',
  },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    borderRadius: 14,
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  skipBtn: {
    marginTop: 16,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
  },
})
