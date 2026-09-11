import { useState, useEffect, useCallback } from 'react'
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native'
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ProviderProfile, { ProviderData, ProviderService } from '@/components/ProviderProfile'
import { startBooking } from '@/lib/startBooking'
import {
  REPORT_REASONS,
  REPORT_SUBMITTED_COPY,
  REPORT_FAILED_COPY,
  REPORT_LIMITED_COPY,
  iBlocked,
  submitReport,
  type ReportReason,
} from '@/lib/safety'
import { openSafetyMenu } from '@/lib/safetyMenu'
import ReportSheet from '@/components/ReportSheet'
import { useProvider, useCategories } from '../../hooks/useProviders'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cacheBustedPhoto } from '@/lib/image'
import { openMessageEntry } from '../../hooks/useMessaging'

export default function ProviderProfilePage() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { provider, services, loading } = useProvider(id as string)
  const { categories } = useCategories()
  const { user } = useAuth()
  const [isFollowing, setIsFollowing] = useState(false)
  const [followerCount, setFollowerCount] = useState(0)
  const [followBusy, setFollowBusy] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [saveBusy, setSaveBusy] = useState(false)
  const [portfolioImages, setPortfolioImages] = useState<string[]>([])
  const [reelVideos, setReelVideos] = useState<string[]>([])
  // Session 8. `null` = not known yet, and every control that depends on it
  // reads `=== true` so an unknown never hides a live provider's Book Now.
  const [blockedByMe, setBlockedByMe] = useState<boolean | null>(null)
  // Requirement G: a provider presented as bookable must actually be bookable.
  // `null` until known, and `=== false` is the only value that withdraws the
  // control — an unread answer must never hide a live provider's Book Now.
  const [bookable, setBookable] = useState<boolean | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reporting, setReporting] = useState(false)

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

  useEffect(() => {
    let cancelled = false
    const pid = provider?.id
    if (!pid) return
    ;(async () => {
      const { data, error } = await supabase.rpc('provider_is_bookable', { p_provider_id: pid })
      if (!cancelled) setBookable(error ? null : data === true)
    })()
    return () => {
      cancelled = true
    }
  }, [provider?.id])

  // Is this someone I have blocked? The answer changes what the PROFILE offers,
  // not just what the safety sheet says — see BLOCKED_PROFILE_COPY.
  //
  // ON FOCUS, not on mount. A plain `useEffect` keyed on [user, provider.user_id]
  // never re-runs, because neither value changes while the screen is in the
  // stack — so the single most likely path through this feature left it stale:
  //
  //     profile -> Message -> block from the thread -> back
  //
  // and the profile, still mounted, went on offering Book Now to someone the
  // user had just blocked. `useProvider` already refetches on focus, so the
  // screen was deliberately refreshing everything about this provider EXCEPT
  // this. The reverse was equally wrong: unblock from the thread, come back, and
  // it still read "You blocked this person".
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      const otherUserId = provider?.user_id
      if (!user || !otherUserId || otherUserId === user.id) return
      ;(async () => {
        const mine = await iBlocked(user.id, otherUserId)
        if (!cancelled) setBlockedByMe(mine)
      })()
      return () => {
        cancelled = true
      }
    }, [user, provider?.user_id]),
  )

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
    businessName: provider.business_name ?? undefined,
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
    isLive: false,
  }

  function handleBookNow() {
    if (!provider) return
    // Centralized booking-start boundary: establishes provider context (resetting
    // the per-attempt verification-notice acknowledgement) and evaluates the
    // verification gate in ONE place, routing to the notice or the service step.
    // See lib/startBooking.ts (CODE-DRIFT-001).
    startBooking({
      id: provider.id,
      name: provider.display_name,
      category: categoryName,
      location,
    })
  }

  // A user cannot act on their own provider profile. When the viewer owns this
  // provider, hide follow / save / message / book. The database also rejects
  // these self-referencing rows (see 20260825120000 migration); this keeps the
  // controls from being shown only to fail.
  const isOwnProfile = !!user && provider.user_id === user.id

  // ── SESSION 8: BLOCK / REPORT ────────────────────────────────────────────
  //
  // Two acts behind one control, because a person who needs either needs it
  // quickly and should not have to work out which submenu it lives in.
  //
  // `blocked` is null until known, and the sheet is not offered until it is: a
  // control that says "Block" to someone who has already blocked, or "Unblock"
  // to someone who has not, is worse than a moment's wait.
  function safetyMenu() {
    if (!user || !provider) return
    void openSafetyMenu({
      userId: user.id,
      otherUserId: provider.user_id,
      title: provider.display_name,
      blocked: blockedByMe,
      onBlockedChange: setBlockedByMe,
      onReport: () => setReportOpen(true),
    })
  }

  // The nine reasons are drawn in a sheet, NOT an Alert: Android renders at most
  // three Alert buttons and silently drops the rest, which on that platform hid
  // six categories and the Cancel control.
  async function handleReport(reason: ReportReason, notes: string | null) {
    if (!user || !provider) return
    setReporting(true)
    const res = await submitReport({
      reporterUserId: user.id,
      type: 'provider',
      reason,
      notes,
      reportedProviderId: provider.id,
      reportedUserId: provider.user_id,
    })
    setReporting(false)
    if (res.limited) {
      // THE SHEET STAYS OPEN. PD-088 requires the text be kept, and closing the
      // sheet would throw away what they wrote — the one thing a refused report
      // must never do.
      Alert.alert(REPORT_LIMITED_COPY.title, REPORT_LIMITED_COPY.body)
      return
    }
    setReportOpen(false)
    const copy = res.ok ? REPORT_SUBMITTED_COPY : REPORT_FAILED_COPY
    Alert.alert(copy.title, copy.body)
  }

  return (
    <>
    <ProviderProfile
      previewMode={false}
      provider={providerData}
      providerId={provider.id}
      isFollowing={isFollowing}
      isSaved={isSaved}
      isOwnProfile={isOwnProfile}
      // ITEM H: a profile reached directly (a saved provider, a message thread,
      // a past booking) is the one place a de-approved provider is still
      // visible — discovery already filters them out. Without this the client
      // would be offered Book Now and only discover the refusal at the end of
      // the flow, as a database error.
      // TWO CAUSES, ONE WITHDRAWAL. De-approval (item H) and "no availability
      // configured" (requirement G) both mean the same thing to a client: this
      // provider cannot take a booking right now. The profile, portfolio,
      // reviews, message control and every existing booking stay exactly as they
      // are in both cases — only the control that would lead nowhere is removed.
      acceptingBookings={provider.is_approved !== false && bookable !== false}
      // QA-JOURNEY-002. A block must withdraw the act it exists to prevent.
      // Before this, Book Now stayed on the bar of someone you had blocked and
      // the refusal arrived at the END of the booking flow as a raw PT427.
      // `=== true` on purpose: an unread block state must never hide the
      // control.
      blockedByMe={blockedByMe === true}
      onSafetyMenu={isOwnProfile ? undefined : safetyMenu}
      onBookNow={handleBookNow}
      onFollow={handleToggleFollow}
      onSave={handleToggleSave}
      onMessage={async () => {
        if (!user || !provider) return
        // Pre-booking contact is a message REQUEST (centralized entry).
        await openMessageEntry(user.id, provider.id, provider.display_name)
      }}
    />
    <ReportSheet
      visible={reportOpen}
      title="Report this provider"
      options={REPORT_REASONS}
      submitting={reporting}
      onCancel={() => setReportOpen(false)}
      onSubmit={handleReport}
    />
    </>
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
