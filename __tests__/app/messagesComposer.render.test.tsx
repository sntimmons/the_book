// app/messages/new.tsx — the first-contact composer, DRIVEN THROUGH THE REAL SCREEN.
//
// The migration was presentational, so what these tests are for is proving the
// presentation change did not disturb the journey around it: the recipient the
// route supplied is the recipient the send uses, a success lands in the migrated
// thread, and a refusal surfaces the helper's own words rather than the screen's.

import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { Alert } from 'react-native'

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockParams.value,
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, session: null, role: 'client' }),
}))

jest.mock('@/hooks/useMessaging', () => ({
  sendPrebookingRequest: jest.fn(),
}))

const mockUser = { id: 'client-1' }
const mockParams = { value: { providerId: 'prov-9', providerName: 'Marisol Vega' } as any }

import ComposerScreen from '@/app/messages/new'
import { sendPrebookingRequest } from '@/hooks/useMessaging'

beforeEach(() => {
  jest.clearAllMocks()
  mockParams.value = { providerId: 'prov-9', providerName: 'Marisol Vega' }
  jest.spyOn(Alert, 'alert').mockImplementation(() => {})
})

function mount() {
  return render(<ComposerScreen />)
}

describe('the composer renders', () => {
  it('names the provider the route supplied', () => {
    const { getByText } = mount()
    expect(getByText('Message Marisol Vega')).toBeTruthy()
  })

  it('falls back without inventing a name', () => {
    mockParams.value = { providerId: 'prov-9' }
    const { getByText } = mount()
    expect(getByText('Message provider')).toBeTruthy()
  })

  it('explains what sending does, truthfully', () => {
    const { getByText } = mount()
    expect(getByText(/Once\s+they accept, you can chat normally\./)).toBeTruthy()
  })
})

describe('the send path is unchanged', () => {
  it('will not send an empty message', async () => {
    const { getByLabelText } = mount()
    await act(async () => {
      fireEvent.press(getByLabelText('Send message request'))
    })
    expect(sendPrebookingRequest).not.toHaveBeenCalled()
  })

  it('sends with the signed-in client and the routed provider', async () => {
    ;(sendPrebookingRequest as jest.Mock).mockResolvedValue({
      conversationId: 'convo-77',
      created: true,
    })
    const { getByPlaceholderText, getByLabelText } = mount()
    fireEvent.changeText(getByPlaceholderText("Hi! I'd love to ask about…"), 'Are you free Saturday?')
    await act(async () => {
      fireEvent.press(getByLabelText('Send message request'))
    })
    expect(sendPrebookingRequest).toHaveBeenCalledWith(
      'client-1',
      'prov-9',
      'Are you free Saturday?',
    )
  })

  it('lands the conversation in the migrated thread, replacing rather than pushing', async () => {
    ;(sendPrebookingRequest as jest.Mock).mockResolvedValue({
      conversationId: 'convo-77',
      created: true,
    })
    const { getByPlaceholderText, getByLabelText } = mount()
    fireEvent.changeText(getByPlaceholderText("Hi! I'd love to ask about…"), 'Hello')
    await act(async () => {
      fireEvent.press(getByLabelText('Send message request'))
    })
    const { router } = require('expo-router')
    // replace(), so Back returns to the profile and not to a spent composer.
    expect(router.replace).toHaveBeenCalledWith('/messages/convo-77')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('surfaces the helper\'s refusal verbatim and stays put', async () => {
    ;(sendPrebookingRequest as jest.Mock).mockResolvedValue({
      conversationId: null,
      created: false,
      error: 'This conversation cannot be re-opened from here.',
    })
    const { getByPlaceholderText, getByLabelText } = mount()
    fireEvent.changeText(getByPlaceholderText("Hi! I'd love to ask about…"), 'Hello again')
    await act(async () => {
      fireEvent.press(getByLabelText('Send message request'))
    })
    expect(Alert.alert).toHaveBeenCalledWith(
      'Could not send',
      'This conversation cannot be re-opened from here.',
    )
    const { router } = require('expo-router')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('falls back to a generic line only when the helper gave no reason', async () => {
    ;(sendPrebookingRequest as jest.Mock).mockResolvedValue({
      conversationId: null,
      created: false,
    })
    const { getByPlaceholderText, getByLabelText } = mount()
    fireEvent.changeText(getByPlaceholderText("Hi! I'd love to ask about…"), 'Hello')
    await act(async () => {
      fireEvent.press(getByLabelText('Send message request'))
    })
    expect(Alert.alert).toHaveBeenCalledWith('Could not send', 'Please try again.')
  })
})

describe('back navigation is unchanged', () => {
  it('returns rather than replacing', async () => {
    const { getByLabelText } = mount()
    await act(async () => {
      fireEvent.press(getByLabelText('Back'))
    })
    const { router } = require('expo-router')
    expect(router.back).toHaveBeenCalled()
  })
})
