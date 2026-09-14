import { Image, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export type TabIconProps = {
  name: 'home' | 'bookings' | 'reels' | 'messages' | 'me'
  focused: boolean
  /** Resolved from the theme by the tab bar — this component owns no colour. */
  color: string
  /** Surface behind the avatar fallback. */
  fallbackBg: string
  avatarUrl?: string
  initials?: string
}

// THE TAB GLYPHS. Colour now arrives from the theme instead of the three literals
// this file used to own (`#F0E8D5`, a 0.4 alpha of it, and the amber ring), so the
// bar renders correctly under both appearances.
//
// The Me tab keeps the account avatar when there is one. The approved Figma
// component draws a person glyph there; keeping the photo is a deliberate
// retention of existing personalisation, and the glyph is the fallback rather than
// the default. Sizes are now uniform so every tab can carry a label.
const SIZE = 24

export default function TabIcon({
  name,
  focused,
  color,
  fallbackBg,
  avatarUrl,
  initials,
}: TabIconProps) {
  switch (name) {
    case 'home':
      return <Ionicons name={focused ? 'compass' : 'compass-outline'} size={SIZE} color={color} />
    case 'bookings':
      return (
        <Ionicons
          name={focused ? 'calendar-clear' : 'calendar-clear-outline'}
          size={SIZE}
          color={color}
        />
      )
    case 'reels':
      return (
        <Ionicons name={focused ? 'play-circle' : 'play-circle-outline'} size={SIZE} color={color} />
      )
    case 'messages':
      return (
        <Ionicons name={focused ? 'chatbubble' : 'chatbubble-outline'} size={SIZE} color={color} />
      )
    case 'me': {
      if (avatarUrl) {
        return (
          <View
            style={[
              styles.ringWrap,
              { borderColor: focused ? color : 'transparent', borderWidth: focused ? 1.5 : 1.5 },
            ]}
          >
            <Image
              source={{ uri: avatarUrl }}
              style={[styles.avatar, { backgroundColor: fallbackBg }]}
            />
          </View>
        )
      }
      if (initials) {
        return (
          <View
            style={[
              styles.ringWrap,
              { borderColor: focused ? color : 'transparent', borderWidth: 1.5 },
            ]}
          >
            <View style={[styles.avatar, styles.center, { backgroundColor: fallbackBg }]}>
              <Text style={[styles.initials, { color }]}>{initials}</Text>
            </View>
          </View>
        )
      }
      return <Ionicons name={focused ? 'person' : 'person-outline'} size={SIZE} color={color} />
    }
  }
}

const AVATAR = 22

const styles = StyleSheet.create({
  ringWrap: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  center: { alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 10, fontFamily: 'Manrope_700Bold' },
})
