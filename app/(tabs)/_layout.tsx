import { Tabs } from 'expo-router'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import TabIcon from '@/components/TabIcon'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'

type IconTabName = 'index' | 'reels' | 'bookings' | 'messages' | 'me'

type Slot = {
  routeName: IconTabName
  iconName: 'home' | 'reels' | 'bookings' | 'messages' | 'me'
  /** Founder-approved visible label. */
  label: string
}

// Mode 3 shared bottom nav: Discover, Reels, Bookings, Messages, Me.
const SLOTS: Slot[] = [
  { routeName: 'index', iconName: 'home', label: 'Discover' },
  { routeName: 'reels', iconName: 'reels', label: 'Reels' },
  { routeName: 'bookings', iconName: 'bookings', label: 'Bookings' },
  { routeName: 'messages', iconName: 'messages', label: 'Messages' },
  { routeName: 'me', iconName: 'me', label: 'Me' },
]

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { colors, type } = useTheme()

  // TODO: pull display name/avatar from a profile store once it exists
  const avatarUrl = (user?.user_metadata?.avatar_url as string | undefined) ?? undefined
  const email = user?.email ?? ''
  const initials = email ? email.charAt(0).toUpperCase() : 'ST'

  return (
    <View
      style={[
        bar.container,
        {
          paddingBottom: insets.bottom,
          height: 68 + insets.bottom,
          backgroundColor: colors.bgSurface,
          borderTopColor: colors.borderSubtle,
        },
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

        // The active tab is named by colour and weight now. The amber underline is
        // gone: with labels visible it was a third signal saying the same thing.
        const tint = isFocused ? colors.actionText : colors.textSecondary

        return (
          <Pressable
            key={routeName}
            onPress={press}
            style={bar.slot}
            android_ripple={null}
            accessibilityRole="tab"
            accessibilityLabel={slot.label}
            accessibilityState={{ selected: isFocused }}
          >
            <TabIcon
              name={slot.iconName}
              focused={isFocused}
              color={tint}
              fallbackBg={colors.bgSubtle}
              avatarUrl={slot.iconName === 'me' ? avatarUrl : undefined}
              initials={slot.iconName === 'me' ? initials : undefined}
            />
            <Text
              numberOfLines={1}
              style={[
                type.caption,
                bar.label,
                { color: tint },
                isFocused && { fontFamily: 'Manrope_600SemiBold' },
              ]}
            >
              {slot.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

export default function TabLayout() {
  // A role-less user is redirected to path selection before reaching the shell
  // (see RootNavigator in app/_layout.tsx), so no orphan clients-row backfill
  // runs here anymore. Minting a row on tab mount silently trapped brand-new
  // users as permanent nameless clients; the backfill now happens only when a
  // user commits to the client path (app/path-selection.tsx).
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

// Colour comes from the theme at render time; only geometry lives here.
const bar = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    alignItems: 'flex-start',
    paddingTop: 10,
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    minHeight: 48,
  },
  label: {
    textAlign: 'center',
  },
})
