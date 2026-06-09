import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, Text, ActivityIndicator } from 'react-native'
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope'
import * as SplashScreen from 'expo-splash-screen'
import { AuthProvider, useAuth } from '@/context/AuthContext'

SplashScreen.preventAutoHideAsync()

const DEV_MODE = true
// Set to false before TestFlight

function DevBadge() {
  const insets = useSafeAreaInsets()
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: insets.top + 4,
        right: 8,
        zIndex: 9999,
        backgroundColor: 'rgba(200,146,42,0.9)',
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: 9, color: '#080808', fontFamily: 'Manrope_700Bold' }}>DEV</Text>
    </View>
  )
}

function RootNavigator() {
  const { session, isLoading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return

    const inTabsGroup = segments[0] === '(tabs)'
    const inDashboard = segments[0] === 'dashboard'
    const inOnboarding = segments[0] === 'onboarding'

    if (!DEV_MODE && !session) {
      if (inTabsGroup || inDashboard || inOnboarding) {
        router.replace('/')
      }
    }
  }, [session, isLoading, segments])

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#080808',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <ActivityIndicator color="rgba(240,232,213,0.6)" size="large" />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#080808' },
          gestureEnabled: true,
          fullScreenGestureEnabled: true,
        }}
      >
        {/* Root-stack swipe-back is on so pushed detail screens (providers,
            reviews, settings, etc.) can be dragged back. But after login the
            welcome/auth screens still sit BELOW these containers in the root
            stack, so the gesture is disabled on them — a signed-in user must
            not be able to swipe back across the auth boundary to welcome /
            sign-up. Logging out (router.replace('/')) is the only way back. */}
        <Stack.Screen
          name="(tabs)"
          options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
        />
        <Stack.Screen
          name="dashboard/provider"
          options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
        />
        <Stack.Screen
          name="path-selection"
          options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
        />
      </Stack>
      {__DEV__ && DEV_MODE && <DevBadge />}
    </View>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  })

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync()
    }
  }, [fontsLoaded, fontError])

  if (!fontsLoaded && !fontError) return null

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  )
}
