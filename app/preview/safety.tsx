import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

// Reassuring tone. Framed as client verification and peace of mind only, never
// a bad-client callout or blocklist feature.
const PIECES: PreviewPiece[] = [
  {
    icon: 'person-circle',
    title: 'Client verification',
    body: 'A verified badge so you know who you are booking with.',
  },
  {
    icon: 'shield-checkmark',
    title: 'Safety for solo providers',
    body: 'Extra peace of mind when you work on your own.',
  },
  {
    icon: 'heart',
    title: 'Peace of mind',
    body: 'Show up to every appointment feeling confident and safe.',
  },
]

export default function SafetyPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="shield-checkmark"
      title="Safety & Verification"
      lede="Know who you are booking. Verify clients and feel safe, especially when you work alone."
      pieces={PIECES}
      featureName="safety"
      footerNote="Would this help you feel safer? Let us know."
    />
  )
}
