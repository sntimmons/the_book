import { useState } from 'react'
import { useLocalSearchParams } from 'expo-router'
import { router } from 'expo-router'
import ProviderProfile, { ProviderData } from '@/components/ProviderProfile'
import { useBookingStore } from '@/store/bookingStore'

// Static mock data — replace with a Supabase fetch keyed on `id` when the API is ready.
const MOCK_PROVIDERS: Record<string, ProviderData> = {
  default: {
    name: 'Marcus Johnson',
    businessName: 'Blade Cuts Studio',
    category: 'Barber',
    location: 'Midtown, Houston',
    bio: 'Master barber with 8 years experience. Specializing in fades, lineups, and creative designs. Book your spot today.',
    rating: 4.9,
    bookingCount: 312,
    followerCount: 847,
    followingCount: 14,
    isVerified: true,
    isLive: true,
    services: [
      { id: '1', name: 'Classic Fade',    price: '45',  duration: '45 min' },
      { id: '2', name: 'Lineup',          price: '25',  duration: '20 min' },
      { id: '3', name: 'Full Cut + Beard', price: '65',  duration: '60 min',
        depositRequired: true, depositAmount: '20' },
    ],
  },
}

export default function ProviderProfilePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const baseProvider = MOCK_PROVIDERS[id ?? ''] ?? MOCK_PROVIDERS.default
  const { setProvider } = useBookingStore()
  const [isFollowing, setIsFollowing] = useState(false)

  const provider: ProviderData = {
    ...baseProvider,
    followerCount: (baseProvider.followerCount ?? 0) + (isFollowing ? 1 : 0),
  }

  function handleBookNow() {
    setProvider(id ?? '1', provider.name, provider.category, provider.location)
    router.push('/book/service')
  }

  return (
    <ProviderProfile
      previewMode={false}
      provider={provider}
      isFollowing={isFollowing}
      onBookNow={handleBookNow}
      onFollow={() => setIsFollowing((prev) => !prev)}
      // TODO: replace with real provider id from props
      onMessage={() => router.push('/messages/1' as any)}
    />
  )
}
