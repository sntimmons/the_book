import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

const PIECES: PreviewPiece[] = [
  {
    icon: 'heart',
    title: 'Save photos and reels',
    body: 'Tap to save any provider photo or reel you love.',
  },
  {
    icon: 'albums',
    title: 'Build inspiration boards',
    body: 'Group your saves into boards by look or occasion.',
  },
  {
    icon: 'attach',
    title: 'Attach inspo when booking',
    body: 'Send your inspiration straight to your provider.',
  },
  {
    icon: 'sparkles',
    title: 'Get the look you want',
    body: 'Show, do not just tell, and book with confidence.',
  },
]

export default function LookbookPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="images"
      title="Lookbook"
      lede="Save the looks you love. Build inspiration boards and show your provider exactly what you want."
      pieces={PIECES}
      featureName="lookbook"
      footerNote="Would you build a lookbook? Let us know."
    />
  )
}
