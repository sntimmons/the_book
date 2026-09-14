import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import { SafeAreaProvider, type Metrics } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { APPEARANCE_STORAGE_KEY, ThemeProvider } from '@/context/ThemeContext'
import { DARK_COLORS, LIGHT_COLORS, type ColorScheme } from '@/lib/theme/tokens'
import ProviderProfile, {
  completedBookingsLine,
  providerInitials,
  reputationLine,
  type ProviderData,
} from '@/components/ProviderProfile'

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}))

// `lib/safety` (for BLOCKED_PROFILE_COPY) pulls the real Supabase client, which
// fails loudly without env by design. Mocked at the lib boundary, the way every
// other suite here reaches a Supabase-backed module.
jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn(), rpc: jest.fn(), auth: {} } }))

// The two live child sections own their own network reads; this suite is about
// the profile's own composition, so they are stubbed at the module boundary.
jest.mock('@/components/ProviderReviewsSection', () => 'ProviderReviewsSection')
jest.mock('@/components/ProviderShoutouts', () => 'ProviderShoutouts')

const METRICS: Metrics = {
  frame: { x: 0, y: 0, width: 393, height: 852 },
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

const RATED: ProviderData = {
  name: 'Jordan Ellis',
  businessName: 'Southline Grooming',
  username: 'jordanellis',
  category: 'Barber',
  location: 'Midtown, Houston',
  bio: 'I keep it simple — sharp fades and clean lines.',
  photo: 'https://example.test/jordan.jpg',
  banner: 'https://example.test/cover.jpg',
  services: [
    { id: 's1', name: 'Signature Cut + Beard', price: '65.00', duration: '60 min', description: 'Hot-towel finish.' },
    { id: 's2', name: 'Clean Fade', price: '45.00', duration: '45 min' },
  ],
  portfolio: ['https://example.test/1.jpg', 'https://example.test/2.jpg'],
  reels: ['https://example.test/r1.mp4'],
  process: ['https://example.test/p1.mp4'],
  specialties: ['Fades', 'Beard work'],
  rating: 4.9,
  ratingClientCount: 12,
  reviewCount: 31,
  bookingCount: 240,
  followerCount: 812,
}

beforeEach(async () => {
  await AsyncStorage.clear()
})

// ── The rules, as pure functions ─────────────────────────────────────────
describe('reputationLine', () => {
  it('shows the rating with the number of CLIENTS it rests on', () => {
    expect(reputationLine({ rating: 4.9, ratingClientCount: 12, reviewCount: 31 })).toEqual({
      rating: '4.9',
      detail: '12 clients  ·  31 reviews',
    })
  })

  it('treats an unrated provider as an absence, never as 0.0', () => {
    // average_rating is `numeric NOT NULL DEFAULT 0`, so an unreviewed provider
    // arrives as 0 — the exact value that must never render as a score.
    expect(reputationLine({ rating: 0, ratingClientCount: 0, reviewCount: 0 })).toEqual({
      rating: null,
      detail: 'No reviews yet',
    })
    expect(reputationLine({})).toEqual({ rating: null, detail: 'No reviews yet' })
  })

  it('never explains a rating with a bare count', () => {
    const { detail } = reputationLine({ rating: 4.5, ratingClientCount: 2, reviewCount: 12 })
    expect(detail).toContain('clients')
    expect(detail).not.toMatch(/^\(?\d+\)?$/)
  })
})

describe('completedBookingsLine', () => {
  it('is absent at zero rather than boasting a nought', () => {
    expect(completedBookingsLine(0)).toBeNull()
    expect(completedBookingsLine(null)).toBeNull()
  })
  it('counts and pluralises', () => {
    expect(completedBookingsLine(1)).toBe('1 completed booking')
    expect(completedBookingsLine(240)).toBe('240 completed bookings')
  })
})

describe('providerInitials', () => {
  it('derives initials for a provider with no photo', () => {
    expect(providerInitials('Jordan Ellis')).toBe('JE')
    expect(providerInitials('Cher')).toBe('CH')
    expect(providerInitials('  ')).toBe('?')
  })
})

// ── The screen ───────────────────────────────────────────────────────────
describe('ProviderProfile — rated provider', () => {
  it('shows identity, rating, bookings and specialties', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() => expect(screen.getByText('Jordan Ellis')).toBeTruthy())
    expect(screen.getByText('@jordanellis')).toBeTruthy()
    expect(screen.getByText('Barber  ·  Southline Grooming')).toBeTruthy()
    expect(screen.getByText('Midtown, Houston')).toBeTruthy()
    expect(screen.getByText('4.9')).toBeTruthy()
    expect(screen.getByText('·  12 clients  ·  31 reviews')).toBeTruthy()
    expect(screen.getByText('240 completed bookings')).toBeTruthy()
    expect(screen.getByText('FADES   ·   BEARD WORK')).toBeTruthy()
  })

  it('never shows a follower count, however many there are', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() => expect(screen.getByText('Jordan Ellis')).toBeTruthy())
    expect(screen.queryByText('812')).toBeNull()
    expect(screen.queryByText(/follower/i)).toBeNull()
  })

  it('says Request booking, never Book Now — the provider still has to accept', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() => expect(screen.getAllByText('Request booking').length).toBeGreaterThan(0))
    expect(screen.queryByText('Book Now')).toBeNull()
  })

  it('makes no live-presence or availability claim', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() => expect(screen.getByText('Jordan Ellis')).toBeTruthy())
    expect(screen.queryByText('LIVE')).toBeNull()
    expect(screen.queryByText(/available now/i)).toBeNull()
    expect(screen.queryByText(/online/i)).toBeNull()
  })

  it('renders services with duration and description, and no invented price framing', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() => expect(screen.getByText('Signature Cut + Beard')).toBeTruthy())
    expect(screen.getByText('60 min')).toBeTruthy()
    expect(screen.getByText('Hot-towel finish.')).toBeTruthy()
    expect(screen.getByText('$65.00')).toBeTruthy()
    expect(screen.queryByText(/from \$/i)).toBeNull()
    expect(screen.queryByText(/starting at/i)).toBeNull()
  })

  it('a service row starts the ONE booking flow with that service', async () => {
    const onSelectService = jest.fn()
    const onBookNow = jest.fn()
    await renderIn(
      'light',
      <ProviderProfile provider={RATED} providerId="p1" onSelectService={onSelectService} onBookNow={onBookNow} />,
    )
    await waitFor(() => expect(screen.getByText('Clean Fade')).toBeTruthy())
    fireEvent.press(screen.getByLabelText(/Clean Fade, \$45\.00, 45 min\. Start a booking request\./))
    expect(onSelectService).toHaveBeenCalledWith(expect.objectContaining({ id: 's2', name: 'Clean Fade' }))
    // It does not quietly become the generic entry, and it does not fire both.
    expect(onBookNow).not.toHaveBeenCalled()
  })

  it('leaves service rows inert when no booking can start from them', async () => {
    // Not accepting bookings: the row must not offer a control that would lead
    // to a request the database refuses.
    await renderIn(
      'light',
      <ProviderProfile provider={RATED} providerId="p1" acceptingBookings={false} onSelectService={jest.fn()} />,
    )
    await waitFor(() => expect(screen.getByText('Clean Fade')).toBeTruthy())
    expect(screen.queryByLabelText(/Start a booking request/)).toBeNull()
    expect(screen.getByText('Not currently available for new bookings')).toBeTruthy()
  })
})

describe('ProviderProfile — absent data is absent, not faked', () => {
  const bare: ProviderData = { name: 'Ada Nwosu', category: 'Braider', location: 'Third Ward' }

  it('omits every section it has no content for', async () => {
    await renderIn('light', <ProviderProfile provider={bare} providerId="p2" />)
    await waitFor(() => expect(screen.getByText('Ada Nwosu')).toBeTruthy())
    expect(screen.queryByText('Services')).toBeNull()
    expect(screen.queryByText('Process')).toBeNull()
    expect(screen.queryByText('Portfolio')).toBeNull()
    expect(screen.queryByText('Reels')).toBeNull()
    // and no placeholder tiles standing in for the missing work
    expect(screen.queryByText(/no photos/i)).toBeNull()
    expect(screen.queryByText(/coming soon/i)).toBeNull()
  })

  it('falls back to initials when there is no profile photo', async () => {
    await renderIn('light', <ProviderProfile provider={bare} providerId="p2" />)
    await waitFor(() => expect(screen.getByText('AN')).toBeTruthy())
    expect(screen.getByLabelText('Ada Nwosu, no profile photo')).toBeTruthy()
  })

  it('an unrated provider reads as unrated, not as badly rated', async () => {
    await renderIn('light', <ProviderProfile provider={bare} providerId="p2" />)
    await waitFor(() => expect(screen.getByText('No reviews yet')).toBeTruthy())
    expect(screen.queryByText('0.0')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('shows Process only when process media exists', async () => {
    await renderIn('light', <ProviderProfile provider={{ ...bare, process: ['https://x.test/a.mp4'] }} providerId="p2" />)
    await waitFor(() => expect(screen.getByText('Process')).toBeTruthy())
    expect(screen.getByLabelText('Process clip 1 of 1')).toBeTruthy()
  })

  it('renders no See all / View all control, because neither has a destination', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() => expect(screen.getByText('Portfolio')).toBeTruthy())
    expect(screen.queryByText(/see all/i)).toBeNull()
    expect(screen.queryByText(/view all/i)).toBeNull()
  })
})

describe('ProviderProfile — hierarchy and appearance', () => {
  it('Book is the primary action and Follow is secondary', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" onFollow={jest.fn()} />)
    await waitFor(() => expect(screen.getByTestId('profile-request-booking')).toBeTruthy())
    const book = flatten(screen.getByTestId('profile-request-booking').props.style)
    const follow = flatten(screen.getByLabelText('Follow Jordan Ellis').props.style)
    // Primary is a filled action; Follow is an outline that never takes the fill.
    expect(book.backgroundColor).toBe(LIGHT_COLORS.actionPrimary)
    expect(follow.backgroundColor).toBeUndefined()
    expect(follow.borderWidth).toBe(1)
  })

  it('states the Follow state in the label, not by colour alone', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" isFollowing onFollow={jest.fn()} />)
    await waitFor(() => expect(screen.getByText('Following')).toBeTruthy())
    expect(screen.getByLabelText(/Following Jordan Ellis\. Tap to unfollow\./)).toBeTruthy()
  })

  it('resolves the page from the theme in Light', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() => expect(screen.getByText('Signature Cut + Beard')).toBeTruthy())
    expect(flatten(screen.getByText('Signature Cut + Beard').props.style).color).toBe(LIGHT_COLORS.textPrimary)
    expect(flatten(screen.getByText('Services').props.style).color).toBe(LIGHT_COLORS.textPrimary)
    expect(flatten(screen.getByText('WHAT YOU CAN BOOK').props.style).color).toBe(LIGHT_COLORS.statusLocal)
  })

  it('resolves the page from the theme in Dark', async () => {
    await renderIn('dark', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() =>
      expect(flatten(screen.getByText('Signature Cut + Beard').props.style).color).toBe(DARK_COLORS.textPrimary),
    )
    expect(flatten(screen.getByText('WHAT YOU CAN BOOK').props.style).color).toBe(DARK_COLORS.statusLocal)
    // The identity band is media scrim in BOTH schemes — that is what keeps the
    // hero continuous instead of inverting under the photograph.
    expect(flatten(screen.getByText('Jordan Ellis').props.style).color).toBe(DARK_COLORS.textOnAction)
  })

  it('keeps the identity lettering constant across appearances', async () => {
    const light = await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() => expect(screen.getByText('Jordan Ellis')).toBeTruthy())
    const inLight = flatten(screen.getByText('Jordan Ellis').props.style).color
    light.unmount()
    await renderIn('dark', <ProviderProfile provider={RATED} providerId="p1" />)
    await waitFor(() => expect(screen.getByText('Jordan Ellis')).toBeTruthy())
    expect(flatten(screen.getByText('Jordan Ellis').props.style).color).toBe(inLight)
  })
})

describe('ProviderProfile — controls only where they are real', () => {
  it('hides every action on your own profile', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" isOwnProfile />)
    await waitFor(() => expect(screen.getByText('Jordan Ellis')).toBeTruthy())
    expect(screen.queryByText('Follow')).toBeNull()
    expect(screen.queryByText('Request booking')).toBeNull()
  })

  it('withdraws message and booking for someone you blocked', async () => {
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" blockedByMe />)
    await waitFor(() => expect(screen.getByText('Jordan Ellis')).toBeTruthy())
    expect(screen.queryByLabelText('Message Jordan Ellis')).toBeNull()
    expect(screen.queryByTestId('profile-book-bar')).toBeNull()
  })

  it('keeps Message live for a provider who is simply not taking bookings', async () => {
    // Item H: the withdrawal is the booking, not the relationship.
    await renderIn('light', <ProviderProfile provider={RATED} providerId="p1" acceptingBookings={false} />)
    await waitFor(() => expect(screen.getByText('Not currently available for new bookings')).toBeTruthy())
    expect(screen.getAllByLabelText('Message Jordan Ellis').length).toBeGreaterThan(0)
  })
})
