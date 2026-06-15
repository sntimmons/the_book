import { Stack } from 'expo-router'

export default function PreviewLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: false,
        contentStyle: { backgroundColor: '#080808' },
      }}
    />
  )
}
