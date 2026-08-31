import { useState } from 'react'
import {
  View,
  Text,
  Pressable,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ProviderProfile from '@/components/ProviderProfile'
import { buildAvailabilityRows } from '@/components/AvailabilityEditor'
import { useProviderStore } from '@/store/providerStore'
import { DEFAULT_POLICY, policyToPoliciesRow, policyToBookingPrefs } from '@/lib/policy'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { uploadMedia, uploadMultiple } from '@/lib/storage'

// A newly-live provider lands in the shared tabs (their studio is reached via
// the Me tab's My Studio entrance). One shell, no modes.
const POST_GOLIVE_ROUTE = '/(tabs)/'

export function parseDurationMinutes(value: string): number {
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
  const { user, retryRole } = useAuth()
  const [isGoingLive, setIsGoingLive] = useState(false)
  const [uploadStage, setUploadStage] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)

  const {
    name, businessName, category, customCategory, categoryId,
    location, bio, photo, banner, isMobile,
    services, portfolioPhotos, reels, availability, policy,
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
    if (!photo) {
      Alert.alert('Add a profile photo', 'You need a profile photo before going live.')
      return
    }

    // Dev-mode bypass: when DEV_MODE is on in app/_layout.tsx the auth gate
    // is open and there is no signed-in user. Let the tester complete the
    // flow optimistically (no DB write) so the dashboard is reachable.
    // Once DEV_MODE is flipped to false before TestFlight this branch
    // becomes unreachable in practice.
    if (!user) {
      Alert.alert(
        'Signed-out preview',
        'You are not signed in. Skipping save and continuing to your dashboard.',
        [
          {
            text: 'OK',
            onPress: () => {
              reset()
              router.replace(POST_GOLIVE_ROUTE as never)
            },
          },
        ],
      )
      return
    }

    setIsGoingLive(true)

    Sentry.addBreadcrumb({ message: 'Provider go live', category: 'onboarding' })

    try {
      // Per-file upload failures, surfaced to the provider at the end rather
      // than silently going live with missing media.
      const uploadFailures: { uri: string; error: string }[] = []

      // STAGE 1: profile photo
      let profilePhotoUrl: string | null = null
      if (photo) {
        setUploadStage('Uploading profile photo...')
        setUploadProgress(0)
        setUploadTotal(1)
        const result = await uploadMedia(photo, user.id, 'profile')
        profilePhotoUrl = result.url
        if (result.error) uploadFailures.push({ uri: 'profile photo', error: result.error })
        setUploadProgress(1)
      }

      // STAGE 2: cover photo
      let bannerUrl: string | null = null
      if (banner) {
        setUploadStage('Uploading cover photo...')
        setUploadProgress(0)
        setUploadTotal(1)
        const result = await uploadMedia(banner, user.id, 'banner')
        bannerUrl = result.url
        if (result.error) uploadFailures.push({ uri: 'cover photo', error: result.error })
        setUploadProgress(1)
      }

      // STAGE 3: portfolio photos
      let portfolioUrls: string[] = []
      if (portfolioPhotos.length > 0) {
        setUploadStage('Uploading portfolio...')
        setUploadTotal(portfolioPhotos.length)
        setUploadProgress(0)
        const portfolioResult = await uploadMultiple(
          portfolioPhotos,
          user.id,
          'portfolio',
          'posts-media',
          (completed, total) => {
            setUploadProgress(completed)
            setUploadTotal(total)
          },
        )
        portfolioUrls = portfolioResult.successful
        uploadFailures.push(...portfolioResult.failed)
      }

      // STAGE 4: reels
      let reelUrls: string[] = []
      if (reels.length > 0) {
        setUploadStage('Uploading reels...')
        setUploadTotal(reels.length)
        setUploadProgress(0)
        const reelUris = reels.map((r) => (typeof r === 'string' ? r : (r as { uri: string }).uri))
        const reelResult = await uploadMultiple(
          reelUris,
          user.id,
          'reels',
          'posts-media',
          (completed, total) => {
            setUploadProgress(completed)
            setUploadTotal(total)
          },
        )
        reelUrls = reelResult.successful
        uploadFailures.push(...reelResult.failed)
      }

      // Surface any upload failures. Continue the go-live with whatever files
      // succeeded rather than aborting the whole flow.
      if (uploadFailures.length > 0) {
        const totalMedia =
          (photo ? 1 : 0) + (banner ? 1 : 0) + portfolioPhotos.length + reels.length
        Alert.alert(
          'Some files did not upload',
          `${uploadFailures.length} of ${totalMedia} files failed to upload. Your profile will be saved with the files that succeeded. You can add the rest later from your dashboard.`,
        )
      }

      // STAGE 5: provider row
      setUploadStage('Saving your profile...')

      const locationValue = location || null
      const displayNameValue = name || 'Provider'

      // `username` is NOT NULL in the providers table with no default, so a
      // first-time insert must supply one. Generate a handle from the display
      // name (lowercase, spaces to underscores, strip anything else) with a
      // short numeric suffix to reduce collisions. This is a generated handle
      // for now; providers can change it once username editing exists.
      const generatedUsername =
        displayNameValue
          .toLowerCase()
          .replace(/\s+/g, '_')
          .replace(/[^a-z0-9_]/g, '') +
        '_' +
        Date.now().toString().slice(-4)

      // `is_approved` is intentionally omitted: the DB default is true, and the
      // Discover feed filters on is_approved = true. Sending false here would
      // hide every newly live provider, so we let the default make them visible.
      const { data: providerData, error: providerError } = await supabase
        .from('providers')
        .upsert(
          {
            user_id: user.id,
            display_name: displayNameValue,
            username: generatedUsername,
            business_name: businessName || null,
            category_id: categoryId,
            // When the provider picked "Other", category_id is null and the
            // typed value lives in customCategory. Persist it so every display
            // surface can fall back to it. When a real category was chosen,
            // clear any custom text so the two never conflict.
            custom_category:
              categoryId == null && customCategory?.trim()
                ? customCategory.trim()
                : null,
            bio: bio || null,
            location: locationValue,
            neighborhood: locationValue,
            profile_photo_url: profilePhotoUrl,
            cover_image_url: bannerUrl,
            verification_status: 'pending',
            identity_verified: false,
            // Mobile-provider flag comes from the availability step's toggle
            // (falls back to the legacy store field if the step was skipped).
            is_mobile: availability?.isMobile ?? isMobile,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )
        .select('id')
        .single()

      if (providerError) {
        console.log('Provider save error:', providerError)
        setIsGoingLive(false)
        setUploadStage('')
        // Surface the real reason rather than hiding every failure behind a
        // single generic line. If the save fails because of a schema or
        // permission problem (e.g. a missing column or an RLS rule), the tester
        // now sees exactly what went wrong so it can be reported and fixed.
        Alert.alert(
          'Something went wrong',
          providerError.message
            ? `We could not save your profile: ${providerError.message}`
            : 'We could not save your profile. Please try again.',
          [{ text: 'OK' }],
        )
        return
      }

      const providerDbId = providerData?.id

      // The providers row now exists. Re-resolve the session role so isProvider
      // flips to true in THIS session — AuthContext otherwise only resolves role
      // once at login, when this brand-new account still owned no rows (which is
      // what left a fresh provider stuck on the client Me screen).
      retryRole()

      // STAGE 6: services. Delete-then-insert avoids unique-key duplicates
      // when a provider edits and re-saves.
      if (services.length > 0 && providerDbId) {
        const { error: servicesDeleteError } = await supabase
          .from('provider_services')
          .delete()
          .eq('provider_id', providerDbId)

        if (!servicesDeleteError) {
          await supabase.from('provider_services').insert(
            services.map((s) => ({
              provider_id: providerDbId,
              name: s.name,
              description: null,
              price: parseFloat(s.price) || 0,
              duration_minutes: parseDurationMinutes(s.duration),
              is_active: true,
              // Deposit captured in the wizard. The onboarding form only offers a
              // fixed-amount deposit, so type is 'fixed'; providers can switch to
              // percentage later in the services dashboard.
              deposit_required: s.depositRequired,
              deposit_type: 'fixed',
              deposit_amount: s.depositRequired ? parseFloat(s.depositAmount) || 0 : 0,
            })),
          )
        }
      }

      // STAGE 7: portfolio + reels URL persistence into the `posts` table.
      // Portfolio photos and reels both live in `posts`, differentiated by
      // media_type ('image' vs 'video'). A failure here does NOT block Go Live
      // (the provider row already saved), but it is surfaced afterward so the
      // provider knows to re-add their media from the dashboard.
      let portfolioSaveFailed = false
      if (providerDbId && (portfolioUrls.length > 0 || reelUrls.length > 0)) {
        const postRows = [
          ...portfolioUrls.map((url, index) => ({
            provider_id: providerDbId,
            media_url: url,
            media_type: 'image',
            content_type: 'portfolio',
            visibility: 'public',
            is_active: true,
            is_demo: false,
            sort_order: index,
          })),
          ...reelUrls.map((url, index) => ({
            provider_id: providerDbId,
            media_url: url,
            media_type: 'video',
            content_type: 'portfolio',
            visibility: 'public',
            is_active: true,
            is_demo: false,
            sort_order: index,
          })),
        ]

        const { error: postsError } = await supabase.from('posts').insert(postRows)
        if (postsError) {
          console.log('Posts insert error:', postsError)
          portfolioSaveFailed = true
        }
      }

      // STAGE 8: availability (weekly hours, blackout dates, booking prefs).
      // Written after the providers row exists. Like the portfolio, a failure
      // here does NOT block Go Live — it is surfaced afterward so the provider
      // can re-set it from the dashboard.
      let availabilitySaveFailed = false
      if (providerDbId && availability) {
        try {
          const { hoursRows, blockedRows, preferences } = buildAvailabilityRows(
            providerDbId,
            availability,
          )
          const delHours = await supabase
            .from('provider_availability')
            .delete()
            .eq('provider_id', providerDbId)
          if (delHours.error) throw delHours.error
          const insHours = await supabase
            .from('provider_availability')
            .insert(hoursRows)
          if (insHours.error) throw insHours.error

          const delBlocked = await supabase
            .from('provider_blocked_dates')
            .delete()
            .eq('provider_id', providerDbId)
          if (delBlocked.error) throw delBlocked.error
          if (blockedRows.length > 0) {
            const insBlocked = await supabase
              .from('provider_blocked_dates')
              .insert(blockedRows)
            if (insBlocked.error) throw insBlocked.error
          }

          const upsertPrefs = await supabase
            .from('provider_booking_preferences')
            .upsert(preferences, { onConflict: 'provider_id' })
          if (upsertPrefs.error) throw upsertPrefs.error
        } catch (availErr) {
          console.log('Availability save error:', availErr)
          availabilitySaveFailed = true
        }
      }

      // STAGE 9: booking policy. Every provider gets a policy row (defaults are
      // real terms), so clients never agree to fabricated terms at booking.
      // Non-blocking, surfaced afterward like the availability/portfolio writes.
      let policySaveFailed = false
      if (providerDbId) {
        const effectivePolicy = policy ?? DEFAULT_POLICY
        try {
          // Fees / reschedule / travel → provider_policies.
          const { error: policyError } = await supabase
            .from('provider_policies')
            .upsert(policyToPoliciesRow(providerDbId, effectivePolicy), {
              onConflict: 'provider_id',
            })
          if (policyError) throw policyError

          // Cancellation window + grace → provider_booking_preferences (their
          // home). Only these columns are sent, so this merges with the
          // availability step's buffer/approval upsert on the same row.
          const { error: prefsError } = await supabase
            .from('provider_booking_preferences')
            .upsert(policyToBookingPrefs(providerDbId, effectivePolicy), {
              onConflict: 'provider_id',
            })
          if (prefsError) throw prefsError
        } catch (policyErr) {
          console.log('Policy save error:', policyErr)
          policySaveFailed = true
        }
      }

      // Empty availability (step skipped, or every day toggled off) means a
      // provider cannot be booked — worth telling them at go-live.
      const availabilityEmpty =
        !availability ||
        !Object.values(availability.schedule).some((d) => d.enabled)

      setUploadStage('')
      setIsGoingLive(false)

      const finishAndGo = () => {
        reset()
        router.replace(POST_GOLIVE_ROUTE as never)
      }

      // Go Live itself is never blocked. Collect any post-save issues and show
      // them together so the provider knows what to finish from the dashboard.
      const issues: string[] = []
      if (availabilitySaveFailed) {
        issues.push(
          'Your availability could not be saved. Set it from your dashboard under Availability so clients can book you.',
        )
      } else if (availabilityEmpty) {
        issues.push(
          "You haven't set your availability yet. Clients can't book you until you add it from your dashboard under Availability.",
        )
      }
      if (policySaveFailed) {
        issues.push(
          'Your cancellation and reschedule policies could not be saved. Set them from your dashboard under Policies.',
        )
      }
      if (portfolioSaveFailed) {
        issues.push(
          'Your photos and reels could not be saved. You can add them from your dashboard under Portfolio and Posts & Reels.',
        )
      }

      if (issues.length > 0) {
        Alert.alert(
          "You're live — a couple of things to finish",
          issues.join('\n\n'),
          [{ text: 'OK', onPress: finishAndGo }],
        )
        return
      }

      setTimeout(finishAndGo, 1500)
    } catch (err: any) {
      console.log('Go live error:', err)
      setIsGoingLive(false)
      setUploadStage('')
      Alert.alert(
        'Something went wrong',
        'Please check your connection and try again.',
        [{ text: 'OK' }],
      )
    }
  }

  const photoMissing = !photo
  const progressPct = uploadTotal > 0 ? uploadProgress / uploadTotal : 0

  return (
    <View style={styles.root}>
      {/* Progress bar: 100% */}
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
          <Text style={styles.topHeadline}>You&apos;re ready.</Text>
          <Text style={styles.topSub}>This is how clients will see you.</Text>
        </View>
        <View style={styles.topSpacer} />
      </View>

      {/* Profile preview fills remaining space */}
      <View style={styles.profileWrap}>
        <ProviderProfile previewMode provider={providerData} />
      </View>

      {/* Fixed bottom */}
      <View style={[styles.bottom, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.verifyNote}>
          <Feather name="clock" size={13} color="#C8922A" />
          <Text style={styles.verifyText}>
            Complete verification within 14 days of going live.
          </Text>
        </View>

        <Pressable
          style={[
            styles.goLiveBtn,
            (isGoingLive || photoMissing) && styles.goLiveBtnDisabled,
          ]}
          onPress={handleGoLive}
          disabled={isGoingLive || photoMissing}
        >
          {isGoingLive ? (
            <View style={styles.uploadingBox}>
              <ActivityIndicator color="#080808" size="small" style={{ marginBottom: 8 }} />
              <Text style={styles.uploadStageText}>
                {uploadStage || 'Going live...'}
              </Text>
              {uploadTotal > 1 && (
                <View style={styles.progressBarTrack}>
                  <View style={[styles.progressBarFill, { width: 200 * progressPct }]} />
                </View>
              )}
            </View>
          ) : (
            <Text style={styles.goLiveBtnText}>Go Live Now</Text>
          )}
        </Pressable>

        {isGoingLive ? (
          <Text style={styles.keepOpenNote}>
            Please keep the app open while we upload your content.
          </Text>
        ) : photoMissing ? (
          <Text style={styles.photoMissingNote}>
            Add a profile photo to go live.
          </Text>
        ) : (
          <TouchableOpacity
            activeOpacity={0.6}
            onPress={() => router.back()}
            style={styles.editWrap}
          >
            <Text style={styles.editText}>Edit my profile</Text>
          </TouchableOpacity>
        )}
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
  goLiveBtn: {
    backgroundColor: '#C8922A',
    borderRadius: 14,
    borderCurve: 'continuous',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: 12,
  },
  goLiveBtnDisabled: {
    backgroundColor: 'rgba(200,146,42,0.4)',
  },
  goLiveBtnText: {
    fontSize: 17,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  uploadingBox: {
    alignItems: 'center',
  },
  uploadStageText: {
    fontSize: 13,
    color: '#080808',
    fontFamily: 'Manrope_500Medium',
  },
  progressBarTrack: {
    width: 200,
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(8,8,8,0.2)',
    marginTop: 10,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: 3,
    borderRadius: 2,
    backgroundColor: '#080808',
  },
  keepOpenNote: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(8,8,8,0.6)',
    fontFamily: 'Manrope_400Regular',
  },
  photoMissingNote: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
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
