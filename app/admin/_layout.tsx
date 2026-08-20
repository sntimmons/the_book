import { useEffect } from 'react'
import { Stack, router } from 'expo-router'
import { useAuth } from '@/context/AuthContext'

export default function AdminLayout() {
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
