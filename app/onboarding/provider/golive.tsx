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
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ProviderProfile from '@/components/ProviderProfile'
import { useProviderStore } from '@/store/providerStore'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { uploadMedia, uploadMultiple } from '@/lib/storage'

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
  const [uploadStage, setUploadStage] = useState('')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadTotal, setUploadTotal] = useState(0)

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
              router.replace('/dashboard/provider')
            },
          },
        ],
      )
      return
    }

    setIsGoingLive(true)

    try {
      // STAGE 1: profile photo
      let profilePhotoUrl: string | null = null
      if (photo) {
        setUploadStage('Uploading profile photo...')
        setUploadProgress(0)
        setUploadTotal(1)
        const result = await uploadMedia(photo, user.id, 'profile')
        profilePhotoUrl = result.url
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
        setUploadProgress(1)
      }

      // STAGE 3: portfolio photos
      let portfolioUrls: string[] = []
      if (portfolioPhotos.length > 0) {
        setUploadStage('Uploading portfolio...')
        setUploadTotal(portfolioPhotos.length)
        setUploadProgress(0)
        portfolioUrls = await uploadMultiple(
          portfolioPhotos,
          user.id,
          'portfolio',
          'provider-media',
          (completed, total) => {
            setUploadProgress(completed)
            setUploadTotal(total)
          },
        )
      }

      // STAGE 4: reels
      let reelUrls: string[] = []
      if (reels.length > 0) {
        setUploadStage('Uploading reels...')
        setUploadTotal(reels.length)
        setUploadProgress(0)
        const reelUris = reels.map((r) => (typeof r === 'string' ? r : (r as { uri: string }).uri))
        reelUrls = await uploadMultiple(
          reelUris,
          user.id,
          'reels',
          'provider-media',
          (completed, total) => {
            setUploadProgress(completed)
            setUploadTotal(total)
          },
        )
      }

      // STAGE 5: provider row
      setUploadStage('Saving your profile...')

      const locationValue = location || null

      const { data: providerData, error: providerError } = await supabase
        .from('providers')
        .upsert(
          {
            user_id: user.id,
            display_name: name || 'Provider',
            category_id: categoryId,
            bio: bio || null,
            location: locationValue,
            neighborhood: locationValue,
            profile_photo_url: profilePhotoUrl,
            cover_image_url: bannerUrl,
            is_approved: false,
            verification_status: 'pending',
            identity_verified: false,
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
        Alert.alert(
          'Something went wrong',
          'We could not save your profile. Please try again.',
          [{ text: 'OK' }],
        )
        return
      }

      const providerDbId = providerData?.id

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
            })),
          )
        }
      }

      // STAGE 7: portfolio + reels URL persistence.
      // TODO: wire portfolioUrls + reelUrls to provider_portfolio /
      // provider_reels tables when those schemas are confirmed. The
      // uploads already succeeded so the URLs are not lost, they are
      // just held in memory for this session.
      void portfolioUrls
      void reelUrls

      setUploadStage('')
      setIsGoingLive(false)

      setTimeout(() => {
        reset()
        router.replace('/dashboard/provider')
      }, 1500)
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
