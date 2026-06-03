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
import { useAuth } from '../../context/AuthContext'

const RATING_RESPONSE: Record<number, string> = {
  5: 'Great client!',
  4: 'Good experience',
  3: 'It was okay',
  2: 'Some issues',
  1: 'Would not rebook',
}

const POSITIVE_TAGS = [
  'On time',
  'Great communication',
  'Easy to work with',
  'Respectful of space',
  'Will rebook',
  'Tipped well',
]

const MIXED_TAGS = [
  'Late arrival',
  'Hard to communicate with',
  'Last minute changes',
  'No show risk',
  'Would not rebook',
]

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
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [booking, setBooking] = useState<BookingForReview | null>(null)
  const [providerDbId, setProviderDbId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

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
        .from('clients')
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

  function handleRate(value: number) {
    setRating(value)
    setSelectedTags([])
  }

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag)
      if (prev.length >= 3) return prev
      return [...prev, tag]
    })
  }

  const tags = rating >= 4 ? POSITIVE_TAGS : MIXED_TAGS
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
        review_text: note.trim() || null,
        tags: selectedTags.length > 0 ? selectedTags : null,
      })

      if (error) {
        console.log('Client review insert error:', error)
        Alert.alert(
          'Could not submit rating',
          'Something went wrong. Please try again.',
          [{ text: 'OK' }],
        )
        setSubmitting(false)
        return
      }

      setSubmitting(false)
      router.replace('/dashboard/provider' as never)
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
    router.replace('/dashboard/provider' as never)
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

        {/* Client tags */}
        {rating > 0 && (
          <View style={styles.tagsSection}>
            <Text style={styles.tagsLabel}>WHAT STOOD OUT?</Text>
            <View style={styles.chipWrap}>
              {tags.map((tag) => {
                const selected = selectedTags.includes(tag)
                return (
                  <TouchableOpacity
                    key={tag}
                    style={[styles.chip, selected ? styles.chipSelected : styles.chipUnselected]}
                    activeOpacity={0.7}
                    onPress={() => toggleTag(tag)}
                  >
                    <Text style={selected ? styles.chipTextSelected : styles.chipTextUnselected}>
                      {tag}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        {/* Optional note */}
        {rating > 0 && (
          <View style={styles.noteSection}>
            <View style={styles.inputContainer}>
              <TextInput
                style={styles.input}
                multiline
                maxLength={200}
                placeholder="Any notes about this client? Only visible to you and our team."
                placeholderTextColor="rgba(240,232,213,0.25)"
                textAlignVertical="top"
                value={note}
                onChangeText={setNote}
              />
            </View>
            <Text style={styles.privacyNote}>
              Client ratings are private. Providers see their score as a range not the exact number or comments.
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

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
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
  tagsSection: {
    marginTop: 28,
    paddingHorizontal: 24,
    alignSelf: 'stretch',
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
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipSelected: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    borderColor: 'rgba(240,232,213,0.3)',
  },
  chipUnselected: {
    backgroundColor: 'transparent',
    borderColor: 'rgba(240,232,213,0.08)',
  },
  chipTextSelected: {
    fontSize: 12,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  chipTextUnselected: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
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
