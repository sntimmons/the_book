import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TOTAL_SLOTS = 9

const TIPS = [
  {
    n: '1',
    bold: 'Use natural or ring light.',
    sub: 'Dark blurry photos lose clients.',
  },
  {
    n: '2',
    bold: 'Show finished results clearly.',
    sub: 'Before and after works well.',
  },
  {
    n: '3',
    bold: 'Your first photo is your hero shot.',
    sub: 'Make it your absolute best work.',
  },
]

export default function ProviderPortfolio() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [photos, setPhotos] = useState<string[]>([])
  const scrollRef = useRef<ScrollView>(null)

  // Force scroll to top on mount — prevents Stack navigator from injecting a content offset
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    }, 0)
    return () => clearTimeout(t)
  }, [])

  // 3 cols, two 12px gaps between them, within 24px padding each side
  const cellSize = (width - 48 - 24) / 3

  async function pickPhoto() {
    if (photos.length >= TOTAL_SLOTS) return
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      setPhotos((prev) => [...prev, result.assets[0].uri])
    }
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  function handleContinue() {
    if (photos.length === 0) return
    router.push('/onboarding/provider/reels')
  }

  const isActive = photos.length >= 1

  // CTA height estimate for gradient positioning
  const ctaHeight = insets.bottom + 132

  return (
    <View style={styles.root}>
      {/* Progress bar */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar — in flow, above ScrollView */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarLabel}>Your portfolio</Text>
        <Text style={styles.topBarStep}>Step 2 of 8</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 180 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <Text style={styles.headline}>Show clients why they{'\n'}should book you.</Text>

        <View style={styles.subheadRow}>
          <Feather name="star" size={14} color="#C8922A" style={{ marginTop: 2 }} />
          <Text style={styles.subheadText}>
            Portfolio photos are permanent on your profile. Post casual content in posts and stories.
          </Text>
        </View>

        {/* Photo grid — 3×3 */}
        <View style={styles.grid}>
          {Array.from({ length: TOTAL_SLOTS }).map((_, i) => {
            const uri = photos[i]
            if (uri) {
              return (
                <View key={i} style={[styles.cell, { width: cellSize, height: cellSize }]}>
                  <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                  <Pressable
                    style={styles.deleteBtn}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    onPress={() => removePhoto(i)}
                  >
                    <Feather name="x" size={12} color="#F0E8D5" />
                  </Pressable>
                </View>
              )
            }
            return (
              <Pressable
                key={i}
                style={({ pressed }) => [
                  styles.cell,
                  styles.emptyCell,
                  { width: cellSize, height: cellSize },
                  pressed && styles.emptyCellPressed,
                ]}
                onPress={pickPhoto}
              >
                <Feather name="plus" size={24} color="rgba(240,232,213,0.4)" />
              </Pressable>
            )
          })}
        </View>

        <Text style={styles.photoHelper}>
          {isActive ? `${photos.length} of 9 photos added` : 'Add at least 1 photo to continue.'}
        </Text>

        {/* Tips */}
        <Text style={styles.tipsLabel}>TIPS FOR GREAT PORTFOLIO PHOTOS</Text>
        <View style={styles.tipsList}>
          {TIPS.map((tip) => (
            <View key={tip.n} style={styles.tipRow}>
              <View style={styles.tipCircle}>
                <Text style={styles.tipNum}>{tip.n}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tipBold}>{tip.bold}</Text>
                <Text style={styles.tipSub}>{tip.sub}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Gradient fade above CTA */}
      <LinearGradient
        colors={['rgba(8,8,8,0)', '#080808']}
        style={[styles.gradientMask, { bottom: ctaHeight }]}
        pointerEvents="none"
      />

      {/* Fixed CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={[styles.continueBtn, !isActive && styles.continueBtnInactive]}
          onPress={handleContinue}
        >
          <Text style={[styles.continueBtnText, !isActive && styles.continueBtnTextInactive]}>
            Continue
          </Text>
        </Pressable>
        <TouchableOpacity
          activeOpacity={0.6}
          style={{ marginTop: 12, alignItems: 'center' }}
          onPress={() => router.push('/onboarding/provider/reels')}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
        <Text style={styles.skipNote}>
          You can add portfolio photos anytime from your dashboard.
        </Text>
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
    width: '25%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 34,
    marginBottom: 12,
  },
  subheadRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 32,
  },
  subheadText: {
    flex: 1,
    fontSize: 14,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cell: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyCell: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCellPressed: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderColor: 'rgba(240,232,213,0.35)',
  },
  deleteBtn: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(8,8,8,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoHelper: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 32,
  },
  tipsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  tipsList: {
    gap: 20,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  tipCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  tipNum: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
  },
  tipBold: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    lineHeight: 20,
  },
  tipSub: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.65)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
  },
  gradientMask: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 24,
    zIndex: 2,
    pointerEvents: 'none',
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
  },
  continueBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.1)',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  continueBtnTextInactive: {
    color: 'rgba(240,232,213,0.4)',
  },
  skipText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    textAlign: 'center',
  },
  skipNote: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 4,
  },
})
