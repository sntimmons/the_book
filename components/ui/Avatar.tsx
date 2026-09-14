import { Image, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/context/ThemeContext'

// IDENTITY AT THREE SIZES.
//
// Initials is a REAL variant, not a broken-image fallback. A provider without a
// photo is not a worse provider, and nothing in Third may render them as one — the
// same rule lib/discovery.ts enforces for placement.

export type AvatarSize = 'small' | 'medium' | 'large'

const PX: Record<AvatarSize, number> = { small: 26, medium: 38, large: 58 }

export type AvatarProps = {
  uri?: string | null
  /** Used to derive initials when there is no photo. */
  name?: string | null
  size?: AvatarSize
  accessibilityLabel?: string
  testID?: string
}

export function initialsFor(name?: string | null): string {
  if (!name) return ''
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export default function Avatar({ uri, name, size = 'medium', accessibilityLabel, testID }: AvatarProps) {
  const { colors, font } = useTheme()
  const px = PX[size] ?? PX.medium
  const label = accessibilityLabel ?? (name ? `${name}` : 'Profile photo')

  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel={label}
        accessible
        testID={testID}
        style={{ width: px, height: px, borderRadius: px / 2, backgroundColor: colors.bgSubtle }}
      />
    )
  }

  return (
    <View
      accessibilityLabel={label}
      accessible
      testID={testID}
      style={[
        s.fallback,
        { width: px, height: px, borderRadius: px / 2, backgroundColor: colors.bgSubtle },
      ]}
    >
      <Text
        style={{
          fontFamily: font.bold,
          fontSize: Math.round(px * 0.36),
          color: colors.textSecondary,
        }}
      >
        {initialsFor(name)}
      </Text>
    </View>
  )
}

const s = StyleSheet.create({ fallback: { alignItems: 'center', justifyContent: 'center' } })
