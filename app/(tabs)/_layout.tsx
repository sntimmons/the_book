import { Tabs, router } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import TabIcon from '@/components/TabIcon'
import { useAuth } from '@/context/AuthContext'

type IconTabName = 'index' | 'bookings' | 'messages' | 'me'

type IconTab = {
  kind: 'icon'
  routeName: IconTabName
  iconName: 'home' | 'bookings' | 'messages' | 'me'
}

type CenterTab = {
  kind: 'center'
  routeName: 'new'
}

type PushTab = {
  kind: 'push'
  key: 'reels'
  iconName: 'reels'
  href: string
}

type Slot = IconTab | CenterTab | PushTab

const SLOTS: Slot[] = [
  { kind: 'icon', routeName: 'index', iconName: 'home' },
  { kind: 'icon', routeName: 'bookings', iconName: 'bookings' },
  { kind: 'push', key: 'reels', iconName: 'reels', href: '/reels' },
  { kind: 'center', routeName: 'new' },
  { kind: 'icon', routeName: 'messages', iconName: 'messages' },
  { kind: 'icon', routeName: 'me', iconName: 'me' },
]

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  // TODO: pull display name/avatar from a profile store once it exists
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? undefined
  const email = user?.email ?? ''
  const derivedInitials = email
    ? email.charAt(0).toUpperCase()
    : 'ST'
  const initials = derivedInitials

  return (
    <View
      style={[
        bar.container,
        { paddingBottom: insets.bottom, height: 64 + insets.bottom },
      ]}
    >
      {SLOTS.map((slot) => {
        if (slot.kind === 'push') {
          return (
            <Pressable
              key={slot.key}
              onPress={() => router.push(slot.href as never)}
              style={bar.slot}
              android_ripple={null}
            >
              <TabIcon name={slot.iconName} focused={false} />
            </Pressable>
          )
        }

        if (slot.kind === 'center') {
          const routeName = slot.routeName
          const route = state.routes.find((r) => r.name === routeName)
          const isFocused = route ? state.index === state.routes.indexOf(route) : false

          function pressCenter() {
            if (!route) return
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(routeName as never)
            }
          }

          return (
            <View key="center" style={bar.slot}>
              <Pressable
                onPress={pressCenter}
                style={({ pressed }) => [
                  bar.centerBtn,
                  pressed && { transform: [{ scale: 0.96 }], opacity: 0.95 },
                ]}
              >
                <Ionicons name="add" size={26} color="#080808" />
              </Pressable>
            </View>
          )
        }

        const routeName = slot.routeName
        const route = state.routes.find((r) => r.name === routeName)
        const isFocused = route ? state.index === state.routes.indexOf(route) : false

        function press() {
          if (!route) return
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          })
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(routeName as never)
          }
        }

        const showAmberBar = isFocused && slot.iconName !== 'me'

        return (
          <Pressable
            key={routeName}
            onPress={press}
            style={bar.slot}
            android_ripple={null}
          >
            <TabIcon
              name={slot.iconName}
              focused={isFocused}
              avatarUrl={slot.iconName === 'me' ? avatarUrl : undefined}
              initials={slot.iconName === 'me' ? initials : undefined}
            />
            {showAmberBar && <View style={bar.activeBar} />}
          </Pressable>
        )
      })}
    </View>
  )
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarShowLabel: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="new" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="me" />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="nearby" options={{ href: null }} />
    </Tabs>
  )
}

const bar = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#080808',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
  },
  slot: {
    flex: 1,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeBar: {
    position: 'absolute',
    bottom: 10,
    width: 4,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#C8922A',
  },
  centerBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#C8922A',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -8,
    shadowColor: '#C8922A',
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
})
