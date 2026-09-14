import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { APPEARANCE_STORAGE_KEY, ThemeProvider } from '@/context/ThemeContext'
import { DARK_COLORS, LIGHT_COLORS, type ColorScheme } from '@/lib/theme/tokens'
import BookingFlowScreen, {
  BookingFlowHeading,
  BookingFlowNote,
} from '@/components/ui/BookingFlowScreen'
import TerminalStatement from '@/components/ui/TerminalStatement'
import AcknowledgeRow from '@/components/ui/AcknowledgeRow'
import DayCell from '@/components/ui/DayCell'
import TimeSlot from '@/components/ui/TimeSlot'
import Button from '@/components/ui/Button'

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}))

// The Phase 2C booking-flow primitives, asserted on resolved colour and on
// accessibility state rather than on a snapshot: a token regression or a lost
// `accessibilityState` must fail loudly instead of quietly updating an image.

// The flow shell reads safe-area insets for its sticky footer, so the harness has
// to supply them — with fixed metrics, so a layout assertion is deterministic.
const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
}

async function renderIn(scheme: ColorScheme, ui: React.ReactElement) {
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, scheme)
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ThemeProvider>{ui}</ThemeProvider>
    </SafeAreaProvider>,
  )
}

const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]))

beforeEach(async () => {
  await AsyncStorage.clear()
})

// ── The shell ────────────────────────────────────────────────────────────
describe('BookingFlowScreen', () => {
  it('shows the step label it is given', async () => {
    await renderIn(
      'light',
      <BookingFlowScreen progressLabel="Step 3 of 5">
        <BookingFlowHeading title="Pick a date" />
      </BookingFlowScreen>,
    )
    await waitFor(() => expect(screen.getByText('Step 3 of 5')).toBeTruthy())
  })

  it('shows NO step label when there is none to show', async () => {
    // PROGRESS TRUTH: a total that is not yet known may not be claimed. The shell
    // renders nothing rather than inventing "Step 1 of ?".
    await renderIn(
      'light',
      <BookingFlowScreen progressLabel={null}>
        <BookingFlowHeading title="Pick a date" />
      </BookingFlowScreen>,
    )
    await waitFor(() => expect(screen.getByText('Pick a date')).toBeTruthy())
    expect(screen.queryByText(/Step/)).toBeNull()
  })

  it('offers a back control only when a handler is supplied', async () => {
    const onBack = jest.fn()
    const { unmount } = await renderIn(
      'light',
      <BookingFlowScreen progressLabel="Step 1 of 4" onBack={onBack}>
        <BookingFlowHeading title="Pick a date" />
      </BookingFlowScreen>,
    )
    await waitFor(() => expect(screen.getByLabelText('Go back')).toBeTruthy())
    fireEvent.press(screen.getByLabelText('Go back'))
    expect(onBack).toHaveBeenCalled()
    unmount()

    await renderIn(
      'light',
      <BookingFlowScreen progressLabel="Step 1 of 4">
        <BookingFlowHeading title="Pick a date" />
      </BookingFlowScreen>,
    )
    await waitFor(() => expect(screen.getByText('Pick a date')).toBeTruthy())
    expect(screen.queryByLabelText('Go back')).toBeNull()
  })

  it('renders its footer', async () => {
    await renderIn(
      'light',
      <BookingFlowScreen progressLabel={null} footer={<Button label="Continue" />}>
        <BookingFlowHeading title="Pick a date" />
      </BookingFlowScreen>,
    )
    await waitFor(() => expect(screen.getByText('Continue')).toBeTruthy())
  })

  it.each<[ColorScheme, typeof LIGHT_COLORS]>([
    ['light', LIGHT_COLORS],
    ['dark', DARK_COLORS],
  ])('paints its canvas from the %s palette', async (scheme, palette) => {
    await renderIn(
      scheme,
      <BookingFlowScreen progressLabel={null} testID="shell">
        <BookingFlowHeading title="Pick a date" />
      </BookingFlowScreen>,
    )
    await waitFor(() => {
      expect(flatten(screen.getByTestId('shell').props.style).backgroundColor).toBe(
        palette.bgCanvas,
      )
    })
    expect(flatten(screen.getByText('Pick a date').props.style).color).toBe(palette.textPrimary)
  })

  it('renders a note as quiet supporting text, never as a status', async () => {
    await renderIn(
      'light',
      <BookingFlowScreen progressLabel={null}>
        <BookingFlowNote title="These are the hours Marcus publishes." body="Not confirmed yet." />
      </BookingFlowScreen>,
    )
    await waitFor(() =>
      expect(screen.getByText('These are the hours Marcus publishes.')).toBeTruthy(),
    )
    const colour = flatten(screen.getByText('Not confirmed yet.').props.style).color
    expect(colour).not.toBe(LIGHT_COLORS.statusDanger)
  })
})

// ── Terminal statements ──────────────────────────────────────────────────
describe('TerminalStatement', () => {
  it('shows no step progress — a confirmation is not a step', async () => {
    await renderIn(
      'light',
      <TerminalStatement
        eyebrow="BOOKING REQUEST SENT"
        title="You're almost in."
        body={['Your request has been sent.']}
      />,
    )
    await waitFor(() => expect(screen.getByText("You're almost in.")).toBeTruthy())
    expect(screen.queryByText(/Step \d/)).toBeNull()
  })

  it('offers no back control by default', async () => {
    await renderIn('light', <TerminalStatement title="You're almost in." />)
    await waitFor(() => expect(screen.getByText("You're almost in.")).toBeTruthy())
    expect(screen.queryByLabelText('Go back')).toBeNull()
  })

  it('offers back when the notice comes BEFORE an irreversible step', async () => {
    const onBack = jest.fn()
    await renderIn('light', <TerminalStatement title="Built on real people." onBack={onBack} />)
    await waitFor(() => expect(screen.getByLabelText('Go back')).toBeTruthy())
    fireEvent.press(screen.getByLabelText('Go back'))
    expect(onBack).toHaveBeenCalled()
  })

  it('renders its what-happens-next steps', async () => {
    await renderIn(
      'light',
      <TerminalStatement
        title="You're almost in."
        steps={[{ title: 'No in-app payment', detail: 'Third does not take payment in this beta.' }]}
      />,
    )
    await waitFor(() => expect(screen.getByText('No in-app payment')).toBeTruthy())
    expect(screen.getByText('Third does not take payment in this beta.')).toBeTruthy()
  })
})

// ── Acknowledge row ──────────────────────────────────────────────────────
describe('AcknowledgeRow', () => {
  it('is a checkbox to assistive tech, and reports its state', async () => {
    await renderIn(
      'light',
      <AcknowledgeRow label="I agree to the policy." checked={false} onToggle={() => {}} testID="ack" />,
    )
    await waitFor(() => expect(screen.getByTestId('ack')).toBeTruthy())
    expect(screen.getByTestId('ack').props.accessibilityRole).toBe('checkbox')
    expect(screen.getByTestId('ack').props.accessibilityState).toMatchObject({ checked: false })
  })

  it('reports the checked state when ticked', async () => {
    await renderIn(
      'light',
      <AcknowledgeRow label="I agree to the policy." checked onToggle={() => {}} testID="ack" />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('ack').props.accessibilityState).toMatchObject({ checked: true }),
    )
  })

  it('toggles on press', async () => {
    const onToggle = jest.fn()
    await renderIn(
      'light',
      <AcknowledgeRow label="I agree." checked={false} onToggle={onToggle} testID="ack" />,
    )
    await waitFor(() => expect(screen.getByTestId('ack')).toBeTruthy())
    fireEvent.press(screen.getByTestId('ack'))
    expect(onToggle).toHaveBeenCalled()
  })

  it('does not toggle while disabled, and says so', async () => {
    const onToggle = jest.fn()
    await renderIn(
      'light',
      <AcknowledgeRow label="I agree." checked={false} onToggle={onToggle} disabled testID="ack" />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('ack').props.accessibilityState).toMatchObject({ disabled: true }),
    )
    fireEvent.press(screen.getByTestId('ack'))
    expect(onToggle).not.toHaveBeenCalled()
  })
})

// ── Date and time pickers ────────────────────────────────────────────────
describe('DayCell', () => {
  it('reports selection to assistive tech', async () => {
    await renderIn('light', <DayCell day="14" selected testID="day" />)
    await waitFor(() =>
      expect(screen.getByTestId('day').props.accessibilityState).toMatchObject({ selected: true }),
    )
  })

  it('is disabled and explains WHY when the provider published no hours', async () => {
    const onPress = jest.fn()
    await renderIn('light', <DayCell day="14" available={false} onPress={onPress} testID="day" />)
    await waitFor(() =>
      expect(screen.getByTestId('day').props.accessibilityState).toMatchObject({ disabled: true }),
    )
    // The reason is about PUBLISHED HOURS, never about a slot being taken.
    expect(screen.getByTestId('day').props.accessibilityHint).toBe(
      'No hours published for this day',
    )
    fireEvent.press(screen.getByTestId('day'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it.each<[ColorScheme, typeof LIGHT_COLORS]>([
    ['light', LIGHT_COLORS],
    ['dark', DARK_COLORS],
  ])('fills a selected day from the %s action colour', async (scheme, palette) => {
    await renderIn(scheme, <DayCell day="14" selected testID="day" />)
    await waitFor(() => {
      expect(flatten(screen.getByTestId('day').props.style).backgroundColor).toBe(
        palette.actionPrimary,
      )
    })
  })

  it('shows the weekday in a strip and omits it in a grid', async () => {
    const { unmount } = await renderIn('light', <DayCell weekday="Mon" day="14" testID="day" />)
    await waitFor(() => expect(screen.getByText('Mon')).toBeTruthy())
    unmount()

    await renderIn('light', <DayCell day="14" testID="day" />)
    await waitFor(() => expect(screen.getByText('14')).toBeTruthy())
    expect(screen.queryByText('Mon')).toBeNull()
  })
})

describe('TimeSlot', () => {
  it('reports selection', async () => {
    await renderIn('light', <TimeSlot time="1:00 PM" selected testID="slot" />)
    await waitFor(() =>
      expect(screen.getByTestId('slot').props.accessibilityState).toMatchObject({ selected: true }),
    )
  })

  it('explains an unavailable slot as published hours, not as scarcity', async () => {
    const onPress = jest.fn()
    await renderIn(
      'light',
      <TimeSlot time="1:00 PM" available={false} onPress={onPress} testID="slot" />,
    )
    await waitFor(() =>
      expect(screen.getByTestId('slot').props.accessibilityState).toMatchObject({ disabled: true }),
    )
    const hint: string = screen.getByTestId('slot').props.accessibilityHint
    expect(hint).toBe('Outside published hours')
    expect(hint).not.toMatch(/taken|booked|last|only|hurry|remaining/i)
    fireEvent.press(screen.getByTestId('slot'))
    expect(onPress).not.toHaveBeenCalled()
  })

  it.each<[ColorScheme, typeof LIGHT_COLORS]>([
    ['light', LIGHT_COLORS],
    ['dark', DARK_COLORS],
  ])('renders under %s from that palette', async (scheme, palette) => {
    await renderIn(scheme, <TimeSlot time="1:00 PM" testID="slot" />)
    await waitFor(() => {
      expect(flatten(screen.getByTestId('slot').props.style).borderColor).toBe(palette.borderSubtle)
    })
    expect(flatten(screen.getByText('1:00 PM').props.style).color).toBe(palette.textPrimary)
  })
})

// ── Button, extended for Phase 2C ────────────────────────────────────────
describe('Button loading label', () => {
  it('announces what is happening while busy instead of the idle label', async () => {
    await renderIn(
      'light',
      <Button label="Send booking request" loadingLabel="Sending your request…" loading testID="b" />,
    )
    await waitFor(() => expect(screen.getByTestId('b').props.accessibilityState.busy).toBe(true))
    // The button itself announces the busy label; the inner row is hidden from
    // assistive tech so the spinner and its caption are not read twice.
    expect(screen.getByTestId('b').props.accessibilityLabel).toBe('Sending your request…')
    expect(
      screen.getByText('Sending your request…', { includeHiddenElements: true }),
    ).toBeTruthy()
  })

  it('does not fire while busy', async () => {
    const onPress = jest.fn()
    await renderIn('light', <Button label="Send" loading onPress={onPress} testID="b" />)
    await waitFor(() => expect(screen.getByTestId('b')).toBeTruthy())
    fireEvent.press(screen.getByTestId('b'))
    expect(onPress).not.toHaveBeenCalled()
  })
})
