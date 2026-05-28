import { useState } from 'react'
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ProviderProfile, { ProviderData, ProviderService } from '@/components/ProviderProfile'
import { useBookingStore } from '@/store/bookingStore'
import { useProvider, useCategories } from '../../hooks/useProviders'

export default function ProviderProfilePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { provider, services, loading } = useProvider(id as string)
  const { categories } = useCategories()
  const { setProvider } = useBookingStore()
  const [isFollowing, setIsFollowing] = useState(false)

  if (loading) {
    return (
      <View style={[s.loadingRoot, { paddingTop: insets.top }]}>
        <View style={s.skeletonBanner} />
        <View style={s.skeletonPhoto} />
        <View style={[s.skeletonBar, { width: 180, marginTop: 16 }]} />
        <View style={[s.skeletonBar, { width: 120, marginTop: 10 }]} />
        <View style={s.skeletonStats}>
          <View style={s.skeletonStat} />
          <View style={s.skeletonStat} />
          <View style={s.skeletonStat} />
          <View style={s.skeletonStat} />
        </View>
        <ActivityIndicator color="rgba(240,232,213,0.4)" style={{ marginTop: 32 }} />
      </View>
    )
  }

  if (!provider) {
    return (
      <View style={[s.errorRoot, { paddingTop: insets.top + 60 }]}>
        <Text style={s.errorTitle}>Provider not found</Text>
        <TouchableOpacity
          style={s.errorBtn}
          activeOpacity={0.85}
          onPress={() => router.replace('/(tabs)/' as any)}
        >
          <Text style={s.errorBtnText}>Back to discovery</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const categoryName =
    categories.find((c) => c.id === provider.category_id)?.name || 'Provider'

  const location = provider.neighborhood ?? provider.location ?? ''

  const profileServices: ProviderService[] = services.map((svc) => ({
    id: svc.id,
    name: svc.name,
    price: svc.price.toFixed(2),
    duration: `${svc.duration_minutes} min`,
    depositRequired: false,
    depositAmount: '0',
  }))

  const ratingValue = provider.average_rating ?? provider.rating ?? 0

  const providerData: ProviderData = {
    name: provider.display_name,
    category: categoryName,
    location,
    bio: provider.bio ?? undefined,
    photo: provider.profile_photo_url ?? undefined,
    banner: provider.cover_image_url ?? undefined,
    services: profileServices,
    rating: ratingValue,
    bookingCount: provider.total_bookings ?? 0,
    followerCount: (provider.follower_count ?? 0) + (isFollowing ? 1 : 0),
    followingCount: 0,
    isVerified: provider.identity_verified,
    isLive: false,
  }

  function handleBookNow() {
    if (!provider) return
    setProvider(provider.id, provider.display_name, categoryName, location)
    router.push('/book/service')
  }

  return (
    <ProviderProfile
      previewMode={false}
      provider={providerData}
      isFollowing={isFollowing}
      onBookNow={handleBookNow}
      onFollow={() => setIsFollowing((prev) => !prev)}
      onMessage={() => router.push(`/messages/${provider.id}` as any)}
    />
  )
}

const s = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
  },
  skeletonBanner: {
    height: 200,
    width: '100%',
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  skeletonPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginTop: -36,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 3,
    borderColor: '#080808',
  },
  skeletonBar: {
    height: 14,
    borderRadius: 4,
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  skeletonStats: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
    paddingHorizontal: 20,
  },
  skeletonStat: {
    flex: 1,
    height: 40,
    borderRadius: 6,
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  errorRoot: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 24,
  },
  errorBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    paddingHorizontal: 24,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBtnText: {
    fontSize: 14,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
})
