import { useEffect, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ReviewSubmitted() {
  const insets = useSafeAreaInsets()
  const scale = useRef(new Animated.Value(0.5)).current

  useEffect(() => {
    Animated.spring(scale, {
      toValue: 1,
      tension: 65,
      friction: 8,
      useNativeDriver: true,
    }).start()
  }, [scale])

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          {/* Status icon */}
          <Animated.View style={[styles.outerRing, { transform: [{ scale }] }]}>
            <View style={styles.innerCircle}>
              <Feather name="star" size={28} color="#C8922A" />
            </View>
          </Animated.View>

          {/* Headline */}
          <Text style={styles.headline}>Review posted.</Text>

          {/* Subtext */}
          <Text style={styles.subtext}>
            Your review helps the Houston community find great providers. Thank you.
          </Text>

          {/* Impact note */}
          <View style={styles.impactNote}>
            <Text style={styles.impactTitle}>
              Your review is now live on Nia's profile.
            </Text>
            <Text style={styles.impactSub}>
              Other Houston clients can now see your experience before booking.
            </Text>
          </View>

          {/* Rebook CTA */}
          <TouchableOpacity
            style={styles.rebookCta}
            activeOpacity={0.7}
            onPress={() => router.push('/book/service')}
          >
            <View style={styles.rebookLeft}>
              <Text style={styles.rebookTitle}>Book Nia again</Text>
              <Text style={styles.rebookSub}>She has slots next week</Text>
            </View>
            <Feather name="chevron-right" size={16} color="rgba(240,232,213,0.3)" />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Bottom buttons */}
      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={styles.homeBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/(tabs)/')}
        >
          <Text style={styles.homeBtnText}>Back to Home</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.profileLink}
          activeOpacity={0.7}
          onPress={() => router.push('/providers/1')}
        >
          <Text style={styles.profileLinkText}>View Nia's Profile</Text>
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
  safe: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  outerRing: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1.5,
    borderColor: 'rgba(200,146,42,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  innerCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(200,146,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headline: {
    marginTop: 20,
    fontSize: 30,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
  },
  subtext: {
    marginTop: 10,
    paddingHorizontal: 48,
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
  impactNote: {
    marginTop: 24,
    marginHorizontal: 24,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  impactTitle: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    marginBottom: 4,
  },
  impactSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 17,
  },
  rebookCta: {
    marginTop: 20,
    marginHorizontal: 24,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rebookLeft: {
    flex: 1,
  },
  rebookTitle: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  rebookSub: {
    marginTop: 2,
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 16,
    backgroundColor: '#080808',
  },
  homeBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  homeBtnText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  profileLink: {
    marginTop: 10,
    alignItems: 'center',
  },
  profileLinkText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
})
