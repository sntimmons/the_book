import { Stack } from 'expo-router'

export default function ReelsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#000000' },
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    />
  )
}
