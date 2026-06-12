import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

// Ties to the future payment/protection build. Explainer only.
const PIECES: PreviewPiece[] = [
  {
    icon: 'shield-checkmark',
    title: 'Protected bookings',
    body: 'Every booking comes with built-in protection.',
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
    body: 'Talk to a person when you need help.',
  },
]

export default function ProtectionCenterPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="umbrella"
      title="Protection Center"
      lede="Your bookings are protected. See what is covered, track any issues, and get help if something goes wrong."
      pieces={PIECES}
      featureName="protection_center"
      footerNote="Would this give you peace of mind? Let us know."
    />
  )
}
