import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '../../lib/supabase'
import {
  reviewOpportunityCopy,
  reviewSubmitErrorMessage,
  REVIEW_SUBMITTED_TITLE,
  REVIEW_SUBMITTED_BODY,
} from '../../lib/reviews'
import ReviewStateScreen from '../../components/ReviewStateScreen'
import { useReviewOpportunity } from '../../hooks/useReviewOpportunity'
import { useAuth } from '../../context/AuthContext'

const RATING_RESPONSE: Record<number, string> = {
  5: 'Great client!',
  4: 'Good experience',
  3: 'It was okay',
  2: 'Some issues',
  1: 'Would not rebook',
}

interface BookingForReview {
  clientUserId: string
  clientFirstName: string
  serviceLabel: string
}

function formatShortDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso + 'T00:00:00')
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ProviderReview() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { id } = useLocalSearchParams<{ id?: string }>()

  const [rating, setRating] = useState(0)
  const [note, setNote] = useState('')
  // Structured accountability dimensions. Default null so the provider
  // actively chooses yes/no rather than a pre-selected value.
  const [showedUp, setShowedUp] = useState<boolean | null>(null)
  const [onTime, setOnTime] = useState<boolean | null>(null)
  const [followedPolicy, setFollowedPolicy] = useState<boolean | null>(null)
  const [paymentCompleted, setPaymentCompleted] = useState<boolean | null>(null)
  const [booking, setBooking] = useState<BookingForReview | null>(null)
  const [providerDbId, setProviderDbId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // QA-UX-004: a successful provider review must not exit silently — submit and skip
  // were previously indistinguishable. Flips to true only after the insert succeeds.
  const [submitted, setSubmitted] = useState(false)

  // Load the real booking + client + service. Per spec: data only, no restyle.
  const load = useCallback(async () => {
    if (!id || !user) return
    try {
      const { data: bookingRow } = await supabase
        .from('bookings')
        .select('id, user_id, service_name, requested_date, provider_id')
        .eq('id', id)
        .maybeSingle<{
          id: string
          user_id: string
          service_name: string | null
          requested_date: string | null
          provider_id: string
        }>()
      if (!bookingRow) return

      const { data: providerRow } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle<{ id: string }>()
      setProviderDbId(providerRow?.id ?? null)

      const { data: clientRow } = await supabase
        .from('clients_provider')
        .select('name')
        .eq('id', bookingRow.user_id)
        .maybeSingle<{ name: string | null }>()

      const clientName = clientRow?.name ?? 'Client'
      const dateLabel = formatShortDate(bookingRow.requested_date)
      const serviceLabel = [
        bookingRow.service_name ?? 'Service',
        dateLabel,
      ]
        .filter(Boolean)
        .join(' · ')

      setBooking({
        clientUserId: bookingRow.user_id,
        clientFirstName: clientName.split(' ')[0] || clientName,
        serviceLabel,
      })
    } catch (err) {
      console.log('Provider review load error:', err)
    }
  }, [id, user])

  useEffect(() => {
    load()
  }, [load])

  // Deep-link / stale-navigation defense (QA-JOURNEY-001). Reachable directly from
  // the completion prompt AND from the persistent booking-detail entry, so it
  // re-checks the server-authoritative opportunity rather than failing at submit.
  const { opportunity: reviewOpp, loading: oppLoading } = useReviewOpportunity(
    id,
    'provider_to_client',
  )

  function handleRate(value: number) {
    setRating(value)
  }

  const canSubmit = rating > 0 && !submitting

  async function handleSubmit() {
    if (!canSubmit) return
    if (!id) {
      Alert.alert(
        'Missing booking',
        'Open this from a completed booking to submit a rating.',
        [{ text: 'OK' }],
      )
      return
    }
    if (!booking) {
      Alert.alert('Booking not found', 'We could not load this booking.', [
        { text: 'OK' },
      ])
      return
    }
    if (!providerDbId) {
      Alert.alert(
        'Provider profile missing',
        'We could not find your provider profile.',
        [{ text: 'OK' }],
      )
      return
    }

    setSubmitting(true)
    try {
      const { error } = await supabase.from('client_reviews').insert({
        booking_id: id,
        client_user_id: booking.clientUserId,
        reviewer_provider_id: providerDbId,
        rating,
        // Structured dimensions (the accountability signal shown to providers).
        showed_up: showedUp,
        on_time: onTime,
        followed_policy: followedPolicy,
        payment_completed: paymentCompleted,
        // Private, provider-only context. Never written to review_text (which
        // was displayed publicly) and never surfaced to clients/other providers.
        private_note: note.trim() || null,
      })

      if (error) {
        console.log('Client review insert error:', error)
        // RLS WITH CHECK rejections all surface as 42501; re-read the authoritative
        // opportunity state for a truthful, non-retry message (already reviewed /
        // window closed / under review) instead of a generic retry (QA-STATE-006).
        const truthful = await reviewSubmitErrorMessage(id as string, 'provider_to_client')
        Alert.alert(
          truthful?.title ?? 'Could not submit rating',
          truthful?.body ?? 'Something went wrong. Please try again.',
          [
            {
              text: truthful ? 'Done' : 'OK',
              onPress: truthful ? () => router.replace('/(tabs)/business' as never) : undefined,
            },
          ],
        )
        setSubmitting(false)
        return
      }

      // QA-UX-004: confirm the write instead of navigating away silently.
      setSubmitting(false)
      setSubmitted(true)
    } catch (err) {
      console.log('Client review exception:', err)
      Alert.alert(
        'Something went wrong',
        'Please check your connection and try again.',
        [{ text: 'OK' }],
      )
      setSubmitting(false)
    }
  }

  function handleSkip() {
    router.replace('/(tabs)/business' as never)
  }

  // Successful submission → truthful confirmation, reusing the shared state screen
  // rather than adding new navigation architecture (QA-UX-004). The copy is the shared
  // constant, so both directions describe the blind window identically and neither
  // claims the review is live/public.
  if (submitted) {
    return (
      <ReviewStateScreen
        icon="check-circle"
        title={REVIEW_SUBMITTED_TITLE}
        body={REVIEW_SUBMITTED_BODY}
        exitLabel="Back to bookings"
        onExit={() => router.replace('/(tabs)/business/bookings' as never)}
      />
    )
  }

  // Terminal (non-retryable) state → truthful screen with a safe exit, never the form.
  // Includes not_completed, which is what a no_show booking resolves to: a no-show
  // is not a completed service, so there is no service-quality rating to give.
  const oppCopy = reviewOpportunityCopy(reviewOpp, 'provider_to_client')
  if (oppLoading) return <View style={styles.root} />
  if (oppCopy.terminal) {
    return (
      <ReviewStateScreen
        title={oppCopy.title}
        body={oppCopy.body}
        exitLabel="Back to bookings"
        onExit={() => router.replace('/(tabs)/business/bookings' as never)}
      />
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Top bar, no back arrow, terminal flow */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <Text style={styles.topBarTitle}>Rate Your Client</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 140 }}
      >
      <View style={styles.content}>
        {/* Client summary */}
        <View style={styles.avatar}>
          <Feather name="user" size={26} color="rgba(240,232,213,0.4)" />
        </View>
        <Text style={styles.title}>
          How was {booking?.clientFirstName ?? 'your client'} as a client?
        </Text>
        <Text style={styles.serviceDate}>
          {booking?.serviceLabel ?? ' '}
        </Text>

        {/* Star rating */}
        <View style={styles.ratingSection}>
          <Text style={styles.tapToRate}>Tap to rate</Text>
          <View style={styles.starRow}>
            {[0, 1, 2, 3, 4].map((i) => (
              <TouchableOpacity key={i} activeOpacity={0.7} onPress={() => handleRate(i + 1)}>
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

        {/* Structured dimensions */}
        {rating > 0 && (
          <View style={styles.dimSection}>
            <Text style={styles.tagsLabel}>ACCOUNTABILITY</Text>
            <DimensionRow label="Did they show up?" value={showedUp} onChange={setShowedUp} />
            <DimensionRow label="Were they on time?" value={onTime} onChange={setOnTime} />
            <DimensionRow
              label="Did they follow your policy?"
              value={followedPolicy}
              onChange={setFollowedPolicy}
            />
            <DimensionRow
              label="Was payment completed?"
              value={paymentCompleted}
              onChange={setPaymentCompleted}
            />
          </View>
        )}

        {/* Optional note */}
        {rating > 0 && (
          <View style={styles.noteSection}>
            <Text style={styles.tagsLabel}>PRIVATE NOTE — ONLY YOU CAN SEE THIS</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                multiline
                maxLength={150}
                placeholder="Optional context for yourself. Never shown to the client or other providers."
                placeholderTextColor="rgba(240,232,213,0.25)"
                textAlignVertical="top"
                value={note}
                onChangeText={setNote}
              />
            </View>
            <Text style={styles.privacyNote}>
              {note.length}/150 · Private to you. Clients and other providers only
              ever see the structured checks above, never this note.
            </Text>
          </View>
        )}
      </View>
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.submitBtn, !canSubmit && styles.submitBtnInactive]}
          activeOpacity={canSubmit ? 0.85 : 1}
          disabled={!canSubmit}
          onPress={handleSubmit}
        >
          <Text style={[styles.submitBtnText, !canSubmit && styles.submitBtnTextInactive]}>
            Submit Rating
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.skipLink}
          activeOpacity={0.7}
          onPress={handleSkip}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
        <Text style={styles.reminderText}>
          Client ratings help keep The Book safe for all providers.
        </Text>
      </View>
    </KeyboardAvoidingView>
  )
}

function DimensionRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean | null
  onChange: (v: boolean) => void
}) {
  return (
    <View style={styles.dimRow}>
      <Text style={styles.dimLabel}>{label}</Text>
      <View style={styles.dimToggle}>
        <TouchableOpacity
          style={[styles.dimBtn, value === true && styles.dimBtnActive]}
          activeOpacity={0.8}
          onPress={() => onChange(true)}
        >
          <Feather
            name="thumbs-up"
            size={15}
            color={value === true ? '#080808' : 'rgba(240,232,213,0.5)'}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.dimBtn, value === false && styles.dimBtnActive]}
          activeOpacity={0.8}
          onPress={() => onChange(false)}
        >
          <Feather
            name="thumbs-down"
            size={15}
            color={value === false ? '#080808' : 'rgba(240,232,213,0.5)'}
          />
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  dimSection: {
    marginTop: 28,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
  },
  dimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  dimLabel: {
    flex: 1,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  dimToggle: {
    flexDirection: 'row',
    gap: 8,
  },
  dimBtn: {
    width: 46,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimBtnActive: {
    backgroundColor: '#F0E8D5',
    borderColor: '#F0E8D5',
  },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    alignItems: 'center',
  },
  topBarTitle: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
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
  tagsLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
    textAlign: 'center',
  },
  noteSection: {
    marginTop: 20,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
  },
  inputContainer: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    padding: 14,
    minHeight: 80,
  },
  input: {
    flex: 1,
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
    minHeight: 52,
  },
  privacyNote: {
    marginTop: 8,
    fontSize: 10,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 14,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  submitBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  submitBtnText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  submitBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
  skipLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  skipText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  reminderText: {
    marginTop: 8,
    fontSize: 10,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
})
