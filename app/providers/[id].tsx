import { useLocalSearchParams } from 'expo-router'
import ProviderProfile, { ProviderData } from '@/components/ProviderProfile'

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
  const provider = MOCK_PROVIDERS[id ?? ''] ?? MOCK_PROVIDERS.default

  return (
    <ProviderProfile
      previewMode={false}
      provider={provider}
      onBookNow={() => console.log('book', id)}
      onFollow={() => console.log('follow', id)}
      onMessage={() => console.log('message', id)}
    />
  )
}
