import { Redirect } from 'expo-router'

// Legacy /dashboard/provider -> /(tabs)/business (the dashboard now lives in the
// tab shell). Keeps old deep links and any stray navigations working.
export default function LegacyDashboardIndexRedirect() {
  return <Redirect href={'/(tabs)/business' as never} />
}
