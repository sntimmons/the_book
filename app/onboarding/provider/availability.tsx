import { router } from 'expo-router'
import AvailabilityEditor from '@/components/AvailabilityEditor'

export default function OnboardingAvailability() {
  return (
    <AvailabilityEditor
      mode="onboarding"
      onContinue={() => router.push('/onboarding/provider/policy')}
      onSkip={() => router.push('/onboarding/provider/policy')}
    />
  )
}
