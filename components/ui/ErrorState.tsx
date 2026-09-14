import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/context/ThemeContext'
import Button from '@/components/ui/Button'

// THE ONE PLACE DANGER BELONGS — and only when a retry can actually succeed.
//
// `tone="quiet"` exists for states that are NOT failures and must not be dressed as
// one. The canonical case is messaging being unavailable: it names no cause and
// offers no retry, because it must never reveal a block, a hidden moderation state,
// or a private account (PD-082). Reaching for the danger treatment there would leak
// the very thing the copy is careful to withhold.

export type ErrorStateProps = {
  title: string
  body?: string
  /** `alert` = a real failure. `quiet` = a limitation with no cause to name. */
  tone?: 'alert' | 'quiet'
  onRetry?: () => void
  retryLabel?: string
  testID?: string
}

export default function ErrorState({
  title,
  body,
  tone = 'alert',
  onRetry,
  retryLabel = 'Try again',
  testID,
}: ErrorStateProps) {
  const { colors, type } = useTheme()
  const alert = tone === 'alert'

  return (
    <View style={s.wrap} testID={testID} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text
        style={[
          alert ? type.titleSection : type.bodyDefault,
          s.center,
          { color: alert ? colors.statusDanger : colors.textSecondary },
        ]}
      >
        {title}
      </Text>
      {body ? (
        <Text style={[type.bodySmall, s.center, { color: colors.textSecondary }]}>{body}</Text>
      ) : null}
      {/* A retry is offered only when one can succeed. */}
      {alert && onRetry ? (
        <View style={s.action}>
          <Button label={retryLabel} variant="tertiary" onPress={onRetry} />
        </View>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { paddingVertical: 36, paddingHorizontal: 28, alignItems: 'center', gap: 8 },
  center: { textAlign: 'center' },
  action: { marginTop: 4 },
})
