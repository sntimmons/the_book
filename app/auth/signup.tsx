import { View, Text, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function SignupScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      {/* Warm gradient base */}
      <LinearGradient
        colors={['#2E1A0A', '#1C1008', '#0D0907', '#080808']}
        locations={[0, 0.28, 0.58, 1]}
        style={StyleSheet.absoluteFill}
      />
      {/* Horizontal amber glow */}
      <LinearGradient
        colors={['transparent', 'rgba(200,146,42,0.11)', 'transparent']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{ position: 'absolute', top: '4%', left: 0, right: 0, height: '45%' }}
      />
      {/* Vertical amber bloom */}
      <LinearGradient
        colors={['rgba(185,105,25,0.18)', 'rgba(185,105,25,0.04)', 'transparent']}
        locations={[0, 0.5, 1]}
        style={{ position: 'absolute', top: 0, left: '12%', right: '12%', height: '52%' }}
      />

      {/* Wordmark */}
      <Text style={[styles.wordmark, { top: insets.top + 16 }]}>THE BOOK</Text>

      {/* Bottom content */}
      <View style={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.headline}>Your city's best creators.</Text>
        <Text style={styles.subtext}>
          Discover and book the talent Houston is talking about.
        </Text>

        <Pressable
          style={({ pressed }) => [styles.btnPrimary, { marginBottom: 10, opacity: pressed ? 0.86 : 1 }]}
          onPress={() => console.log('apple')}
        >
          <Text style={styles.btnPrimaryText}>Continue with Apple</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btnSecondary, { marginBottom: 10, opacity: pressed ? 0.78 : 1 }]}
          onPress={() => console.log('email')}
        >
          <Text style={styles.btnSecondaryText}>Continue with Email</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btnSecondary, { opacity: pressed ? 0.78 : 1 }]}
          onPress={() => router.push('/auth/phone')}
        >
          <Text style={styles.btnSecondaryText}>Continue with Phone</Text>
        </Pressable>

        <Pressable style={styles.footerRow} onPress={() => router.push('/auth/signin')}>
          <Text style={styles.footerText}>
            Already have an account?{'  '}
            <Text style={styles.footerLink}>Sign in</Text>
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
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_600SemiBold',
    zIndex: 1,
  },
  content: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
  },
  headline: {
    fontSize: 38,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 44,
    marginBottom: 12,
  },
  subtext: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.65)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 22,
    marginBottom: 40,
  },
  btnPrimary: {
    height: 52,
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
  },
  btnSecondary: {
    height: 52,
    backgroundColor: 'transparent',
    borderRadius: 14,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  btnSecondaryText: {
    fontSize: 15,
    fontWeight: '500',
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  footerRow: {
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  footerLink: {
    color: '#F0E8D5',
    fontWeight: '600',
    fontFamily: 'Manrope_600SemiBold',
  },
})
