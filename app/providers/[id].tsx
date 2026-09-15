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
import { useTheme } from '@/context/ThemeContext'
import { supabase } from '@/lib/supabase'
import { cacheBustedPhoto } from '@/lib/image'
import {
  NO_PUBLIC_BOOKING_TERMS,
  PublicBookingTerms,
  fetchPublicBookingTerms,
} from '@/lib/publicBookingTerms'
import { openMessageEntry } from '../../hooks/useMessaging'

export default function ProviderProfilePage() {
  // Phase 3B: the skeleton and the not-found state belong to this screen, so
  // they answer the same appearance as the profile they stand in for.
  const { colors } = useTheme()
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
  // Process media is a THIRD partition of the same posts read, not a new query
  // and not a new content type: `posts.content_type` has allowed 'process' since
  // the canonical baseline. It is the provider's own account of how an
  // appointment goes.
  const [processMedia, setProcessMedia] = useState<string[]>([])
  // The provider's REAL cancellation window and lateness grace. Nulls mean the
  // provider has not published them and the section stays absent — never the
  // platform default dressed as their term (PD-125).
  const [bookingTerms, setBookingTerms] = useState<PublicBookingTerms>(NO_PUBLIC_BOOKING_TERMS)
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
      // Live follower count, through an RPC rather than a row count. The rows
      // carry real account ids, so `provider_follows` is readable only for your
      // OWN follows now — a public `count` over other people's rows was handing
      // anyone a supply of account identifiers. The number is still live, and
      // still preferred over the stale providers.follower_count column (which no
      // trigger maintains).
      const { data: followers } = await supabase.rpc('provider_follower_count', {
        p_provider_id: providerId,
      })
      if (!cancelled && typeof followers === 'number') setFollowerCount(followers)

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
      setProcessMedia([])
      return
    }
    ;(async () => {
      // PD-089: `posts_visible`, not `posts`. This screen used to read the base
      // table, so a provider's portfolio, reels and process shots rendered in
      // full across a block in either direction — on the one surface the whole
      // discovery funnel routes into (CODE-DRIFT-008).
      //
      // `is_active` is dropped from the filter because the view already enforces
      // it; `is_demo` stays, because the view deliberately carries the column
      // rather than filtering on it — demo content is a seeding concern, not a
      // visibility one. `sort_order` is the provider's own curation of how their
      // work reads, and 20261138000000 added it to the view precisely so this
      // screen would not have to return to the base table to get it.
      const { data, error } = await supabase
        .from('posts_visible')
        .select('id, media_url, media_type, content_type, caption, sort_order')
        .eq('provider_id', providerId)
        .eq('is_demo', false)
        .order('sort_order', { ascending: true })
      if (cancelled) return
      if (error) {
        console.log('Fetch provider posts error:', error)
        return
      }
      const rows =
        (data as { media_url: string; media_type: string; content_type: string }[]) ?? []
      // Process is partitioned OUT of the other two rather than layered on top,
      // so a process clip cannot also appear as a portfolio shot or a reel and
      // make one provider's three posts look like nine.
      const isProcess = (r: { content_type: string }) => r.content_type === 'process'
      setProcessMedia(rows.filter(isProcess).map((r) => r.media_url))
      setPortfolioImages(
        rows.filter((r) => !isProcess(r) && r.media_type === 'image').map((r) => r.media_url),
      )
      setReelVideos(
        rows.filter((r) => !isProcess(r) && r.media_type === 'video').map((r) => r.media_url),
      )
    })()
    return () => {
      cancelled = true
    }
  }, [provider?.id])

  useEffect(() => {
    let cancelled = false
    const pid = provider?.id
    if (!pid) {
      setBookingTerms(NO_PUBLIC_BOOKING_TERMS)
      return
    }
    ;(async () => {
      const t = await fetchPublicBookingTerms(pid)
      if (!cancelled) setBookingTerms(t)
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
      <View style={[s.loadingRoot, { paddingTop: insets.top, backgroundColor: colors.bgCanvas }]}>
        <View style={[s.skeletonBanner, { backgroundColor: colors.bgSubtle }]} />
        <View style={[s.skeletonPhoto, { backgroundColor: colors.bgSubtle }]} />
        <View style={[s.skeletonBar, { width: 180, marginTop: 16, backgroundColor: colors.bgSubtle }]} />
        <View style={[s.skeletonBar, { width: 120, marginTop: 10, backgroundColor: colors.bgSubtle }]} />
        <View style={s.skeletonStats}>
          <View style={[s.skeletonStat, { backgroundColor: colors.bgSubtle }]} />
          <View style={[s.skeletonStat, { backgroundColor: colors.bgSubtle }]} />
          <View style={[s.skeletonStat, { backgroundColor: colors.bgSubtle }]} />
          <View style={[s.skeletonStat, { backgroundColor: colors.bgSubtle }]} />
        </View>
        <ActivityIndicator color={colors.textSecondary} style={{ marginTop: 32 }} />
      </View>
    )
  }

  if (!provider) {
    return (
      <View style={[s.errorRoot, { paddingTop: insets.top + 60, backgroundColor: colors.bgCanvas }]}>
        <Text style={[s.errorTitle, { color: colors.textPrimary }]}>Provider not found</Text>
        <TouchableOpacity
          style={[s.errorBtn, { backgroundColor: colors.actionPrimary }]}
          activeOpacity={0.85}
          onPress={() => router.replace('/(tabs)/' as any)}
        >
          <Text style={[s.errorBtnText, { color: colors.textOnAction }]}>Back to discovery</Text>
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
    // Already on provider_services and already public-readable; it simply never
    // reached the profile before.
    description: svc.description ?? undefined,
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
    process: processMedia,
    specialties: provider.specialties ?? undefined,
    bookingTerms,
    username: provider.username ?? undefined,
    rating: ratingValue,
    ratingClientCount: (provider as { rating_client_count?: number }).rating_client_count ?? 0,
    bookingCount: provider.total_bookings ?? 0,
    followerCount: followerCount,
    reviewCount: provider.review_count ?? 0,
  }

  // ONE booking entry for this screen. Both the identity-area control and the
  // sticky bar call this, and so does a service row — the only difference is
  // whether a service travels with it. Nothing else may start a booking here
  // (CODE-DRIFT-001).
  function handleBookNow(service?: ProviderService) {
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
      // Preselection only. The attempt still enters at the service step and
      // still walks every step after it; the gate above is unchanged, so a row
      // tap cannot route around the verification notice.
      service:
        service && service.id
          ? {
              id: service.id,
              name: service.name,
              price: service.price,
              duration: service.duration ?? '',
              depositRequired: false,
              depositAmount: '0',
              addOns: [],
            }
          : undefined,
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
      onBookNow={() => handleBookNow()}
      onSelectService={(service) => handleBookNow(service)}
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
    alignItems: 'center',
  },
  skeletonBanner: {
    height: 200,
    width: '100%',
  },
  skeletonPhoto: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginTop: -36,
    borderWidth: 3,
  },
  skeletonBar: {
    height: 14,
    borderRadius: 4,
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
  },
  errorRoot: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'Manrope_700Bold',
    marginBottom: 24,
  },
  errorBtn: {
    borderRadius: 14,
    paddingHorizontal: 24,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBtnText: {
    fontSize: 14,
    fontFamily: 'Manrope_700Bold',
  },
})
