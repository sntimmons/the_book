import { router } from 'expo-router'

// Shared back action for the provider dashboard section screens. Pops to wherever
// the user came from; if history is empty (e.g. arriving via a replace from a
// terminal flow) it falls back to the dashboard home so the user is never
// stranded. Matches the dashboard home chevron from phase 1.
export function dashboardBack() {
  if (router.canGoBack()) router.back()
  else router.replace('/dashboard/provider')
}
