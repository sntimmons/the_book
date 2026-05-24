import { useState } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TOTAL_SLOTS = 6

interface Reel {
  uri: string
  duration?: string
}

const TIPS = [
  {
    n: '1',
    text: 'Before and after transformations.\nClients love the reveal moment.',
  },
  {
    n: '2',
    text: 'Your process while you work.\nAuthentic behind the scenes content.',
  },
  {
    n: '3',
    text: 'Personality clips. Clients book people\nthey feel comfortable with.',
  },
]

export default function ProviderReels() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const [reels, setReels] = useState<Reel[]>([])

  // 2 columns, 1 inner gap of 10px, within 24px horizontal padding each side
  const cellWidth = (width - 48 - 10) / 2

  async function pickReel() {
    if (reels.length >= TOTAL_SLOTS) return
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!granted) return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['videos'],
      allowsEditing: true,
      videoMaxDuration: 60,
      quality: 0.8,
    })
    if (!result.canceled && result.assets[0]) {
      const raw = result.assets[0].duration ?? 0
      const secs = Math.round(raw / 1000)
      const duration = '0:' + secs.toString().padStart(2, '0')
      setReels((prev) => [...prev, { uri: result.assets[0].uri, duration }])
    }
  }

  function removeReel(index: number) {
    setReels((prev) => prev.filter((_, i) => i !== index))
  }

  function navigate() {
    router.push('/onboarding/provider/services')
  }

  return (
    <View style={styles.root}>
      {/* Progress bar — 37.5% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar — fixed above scroll */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarLabel}>Your reels</Text>
        <Text style={styles.topBarStep}>Step 3 of 8</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
      >
        <Text style={styles.headline}>Add your reels.</Text>
        <Text style={styles.subtext}>
          Short videos of your work, process, or personality. Clients love seeing the real you before they book.
        </Text>

        {/* Info note */}
        <View style={styles.infoNote}>
          <Feather name="video" size={14} color="rgba(240,232,213,0.3)" style={{ marginTop: 2 }} />
          <Text style={styles.infoText}>
            Up to 6 reels, 60 seconds each. Vertical video looks best.
          </Text>
        </View>

        {/* Reels grid — 2 columns */}
        <View style={styles.grid}>
          {Array.from({ length: TOTAL_SLOTS }).map((_, i) => {
            const reel = reels[i]
            const cellH = cellWidth * (16 / 9)

            if (reel) {
              return (
                <View
                  key={i}
                  style={[styles.cell, styles.filledCell, { width: cellWidth, height: cellH }]}
                >
                  {/* Dark bg with play icon */}
                  <View style={styles.filledBg}>
                    <Feather name="play" size={28} color="rgba(240,232,213,0.5)" />
                  </View>

                  {/* Duration overlay */}
                  <View style={styles.durationBar}>
                    <Feather name="clock" size={10} color="rgba(240,232,213,0.45)" />
                    <Text style={styles.durationText}>{reel.duration ?? '0:00'}</Text>
                  </View>

                  {/* Delete button */}
                  <Pressable
                    style={styles.deleteBtn}
                    hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    onPress={() => removeReel(i)}
                  >
                    <Feather name="x" size={13} color="#F0E8D5" />
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
                  { width: cellWidth, height: cellH },
                  pressed && styles.emptyCellPressed,
                ]}
                onPress={pickReel}
              >
                <Feather name="play-circle" size={32} color="rgba(240,232,213,0.15)" />
                <Text style={styles.emptyCellLabel}>Add reel</Text>
                <Text style={styles.emptyCellSub}>Up to 60 sec</Text>
              </Pressable>
            )
          })}
        </View>

        {/* Reel count */}
        <Text style={styles.reelCount}>
          {reels.length === 0
            ? '0 of 6 reels added'
            : `${reels.length} of 6 reels added`}
        </Text>

        {/* Tips */}
        <Text style={styles.tipsLabel}>WHAT WORKS WELL</Text>
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
        <Pressable style={styles.continueBtn} onPress={navigate}>
          <Text style={styles.continueBtnText}>Continue</Text>
        </Pressable>
        <TouchableOpacity activeOpacity={0.6} style={styles.skipWrap} onPress={navigate}>
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
        <Text style={styles.skipNote}>
          Providers with reels get 3x more profile views.
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
    width: '37.5%',
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
    paddingBottom: 140,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 36,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 8,
  },
  infoNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 32,
  },
  infoText: {
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
    gap: 10,
  },
  cell: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  emptyCell: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCellPressed: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderColor: 'rgba(240,232,213,0.2)',
  },
  emptyCellLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 10,
  },
  emptyCellSub: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.15)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  filledCell: {
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  filledBg: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(8,8,8,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  durationText: {
    fontSize: 11,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  deleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(8,8,8,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Count
  reelCount: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 32,
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
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
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
