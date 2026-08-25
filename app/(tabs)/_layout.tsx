import { useEffect } from 'react'
import { Tabs } from 'expo-router'
import { Pressable, StyleSheet, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import TabIcon from '@/components/TabIcon'
import { useAuth } from '@/context/AuthContext'
import { ensureClientRow } from '@/lib/ensureClientRow'

type IconTabName = 'index' | 'reels' | 'bookings' | 'messages' | 'me'

type Slot = {
  routeName: IconTabName
  iconName: 'home' | 'reels' | 'bookings' | 'messages' | 'me'
}

// Mode 3 shared bottom nav: Discover, Reels, Bookings, Messages, Me.
const SLOTS: Slot[] = [
  { routeName: 'index', iconName: 'home' },
  { routeName: 'reels', iconName: 'reels' },
  { routeName: 'bookings', iconName: 'bookings' },
  { routeName: 'messages', iconName: 'messages' },
  { routeName: 'me', iconName: 'me' },
]

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()

  // TODO: pull display name/avatar from a profile store once it exists
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? undefined
  const email = user?.email ?? ''
  const initials = email ? email.charAt(0).toUpperCase() : 'ST'

  return (
    <View
      style={[
        bar.container,
        { paddingBottom: insets.bottom, height: 64 + insets.bottom },
      ]}
    >
      {SLOTS.map((slot) => {
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
  const { user, role, roleLoading } = useAuth()

  // Orphan safety net: a signed-in user who reaches the shared shell with no
  // role (neither provider nor client row) still needs a clients row so their
  // name resolves in messaging instead of showing "Client". Done here rather
  // than at auth-resolve so a provider still completing onboarding — who is not
  // in the tab shell yet — never gets a junk client row. Gated on role === null;
  // resolved providers/clients are skipped.
  useEffect(() => {
    if (!roleLoading && role === null && user) {
      void ensureClientRow(user.id)
    }
  }, [roleLoading, role, user])

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false, tabBarShowLabel: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="reels" />
      <Tabs.Screen name="bookings" />
      <Tabs.Screen name="messages" />
      <Tabs.Screen name="me" />
      {/* Registered but not in the bar: the old "+" quick-action sheet (kept
          reachable via direct route for now) and the search screen (reached
          from Discover). */}
      <Tabs.Screen name="new" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      {/* Provider Business tools: a nested Stack that keeps the tab bar visible.
          href: null so it is not a sixth tab. */}
      <Tabs.Screen name="business" options={{ href: null }} />
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
})
