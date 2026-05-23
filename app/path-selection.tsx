import { View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function PathSelection() {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom + 24 }]}>
      {/* Wordmark */}
      <Text style={styles.wordmark}>THE BOOK</Text>

      {/* Headline */}
      <Text style={styles.headline}>How are you here?</Text>
      <Text style={styles.subtext}>Choose your path to get started.</Text>

      {/* Cards */}
      <View style={styles.cards}>
        <Pressable
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
          onPress={() => router.push('/onboarding/client')}
        >
          <View style={styles.cardTop}>
            <Text style={styles.cardIcon}>⌕</Text>
            <Text style={styles.cardArrow}>›</Text>
          </View>
          <Text style={styles.cardTitle}>I&apos;m booking</Text>
          <Text style={styles.cardSubtitle}>Find creators near you</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.card, pressed && { opacity: 0.8 }]}
          onPress={() => router.push('/onboarding/provider')}
        >
          <View style={styles.cardTop}>
            <Text style={styles.cardIcon}>✦</Text>
            <Text style={styles.cardArrow}>›</Text>
          </View>
          <Text style={styles.cardTitle}>I&apos;m a provider</Text>
          <Text style={styles.cardSubtitle}>Build your clientele</Text>
        </Pressable>
      </View>

      {/* Sign in link */}
      <Pressable onPress={() => router.push('/auth/signin')}>
        <Text style={styles.signInText}>
          Already have an account?{'  '}
          <Text style={styles.signInLink}>Sign in</Text>
        </Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
    paddingHorizontal: 20,
  },
  wordmark: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 3,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 8,
    marginBottom: 0,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
    marginTop: 80,
    marginBottom: 10,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginBottom: 48,
  },
  cards: {
    gap: 16,
    flex: 1,
  },
  card: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 16,
    padding: 24,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIcon: {
    fontSize: 22,
    color: '#F0E8D5',
  },
  cardArrow: {
    fontSize: 24,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  signInText: {
    textAlign: 'center',
    fontSize: 13,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 24,
  },
  signInLink: {
    color: '#F0E8D5',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
})
