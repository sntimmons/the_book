import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

// PRODUCT TRUTH: this told clients to "Look for the badge that means their
// identity is confirmed" — an instruction to act NOW on a badge that no longer
// renders anywhere, because no identity-verification process exists to produce
// it (PD-004). A client following that instruction and finding no badge would
// read its absence as a specific provider failing a check, which is a worse
// trust outcome than the badge was.

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
      title="Verified Providers"
      lede="Know your provider is real. See verified IDs, real reviews, and completed bookings before you book."
      pieces={PIECES}
      featureName="provider_verification"
      footerNote="Want this before you book? Let us know."
    />
  )
}
