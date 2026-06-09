import { Stack } from 'expo-router'

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        gestureEnabled: true,
        fullScreenGestureEnabled: true,
      }}
    >
      {/* Block swipe-back mid-verification so a half-entered OTP isn't lost to
          an accidental swipe. The verify screen keeps its on-screen back arrow
          and "Wrong number?" link for deliberate back navigation. */}
      <Stack.Screen
        name="verify"
        options={{ gestureEnabled: false, fullScreenGestureEnabled: false }}
      />
    </Stack>
  )
}
