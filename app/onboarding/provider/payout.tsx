import { View, Text, Pressable, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather, Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ProviderPayout() {
  const insets = useSafeAreaInsets()


  return (
    <View style={styles.root}>
      {/* Progress bar: 87.5% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarLabel}>Payouts</Text>
        {/* No step number: payout setup is NOT part of onboarding any more
            (Correction 3, item Y). This screen is reached from the Business
            dashboard's Payouts entry, where it explains why there is nothing to
            set up yet; it is no longer a required stop on the way to going
            live. */}
        <View style={styles.topBarSpacer} />
      </View>

      <View style={styles.body}>
        <View style={styles.iconRing}>
          <Ionicons name="wallet-outline" size={30} color="#C8922A" />
        </View>

        <Text style={styles.heading}>Payout setup coming soon</Text>

        {/* PRODUCT TRUTH: promised to a brand-new provider that completed
            service value "will be tracked", pointing at a screen that tracks
            nothing. The Business dashboard does show it, so say that. */}
        <Text style={styles.bodyText}>
          Payouts are not available during beta. Your completed service value is
          shown on your Business dashboard.
        </Text>
      </View>

      {/* Was "Continue", which pushed on to Go Live — the tell that this screen
          sat in the onboarding path. It goes back to where the provider came
          from instead, because there is nothing here to continue THROUGH. */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable style={styles.continueBtn} onPress={() => router.back()}>
          <Text style={styles.continueBtnText}>Go back</Text>
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
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.1)',
    zIndex: 10,
  },
  progressFill: {
    width: '87.5%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBarLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  topBarSpacer: { width: 74 },
  topBarStep: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: 'rgba(200,146,42,0.3)',
    backgroundColor: 'rgba(200,146,42,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  heading: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
    marginBottom: 12,
  },
  bodyText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 21,
  },
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  continueBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  continueBtnText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
})
