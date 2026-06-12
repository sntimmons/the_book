import { PreviewScreen, PreviewPiece } from '../../components/PreviewScreen'

const PIECES: PreviewPiece[] = [
  {
    icon: 'paper-plane',
    title: 'Send an agreement',
    body: 'Share a simple service agreement before the work begins.',
  },
  {
    icon: 'create',
    title: 'Client signs',
    body: 'They review and sign right in the app, no printing needed.',
  },
  {
    icon: 'list',
    title: 'Clear terms',
    body: 'Spell out the work, the price, and the cancellation rules.',
  },
  {
    icon: 'folder-open',
    title: 'A record kept',
    body: 'Every signed agreement saved and easy to find later.',
  },
]

export default function ContractsPreviewScreen() {
  return (
    <PreviewScreen
      heroIcon="document-text"
      title="Contracts"
      lede="Send and sign simple service agreements right in the app. Protect yourself and your clients."
      pieces={PIECES}
      featureName="contracts"
      footerNote="Would you use agreements like this? Let us know."
    />
  )
}
