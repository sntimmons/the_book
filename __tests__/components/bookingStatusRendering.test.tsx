import { render, screen, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { APPEARANCE_STORAGE_KEY, ThemeProvider } from '@/context/ThemeContext'
import { DARK_COLORS, LIGHT_COLORS, type ColorScheme } from '@/lib/theme/tokens'
import { bookingRequestUrgency, bookingStatusTone } from '@/lib/bookingStatus'
import StatusBadge from '@/components/ui/StatusBadge'

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}))

// EVERY STATUS THE SERVER CAN SEND, RENDERED THE WAY A CLIENT WILL SEE IT.
//
// This joins the two authorities the migrated Bookings list relies on —
// `lib/bookingStatus.ts` for the human label and `lib/theme/statusTone.ts` for the
// treatment — so a change to either is caught here rather than on a user's screen.

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[])

async function renderIn(scheme: ColorScheme, ui: React.ReactElement) {
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, scheme)
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

beforeEach(async () => {
  await AsyncStorage.clear()
})

// status -> the label a human should read
const CASES: [string, string][] = [
  ['pending', 'Pending'],
  ['accepted', 'Confirmed'],
  ['arriving', 'Confirmed'],
  ['checked_in', 'Confirmed'],
  ['rescheduled', 'Confirmed'],
  ['completed', 'Completed'],
  ['no_show', 'No show'],
  ['declined', 'Declined'],
  ['canceled', 'Cancelled'],
  ['cancelled', 'Cancelled'],
  ['cancelled_by_client', 'Cancelled'],
  ['cancelled_by_provider', 'Cancelled'],
  ['late_cancelled', 'Cancelled'],
]

describe('every booking status reads as a human label', () => {
  it.each(CASES)('%s renders as "%s"', async (status, label) => {
    await renderIn('light', <StatusBadge status={status} />)
    await waitFor(() => expect(screen.getByText(label)).toBeTruthy())
    // Never the raw enum.
    if (status !== label) expect(screen.queryByText(status)).toBeNull()
  })
})

describe.each<[ColorScheme, typeof LIGHT_COLORS]>([
  ['light', LIGHT_COLORS],
  ['dark', DARK_COLORS],
])('no booking status is styled as an error under %s', (scheme, palette) => {
  it.each(CASES)('%s avoids the danger colour', async (status) => {
    await renderIn(scheme, <StatusBadge status={status} testID="badge" />)
    await waitFor(() => expect(screen.getByTestId('badge')).toBeTruthy())
    const box = flatten(screen.getByTestId('badge').props.style)
    expect(box.borderColor).not.toBe(palette.statusDanger)
  })

  it('an outcome uses the neutral role, not danger', async () => {
    await renderIn(scheme, <StatusBadge status="declined" />)
    const label = await screen.findByText('Declined')
    expect(flatten(label.props.style).color).toBe(palette.statusOutcome)
    expect(flatten(label.props.style).color).not.toBe(palette.statusDanger)
  })

  it('a confirmed booking uses the truthful-status role', async () => {
    await renderIn(scheme, <StatusBadge status="accepted" />)
    const label = await screen.findByText('Confirmed')
    expect(flatten(label.props.style).color).toBe(palette.statusLocal)
  })
})

// THE LIST'S OWN DERIVATION, MIRRORED.
//
// Expiry is not in the status enum — the list computes it from `expires_at` and
// hands the answer to the badge. This reproduces that wiring so the pair is tested
// together, not just the badge in isolation.
describe('an expired request is distinguished from a live one', () => {
  const derive = (row: { submitted_at: string | null; expires_at: string | null }, status: string) =>
    bookingStatusTone(status) === 'pending' &&
    bookingRequestUrgency(row, Date.now()) === 'expired'

  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  it('reads Expired once the deadline has passed', async () => {
    const expired = derive({ submitted_at: past, expires_at: past }, 'pending')
    expect(expired).toBe(true)
    await renderIn('light', <StatusBadge status="pending" expired={expired} />)
    await waitFor(() => expect(screen.getByText('Expired')).toBeTruthy())
    expect(screen.queryByText('Pending')).toBeNull()
  })

  it('still reads Pending while the deadline is live', async () => {
    const expired = derive({ submitted_at: past, expires_at: future }, 'pending')
    expect(expired).toBe(false)
    await renderIn('light', <StatusBadge status="pending" expired={expired} />)
    await waitFor(() => expect(screen.getByText('Pending')).toBeTruthy())
    expect(screen.queryByText('Expired')).toBeNull()
  })

  it('never expires a booking the provider already accepted', () => {
    expect(derive({ submitted_at: past, expires_at: past }, 'accepted')).toBe(false)
  })

  it('keeps Expired neutral in both appearances', async () => {
    for (const [scheme, palette] of [
      ['light', LIGHT_COLORS],
      ['dark', DARK_COLORS],
    ] as const) {
      await AsyncStorage.clear()
      const { unmount } = await renderIn(scheme, <StatusBadge status="pending" expired />)
      const label = await screen.findByText('Expired')
      expect(flatten(label.props.style).color).toBe(palette.statusOutcome)
      unmount()
    }
  })
})
