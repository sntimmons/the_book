import { View, Text, Pressable, ActivityIndicator, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'

// WHERE THE MAGIC LINK LANDS.
//
// The route exists so `thebook://auth/callback` resolves to a real screen rather
// than Expo Router's unmatched-route fallback. It does NOT do the work: the
// session is opened by hooks/useMagicLinkSession, mounted in AuthProvider above
// the navigator, because a link that cold-starts the app arrives before any
// screen has mounted. Routing away is lib/postAuthRouting's job, driven from
// app/_layout.tsx — which is why this screen has no navigation of its own beyond
// the escape hatch on failure.
//
// So this is a waiting room. It is usually on screen for a moment or not at all.

export default function AuthCallbackScreen() {
  const insets = useSafeAreaInsets()
  const { magicLinkError, clearMagicLinkError } = useAuth()

  function handleBackToSignIn() {
    clearMagicLinkError()
    router.replace('/auth/signin')
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={[styles.wordmark, { top: insets.top + 16 }]}>THE BOOK</Text>

      <View style={styles.center}>
        {magicLinkError === null ? (
          <>
            <ActivityIndicator color="rgba(240,232,213,0.6)" size="large" />
            <Text style={styles.status}>Signing you in...</Text>
          </>
        ) : (
          <>
            <Text style={styles.headline}>That link didn&apos;t work.</Text>
            <Text style={styles.detail}>{magicLinkError}</Text>
            <Pressable style={styles.cta} onPress={handleBackToSignIn}>
              <Text style={styles.ctaText}>Back to sign in</Text>
            </Pressable>
          </>
        )}
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
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  status: {
    marginTop: 16,
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
  headline: {
    fontSize: 22,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  detail: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 20,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  cta: {
    marginTop: 28,
    height: 48,
    paddingHorizontal: 32,
    borderRadius: 14,
    borderCurve: 'continuous',
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
})
