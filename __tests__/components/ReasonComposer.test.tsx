// The ONE structural rule PD-060/PD-062 set for a reason box: the disclosure sits ABOVE the
// input, before the writer commits. That rule is why this component exists — it was previously
// enforced by two hand-authored JSX copies and a reviewer's eye. A rule about layout that
// nothing asserts is a rule that drifts, so this asserts the ORDER, not merely the presence.

import { render, fireEvent } from '@testing-library/react-native'
import ReasonComposer from '@/components/ReasonComposer'

const NOTE = 'Optional — shared with the other provider.'
const PLACEHOLDER = 'What happened? (optional)'

function setup(over: Partial<React.ComponentProps<typeof ReasonComposer>> = {}) {
  const onChangeText = jest.fn()
  const onSubmit = jest.fn()
  const utils = render(
    <ReasonComposer
      note={NOTE}
      placeholder={PLACEHOLDER}
      value=""
      onChangeText={onChangeText}
      maxLength={200}
      submitLabel="Report no-show"
      onSubmit={onSubmit}
      {...over}
    />,
  )
  return { ...utils, onChangeText, onSubmit }
}

describe('ReasonComposer', () => {
  it('renders the disclosure BEFORE the input, not merely somewhere on screen', () => {
    const { getByText, getByPlaceholderText, toJSON } = setup()
    expect(getByText(NOTE)).toBeTruthy()
    expect(getByPlaceholderText(PLACEHOLDER)).toBeTruthy()
    // Serialise the tree and compare positions: the disclosure must come first in render order.
    const tree = JSON.stringify(toJSON())
    expect(tree.indexOf(NOTE)).toBeGreaterThan(-1)
    expect(tree.indexOf(PLACEHOLDER)).toBeGreaterThan(-1)
    expect(tree.indexOf(NOTE)).toBeLessThan(tree.indexOf(PLACEHOLDER))
  })

  it('reports edits and submissions to the caller, and decides nothing itself', () => {
    const { getByPlaceholderText, getByText, onChangeText, onSubmit } = setup()
    fireEvent.changeText(getByPlaceholderText(PLACEHOLDER), 'they never arrived')
    expect(onChangeText).toHaveBeenCalledWith('they never arrived')
    fireEvent.press(getByText('Report no-show'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does not submit while a write is in flight', () => {
    const { getByText, onSubmit } = setup({ busy: true })
    fireEvent.press(getByText('Report no-show'))
    expect(onSubmit).not.toHaveBeenCalled()
  })
})
