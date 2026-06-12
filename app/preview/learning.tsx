import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

const PIECES: PreviewPiece[] = [
  {
    icon: 'calculator',
    title: 'Tax and finance basics',
    body: 'Write-offs, saving for taxes, and keeping more of what you earn.',
  },
  {
    icon: 'pricetag',
    title: 'Pricing your services',
    body: 'Charge what you are worth without scaring clients away.',
  },
  {
    icon: 'trending-up',
    title: 'Growing your clients',
    body: 'Simple ways to get booked more and keep people coming back.',
  },
  {
    icon: 'chatbubbles',
    title: 'Real provider advice',
    body: 'Lessons from people who have built a business doing this.',
  },
]

export default function LearningPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="school"
      title="Learn the Business"
      lede="Learn to run your business. Tax write-offs, pricing, and growing your client base, from people who have done it."
      pieces={PIECES}
      featureName="learning"
      footerNote="Want to learn this inside the app? Let us know."
    />
  )
}
