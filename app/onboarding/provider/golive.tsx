import { useState } from 'react'
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ProviderProfile from '@/components/ProviderProfile'
import { useProviderStore } from '@/store/providerStore'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

function parseDurationMinutes(value: string): number {
  if (!value) return 60
  const trimmed = value.toLowerCase()
  const hourMatch = trimmed.match(/(\d+(?:\.\d+)?)\s*hr/)
  if (hourMatch) return Math.round(parseFloat(hourMatch[1]) * 60)
  const minMatch = trimmed.match(/(\d+)\s*min/)
  if (minMatch) return parseInt(minMatch[1], 10)
  const numMatch = trimmed.match(/(\d+)/)
  if (numMatch) return parseInt(numMatch[1], 10)
  return 60
}

export default function ProviderGoLive() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [isGoingLive, setIsGoingLive] = useState(false)
  const [showReviewMessage, setShowReviewMessage] = useState(false)
  const {
    name, businessName, category, customCategory, categoryId,
    location, bio, photo, banner, isMobile,
    services, portfolioPhotos, reels,
    reset,
  } = useProviderStore()

  const providerData = {
    name: name || 'Your Name',
    businessName: businessName || undefined,
    category: customCategory || category || 'Your Category',
    location: location || 'Houston, TX',
    bio: bio || undefined,
    photo: photo || undefined,
    banner: banner || undefined,
    services,
    portfolio: portfolioPhotos,
    reels,
    rating: 0,
    bookingCount: 0,
    followerCount: 0,
    followingCount: 0,
    isVerified: false,
    isLive: false,
  }

  async function handleGoLive() {
    if (isGoingLive) return
    setIsGoingLive(true)

    if (!user) {
      setShowReviewMessage(true)
      setTimeout(() => {
        reset()
        router.replace('/dashboard/provider')
      }, 2000)
      return
    }

    const displayName = name || 'Provider'
    const locationValue = location || null

    const { data: providerData, error: providerError } = await supabase
      .from('providers')
      .upsert({
        user_id: user.id,
        display_name: displayName,
        category_id: categoryId,
        bio: bio || null,
        location: locationValue,
        neighborhood: locationValue,
        is_approved: false,
        verification_status: 'pending',
        identity_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (providerError) {
      console.log('Provider save error:', providerError)
    }

    const providerDbId = providerData?.id

    if (services.length > 0 && providerDbId) {
      const { error: servicesError } = await supabase
        .from('provider_services')
        .upsert(
          services.map((service) => ({
            provider_id: providerDbId,
            name: service.name,
            description: null,
            price: Math.round((parseFloat(service.price) || 0) * 100),
            duration_minutes: parseDurationMinutes(service.duration),
            is_active: true,
          })),
        )

      if (servicesError) {
        console.log('Services save error:', servicesError)
      }
    }

    reset()
    setShowReviewMessage(true)

    setTimeout(() => {
      router.replace('/dashboard/provider')
    }, 2000)
  }

  return (
    <View style={styles.root}>
      {/* Progress bar — 100% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Non-scrollable top section */}
      <View style={[styles.topSection, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <View style={styles.topCenter}>
          <Text style={styles.topHeadline}>You're ready.</Text>
          <Text style={styles.topSub}>This is how clients will see you.</Text>
        </View>
        {/* Spacer to balance back btn */}
        <View style={styles.topSpacer} />
      </View>

      {/* Profile preview fills remaining space */}
      <View style={styles.profileWrap}>
        <ProviderProfile previewMode provider={providerData} />
      </View>

      {/* Fixed bottom */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        {showReviewMessage && (
          <View style={styles.reviewNote}>
            <Feather name="check-circle" size={14} color="#4CAF50" />
            <Text style={styles.reviewText}>
              Your profile is under review. We will notify you when you are approved and live on The Book.
            </Text>
          </View>
        )}

        {/* 14-day note */}
        <View style={styles.verifyNote}>
          <Feather name="clock" size={13} color="#C8922A" />
          <Text style={styles.verifyText}>
            Complete verification within 14 days of going live.
          </Text>
        </View>

        {/* Go Live button */}
        <Pressable
          style={[styles.goLiveBtn, isGoingLive && styles.goLiveBtnLoading]}
          onPress={handleGoLive}
          disabled={isGoingLive}
        >
          {isGoingLive ? (
            <ActivityIndicator color="#080808" />
          ) : (
            <Text style={styles.goLiveBtnText}>Go Live Now</Text>
          )}
        </Pressable>

        {/* Edit link */}
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => router.back()}
          style={styles.editWrap}
        >
          <Text style={styles.editText}>Edit my profile</Text>
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
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.1)',
    zIndex: 10,
  },
  progressFill: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  topCenter: {
    flex: 1,
    alignItems: 'center',
  },
  topHeadline: {
    fontSize: 28,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  topSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 4,
  },
  topSpacer: {
    width: 36,
    flexShrink: 0,
  },
  profileWrap: {
    flex: 1,
    overflow: 'hidden',
  },
  bottom: {
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  verifyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  verifyText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  reviewNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
  },
  reviewText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },
  goLiveBtn: {
    backgroundColor: '#C8922A',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  goLiveBtnLoading: {
    opacity: 0.7,
  },
  goLiveBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  editWrap: {
    alignItems: 'center',
    marginTop: 10,
  },
  editText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
})
