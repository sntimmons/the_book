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
      // PRODUCT TRUTH (audit F4): read "Know who you are booking. Verify clients
      // and feel safe" — two present-tense instructions to verify a client, which
      // no process in this product can do (PD-004). Same correction as
      // provider-verification.tsx and for the same reason: of everything in this
      // cluster, a safety claim is the one a provider is most likely to rely on
      // when deciding whether to accept a stranger.
      lede="Working alone should not mean working blind. Client checks would let you know who is booking you before you accept. They do not exist yet — nothing in the app verifies a client today."
      pieces={PIECES}
      featureName="safety"
      footerNote="Would this help you feel safer? Let us know."
    />
  )
}
