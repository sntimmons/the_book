import { Redirect, useLocalSearchParams } from 'expo-router'

// Catch-all legacy redirect: /dashboard/provider/<sub> -> /(tabs)/business/<sub>.
// Covers every old dashboard sub-route deep link in one file.
export default function LegacyDashboardCatchAllRedirect() {
  const { rest } = useLocalSearchParams<{ rest?: string | string[] }>()
  const sub = Array.isArray(rest) ? rest.join('/') : rest ?? ''
  const href = sub ? '/(tabs)/business/' + sub : '/(tabs)/business'
  return <Redirect href={href as never} />
}
