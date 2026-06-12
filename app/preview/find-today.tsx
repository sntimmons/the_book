import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

// Covers both ways to solve an urgent booking: tell us what you need and get
// matched (request-based), or browse who is open right now (browse-based).
const PIECES: PreviewPiece[] = [
  {
    icon: 'create',
    title: 'Tell us what you need',
    body: 'Service, time, budget, and area, in a few taps, and get matched.',
  },
  {
    icon: 'time',
    title: 'See who is open right now',
    body: 'Or browse providers with slots free today, near you.',
  },
  {
    icon: 'flash',
    title: 'Book last-minute',
    body: 'Lock in an appointment in minutes, not days.',
  },
  {
    icon: 'happy',
    title: 'Never get stuck',
    body: 'Always a way to find help when you need it today.',
  },
]

export default function FindTodayPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="search"
      title="Find Me Someone Today"
      lede="Need someone today? Tell us what you need and get matched, or browse who is open right now, and book in minutes."
      pieces={PIECES}
      featureName="find_today"
      footerNote="Would you use same-day booking? Let us know."
    />
  )
}
