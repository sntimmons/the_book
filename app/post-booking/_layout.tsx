import { Stack } from 'expo-router'

export default function PostBookingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: '#080808' },
      }}
    />
  )
}
