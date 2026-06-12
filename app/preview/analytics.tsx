import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

const PIECES: PreviewPiece[] = [
  {
    icon: 'cash',
    title: 'Earnings overview',
    body: 'What you made this week, month, and year at a glance.',
  },
  {
    icon: 'trending-up',
    title: 'Booking trends',
    body: 'See your busy days and quiet ones so you can plan ahead.',
  },
  {
    icon: 'people',
    title: 'Client insights',
    body: 'Who books most, who is new, and who has not been back.',
  },
  {
    icon: 'receipt',
    title: 'Clean records for taxes',
    body: 'Tidy numbers ready when tax season comes around.',
  },
]

export default function AnalyticsPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="bar-chart"
      title="Money & Analytics"
      lede="See your earnings, bookings, and business health in one place. Stop juggling spreadsheets."
      pieces={PIECES}
      featureName="analytics"
      footerNote="Would this help you run your business? Let us know."
    />
  )
}
