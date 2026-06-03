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

const RATING_RESPONSE: Record<number, string> = {
  5: 'Amazing!',
  4: 'Really good!',
  3: 'It was okay',
  2: 'Not great',
  1: 'Not good',
}

export default function SatisfactionCheck() {
  const { id } = useLocalSearchParams<{ id?: string }>()
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [providerName, setProviderName] = useState<string | null>(null)

  // Resolve the real provider name from the booking (bookings -> provider_id ->
  // providers.display_name). Mirrors the submitted.tsx pattern. Data only.
  const loadProvider = useCallback(async () => {
    if (!id) return
    try {
      const { data: booking } = await supabase
        .from('bookings')
        .select('provider_id')
        .eq('id', id)
        .maybeSingle<{ provider_id: string }>()
      if (!booking?.provider_id) return

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

  const canContinue = rating > 0

  // Thread the booking id + the star chosen here into the review screen.
  // Param-only change, no UI edits.
  function reviewHref() {
    const parts: string[] = []
    if (id) parts.push('id=' + id)
    if (rating > 0) parts.push('rating=' + rating)
    return '/post-booking/review' + (parts.length ? '?' + parts.join('&') : '')
  }

  function issueHref() {
    return id ? '/post-booking/issue?id=' + id : '/post-booking/issue'
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
          <Text style={styles.serviceDate}>Classic Full Set · May 28</Text>

          {/* Star rating */}
          <View style={styles.ratingSection}>
            <Text style={styles.tapToRate}>Tap to rate</Text>
            <View style={styles.starRow}>
              {[0, 1, 2, 3, 4].map((i) => (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.7}
                  onPressIn={() => setHoveredRating(i + 1)}
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
                Yes, it was great
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryBtn}
              activeOpacity={0.7}
              onPress={() => router.push(issueHref() as never)}
            >
              <Text style={styles.secondaryBtnText}>Something wasn't right</Text>
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
