import { StyleSheet, Text, TextInput, View } from 'react-native'
import { useState } from 'react'
import { useTheme } from '@/context/ThemeContext'

// FREE TEXT.
//
// `error` is the ONE place in this component that reaches `statusDanger`, and it is
// legitimate: a rejected input is a real failure the user can fix. Booking outcomes
// never borrow this treatment — see lib/theme/statusTone.ts.

export type TextFieldProps = {
  value: string
  onChangeText: (next: string) => void
  placeholder?: string
  label?: string
  error?: string | null
  multiline?: boolean
  minHeight?: number
  maxLength?: number
  accessibilityLabel?: string
  testID?: string
}

export default function TextField({
  value,
  onChangeText,
  placeholder,
  label,
  error = null,
  multiline = false,
  minHeight,
  maxLength,
  accessibilityLabel,
  testID,
}: TextFieldProps) {
  const { colors, radius, type } = useTheme()
  const [focused, setFocused] = useState(false)
  const borderColor = error
    ? colors.statusDanger
    : focused
      ? colors.actionPrimary
      : colors.borderSubtle

  return (
    <View style={s.wrap}>
      {label ? (
        <Text style={[type.labelMeta, { color: colors.textSecondary }]}>{label}</Text>
      ) : null}
      <View
        style={[
          s.field,
          {
            backgroundColor: colors.bgSurface,
            borderRadius: radius.md,
            borderColor,
            borderWidth: error || focused ? 1.5 : 1,
            minHeight: minHeight ?? (multiline ? 116 : 48),
          },
        ]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          multiline={multiline}
          maxLength={maxLength}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          accessibilityLabel={accessibilityLabel ?? label ?? placeholder}
          accessibilityState={{ disabled: false }}
          testID={testID}
          style={[
            type.bodyDefault,
            s.input,
            { color: colors.textPrimary, textAlignVertical: multiline ? 'top' : 'center' },
          ]}
        />
      </View>
      {error ? (
        <Text style={[type.caption, { color: colors.statusDanger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  )
}

const s = StyleSheet.create({
  wrap: { gap: 8, alignSelf: 'stretch' },
  field: { paddingHorizontal: 15, paddingVertical: 14, justifyContent: 'flex-start' },
  input: { flex: 1, padding: 0 },
})
