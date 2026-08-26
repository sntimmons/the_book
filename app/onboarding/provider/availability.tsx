import { router } from 'expo-router'
import AvailabilityEditor from '@/components/AvailabilityEditor'
import { useProviderStore } from '@/store/providerStore'

export default function OnboardingAvailability() {
  const setAvailability = useProviderStore((s) => s.setAvailability)
  return (
    <AvailabilityEditor
      mode="onboarding"
      // Continue: persist the entered schedule into the store so go-live can
      // write it once the providers row exists.
      onContinue={(value) => {
        setAvailability(value)
        router.push('/onboarding/provider/policy')
      }}
      // Skip: clear any prior value; go-live will warn that clients can't book.
      onSkip={() => {
        setAvailability(null)
        router.push('/onboarding/provider/policy')
      }}
    />
  )
}
