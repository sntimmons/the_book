import { useState } from 'react'
import { View, Text, Pressable, Image, StyleSheet, Alert } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function SigninScreen() {
  const insets = useSafeAreaInsets()
  const [imageError, setImageError] = useState(false)

  return (
    <View style={styles.root}>
      {/* Background: image with gradient overlay, or gradient fallback */}
      {!imageError ? (
        <Image
          source={require('../../assets/images/welcome/welcome-bg.jpg')}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      ) : (
        <LinearGradient
          colors={['#2A1808', '#1a0e05', '#080808']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      )}

      {/* Dark overlay always on top of background */}
      <LinearGradient
        colors={['rgba(8,8,8,0.2)', 'rgba(8,8,8,0.5)', 'rgba(8,8,8,0.88)', '#080808']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <Text style={[styles.wordmark, { top: insets.top + 16 }]}>THE BOOK</Text>

      <View style={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.headline}>Welcome back.</Text>
        <Text style={styles.subtext}>Sign in to continue.</Text>

        <Pressable
          style={({ pressed }) => [styles.btnPrimary, { marginBottom: 10, opacity: pressed ? 0.86 : 1 }]}
          onPress={() =>
            Alert.alert(
              'Apple Sign In',
              'Apple Sign In is coming soon. Please use your phone number to sign in.',
              [{ text: 'OK' }],
            )
          }
        >
          <Text style={styles.btnPrimaryText}>Continue with Apple</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btnSecondary, { marginBottom: 10, opacity: pressed ? 0.78 : 1 }]}
          onPress={() =>
            Alert.alert(
              'Email Sign In',
              'Email sign in is coming soon. Please use your phone number to sign in.',
              [{ text: 'OK' }],
            )
          }
        >
          <Text style={styles.btnSecondaryText}>Continue with Email</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.btnSecondary, { opacity: pressed ? 0.78 : 1 }]}
          onPress={() => router.push('/auth/phone')}
        >
          <Text style={styles.btnSecondaryText}>Sign in with Phone</Text>
        </Pressable>

        <Pressable style={styles.footerRow} onPress={() => router.push('/auth/signup')}>
          <Text style={styles.footerText}>
            Don&apos;t have an account?{'  '}
            <Text style={styles.footerLink}>Sign up</Text>
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
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3.5,
    color: 'rgba(240,232,213,0.35)',
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
