import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

const PIECES: PreviewPiece[] = [
  {
    icon: 'time',
    title: 'See who is open today',
    body: 'Browse providers with slots free right now, near you.',
  },
  {
    icon: 'flash',
    title: 'Book last-minute',
    body: 'Found a gap in your day? Fill it in a couple of taps.',
  },
  {
    icon: 'calendar',
    title: 'Fill provider gaps',
    body: 'Last-minute openings find clients instead of going to waste.',
  },
]

export default function AvailableTodayPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="flash"
      title="Available Today"
      lede="Need someone today? Find providers with open slots right now."
      pieces={PIECES}
      featureName="available_today"
      footerNote="Would you book same-day? Let us know."
    />
  )
}
