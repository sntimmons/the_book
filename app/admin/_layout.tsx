import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { useAuth } from '@/context/AuthContext'

// Admin screens exist for LOCAL DEVELOPMENT ONLY. The exported layout hard-gates
// on __DEV__ (false in production/TestFlight builds) and returns null before any
// hook runs or admin UI mounts — so there is no flash and no reach via deep link
// in production. The inner component (with the auth hooks) only ever mounts in
// dev. The isProvider guard below stays as the dev-time restriction. Screens are
// kept in the tree, just unreachable in prod.
export default function AdminLayout() {
  if (!__DEV__) return null
  return <AdminLayoutDev />
}

function AdminLayoutDev() {
  const { user, isProvider, roleLoading } = useAuth()

  // Gate the admin section: require authentication, and (until a real admin
  // flag exists) restrict to providers. Everyone else is bounced out.
  useEffect(() => {
    if (roleLoading) return
    if (!user) {
      router.replace('/')
    } else if (!isProvider) {
      router.replace('/(tabs)/')
    }
  }, [user, isProvider, roleLoading])

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: false,
        contentStyle: {
          backgroundColor: '#080808',
        },
      }}
    />
  )
}
