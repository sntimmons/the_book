import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

// PRODUCT TRUTH: this told clients to "Look for the badge that means their
// identity is confirmed" — an instruction to act NOW on a badge that no longer
// renders anywhere, because no identity-verification process exists to produce
// it (PD-004). A client following that instruction and finding no badge would
// read its absence as a specific provider failing a check, which is a worse
// trust outcome than the badge was.
//
// SECOND CORRECTION (audit F4). That pass fixed the PIECES and left the LEDE,
// which still read "Know your provider is real. See verified IDs, real reviews,
// and completed bookings before you book." — a present-tense instruction to do,
// before booking, a thing that cannot be done. The screen contradicted itself:
// its own card said a badge "would" show while its lede said to go and see one.
// The rule this file already states applies to both halves — a "Coming soon" tag
// above a present-tense assertion does not neutralise it, and of everything in
// this cluster an identity claim is the one a client is most likely to act on.

const PIECES: PreviewPiece[] = [
  {
    icon: 'card',
    title: 'ID verified providers',
    body: 'A badge would show when a provider\'s identity has been confirmed.',
  },
  {
    icon: 'star',
    title: 'Verified real reviews',
    body: 'Reviews from clients who actually booked, not strangers.',
  },
  {
    icon: 'checkmark-done',
    title: 'Completed booking counts',
    body: 'See how many appointments a provider has finished.',
  },
  {
    icon: 'lock-closed',
    title: 'Book with trust',
    body: 'Choose providers you can feel sure about.',
  },
]

export default function ProviderVerificationPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="ribbon"
      // PD-113: "Verified Providers" is not approved terminology while identity
      // verification is not live. The PM's alternatives — "Houston Beta Providers",
      // "Approved Providers" — name a SET of providers, and this screen is about a
      // future ID CHECK, so neither fits. "Provider ID checks" names the capability
      // without implying a category of providers that already passed one.
      title="Provider ID checks"
      lede="Knowing a provider is real should not take a leap of faith. Verified IDs would sit beside the reviews and completed-booking counts that already exist. The ID check does not exist yet, so nothing here is verifying identity today."
      pieces={PIECES}
      featureName="provider_verification"
      footerNote="Want this before you book? Let us know."
    />
  )
}
