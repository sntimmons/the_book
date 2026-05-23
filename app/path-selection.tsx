import { useRef } from 'react'
import { View, Text, Pressable, Animated, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

function Card({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: string
  title: string
  subtitle: string
  onPress: () => void
}) {
  const scale = useRef(new Animated.Value(1)).current
  const bg = useRef(new Animated.Value(0)).current

  function handlePressIn() {
    Animated.parallel([
      Animated.timing(scale, { toValue: 0.98, duration: 80, useNativeDriver: true }),
      Animated.timing(bg, { toValue: 1, duration: 80, useNativeDriver: false }),
    ]).start()
  }

  function handlePressOut() {
    Animated.parallel([
      Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: true }),
      Animated.timing(bg, { toValue: 0, duration: 120, useNativeDriver: false }),
    ]).start()
  }

  const bgColor = bg.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(240,232,213,0.04)', 'rgba(240,232,213,0.07)'],
  })
  const borderColor = bg.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(240,232,213,0.08)', 'rgba(240,232,213,0.15)'],
  })

  return (
    <Pressable
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: bgColor, borderColor, transform: [{ scale }] },
        ]}
      >
        <View style={styles.cardInner}>
          {/* Left side */}
          <View style={{ flex: 1 }}>
            <View style={styles.iconCircle}>
              <Text style={styles.iconText}>{icon}</Text>
            </View>
            <Text style={styles.cardTitle}>{title}</Text>
            <Text style={styles.cardSubtitle}>{subtitle}</Text>
          </View>

          {/* Right arrow */}
          <View style={styles.arrowCircle}>
            <Text style={styles.arrowText}>›</Text>
          </View>
        </View>
      </Animated.View>
    </Pressable>
  )
}

export default function PathSelection() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      {/* Wordmark */}
      <Text style={[styles.wordmark, { top: insets.top + 16 }]}>THE BOOK</Text>

      {/* Centered content */}
      <View style={[styles.center, { paddingBottom: insets.bottom + 24 }]}>
        <Text style={styles.headline}>How are you here?</Text>
        <Text style={styles.subtext}>Choose your path to get started.</Text>

        <View style={styles.cards}>
          <Card
            icon="⌕"
            title="I'm booking"
            subtitle={'Discover and book the best\ncreators in Houston.'}
            onPress={() => router.push('/onboarding/client')}
          />
          <Card
            icon="✦"
            title="I'm a provider"
            subtitle={'Set up your profile and start\ngetting discovered.'}
            onPress={() => router.push('/onboarding/provider')}
          />
        </View>

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
  wordmark: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    zIndex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginBottom: 40,
  },
  cards: {
    gap: 12,
    marginBottom: 24,
  },
  card: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 28,
    width: '100%',
  },
  cardInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 20,
    color: '#F0E8D5',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 6,
  },
  cardSubtitle: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
  },
  arrowCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  arrowText: {
    fontSize: 20,
    color: 'rgba(240,232,213,0.4)',
    lineHeight: 22,
  },
  signInText: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  signInLink: {
    color: '#F0E8D5',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
})
