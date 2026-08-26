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
  const { session, isLoading, role, roleLoading, roleError, retryRole } = useAuth()
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
      return
    }

    // Defense-in-depth for the "permanent nameless client" trap: a signed-in
    // user whose role resolved to null (no clients or providers row, i.e. has
    // not chosen a path yet) must never sit in the tab shell or dashboard,
    // where the app would otherwise mint a clients row and lock them in as a
    // client forever. Route them to path selection instead. Onboarding and
    // path-selection are excluded (role null is a legitimate in-progress state
    // there); roleError has its own retry screen; while roleLoading we wait
    // rather than bounce a user whose role is mid-resolve (e.g. just-onboarded).
    if (session && !roleLoading && !roleError && role === null) {
      if (inTabsGroup || inDashboard) {
        router.replace('/path-selection')
      }
    }
  }, [session, isLoading, role, roleLoading, roleError, segments])

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
        {/* Dashboard is a PUSHED destination reached from the Me tab's My Studio
            entrance, so it inherits the root swipe-back (gestureEnabled: true,
            edge-only) — a provider swipes back to the tab shell. No explicit
            override needed. */}
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
