import { Stack } from 'expo-router'

export default function ProviderOnboardingLayout() {
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
