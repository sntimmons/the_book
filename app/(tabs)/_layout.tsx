import { Tabs, router } from 'expo-router'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

type TabItem =
  | { name: 'index' | 'search' | 'new' | 'me'; icon: string | null; label: string; href?: never }
  | { name: string; icon: string; label: string; href: string }

const TAB_ITEMS: TabItem[] = [
  { name: 'index', icon: '⌂', label: 'Home' },
  { name: 'search', icon: '⌕', label: 'Search' },
  { name: 'new', icon: null, label: '' },
  { name: 'messages-tab', icon: '✉', label: 'Messages', href: '/messages' },
  { name: 'me', icon: '◯', label: 'Me' },
]

function CustomTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()

  return (
    <View style={[bar.container, { paddingBottom: insets.bottom, height: 56 + insets.bottom }]}>
      {TAB_ITEMS.map((tab, idx) => {
        const route = state.routes[idx]
        const isFocused = state.index === idx
        const isCenter = tab.name === 'new'

        function handlePress() {
          if ('href' in tab && tab.href) {
            router.push(tab.href as any)
            return
          }
          const event = navigation.emit({ type: 'tabPress', target: route?.key ?? '', canPreventDefault: true })
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(tab.name as any)
          }
        }

        if (isCenter) {
          return (
            <TouchableOpacity key={tab.name} activeOpacity={0.8} onPress={handlePress} style={bar.centerWrap}>
              <View style={bar.centerBtn}>
                <Text style={bar.centerIcon}>+</Text>
              </View>
            </TouchableOpacity>
          )
        }

        return (
          <TouchableOpacity key={tab.name} activeOpacity={0.7} onPress={handlePress} style={bar.tab}>
            <Text style={[bar.icon, isFocused ? bar.iconActive : bar.iconInactive]}>{tab.icon}</Text>
            <Text style={[bar.label, isFocused ? bar.labelActive : bar.labelInactive]}>{tab.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

export default function TabLayout() {
  return (
    <Tabs tabBar={(props) => <CustomTabBar {...props} />}>
      <Tabs.Screen name="index" options={{ headerShown: false }} />
      <Tabs.Screen name="search" options={{ headerShown: false }} />
      <Tabs.Screen name="new" options={{ headerShown: false }} />
      <Tabs.Screen name="bookings" options={{ headerShown: false, href: null }} />
      <Tabs.Screen name="me" options={{ headerShown: false }} />
    </Tabs>
  )
}

const bar = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    alignItems: 'center',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  icon: {
    fontSize: 22,
    lineHeight: 26,
  },
  iconActive: {
    color: '#F0E8D5',
  },
  iconInactive: {
    color: 'rgba(240,232,213,0.3)',
  },
  label: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    marginTop: 3,
  },
  labelActive: {
    color: '#F0E8D5',
  },
  labelInactive: {
    color: 'rgba(240,232,213,0.3)',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -16,
  },
  centerIcon: {
    fontSize: 22,
    color: '#080808',
    lineHeight: 26,
    fontFamily: 'Manrope_700Bold',
  },
})
