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

export default function ProviderGoLive() {
  const insets = useSafeAreaInsets()
  const [isGoingLive, setIsGoingLive] = useState(false)
  const {
    name, businessName, category, customCategory,
    location, bio, photo, banner,
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

  function handleGoLive() {
    setIsGoingLive(true)
    setTimeout(() => {
      reset()
      router.replace('/(tabs)')
    }, 1500)
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
