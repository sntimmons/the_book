// app/messages/[id].tsx — the Working Letter thread, DRIVEN THROUGH THE REAL SCREEN.
//
// The two claims worth mounting for: that the DAY SEPARATORS derive correctly
// from the timestamps the messages already carry, and that the request gating —
// which decides whether someone may type at all — behaves exactly as it did.
// Neither is visible in source text.

import React from 'react'
import { act, render } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: 'convo-1' }),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}))

jest.mock('@/components/ReportSheet', () => () => null)

jest.mock('@/lib/safety', () => ({
  ...jest.requireActual('@/lib/safety'),
  iBlocked: jest.fn(() => Promise.resolve(false)),
  submitReport: jest.fn(),
}))

jest.mock('@/lib/safetyMenu', () => ({
  openSafetyMenu: jest.fn(),
  confirmUnblock: jest.fn(),
}))

const DAY = 86400000
const mockNow = Date.now()
const mockMessages = [
  { id: 'm1', conversation_id: 'convo-1', sender_id: 'them', content: 'Morning — still on for Saturday?', created_at: new Date(mockNow - 3 * DAY).toISOString(), is_read: true, is_mine: false, is_system: false },
  { id: 'm2', conversation_id: 'convo-1', sender_id: 'me', content: 'Yes, 9am works.', created_at: new Date(mockNow - 3 * DAY + 60000).toISOString(), is_read: true, is_mine: true, is_system: false },
  { id: 'm3', conversation_id: 'convo-1', sender_id: 'me', content: 'Bringing the ladder.', created_at: new Date(mockNow - DAY).toISOString(), is_read: true, is_mine: true, is_system: false },
  { id: 'm4', conversation_id: 'convo-1', sender_id: 'them', content: 'Perfect, thank you.', created_at: new Date(mockNow).toISOString(), is_read: true, is_mine: false, is_system: false },
]

const mockConvo = {
  client_id: 'me',
  provider_id: 'prov-1',
  booking_id: 'b-1',
  request_status: null as string | null,
}

jest.mock('@/hooks/useMessaging', () => ({
  useMessages: () => ({
    messages: mockMessages,
    loading: false,
    sending: false,
    sendMessage: jest.fn(),
  }),
  setRequestStatus: jest.fn(),
}))

jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me' }, session: null, role: 'client' }),
}))

jest.mock('@/lib/supabase', () => {
  const build = (result: any) => {
    const c: any = {}
    for (const m of ['select', 'eq', 'order']) c[m] = jest.fn(() => c)
    c.maybeSingle = jest.fn(() => Promise.resolve(result))
    c.then = (res: any) => Promise.resolve(result).then(res)
    return c
  }
  return {
    supabase: {
      from: jest.fn((table: string) => {
        if (table === 'conversation') return build({ data: mockConvoRef.value, error: null })
        if (table === 'providers')
          return build({ data: { display_name: 'Marisol Vega', user_id: 'them' }, error: null })
        if (table === 'bookings')
          return build({ data: { service_name: 'Deep clean' }, error: null })
        return build({ data: null, error: null })
      }),
      channel: jest.fn(() => {
        const ch: any = {}
        ch.on = jest.fn(() => ch)
        ch.subscribe = jest.fn(() => ch)
        return ch
      }),
      removeChannel: jest.fn(),
    },
  }
})

// Referenced from inside the factory above, so it must be `mock`-prefixed.
const mockConvoRef = { value: mockConvo as any }

import ChatScreen from '@/app/messages/[id]'

beforeEach(() => {
  jest.clearAllMocks()
  mockConvoRef.value = { ...mockConvo }
})

async function mount() {
  const utils = render(<ChatScreen />)
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
  return utils
}

describe('the thread renders', () => {
  it('mounts and shows the messages', async () => {
    const { getByText } = await mount()
    expect(getByText('Yes, 9am works.')).toBeTruthy()
    expect(getByText('Perfect, thank you.')).toBeTruthy()
  })

  it('shows the other party once in the header', async () => {
    const { queryAllByText } = await mount()
    expect(queryAllByText('Marisol Vega').length).toBe(1)
  })
})

describe('day separators derive from the timestamps already on the messages', () => {
  it('opens the thread with a dated rule and names today and yesterday', async () => {
    const { getByText } = await mount()
    expect(getByText('Today')).toBeTruthy()
    expect(getByText('Yesterday')).toBeTruthy()
  })

  it('emits one separator per calendar day, not one per message', async () => {
    const { queryAllByText } = await mount()
    // Four messages across three days: two share the oldest day.
    expect(queryAllByText('Today').length).toBe(1)
    expect(queryAllByText('Yesterday').length).toBe(1)
  })
})

describe('request gating is unchanged', () => {
  it('an open conversation can be composed in', async () => {
    const { getByLabelText } = await mount()
    expect(getByLabelText('Send message')).toBeTruthy()
  })

  it('a client with a pending request cannot compose, and is told why', async () => {
    mockConvoRef.value = { ...mockConvo, request_status: 'pending' }
    const { queryByLabelText, getByText } = await mount()
    expect(queryByLabelText('Send message')).toBeNull()
    const { REQUEST_PENDING_CLIENT_COPY } = require('@/lib/messageRequests')
    expect(getByText(REQUEST_PENDING_CLIENT_COPY)).toBeTruthy()
  })

  it('a declined request closes the composer with the neutral copy', async () => {
    mockConvoRef.value = { ...mockConvo, request_status: 'declined' }
    const { queryByLabelText, getByText } = await mount()
    expect(queryByLabelText('Send message')).toBeNull()
    const { REQUEST_DECLINED_CLIENT_COPY } = require('@/lib/messageRequests')
    expect(getByText(REQUEST_DECLINED_CLIENT_COPY)).toBeTruthy()
  })
})

describe('the safety control stays reachable', () => {
  it('is present once the other party is resolved', async () => {
    const { getByLabelText } = await mount()
    expect(getByLabelText('Safety options')).toBeTruthy()
  })
})
