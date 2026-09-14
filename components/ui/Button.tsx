import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/context/ThemeContext'

// ONE BUTTON, THREE VARIANTS.
//
// Figma carries Button/Primary, Button/Secondary and Button/Tertiary as three
// component sets because a Figma set cannot express a shared shape with a swapped
// skin. React can, and splitting this into three files would triplicate the
// disabled, loading and accessibility behaviour for no gain. The Code Connect map
// points all three Figma sets at this one component with a different `variant`.
//
// The variants are not decoration:
//   primary   — the ONE action on a screen. Mulberry fill, Linen label.
//   secondary — a real action that is not the primary one. Hairline, no fill.
//   tertiary  — link weight, inside content. No border, no fill.

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary'

export type ButtonProps = {
  label: string
  onPress?: () => void
  variant?: ButtonVariant
  loading?: boolean
  /**
   * Shown beside the spinner while `loading`. Supply it where the wait is long
   * enough that a bare spinner would leave the user guessing what is happening —
   * sending a booking request, for one. Omitted, the button shows the spinner alone.
   */
  loadingLabel?: string
  disabled?: boolean
  /** Tertiary hugs its label by default; primary and secondary fill their row. */
  fullWidth?: boolean
  accessibilityLabel?: string
  testID?: string
}

export default function Button({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  loadingLabel,
  disabled = false,
  fullWidth,
  accessibilityLabel,
  testID,
}: ButtonProps) {
  const { colors, radius, type } = useTheme()
  const inactive = disabled || loading
  const stretch = fullWidth ?? variant !== 'tertiary'

  const surface =
    variant === 'primary'
      ? { backgroundColor: colors.actionPrimary }
      : variant === 'secondary'
        ? { borderWidth: 1.5, borderColor: colors.actionSecondary }
        : null

  const labelColor =
    variant === 'primary'
      ? colors.textOnAction
      : variant === 'secondary'
        ? colors.textPrimary
        : colors.actionText

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      disabled={inactive}
      accessibilityRole="button"
      // While busy, announce what is happening rather than the idle label.
      accessibilityLabel={accessibilityLabel ?? (loading && loadingLabel ? loadingLabel : label)}
      accessibilityState={{ disabled: inactive, busy: loading }}
      testID={testID}
      style={({ pressed }) => [
        s.base,
        { borderRadius: radius.md },
        variant === 'tertiary' && s.tertiary,
        surface,
        stretch ? s.stretch : s.hug,
        // Pressed reads as a settle, not a colour change.
        pressed && !inactive && s.pressed,
        disabled && s.disabled,
      ]}
    >
      {loading ? (
        <View style={s.loading} accessibilityElementsHidden>
          <ActivityIndicator color={labelColor} size="small" />
          {loadingLabel ? (
            <Text style={[type.labelAction, { color: labelColor }]} numberOfLines={1}>
              {loadingLabel}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={[type.labelAction, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}

const s = StyleSheet.create({
  base: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48, // touch target
  },
  tertiary: { paddingHorizontal: 0, paddingVertical: 10, minHeight: 44 },
  stretch: { alignSelf: 'stretch' },
  hug: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.4 },
  loading: {
    height: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
})
