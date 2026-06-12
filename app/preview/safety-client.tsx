import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

// Reassuring tone, client-facing. About sharing and checking in for peace of
// mind, never about flagging or blocking anyone.
const PIECES: PreviewPiece[] = [
  {
    icon: 'share-social',
    title: 'Share your appointment',
    body: 'Send the details to a trusted contact before you go.',
  },
  {
    icon: 'checkmark-circle',
    title: 'Check in and out',
    body: 'A quick tap lets your contact know you arrived and left safely.',
  },
  {
    icon: 'home',
    title: 'In-home and solo visits',
    body: 'Extra reassurance for appointments at home or on your own.',
  },
  {
    icon: 'shield-checkmark',
    title: 'Book with confidence',
    body: 'Peace of mind built into every booking you make.',
  },
]

export default function SafetyClientPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="shield-checkmark"
      title="Safety"
      lede="Feel safe at every appointment. Share where you are with a friend, check in, and book with peace of mind."
      pieces={PIECES}
      featureName="safety_client"
      footerNote="Would this help you feel safer? Let us know."
    />
  )
}
