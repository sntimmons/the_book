import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { APPEARANCE_STORAGE_KEY, ThemeProvider } from '@/context/ThemeContext'
import { DARK_COLORS, LIGHT_COLORS, type ColorScheme } from '@/lib/theme/tokens'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/ui/StatusBadge'
import EmptyState from '@/components/ui/EmptyState'
import ErrorState from '@/components/ui/ErrorState'
import Avatar from '@/components/ui/Avatar'
import { StepProgress } from '@/components/StepProgress'

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}))

// Every shared primitive must render correctly under BOTH appearances. These assert
// the resolved colour, not a snapshot, so a token regression fails loudly instead of
// silently updating an image.

async function renderIn(scheme: ColorScheme, ui: React.ReactElement) {
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, scheme)
  // Each test waits for its OWN assertion rather than for output to exist — a
  // component that correctly renders nothing (StepProgress with a null label) is a
  // valid result, not something to wait out.
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...[style].flat(Infinity).filter(Boolean) as object[])

beforeEach(async () => {
  await AsyncStorage.clear()
})

describe.each<[ColorScheme, typeof LIGHT_COLORS]>([
  ['light', LIGHT_COLORS],
  ['dark', DARK_COLORS],
])('under %s', (scheme, palette) => {
  it('renders a primary button on the action colour with on-action text', async () => {
    await renderIn(scheme, <Button label="Request booking" testID="btn" />)
    await waitFor(() => {
      expect(flatten(screen.getByTestId('btn').props.style).backgroundColor).toBe(
        palette.actionPrimary,
      )
    })
    expect(flatten(screen.getByText('Request booking').props.style).color).toBe(
      palette.textOnAction,
    )
  })

  it('renders a tertiary button as a link, with no fill', async () => {
    await renderIn(scheme, <Button label="See all" variant="tertiary" testID="btn" />)
    await waitFor(() => {
      expect(flatten(screen.getByText('See all').props.style).color).toBe(palette.actionText)
    })
    expect(flatten(screen.getByTestId('btn').props.style).backgroundColor).toBeUndefined()
  })

  it('marks a disabled button as disabled for assistive tech', async () => {
    const onPress = jest.fn()
    await renderIn(scheme, <Button label="Go live" disabled onPress={onPress} testID="btn" />)
    const btn = screen.getByTestId('btn')
    expect(btn.props.accessibilityState.disabled).toBe(true)
    fireEvent.press(btn)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('gives a confirmed booking the truthful-status colour', async () => {
    await renderIn(scheme, <StatusBadge status="accepted" testID="badge" />)
    await waitFor(() => {
      expect(flatten(screen.getByTestId('badge').props.style).borderColor).toBe(
        palette.statusLocal,
      )
    })
    expect(screen.getByText('Confirmed')).toBeTruthy()
  })

  it('keeps an expired request neutral and never danger', async () => {
    await renderIn(scheme, <StatusBadge status="pending" expired testID="badge" />)
    await waitFor(() => expect(screen.getByText('Expired')).toBeTruthy())
    const style = flatten(screen.getByTestId('badge').props.style)
    expect(style.borderColor).toBe(palette.borderSubtle)
    expect(style.borderColor).not.toBe(palette.statusDanger)
    expect(flatten(screen.getByText('Expired').props.style).color).toBe(palette.statusOutcome)
  })

  it('keeps a declined booking out of the danger family', async () => {
    await renderIn(scheme, <StatusBadge status="declined" testID="badge" />)
    await waitFor(() => expect(screen.getByText('Declined')).toBeTruthy())
    expect(flatten(screen.getByText('Declined').props.style).color).toBe(palette.statusOutcome)
  })

  it('renders an empty state without the danger colour', async () => {
    await renderIn(scheme, <EmptyState title="No reviews yet" body="Be the first." />)
    await waitFor(() => expect(screen.getByText('No reviews yet')).toBeTruthy())
    expect(flatten(screen.getByText('No reviews yet').props.style).color).toBe(
      palette.textPrimary,
    )
  })

  it('uses danger only for a real error, and offers a retry', async () => {
    const onRetry = jest.fn()
    await renderIn(
      scheme,
      <ErrorState title="Could not load this" body="Check your connection." onRetry={onRetry} />,
    )
    await waitFor(() => expect(screen.getByText('Could not load this')).toBeTruthy())
    expect(flatten(screen.getByText('Could not load this').props.style).color).toBe(
      palette.statusDanger,
    )
    fireEvent.press(screen.getByText('Try again'))
    expect(onRetry).toHaveBeenCalled()
  })

  it('does NOT dress messaging-unavailable as an error', async () => {
    await renderIn(
      scheme,
      <ErrorState title="Messaging is not available for this conversation." tone="quiet" />,
    )
    const line = await screen.findByText('Messaging is not available for this conversation.')
    // No cause named, no retry offered, and not the danger colour — it must not
    // reveal a block, moderation state, or a private account.
    expect(flatten(line.props.style).color).toBe(palette.textSecondary)
    expect(screen.queryByText('Try again')).toBeNull()
  })

  it('renders initials when a provider has no photo, without penalty styling', async () => {
    await renderIn(scheme, <Avatar name="Wesley Kim" testID="avatar" />)
    await waitFor(() => expect(screen.getByText('WK')).toBeTruthy())
    expect(flatten(screen.getByTestId('avatar').props.style).backgroundColor).toBe(
      palette.bgSubtle,
    )
  })

  it('renders the step label on the secondary text role', async () => {
    await renderIn(scheme, <StepProgress label="Step 3" />)
    await waitFor(() => expect(screen.getByText('Step 3')).toBeTruthy())
    expect(flatten(screen.getByText('Step 3').props.style).color).toBe(palette.textSecondary)
  })

  it('renders nothing at all for a null step label', async () => {
    const { toJSON } = await renderIn(scheme, <StepProgress label={null} />)
    expect(toJSON()).toBeNull()
  })
})
