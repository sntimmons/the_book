import { router } from 'expo-router'
import PolicyEditor from '@/components/PolicyEditor'
import { useProviderStore } from '@/store/providerStore'
import { DEFAULT_POLICY } from '@/lib/policy'

export default function ProviderPolicy() {
  const setPolicy = useProviderStore((s) => s.setPolicy)
  return (
    <PolicyEditor
      mode="onboarding"
      // Continue persists the entered policy; "Use defaults" persists the real
      // default terms (not empty) so every provider goes live with a policy.
      onContinue={(value) => {
        setPolicy(value)
        router.push('/onboarding/provider/payout')
      }}
      onSkip={() => {
        setPolicy(DEFAULT_POLICY)
        router.push('/onboarding/provider/payout')
      }}
    />
  )
}
