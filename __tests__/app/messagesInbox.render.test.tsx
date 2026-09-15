// app/(tabs)/messages.tsx — the Working Letter inbox, DRIVEN THROUGH THE REAL SCREEN.
//
// The companion guard reads this file as text. This one mounts it, because the
// claims that matter are about what a viewer ends up seeing: that the renamed
// filter selects exactly the rows the old one did, that a truthful Requests
// count appears, and that no empty state tells someone to do something this
// screen cannot do.

import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }))

// Four conversations spanning every request state the inbox partitions on.
const mockRows = [
  {
    id: 'c-open',
    request_status: null,
    booking_id: null,
    other_party_name: 'Marisol Vega',
    last_message_preview: 'Sounds good, see you then.',
    last_message_at: new Date().toISOString(),
    unread_count: 0,
  },
  {
    id: 'c-booking',
    request_status: 'accepted',
    booking_id: 'b-1',
    booking_service: 'Deep clean',
    other_party_name: 'Dana Okafor',
    last_message_preview: 'Bringing the ladder.',
    last_message_at: new Date().toISOString(),
    unread_count: 3,
  },
  {
    id: 'c-pending',
    request_status: 'pending',
    booking_id: null,
    other_party_name: 'Ray Whitfield',
    last_message_preview: 'Hi — are you free Saturday?',
    last_message_at: new Date().toISOString(),
    unread_count: 1,
  },
  {
    id: 'c-declined',
    request_status: 'declined',
    booking_id: null,
    other_party_name: 'Nobody Visible',
    last_message_preview: 'should never render',
    last_message_at: new Date().toISOString(),
    unread_count: 0,
  },
]

const mockState = { rows: mockRows as any[], loading: false }
jest.mock('@/hooks/useMessaging', () => ({
  useConversations: () => ({
    conversations: mockState.rows,
    loading: mockState.loading,
    refetch: jest.fn(() => Promise.resolve()),
  }),
}))

import InboxScreen from '@/app/(tabs)/messages'

beforeEach(() => {
  jest.clearAllMocks()
  mockState.rows = mockRows as any[]
  mockState.loading = false
})

async function mount() {
  const utils = render(<InboxScreen />)
  await act(async () => {
    await Promise.resolve()
  })
  return utils
}

describe('the inbox renders', () => {
  it('mounts and lists open conversations', async () => {
    const { getByText } = await mount()
    expect(getByText('Messages')).toBeTruthy()
    expect(getByText('Marisol Vega')).toBeTruthy()
  })

  it('labels the first filter Conversations, not All', async () => {
    const { getByText, queryByText } = await mount()
    expect(getByText('Conversations')).toBeTruthy()
    expect(queryByText('All')).toBeNull()
  })
})

describe('the renamed filter keeps the exact prior behaviour', () => {
  it('shows open and accepted rows, and NOT pending or declined', async () => {
    const { getByText, queryByText } = await mount()
    expect(getByText('Marisol Vega')).toBeTruthy()   // null      -> active
    expect(getByText('Dana Okafor')).toBeTruthy()    // accepted  -> active
    expect(queryByText('Ray Whitfield')).toBeNull()  // pending   -> requests
    expect(queryByText('Nobody Visible')).toBeNull() // declined  -> hidden
  })

  it('Requests shows only pending', async () => {
    const { getByText, queryByText } = await mount()
    await act(async () => {
      fireEvent.press(getByText(/^Requests/))
    })
    expect(getByText('Ray Whitfield')).toBeTruthy()
    expect(queryByText('Marisol Vega')).toBeNull()
    expect(queryByText('Nobody Visible')).toBeNull()
  })

  it('Bookings shows booking-linked rows and never a declined one', async () => {
    const { getByText, queryByText } = await mount()
    await act(async () => {
      fireEvent.press(getByText('Bookings'))
    })
    expect(getByText('Dana Okafor')).toBeTruthy()
    expect(queryByText('Marisol Vega')).toBeNull()
    expect(queryByText('Nobody Visible')).toBeNull()
  })
})

describe('the Requests count is truthful', () => {
  it('counts pending requests only, and appears in the filter', async () => {
    const { getByText } = await mount()
    expect(getByText('Requests (1)')).toBeTruthy()
  })

  it('disappears when there are none', async () => {
    mockState.rows = mockRows.filter((r) => r.request_status !== 'pending') as any[]
    const { getByText, queryByText } = await mount()
    expect(getByText('Requests')).toBeTruthy()
    expect(queryByText('Requests (1)')).toBeNull()
  })
})

describe('rows', () => {
  it('opens the correct thread', async () => {
    const { getByText } = await mount()
    await act(async () => {
      fireEvent.press(getByText('Dana Okafor'))
    })
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/messages/c-booking')
  })

  it('shows booking context where it genuinely exists, and not otherwise', async () => {
    const { getByText, queryByText } = await mount()
    expect(getByText('Deep clean')).toBeTruthy()
    expect(queryByText('undefined')).toBeNull()
  })

  it('marks an unread row without printing a number', async () => {
    const { getByLabelText, queryByText } = await mount()
    expect(getByLabelText('Dana Okafor, unread conversation')).toBeTruthy()
    expect(getByLabelText('Marisol Vega')).toBeTruthy()
    // The count exists in the data (3) and must not be rendered.
    expect(queryByText('3')).toBeNull()
  })
})

describe('empty states describe their own filter and instruct nothing', () => {
  it('Conversations', async () => {
    mockState.rows = []
    const { getByText, queryByText } = await mount()
    expect(getByText('No conversations yet')).toBeTruthy()
    expect(getByText('Ongoing conversations will appear here.')).toBeTruthy()
    expect(queryByText(/Message a provider/)).toBeNull()
  })

  it('Requests', async () => {
    mockState.rows = []
    const { getByText } = await mount()
    await act(async () => {
      fireEvent.press(getByText('Requests'))
    })
    expect(getByText('No message requests')).toBeTruthy()
    expect(getByText('New message requests will appear here.')).toBeTruthy()
  })

  it('Bookings', async () => {
    mockState.rows = []
    const { getByText } = await mount()
    await act(async () => {
      fireEvent.press(getByText('Bookings'))
    })
    expect(getByText('No booking conversations')).toBeTruthy()
    expect(getByText('Conversations connected to bookings will appear here.')).toBeTruthy()
  })
})
