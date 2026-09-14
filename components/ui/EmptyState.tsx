import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/context/ThemeContext'

// AN ABSENCE IS NOT A FAILURE.
//
// No illustration, no danger colour, and no call to action that cannot succeed.
// "No reviews yet" means nobody has reviewed — it must never read as a verdict, the
// same reason lib/reputationLabel.ts refuses to render a 0 rating.

export type EmptyStateProps = {
  title: string
  body?: string
  /** Optional action. Omit it rather than invent something the user cannot do. */
  action?: React.ReactNode
  testID?: string
}

export default function EmptyState({ title, body, action, testID }: EmptyStateProps) {
  const { colors, type } = useTheme()
  return (
    <View style={s.wrap} testID={testID} accessibilityRole="summary">
      <Text style={[type.titleSection, s.center, { color: colors.textPrimary }]}>{title}</Text>
      {body ? (
        <Text style={[type.bodySmall, s.center, { color: colors.textSecondary }]}>{body}</Text>
      ) : null}
      {action ? <View style={s.action}>{action}</View> : null}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 44, paddingHorizontal: 28, alignItems: 'center', gap: 8 },
  center: { textAlign: 'center' },
  action: { marginTop: 8 },
})
