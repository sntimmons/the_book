import { useState, useEffect } from 'react'
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ProviderProfile, { ProviderData, ProviderService } from '@/components/ProviderProfile'
import { useBookingStore } from '@/store/bookingStore'
import { useProvider, useCategories } from '../../hooks/useProviders'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cacheBustedPhoto } from '@/lib/image'
import { getOrCreateConversation } from '../../hooks/useMessaging'

export default function ProviderProfilePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { provider, services, loading } = useProvider(id as string)
  const { categories } = useCategories()
  const { setProvider } = useBookingStore()
  const { user } = useAuth()
  const [isFollowing, setIsFollowing] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followBusy, setFollowBusy] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [portfolioImages, setPortfolioImages] = useState<string[]>([])
  const [reelVideos, setReelVideos] = useState<string[]>([])

  // Load real follow state + a live follower count once the provider (and, for
  // the per-user state, the auth user) resolve. Without this the button always
  // reset to "Follow" on reload regardless of the persisted row.
  useEffect(() => {
    let cancelled = false
    const providerId = provider?.id
    if (!providerId) return
    ;(async () => {
      // Live follower count — count rows rather than trusting the stale
      // providers.follower_count column (no trigger maintains it).
      const { count } = await supabase
        .from('provider_follows')
        .select('*', { count: 'exact', head: true })
        .eq('provider_id', providerId)
      if (!cancelled && count != null) setFollowerCount(count)

      // Does THIS user already follow?
      if (user?.id) {
        const { data: mine } = await supabase
          .from('provider_follows')
          .select('id')
          .eq('provider_id', providerId)
          .eq('follower_user_id', user.id)
          .maybeSingle()
        if (!cancelled) setIsFollowing(!!mine)
      } else if (!cancelled) {
        setIsFollowing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [provider?.id, user?.id])

  // Follow / unfollow with optimistic UI and revert-on-failure (no silent fail).
  async function handleToggleFollow() {
    if (!user || !provider || followBusy) return
    const providerId = provider.id
    const wasFollowing = isFollowing

    setFollowBusy(true)
    setIsFollowing(!wasFollowing)
    setFollowerCount((c) => Math.max(0, c + (wasFollowing ? -1 : 1)))

    try {
      const { error } = wasFollowing
        ? await supabase
            .from('provider_follows')
            .delete()
            .eq('provider_id', providerId)
            .eq('follower_user_id', user.id)
        : await supabase
            .from('provider_follows')
            .insert({ provider_id: providerId, follower_user_id: user.id })
      if (error) throw error
    } catch (err: any) {
      // Revert the optimistic change so the UI never shows a state that did
      // not persist.
      setIsFollowing(wasFollowing)
      setFollowerCount((c) => Math.max(0, c + (wasFollowing ? 1 : -1)))
      if (err?.code === '42501') {
        console.log('FOLLOW RLS gap (42501) — INSERT/DELETE policy not live:', err?.message)
      } else {
        console.log('Follow write error:', err)
      }
      Alert.alert('Could not update', 'Please try again.')
    } finally {
      setFollowBusy(false)
    }
  }

  // Load real saved state once the provider + auth user resolve, so the
  // bookmark reflects the persisted row after reload.
  useEffect(() => {
    let cancelled = false
    const providerId = provider?.id
    if (!providerId || !user?.id) {
      setIsSaved(false)
      return
    }
    ;(async () => {
      const { data: mine } = await supabase
        .from('saved_providers')
        .select('id')
        .eq('provider_id', providerId)
        .eq('user_id', user.id)
        .maybeSingle()
      if (!cancelled) setIsSaved(!!mine)
    })()
    return () => {
      cancelled = true
    }
  }, [provider?.id, user?.id])

  // Save / unsave with optimistic UI and revert-on-failure (no silent fail).
  async function handleToggleSave() {
    if (!user || !provider || saveBusy) return
    const providerId = provider.id
    const wasSaved = isSaved

    setSaveBusy(true)
    setIsSaved(!wasSaved)

    try {
      const { error } = wasSaved
        ? await supabase
            .from('saved_providers')
            .delete()
            .eq('provider_id', providerId)
            .eq('user_id', user.id)
        : await supabase
            .from('saved_providers')
            .insert({ user_id: user.id, provider_id: providerId })
      if (error) throw error
    } catch (err: any) {
      // Revert so the bookmark never shows a state that did not persist.
      setIsSaved(wasSaved)
      if (err?.code === '42501') {
        console.log('SAVE RLS gap (42501) — INSERT/DELETE policy not live:', err?.message)
      } else {
        console.log('Save write error:', err)
      }
      Alert.alert('Could not update', 'Please try again.')
    } finally {
      setSaveBusy(false)
    }
  }

  // Load this provider's real content from the posts table. Images populate the
  // Portfolio tab; videos populate the profile's Reels sub-section. Both are
  // mapped to plain URL arrays, the shape ProviderProfile already renders.
  useEffect(() => {
    let cancelled = false
    const providerId = provider?.id
    if (!providerId) {
      setPortfolioImages([])
      setReelVideos([])
      return
    }
    ;(async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, media_url, media_type, content_type, caption, sort_order')
        .eq('provider_id', providerId)
        .eq('is_active', true)
        .eq('is_demo', false)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (error) {
        console.log('Fetch provider posts error:', error)
        return
      }
      const rows = (data as { media_url: string; media_type: string }[]) ?? []
      setPortfolioImages(
        rows.filter((r) => r.media_type === 'image').map((r) => r.media_url),
      )
      setReelVideos(
        rows.filter((r) => r.media_type === 'video').map((r) => r.media_url),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [provider?.id])

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
    categories.find((c) => c.id === provider.category_id)?.name ||
    provider.custom_category ||
    'Provider'

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
    photo: cacheBustedPhoto(provider.profile_photo_url),
    banner: provider.cover_image_url ?? undefined,
    services: profileServices,
    portfolio: portfolioImages,
    reels: reelVideos,
    rating: ratingValue,
    bookingCount: provider.total_bookings ?? 0,
    followerCount: followerCount,
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
      providerId={provider.id}
      isFollowing={isFollowing}
      isSaved={isSaved}
      onBookNow={handleBookNow}
      onFollow={handleToggleFollow}
      onSave={handleToggleSave}
      onMessage={async () => {
        if (!user) return
        const convoId = await getOrCreateConversation(user.id, provider.id)
        if (convoId) router.push(`/messages/${convoId}` as any)
      }}
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
