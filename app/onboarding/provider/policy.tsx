import { router } from 'expo-router'
import PolicyEditor from '@/components/PolicyEditor'
import { useProviderStore } from '@/store/providerStore'
import { DEFAULT_POLICY } from '@/lib/policy'

// ITEM Y (Correction 3): this used to hand off to `/onboarding/provider/payout`,
// which was a REQUIRED step — "Step 7 of 8", a Continue button and no skip — for
// a capability that does not exist. Payouts are not available during beta, so the
// screen's only content was an apology, and every new provider had to walk past
// it. Item Y is explicit that payout setup must not be part of the minimum
// onboarding path.
//
// The onboarding payout screen has been DELETED rather than left behind. An
// earlier draft of this comment said it was "still reachable from the Business
// dashboard's Payouts entry" — it was not: that entry goes to
// `app/(tabs)/business/payouts.tsx`, a different file with the same explanation.
// Taking a screen out of a flow and leaving it in the tree gives you two files
// answering one product question, and the next copy change lands in only one.
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
