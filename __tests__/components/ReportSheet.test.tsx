import { readFileSync } from 'fs'
import { render, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import ReportSheet from '@/components/ReportSheet'
import { REPORT_REASONS } from '@/lib/safety'

// `lib/safety` imports the Supabase client, which refuses to construct without
// public config — deliberately, so no build can fall back to production. The
// sheet itself touches none of it.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn() } }))

// ── WHAT THIS CAN AND CANNOT PROVE ────────────────────────────────────────
//
// This component replaced three `Alert.alert` pickers because Android draws at
// most three alert buttons and silently discards the rest — so on that platform
// the provider sheet showed 3 of its 9 reasons and NO Cancel control.
//
// It then nearly reproduced that failure by a different mechanism. React
// Native's Yoga default for `flexShrink` is **0**, unlike the web, so a
// `flexGrow: 0` list with no shrink takes its full content height and refuses
// to yield — pushing the notes field and the Submit button past the sheet's 85%
// cap, where a `View` clips them.
//
// **jsdom does not run Yoga.** Nothing in this file measures a rendered layout,
// and no assertion here is a substitute for opening the sheet on a small device
// with the keyboard up. What it CAN do is pin the two things that are decidable
// without a layout engine:
//
//   1. every option is REACHABLE and the actions EXIST — the Android defect;
//   2. the FIXED CHROME fits inside the sheet's budget with room to spare —
//      the invariant that makes the flexible part safe. If the header, notes
//      field and submit button alone exceed the cap, no amount of list-shrinking
//      saves the Submit control, and that arithmetic does not need a device.

const TITLE = 'Report this provider'

function setup(over: Partial<React.ComponentProps<typeof ReportSheet>> = {}) {
  const onCancel = jest.fn()
  const onSubmit = jest.fn()
  const utils = render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 375, height: 667 },
        insets: { top: 20, left: 0, right: 0, bottom: 0 },
      }}
    >
      <ReportSheet
        visible
        title={TITLE}
        options={REPORT_REASONS}
        onCancel={onCancel}
        onSubmit={onSubmit}
        {...over}
      />
    </SafeAreaProvider>,
  )
  return { ...utils, onCancel, onSubmit }
}

describe('every option is reachable — the defect this component exists for', () => {
  it('renders ALL nine reasons, not the first three', () => {
    const { getByText } = setup()
    for (const r of REPORT_REASONS) expect(getByText(r.label)).toBeTruthy()
  })

  it('offers a dismiss control, which the Alert version lost on Android', () => {
    // `Cancel` was conventionally LAST in the button array, so it was the first
    // casualty of the three-button limit: a dialog that could not be closed.
    const { getByLabelText, onCancel } = setup()
    fireEvent.press(getByLabelText('Close'))
    expect(onCancel).toHaveBeenCalled()
  })

  it('offers the submit action', () => {
    expect(setup().getByText('Submit report')).toBeTruthy()
  })
})

describe('submitting', () => {
  it('cannot submit before a reason is chosen', () => {
    const { getByText, onSubmit } = setup()
    fireEvent.press(getByText('Submit report'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits the chosen reason', () => {
    const { getByText, onSubmit } = setup()
    fireEvent.press(getByText('Safety concern'))
    fireEvent.press(getByText('Submit report'))
    expect(onSubmit).toHaveBeenCalledWith('safety_concern', null)
  })

  it('withdraws the submit label entirely while one is in flight', () => {
    // A double-tap would file the same report twice and open two operator
    // cases. The control is both disabled AND relabelled to a spinner, so there
    // is nothing left to press a second time — asserting the label is gone is
    // therefore the stronger check, not a weaker one.
    const { queryByText } = setup({ submitting: true })
    expect(queryByText('Submit report')).toBeNull()
  })
})

describe('the height budget that protects the Submit control', () => {
  // The smallest device the product supports, and the sheet's own cap.
  const SHORTEST_DEVICE_PT = 667 // iPhone SE / 8
  const SHEET_MAX = SHORTEST_DEVICE_PT * 0.85
  // A keyboard covers roughly this much of the screen when the notes field has
  // focus. On iOS `behavior="padding"` lifts the sheet; on Android nothing does.
  const KEYBOARD_PT = 260

  // Fixed, non-shrinking chrome: header row, prompt, notes field, submit
  // button, and the paddings and margins between them. Generous rather than
  // exact — an estimate that is too LOW would make this pass wrongly.
  const CHROME = {
    sheetPaddingTop: 18,
    header: 28,
    prompt: 18 + 6 + 10,
    notes: 72 + 4 + 14,
    submit: 52,
    bottomInset: 34 + 12,
  }
  const chromeTotal = Object.values(CHROME).reduce((a, b) => a + b, 0)

  it('leaves room for at least two option rows with no keyboard', () => {
    // Two rows is the floor at which the list still reads as a list.
    const ROW = 14 + 14 + 20 + 8 // paddingVertical x2 + text + marginBottom
    expect(SHEET_MAX - chromeTotal).toBeGreaterThan(ROW * 2)
  })

  it('still fits its chrome when the keyboard is up', () => {
    // THE CASE THAT MATTERS. If the fixed chrome alone does not fit in what the
    // keyboard leaves, the Submit control is unreachable however well the list
    // shrinks — and the person cannot file the report.
    expect(chromeTotal).toBeLessThan(SHORTEST_DEVICE_PT - KEYBOARD_PT)
  })

  it('the option list is allowed to shrink, which is what makes the rest safe', () => {
    // The actual bug: `flexGrow: 0` with no `flexShrink`. Yoga defaults
    // flexShrink to 0, so the list would not yield, and the overflow landed on
    // the notes field and the submit button.
    //
    // Pinned against the SOURCE because the StyleSheet is private to the
    // component, and exporting it only so a test can read it would change the
    // component's shape to suit the test.
    const src = readFileSync('components/ReportSheet.tsx', 'utf8')
    expect(src).toMatch(/list:\s*\{[^}]*flexShrink:\s*1/)
  })
})
