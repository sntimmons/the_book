import { Stack } from 'expo-router'

export default function Layout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        presentation: 'card',
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#080808' },
      }}
    />
  )
}
