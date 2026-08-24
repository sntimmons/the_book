import { View, Text, Pressable, StyleSheet, ImageSourcePropType, Alert } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import CrossfadeBackground from '../../components/CrossfadeBackground'

const authImages = (() => {
  const loaded: ImageSourcePropType[] = []
  try { loaded.push(require('../../assets/images/auth/signup1.jpg')) } catch (e) {}
  try { loaded.push(require('../../assets/images/auth/signup2.jpg')) } catch (e) {}
  try { loaded.push(require('../../assets/images/auth/signup3.jpg')) } catch (e) {}
  return loaded
})()

export default function SignupScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.root}>
      <CrossfadeBackground images={authImages} fallback={authImages.length === 0} />

      {/* Back to Welcome */}
      <Pressable
        onPress={() => router.back()}
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        style={[styles.backBtn, { top: insets.top + 12 }]}
      >
        <Feather name="chevron-left" size={24} color="rgba(240,232,213,0.8)" />
      </Pressable>

      {/* Wordmark */}
      <Text style={[styles.wordmark, { top: insets.top + 16 }]}>THE BOOK</Text>

      {/* Bottom content */}
      <View style={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
        <Text style={styles.headline}>Your city's best providers.</Text>
        <Text style={styles.subtext}>
          Discover and book the talent Houston is talking about.
        </Text>

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
          onPress={() => router.push('/auth/email')}
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
  backBtn: {
    position: 'absolute',
    left: 16,
    zIndex: 2,
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
