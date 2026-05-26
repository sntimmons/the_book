import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { View, ActivityIndicator } from 'react-native'
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

function RootNavigator() {
  const { session, isLoading } = useAuth()
  const segments = useSegments()
  const router = useRouter()

  useEffect(() => {
    if (isLoading) return

    const inTabsGroup = segments[0] === '(tabs)'
    const inDashboard = segments[0] === 'dashboard'
    const inOnboarding = segments[0] === 'onboarding'

    if (!session) {
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
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#080808' },
      }}
    />
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
