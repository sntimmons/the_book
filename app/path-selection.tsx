import { useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native'
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

  function handlePressIn() {
    Animated.timing(scale, { toValue: 0.97, duration: 100, useNativeDriver: true }).start()
  }

  function handlePressOut() {
    Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }).start()
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
        {/* Top row: icon left, arrow right */}
        <View style={styles.cardTopRow}>
          <View style={styles.iconContainer}>
            <Text style={styles.iconText}>{icon}</Text>
          </View>
          <View style={styles.arrowContainer}>
            <Text style={styles.arrowText}>›</Text>
          </View>
        </View>

        {/* Title + subtext */}
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardSubtitle}>{subtitle}</Text>
      </Animated.View>
    </TouchableOpacity>
  )
}

export default function PathSelection() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <Text style={[styles.wordmark, { top: insets.top + 16 }]}>THE BOOK</Text>

      <View style={styles.center}>
        <Text style={styles.headline}>How are you here?</Text>
        <Text style={styles.subtext}>Choose your path to get started.</Text>

        <View style={styles.cards}>
          <Card
            icon="⌕"
            title="I'm booking"
            subtitle={"Discover and book the best\ncreators in Houston."}
            onPress={() => router.push('/onboarding/client')}
          />
          <Card
            icon="✦"
            title="I'm a provider"
            subtitle={"Set up your profile and start\ngetting discovered."}
            onPress={() => router.push('/onboarding/provider')}
          />
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => router.push('/auth/signin')}
          style={{ marginTop: 36 }}
        >
          <Text style={styles.signInText}>
            Already have an account?{'  '}
            <Text style={styles.signInLink}>Sign in</Text>
          </Text>
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
  wordmark: {
    position: 'absolute',
    alignSelf: 'center',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    zIndex: 1,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  headline: {
    fontSize: 32,
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
    marginBottom: 48,
  },
  cards: {
    gap: 12,
  },
  card: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 20,
    padding: 28,
    width: '100%',
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
    color: 'rgba(240,232,213,0.6)',
  },
  arrowContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowText: {
    fontSize: 18,
    color: 'rgba(240,232,213,0.35)',
    lineHeight: 20,
  },
  cardTitle: {
    fontSize: 22,
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
