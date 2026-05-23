import { View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

export default function ClientPreferences() {
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <Text style={styles.label}>COMING SOON</Text>
      <Text style={styles.headline}>Preferences</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 2,
    marginBottom: 12,
  },
  headline: {
    fontSize: 28,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
})
