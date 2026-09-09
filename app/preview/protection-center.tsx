import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

// PRODUCT TRUTH: every line here was PRESENT tense — "Your bookings are
// protected", "Every booking comes with built-in protection". A "Coming soon"
// pill above a present-tense assertion does not neutralise it. The Book operates
// no payment protection of any kind (PD-042). Preview screens may NAME a future
// capability; they may not assert one.

// Ties to the future payment/protection build. Explainer only.
const PIECES: PreviewPiece[] = [
  {
    icon: 'shield-checkmark',
    title: 'Protected bookings',
    body: 'Every booking would come with built-in protection.',
  },
  {
    icon: 'refresh-circle',
    title: 'Refund and claim status',
    body: 'Track any refund or claim from start to finish.',
  },
  {
    icon: 'document-text',
    title: 'What is covered',
    body: 'Plain-language terms so you always know where you stand.',
  },
  {
    icon: 'headset',
    title: 'Real support',
    body: 'You would be able to talk to a person when you need help.',
  },
]

export default function ProtectionCenterPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="umbrella"
      title="Protection Center"
      lede="A future Protection Center would cover your bookings, track issues, and get you help if something goes wrong. None of it exists yet."
      pieces={PIECES}
      featureName="protection_center"
      footerNote="Would this give you peace of mind? Let us know."
    />
  )
}
