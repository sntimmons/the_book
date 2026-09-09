import { router } from 'expo-router'
import PolicyEditor from '@/components/PolicyEditor'
import { useProviderStore } from '@/store/providerStore'
import { DEFAULT_POLICY } from '@/lib/policy'

// ITEM Y (Correction 3): this used to hand off to `/onboarding/provider/payout`,
// which was a REQUIRED step — "Step 7 of 8", a Continue button and no skip — for
// a capability that does not exist. Payouts are not available during beta, so the
// screen's only content was an apology, and every new provider had to walk past
// it. Item Y is explicit that payout setup must not be part of the minimum
// onboarding path. The screen itself is untouched and still reachable from the
// Business dashboard's Payouts entry; it is simply no longer in the way.
export default function ProviderPolicy() {
  const setPolicy = useProviderStore((s) => s.setPolicy)
  return (
    <PolicyEditor
      mode="onboarding"
      // Continue persists the entered policy; "Use defaults" persists the real
      // default terms (not empty) so every provider goes live with a policy.
      onContinue={(value) => {
        setPolicy(value)
        router.push('/onboarding/provider/review')
      }}
      onSkip={() => {
        setPolicy(DEFAULT_POLICY)
        router.push('/onboarding/provider/review')
      }}
    />
  )
}
