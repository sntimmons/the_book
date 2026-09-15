// app/(tabs)/reels.tsx — the Session 6B "Held Light" surface, DRIVEN THROUGH THE REAL SCREEN.
//
// The companion guard (__tests__/guards/reelsHeldLight.test.ts) reads this file
// as text. This one mounts it. The two answer different questions: the guard
// proves the source does not contain a thing, and this proves the rendered
// output does not contain it either — which is the claim that actually matters
// for a count that should be absent or a control a client must never see.
//
// Supabase is mocked at the client boundary, so no real client is constructed.

import React from 'react'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock('expo-av', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    ResizeMode: { COVER: 'cover' },
    Audio: { setAudioModeAsync: jest.fn(() => Promise.resolve()) },
    // Named rather than anonymous so the component has a display name.
    Video: React.forwardRef(function MockVideo(props: any, ref: any) {
      React.useImperativeHandle(ref, () => ({
        setPositionAsync: jest.fn(() => Promise.resolve()),
        pauseAsync: jest.fn(() => Promise.resolve()),
        playAsync: jest.fn(() => Promise.resolve()),
      }))
      return <View testID="reel-video" {...props} />
    }),
  }
})

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: View }
})

// `user` is a STABLE reference on purpose. The screen's reel-loading effect is
// keyed on it, so handing back a fresh object literal each render re-runs the
// fetch, sets state, re-renders, and loops until the test times out. That is a
// property of the mock, not of the screen.
const mockUser = { id: 'user-1' }
const mockRole: { isProvider: boolean; providerId: string | null } = {
  isProvider: true,
  providerId: 'prov-1',
}
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    session: null,
    role: mockRole.isProvider ? 'provider' : 'client',
    isProvider: mockRole.isProvider,
    providerId: mockRole.providerId,
  }),
}))

// The row carries a four-figure like count and a three-figure comment count on
// purpose: a reintroduced tally would then have something recognisable to print
// into the tree, and the absence assertions below would stop passing vacuously.
const mockReelRow = {
  id: 'post-1',
  media_url: 'https://cdn.test/r.mp4',
  caption: 'Repainted this porch in one afternoon.',
  like_count: 1200,
  comment_count: 348,
  provider: {
    id: 'prov-9',
    display_name: 'Marisol Vega',
    category_id: 1,
    neighborhood: 'Montrose',
    profile_photo_url: null,
  },
}

jest.mock('@/lib/supabase', () => {
  // Built INSIDE the factory: jest refuses out-of-scope references here, and a
  // `mock`-prefixed name is the only kind it will let through.
  const build = (result: any) => {
    const c: any = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit']) c[m] = jest.fn(() => c)
    c.then = (res: any) => Promise.resolve(result).then(res)
    return c
  }
  return {
    supabase: {
      from: jest.fn((table: string) =>
        table === 'posts_visible'
          ? build({ data: [mockReelRow], error: null })
          : build({ data: [], error: null }),
      ),
    },
  }
})

// Category names come from the `categories` table, which the mock above returns
// empty — so the meta line renders the neighbourhood and no category. That is
// the honest empty-field behaviour the system asks for (absence, not a filler
// dash), and it keeps this test's assertions about place unambiguous.

import ReelsScreen from '@/app/(tabs)/reels'

beforeEach(() => {
  jest.clearAllMocks()
  mockRole.isProvider = true
  mockRole.providerId = 'prov-1'
})

async function mount() {
  const utils = render(<ReelsScreen />)
  await act(async () => {
    await Promise.resolve()
  })
  return utils
}

describe('Reels renders', () => {
  it('mounts without crashing and shows the reel', async () => {
    const { getByText } = await mount()
    await waitFor(() => expect(getByText('Marisol Vega')).toBeTruthy())
  })

  it('renders the provider identity exactly ONCE', async () => {
    const { queryAllByText } = await mount()
    await waitFor(() => expect(queryAllByText('Marisol Vega').length).toBe(1))
  })

  it('shows the caption, subordinate to the identity', async () => {
    const { getByText } = await mount()
    await waitFor(() =>
      expect(getByText('Repainted this porch in one afternoon.')).toBeTruthy(),
    )
  })

  it('shows the neighbourhood as truthful place metadata', async () => {
    const { getByText } = await mount()
    await waitFor(() => expect(getByText('Montrose')).toBeTruthy())
  })
})

describe('no engagement count reaches the screen', () => {
  it('renders neither the like count nor the comment count', async () => {
    // The mocked row carries 1200 likes and 348 comments precisely so that a
    // reintroduced tally would have something recognisable to print.
    const { queryByText } = await mount()
    await waitFor(() => expect(queryByText('Marisol Vega')).toBeTruthy())
    for (const n of ['1200', '1.2k', '348', '1,200']) {
      expect(queryByText(n)).toBeNull()
    }
  })

  it('still offers the Like and Comment controls', async () => {
    const { getByLabelText } = await mount()
    await waitFor(() => expect(getByLabelText('Like')).toBeTruthy())
    expect(getByLabelText('Comment')).toBeTruthy()
  })
})

describe('playback', () => {
  it('starts playing and says nothing about being paused', async () => {
    const { queryByText, getByLabelText } = await mount()
    await waitFor(() => expect(getByLabelText('Pause video')).toBeTruthy())
    expect(queryByText('PAUSED')).toBeNull()
  })

  it('a single tap pauses, and the paused state is stated in a word', async () => {
    jest.useFakeTimers()
    const { getByLabelText, getByText } = await mount()
    await waitFor(() => expect(getByLabelText('Pause video')).toBeTruthy())

    await act(async () => {
      fireEvent.press(getByLabelText('Pause video'))
      jest.advanceTimersByTime(400)
    })

    expect(getByText('PAUSED')).toBeTruthy()
    expect(getByLabelText('Play video')).toBeTruthy()
    jest.useRealTimers()
  })

  it('there is no centre play control to press', async () => {
    const { queryByLabelText } = await mount()
    await waitFor(() => expect(queryByLabelText('Pause video')).toBeTruthy())
    // The only playback affordance is the frame itself.
    expect(queryByLabelText('Play')).toBeNull()
  })
})

describe('the primary action', () => {
  it('is labelled "View & book" and routes to the provider profile', async () => {
    const { getByText } = await mount()
    await waitFor(() => expect(getByText('View & book')).toBeTruthy())

    await act(async () => {
      fireEvent.press(getByText('View & book'))
    })
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/providers/prov-9')
  })

  it('never renders a control labelled just "Book"', async () => {
    const { queryByText } = await mount()
    await waitFor(() => expect(queryByText('View & book')).toBeTruthy())
    expect(queryByText('Book')).toBeNull()
  })
})

describe('the provider-only creation affordance', () => {
  it('a provider sees Add a reel, and it opens the existing uploader', async () => {
    const { getByLabelText } = await mount()
    await waitFor(() => expect(getByLabelText('Add a reel')).toBeTruthy())

    await act(async () => {
      fireEvent.press(getByLabelText('Add a reel'))
    })
    const { router } = require('expo-router')
    expect(router.push).toHaveBeenCalledWith('/(tabs)/business/posts')
  })

  it('A CLIENT NEVER SEES IT', async () => {
    mockRole.isProvider = false
    mockRole.providerId = null
    const { queryByLabelText, getByText } = await mount()
    await waitFor(() => expect(getByText('Marisol Vega')).toBeTruthy())
    expect(queryByLabelText('Add a reel')).toBeNull()
  })

  it('a provider still mid-onboarding, with no provider row, never sees it', async () => {
    // `isProvider` can resolve before the provider row exists. An entry point
    // to a door the uploader would not open is worse than no entry point.
    mockRole.isProvider = true
    mockRole.providerId = null
    const { queryByLabelText, getByText } = await mount()
    await waitFor(() => expect(getByText('Marisol Vega')).toBeTruthy())
    expect(queryByLabelText('Add a reel')).toBeNull()
  })
})
