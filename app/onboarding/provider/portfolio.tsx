import { useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useWindowDimensions } from 'react-native'

const TOTAL_SLOTS = 9

const TIPS = [
  {
    n: '1',
    text: 'Use natural or ring light.\nDark blurry photos lose clients.',
  },
  {
    n: '2',
    text: 'Show finished results clearly.\nBefore and after works well.',
  },
  {
    n: '3',
    text: 'Your first photo is your hero shot.\nMake it your absolute best work.',
  },
]

export default function ProviderPortfolio() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [photos, setPhotos] = useState<string[]>([])

  // Cell size: full width minus 48px horizontal padding, divided into 3 cols with 2 gaps of 3px
  const cellSize = (width - 48 - 6) / 3

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

  return (
    <View style={styles.root}>
      {/* Progress bar — 25% */}
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
        <Text style={styles.topBarLabel}>Your portfolio</Text>
        <Text style={styles.topBarStep}>Step 2 of 8</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.headline}>Show them your work.</Text>
        <Text style={styles.subtext}>
          Add your best photos. This is what clients see when deciding to book you.
        </Text>

        {/* Quality note */}
        <View style={styles.qualityNote}>
          <Feather name="star" size={14} color="#C8922A" style={{ marginTop: 2 }} />
          <Text style={styles.qualityText}>
            Portfolio photos are permanent on your profile. Post casual content in posts and stories.
          </Text>
        </View>

        {/* Photo grid — 3 cols, edge to edge within padding */}
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
                <Feather name="plus" size={20} color="rgba(240,232,213,0.2)" />
              </Pressable>
            )
          })}
        </View>

        {/* Photo count */}
        <Text style={styles.photoCount}>
          {photos.length === 0
            ? 'Add at least 1 photo to continue'
            : `${photos.length} of 9 photos added`}
        </Text>

        {/* Add more row */}
        {photos.length > 0 && photos.length < TOTAL_SLOTS && (
          <TouchableOpacity
            activeOpacity={0.7}
            style={styles.addMoreRow}
            onPress={pickPhoto}
          >
            <Feather name="plus" size={16} color="rgba(240,232,213,0.3)" />
            <Text style={styles.addMoreText}>Add more photos</Text>
          </TouchableOpacity>
        )}

        {/* Tips section */}
        <Text style={styles.tipsLabel}>TIPS FOR GREAT PORTFOLIO PHOTOS</Text>
        <View style={styles.tipsList}>
          {TIPS.map((tip) => (
            <View key={tip.n} style={styles.tipRow}>
              <View style={styles.tipNumCircle}>
                <Text style={styles.tipNum}>{tip.n}</Text>
              </View>
              <Text style={styles.tipText}>{tip.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

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
          style={styles.skipWrap}
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
    marginBottom: 8,
  },
  qualityNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 28,
  },
  qualityText: {
    flex: 1,
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 3,
  },
  cell: {
    overflow: 'hidden',
    borderRadius: 4,
  },
  emptyCell: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCellPressed: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderColor: 'rgba(240,232,213,0.2)',
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

  // Count + add more
  photoCount: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 8,
  },
  addMoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginBottom: 32,
  },
  addMoreText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
  },

  // Tips
  tipsLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 8,
  },
  tipsList: {
    gap: 10,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  tipNumCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  tipNum: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
  },
  tipText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },

  // CTA
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
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  continueBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
  skipWrap: {
    alignItems: 'center',
    marginTop: 10,
  },
  skipText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  skipNote: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
})
