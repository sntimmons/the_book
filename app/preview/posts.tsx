import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

// Both sides post: providers show their work, clients show their results.
const PIECES: PreviewPiece[] = [
  {
    icon: 'briefcase',
    title: 'Providers post their work',
    body: 'Photos, videos, and updates that show what you do best.',
  },
  {
    icon: 'sparkles',
    title: 'Clients post their results',
    body: 'A fresh cut, a workout, a shoutout. Real results that lift your providers.',
  },
]

export default function PostsPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="grid"
      title="Posts"
      lede="Share your work and your results. Photos, videos, updates, and shoutouts, all in one place."
      pieces={PIECES}
      featureName="posts"
      footerNote="Would you post here? Tell us and we will know what to build first."
    />
  )
}
