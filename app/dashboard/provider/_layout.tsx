import { Stack } from 'expo-router'

// Redirect-only group. The provider dashboard moved into the tab shell at
// /(tabs)/business (so the five-tab bar stays visible). These shim routes keep
// old /dashboard/provider* deep links working. See index.tsx and [...rest].tsx.
export default function LegacyDashboardLayout() {
  return <Stack screenOptions={{ headerShown: false }} />
}
