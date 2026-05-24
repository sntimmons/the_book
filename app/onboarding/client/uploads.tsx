import { View, Text, ScrollView, Pressable, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const PHOTO_SLOTS = [0, 1, 2]
const VIDEO_SLOTS = [0, 1]

export default function ClientUploads() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      {/* Progress bar 75% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarLabel}>Build your vibe</Text>
        <Text style={styles.topBarStep}>Step 3 of 4</Text>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.headline}>Show them what you&apos;re about.</Text>
        <Text style={styles.subtext}>
          Add photos and videos that show your style.{'\n'}
          This is optional but helps providers connect{'\n'}
          with clients faster.
        </Text>

        {/* Photos section */}
        <Text style={styles.sectionLabel}>PHOTOS</Text>
        <View style={styles.photoGrid}>
          {PHOTO_SLOTS.map((i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.photoBox,
                pressed && styles.photoBoxPressed,
              ]}
              onPress={() => console.log('open photo picker')}
            >
              <Text style={styles.photoIcon}>⊞</Text>
              <Text style={styles.photoBoxLabel}>Add photo</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.mediaHint}>Add up to 9 photos</Text>

        <View style={styles.sectionGap} />

        {/* Reels section */}
        <Text style={styles.sectionLabel}>REELS</Text>
        <View style={styles.reelRow}>
          {VIDEO_SLOTS.map((i) => (
            <Pressable
              key={i}
              style={({ pressed }) => [
                styles.reelBox,
                pressed && styles.reelBoxPressed,
              ]}
              onPress={() => console.log('open video picker')}
            >
              <Text style={styles.videoIcon}>▷</Text>
              <Text style={styles.reelLabel}>Add reel</Text>
              <Text style={styles.reelSublabel}>Up to 60 seconds</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.mediaHint}>
          Short clips of your style, routine,{'\n'}
          or favorite looks.
        </Text>

        <View style={styles.sectionGap} />

        {/* Skip */}
        <TouchableOpacity
          activeOpacity={0.6}
          onPress={() => router.push('/onboarding/client/payment')}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [styles.continueBtn, pressed && { opacity: 0.88 }]}
          onPress={() => router.push('/onboarding/client/payment')}
        >
          <Text style={styles.continueBtnText}>Continue</Text>
        </Pressable>
        <Text style={styles.ctaNote}>You can add more later in your profile.</Text>
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
    width: '75%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
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
  },
  topBarLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  topBarStep: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 140,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 36,
    marginTop: 24,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 32,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  photoGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  photoBox: {
    flex: 1,
    aspectRatio: 1,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  photoBoxPressed: {
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderColor: 'rgba(240,232,213,0.2)',
  },
  photoIcon: {
    fontSize: 24,
    color: 'rgba(240,232,213,0.2)',
    lineHeight: 28,
  },
  photoBoxLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
  },
  mediaHint: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 16,
  },
  sectionGap: {
    height: 32,
  },
  reelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reelBox: {
    width: '47%',
    aspectRatio: 9 / 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  reelBoxPressed: {
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderColor: 'rgba(240,232,213,0.2)',
  },
  videoIcon: {
    fontSize: 28,
    color: 'rgba(240,232,213,0.2)',
    lineHeight: 34,
  },
  reelLabel: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  reelSublabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.15)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  skipText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  continueBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 8,
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  ctaNote: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
})
