import { View, Text, Pressable, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function DiscoveryScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.wordmark}>THE BOOK</Text>
      <View style={styles.center}>
        <Text style={styles.label}>COMING SOON</Text>
        <Text style={styles.headline}>Discovery Feed</Text>
        <Text style={styles.subtext}>
          The best creators in Houston,{'\n'}all in one place.
        </Text>
        <Pressable
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
        >
          <Text style={styles.backText}>Go back</Text>
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
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 3.5,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 16,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 2,
    marginBottom: 16,
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 40,
  },
  backBtn: {
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    borderRadius: 12,
    borderCurve: 'continuous',
  },
  backText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_500Medium',
  },
})
