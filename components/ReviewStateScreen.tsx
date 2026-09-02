import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { SafeAreaView } from 'react-native-safe-area-context'

// Shared terminal state for a review entry point (QA-JOURNEY-001 defense-in-depth).
//
// Rendered when the server-authoritative review opportunity is a settled end state
// (already_submitted / window_closed / under_review / not_completed /
// not_participant). It states the truth and offers a safe exit — it deliberately
// offers NO retry, because retrying can never succeed. Copy comes from
// reviewOpportunityCopy() in lib/reviews.ts so every screen says the same thing.
export default function ReviewStateScreen({
  title,
  body,
  onExit,
  exitLabel = 'Back to bookings',
  icon = 'clock',
}: {
  title: string
  body: string
  onExit: () => void
  exitLabel?: string
  icon?: keyof typeof Feather.glyphMap
}) {
  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.content}>
          <View style={styles.avatar}>
            <Feather name={icon} size={26} color="rgba(240,232,213,0.4)" />
          </View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            activeOpacity={0.85}
            onPress={onExit}
          >
            <Text style={styles.primaryBtnText}>{exitLabel}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  safe: { flex: 1 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginTop: 14,
    paddingHorizontal: 32,
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    textAlign: 'center',
    lineHeight: 28,
  },
  body: {
    marginTop: 10,
    paddingHorizontal: 36,
    fontSize: 14,
    color: 'rgba(240,232,213,0.65)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    lineHeight: 21,
  },
  primaryBtn: {
    marginTop: 24,
    height: 52,
    paddingHorizontal: 28,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    fontSize: 15,
    color: '#080808',
    fontFamily: 'Manrope_600SemiBold',
  },
})
