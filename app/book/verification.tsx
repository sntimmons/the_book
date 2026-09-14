import { router } from 'expo-router'
import { useBookingStore } from '@/store/bookingStore'
import TerminalStatement from '@/components/ui/TerminalStatement'
import Button from '@/components/ui/Button'

// Beta identity-verification trust notice, shown once near the start of the
// booking journey for unverified users. This is an EDUCATION screen only — there
// is no real verification here (no form, no upload, no scan, no vendor). It never
// changes any verification state. In beta, "Continue Booking" proceeds normally.
export default function BookVerification() {
  const { setVerificationNoticeAcknowledged } = useBookingStore()

  function continueBooking() {
    // Acknowledged for this booking attempt so it is not shown again on re-entry.
    // This does NOT mark the user verified and writes nothing to the database.
    setVerificationNoticeAcknowledged(true)
    // Replace so the notice is not re-entered when the user backs out of service.
    router.replace('/book/service')
  }

  return (
    <TerminalStatement
      eyebrow="IDENTITY VERIFICATION COMING SOON"
      title="Built on real people."
      body={[
        'Third is being built around trust.',
        'Before real transactions go live, both clients and providers will verify their identity so everyone knows they\u2019re connecting with a real person.',
        'For beta, identity verification is still being finalized, so you can continue booking for now.',
        'Thanks for helping us build a safer community from day one.',
      ]}
      // A notice BEFORE the flow, not after an irreversible step, so backing out
      // of it is legitimate and the control is offered.
      onBack={() => router.back()}
      testID="book-verification"
      actions={
        <>
          <Button label="Continue booking" onPress={continueBooking} testID="verification-continue" />
          <Button label="Not now" variant="tertiary" onPress={() => router.back()} fullWidth />
        </>
      }
    />
  )
}
