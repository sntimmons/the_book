import { act, renderHook, waitFor } from '@testing-library/react-native'
import * as Linking from 'expo-linking'
import { supabase } from '@/lib/supabase'
import { useMagicLinkSession } from '@/hooks/useMagicLinkSession'

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `thebook://${String(path).replace(/^\//, '')}`),
  getInitialURL: jest.fn(async () => null),
  addEventListener: jest.fn(() => ({ remove: jest.fn() })),
}))

jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      setSession: jest.fn(),
      exchangeCodeForSession: jest.fn(),
    },
  },
}))

const mockLinking = Linking as unknown as {
  getInitialURL: jest.Mock
  addEventListener: jest.Mock
}
const mockAuth = supabase.auth as unknown as {
  setSession: jest.Mock
  exchangeCodeForSession: jest.Mock
}

const TOKENS_URL =
  'thebook://auth/callback#access_token=aaa.bbb.ccc&refresh_token=rrr&token_type=bearer&type=magiclink'

/** Hand the hook a URL the way the OS would for an already-running app. */
function emitUrl(url: string) {
  const handler = mockLinking.addEventListener.mock.calls.at(-1)?.[1]
  expect(typeof handler).toBe('function')
  return act(async () => {
    await handler({ url })
  })
}

const SESSION = { access_token: 'aaa.bbb.ccc', user: { id: 'u1' } }

beforeEach(() => {
  mockLinking.getInitialURL.mockResolvedValue(null)
  mockLinking.addEventListener.mockReturnValue({ remove: jest.fn() })
  mockAuth.setSession.mockResolvedValue({ data: { session: SESSION }, error: null })
  mockAuth.exchangeCodeForSession.mockResolvedValue({
    data: { session: SESSION },
    error: null,
  })
})

describe('useMagicLinkSession', () => {
  it('starts idle and does nothing when the app was not opened by a link', async () => {
    const { result } = renderHook(() => useMagicLinkSession())
    await waitFor(() => expect(mockLinking.getInitialURL).toHaveBeenCalled())
    expect(result.current.status).toBe('idle')
    expect(result.current.pendingRedirect).toBe(false)
    expect(mockAuth.setSession).not.toHaveBeenCalled()
  })

  it('establishes a session from the tokens in a magic-link callback', async () => {
    const { result } = renderHook(() => useMagicLinkSession())
    await emitUrl(TOKENS_URL)

    expect(mockAuth.setSession).toHaveBeenCalledWith({
      access_token: 'aaa.bbb.ccc',
      refresh_token: 'rrr',
    })
    await waitFor(() => expect(result.current.pendingRedirect).toBe(true))
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('handles a cold start, where the link IS the launch URL', async () => {
    mockLinking.getInitialURL.mockResolvedValue(TOKENS_URL)
    const { result } = renderHook(() => useMagicLinkSession())

    await waitFor(() => expect(mockAuth.setSession).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(result.current.pendingRedirect).toBe(true))
  })

  it('exchanges a PKCE code when the callback carries one', async () => {
    const { result } = renderHook(() => useMagicLinkSession())
    await emitUrl('thebook://auth/callback?code=abc-123')

    expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('abc-123')
    expect(mockAuth.setSession).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.pendingRedirect).toBe(true))
  })

  it('ignores deep links that are not the auth callback', async () => {
    renderHook(() => useMagicLinkSession())
    await emitUrl('thebook://providers/abc')
    expect(mockAuth.setSession).not.toHaveBeenCalled()
  })

  it('handles the same callback twice without a second exchange', async () => {
    // The OS can deliver the launch URL through BOTH getInitialURL and the url
    // event; the tokens are single-use, so the second attempt would fail and
    // wrongly show the user an error on a sign-in that actually worked.
    mockLinking.getInitialURL.mockResolvedValue(TOKENS_URL)
    const { result } = renderHook(() => useMagicLinkSession())
    await waitFor(() => expect(mockAuth.setSession).toHaveBeenCalledTimes(1))

    await emitUrl(TOKENS_URL)
    await emitUrl(TOKENS_URL)

    expect(mockAuth.setSession).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
    expect(result.current.pendingRedirect).toBe(true)
  })

  it('fails safely on an expired link: a message, no session attempt', async () => {
    const { result } = renderHook(() => useMagicLinkSession())
    await emitUrl(
      'thebook://auth/callback#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    )

    expect(mockAuth.setSession).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatch(/expired/i)
    expect(result.current.pendingRedirect).toBe(false)
  })

  it('fails safely when Supabase rejects the tokens', async () => {
    mockAuth.setSession.mockResolvedValue({
      data: { session: null },
      error: { message: 'Invalid Refresh Token' },
    })
    const { result } = renderHook(() => useMagicLinkSession())
    await emitUrl(TOKENS_URL)

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toBeTruthy()
    expect(result.current.pendingRedirect).toBe(false)
  })

  it('fails safely when the exchange throws', async () => {
    mockAuth.setSession.mockRejectedValue(new Error('network down'))
    const { result } = renderHook(() => useMagicLinkSession())
    await emitUrl(TOKENS_URL)

    await waitFor(() => expect(result.current.status).toBe('error'))
    // Never surface a raw throw at the user.
    expect(result.current.error).not.toContain('network down')
  })

  it('clears the redirect flag once routing has consumed it', async () => {
    const { result } = renderHook(() => useMagicLinkSession())
    await emitUrl(TOKENS_URL)
    await waitFor(() => expect(result.current.pendingRedirect).toBe(true))

    act(() => result.current.clearRedirect())
    expect(result.current.pendingRedirect).toBe(false)
  })

  it('clears the error so a retry starts from a clean state', async () => {
    const { result } = renderHook(() => useMagicLinkSession())
    await emitUrl('thebook://auth/callback#error=access_denied&error_code=otp_expired')
    await waitFor(() => expect(result.current.status).toBe('error'))

    act(() => result.current.clearError())
    expect(result.current.status).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('unsubscribes from the URL listener on unmount', async () => {
    const remove = jest.fn()
    mockLinking.addEventListener.mockReturnValue({ remove })
    const { unmount } = renderHook(() => useMagicLinkSession())
    unmount()
    expect(remove).toHaveBeenCalled()
  })
})
