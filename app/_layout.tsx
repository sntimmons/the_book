import { useEffect } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context'
import { View, Text, ActivityIndicator, TouchableOpacity } from 'react-native'
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope'
import * as SplashScreen from 'expo-splash-screen'
import * as Sentry from '@sentry/react-native'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { PROVIDER_LANDS_IN_TABS } from '@/lib/featureFlags'

// Crash + error reporting. Disabled in dev (errors still hit the console) so we
// only ingest real production failures. Must run before the root renders.
Sentry.init({
  dsn: 'https://65ff1fe11f07d9b71b9e8531cdef8d7b@o4511946923048960.ingest.sentry.io/4511947027841024',
  enabled: !__DEV__,
  environment: __DEV__ ? 'development' : 'production',
  tracesSampleRate: 0.2,
  debug: false,
})

SplashScreen.preventAutoHideAsync()

const DEV_MODE = __DEV__ && false
// Prod-safe: __DEV__ is false in production builds, so DEV_MODE can never be
// true there regardless of the second operand. Flip `false` to `true` to enable
// the dev auth bypass locally (still can't leak to prod).

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

// Shown when role resolution failed (network/RLS) instead of silently treating
// the user as role-less and creating a phantom clients row.
function RoleErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#080808',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
      }}
    >
      <Text
        style={{
          color: '#F0E8D5',
          fontFamily: 'Manrope_700Bold',
          fontSize: 17,
          textAlign: 'center',
        }}
      >
        Couldn&apos;t load your account
      </Text>
      <Text
        style={{
          color: 'rgba(240,232,213,0.5)',
          fontFamily: 'Manrope_400Regular',
          fontSize: 13,
          textAlign: 'center',
          marginTop: 8,
          lineHeight: 19,
        }}
      >
        {message}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        activeOpacity={0.85}
        style={{
          marginTop: 24,
          backgroundColor: '#F0E8D5',
          borderRadius: 14,
          height: 48,
          paddingHorizontal: 32,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: '#080808', fontFamily: 'Manrope_700Bold', fontSize: 15 }}>
          Retry
        </Text>
      </TouchableOpacity>
    </View>
  )
}

function RootNavigator() {
  const { session, isLoading, roleError, retryRole } = useAuth()
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

  // Role lookup failed for a signed-in user — offer a retry instead of
  // proceeding (which would risk creating a phantom clients row).
  if (session && roleError) {
    return <RoleErrorScreen message={roleError} onRetry={retryRole} />
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Back-swipe is EDGE-only (fullScreenGestureEnabled: false) app-wide.
          The full-screen variant let a swipe start anywhere, and testers were
          triggering accidental back navigations mid-screen. Edge-swipe keeps the
          intentional left-edge gesture while ignoring mid-screen drags. */}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#080808' },
          gestureEnabled: true,
          fullScreenGestureEnabled: false,
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
        {/* Dashboard swipe-back is gated on PROVIDER_LANDS_IN_TABS, which is now
            false (Option B): providers LAND in the dashboard via router.replace,
            so it is the root of their stack. The gesture stays DISABLED here so a
            landed provider cannot swipe back across the auth boundary to welcome /
            sign-up. They reach the shared app via the header "Explore" button and
            the drawer's "Back to The Book"; both go to /(tabs)/. (If the flag were
            flipped back to true, the dashboard becomes a pushed section and the
            gesture re-enables to swipe back to the Me tab.) */}
        <Stack.Screen
          name="dashboard/provider"
          options={{
            gestureEnabled: PROVIDER_LANDS_IN_TABS,
            fullScreenGestureEnabled: PROVIDER_LANDS_IN_TABS,
          }}
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

// Fallback shown if a render error escapes all the way to the root, instead of
// a white screen. The error itself is captured by the Sentry ErrorBoundary.
function CrashFallback() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#080808',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
      }}
    >
      <Text
        style={{
          color: '#F0E8D5',
          fontFamily: 'Manrope_700Bold',
          fontSize: 16,
          textAlign: 'center',
        }}
      >
        Something went wrong.
      </Text>
      <Text
        style={{
          color: 'rgba(240,232,213,0.5)',
          fontFamily: 'Manrope_400Regular',
          fontSize: 13,
          textAlign: 'center',
          marginTop: 8,
        }}
      >
        Please close and reopen the app.
      </Text>
    </View>
  )
}

function RootLayout() {
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
      <Sentry.ErrorBoundary fallback={<CrashFallback />}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </Sentry.ErrorBoundary>
    </SafeAreaProvider>
  )
}

export default Sentry.wrap(RootLayout)
