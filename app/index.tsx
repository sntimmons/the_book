import { useRef, useState, useEffect } from 'react'
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Video, ResizeMode } from 'expo-av'
import { Asset } from 'expo-asset'
import { StatusBar } from 'expo-status-bar'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'

const SLIDES = [
  {
    pill: true,
    headline: "Your city's best creators. One place.",
    subtext: "Discover and book the talent your\ncity is talking about.",
  },
  {
    pill: false,
    headline: 'Book with confidence. Every time.',
    subtext: 'Protected payments. Verified creators.\nReal reviews from real clients.',
  },
  {
    pill: false,
    headline: 'Built for creators. Loved by clients.',
    subtext: "Whether you're booking or building,\nthis is where Houston shows up.",
  },
] as const

// Set to require('../assets/videos/welcome.mp4') once you drop the file in.
// Leave null to use the gradient fallback.
const VIDEO_MODULE = require("../assets/videos/welcome.mp4")

const DISPLAY_MS = 4500
const FADE_MS = 600
const CYCLE_MS = DISPLAY_MS + FADE_MS * 2

export default function WelcomeScreen() {
  const fadeAnim = useRef(new Animated.Value(1)).current
  const [currentIndex, setCurrentIndex] = useState(0)
  const [videoUri, setVideoUri] = useState<string | null>(null)
  const insets = useSafeAreaInsets()

  // Load video via Asset system (works in Expo Go)
  useEffect(() => {
    if (!VIDEO_MODULE) return
    async function loadVideo() {
      try {
        const asset = Asset.fromModule(VIDEO_MODULE as number)
        await asset.downloadAsync()
        setVideoUri(asset.localUri)
      } catch {
        console.log('Video not available, using gradient')
      }
    }
    loadVideo()
  }, [])

  // Content cycling animation
  useEffect(() => {
    const interval = setInterval(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(() => {
        setCurrentIndex((prev) => (prev + 1) % SLIDES.length)
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: FADE_MS,
          useNativeDriver: true,
        }).start()
      })
    }, CYCLE_MS)

    return () => {
      clearInterval(interval)
      fadeAnim.stopAnimation()
    }
  }, [])

  const slide = SLIDES[currentIndex]

  return (
    <View style={styles.root}>
      <StatusBar style="light" />
      {/* Video or gradient background */}
      {videoUri ? (
        <Video
          source={{ uri: videoUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted
          rate={1.0}
          volume={0}
        />
      ) : (
        <LinearGradient
          colors={['#2A1808', '#1a0e05', '#080808']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Dark scrim — always on top */}
      <LinearGradient
        colors={['transparent', 'rgba(8,8,8,0.2)', 'rgba(8,8,8,0.7)', '#080808']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      {/* Bottom content */}
      <View style={[styles.bottomContainer, { paddingBottom: insets.bottom + 32 }]}>

        {/* Animated block: pill + headline + subtext */}
        <Animated.View style={{ opacity: fadeAnim }}>
          {slide.pill && (
            <View style={styles.pill}>
              <Text style={styles.pillText}>HOUSTON, TX</Text>
            </View>
          )}
          <Text style={styles.headline}>{slide.headline}</Text>
          <Text style={styles.subtext}>{slide.subtext}</Text>
        </Animated.View>

        {/* Progress dots */}
        <View style={styles.dotsRow}>
          {SLIDES.map((_, i) => (
            <View key={i} style={i === currentIndex ? styles.dotActive : styles.dotInactive} />
          ))}
        </View>

        {/* Get Started */}
        <Pressable
          style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.86 }]}
          onPress={() => router.push('/auth/signup')}
        >
          <Text style={styles.btnPrimaryText}>Get Started</Text>
        </Pressable>

        {/* Sign in link */}
        <Pressable onPress={() => router.push('/auth/signin')}>
          <Text style={styles.signInText}>
            Already have an account?{'  '}
            <Text style={styles.signInLink}>Sign in</Text>
          </Text>
        </Pressable>

      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  bottomContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  pill: {
    alignSelf: 'flex-start',
    backgroundColor: '#C8922A',
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 16,
  },
  pillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 0.5,
  },
  headline: {
    fontSize: 36,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 42,
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.65)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 22,
    marginBottom: 28,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    marginBottom: 28,
  },
  dotActive: {
    width: 20,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#F0E8D5',
  },
  dotInactive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(240,232,213,0.3)',
  },
  btnPrimary: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  signInText: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginBottom: 8,
  },
  signInLink: {
    color: '#F0E8D5',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
})
