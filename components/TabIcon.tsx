import { Image, StyleSheet, Text, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

export type TabIconProps = {
  name: 'home' | 'bookings' | 'reels' | 'messages' | 'me'
  focused: boolean
  avatarUrl?: string
  initials?: string
}

const ACTIVE = '#F0E8D5'
const INACTIVE = 'rgba(240,232,213,0.4)'
const AVATAR_BG = '#1A1410'
const RING_ACTIVE = '#C8922A'
const RING_INACTIVE = 'rgba(240,232,213,0.15)'

export default function TabIcon({ name, focused, avatarUrl, initials }: TabIconProps) {
  const color = focused ? ACTIVE : INACTIVE

  switch (name) {
    case 'home':
      return (
        <Ionicons name={focused ? 'home' : 'home-outline'} size={26} color={color} />
      )
    case 'bookings':
      return (
        <Ionicons
          name={focused ? 'calendar-clear' : 'calendar-clear-outline'}
          size={26}
          color={color}
        />
      )
    case 'reels':
      return (
        <Ionicons
          name={focused ? 'play-circle' : 'play-circle-outline'}
          size={28}
          color={color}
        />
      )
    case 'messages':
      return (
        <Ionicons
          name={focused ? 'chatbubble' : 'chatbubble-outline'}
          size={26}
          color={color}
        />
      )
    case 'me': {
      const ringWidth = focused ? 1.5 : 1
      const ringColor = focused ? RING_ACTIVE : RING_INACTIVE
      return (
        <View
          style={[
            styles.ringWrap,
            { borderWidth: ringWidth, borderColor: ringColor },
          ]}
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials ?? ''}</Text>
            </View>
          )}
        </View>
      )
    }
  }
}

const AVATAR = 44
const RING_GAP = 1

const styles = StyleSheet.create({
  ringWrap: {
    width: AVATAR + (RING_GAP + 1.5) * 2,
    height: AVATAR + (RING_GAP + 1.5) * 2,
    borderRadius: (AVATAR + (RING_GAP + 1.5) * 2) / 2,
    padding: RING_GAP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: AVATAR_BG,
  },
  avatarFallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: AVATAR_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
})
