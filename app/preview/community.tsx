import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

// The pieces that make the Hub more than service-swapping. Framed around
// community and advice only (no bad-client callout feature).
const PIECES: PreviewPiece[] = [
  {
    icon: 'swap-horizontal',
    title: 'Trade services',
    body: 'Your work for theirs, no cash. Swap a cut for a photo shoot.',
  },
  {
    icon: 'help-buoy',
    title: 'Ask for help and advice',
    body: 'Get answers from providers who have been there before.',
  },
  {
    icon: 'bulb',
    title: 'Share what works',
    body: 'Swap knowledge, tips, and the things that grew your book.',
  },
  {
    icon: 'people',
    title: 'Connect and network',
    body: 'Meet and look out for others who do what you do.',
  },
]

export default function CommunityPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="people"
      title="The Hub"
      lede="A space for providers. Trade services, ask for advice, share what works, and connect with others who do what you do."
      pieces={PIECES}
      featureName="community_hub"
      footerNote="Want this in your version? Let us know and we will build it with you."
    />
  )
}
