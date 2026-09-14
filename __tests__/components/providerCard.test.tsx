import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import { router } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { APPEARANCE_STORAGE_KEY, ThemeProvider } from '@/context/ThemeContext'
import { DARK_COLORS, LIGHT_COLORS, type ColorScheme } from '@/lib/theme/tokens'
import ProviderCard, {
  cardRating,
  providerSubtitle,
  type ProviderCardData,
} from '@/components/ui/ProviderCard'

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}))

async function renderIn(scheme: ColorScheme, ui: React.ReactElement) {
  await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, scheme)
  return render(<ThemeProvider>{ui}</ThemeProvider>)
}
const flatten = (style: unknown): Record<string, unknown> =>
  Object.assign({}, ...([style].flat(Infinity).filter(Boolean) as object[]))

const RATED: ProviderCardData = {
  id: 'p1',
  displayName: 'Jordan Ellis',
  businessName: 'Southline Grooming',
  trade: 'Barber',
  neighborhood: 'Midtown',
  image: 'https://example.test/work.jpg',
  averageRating: 4.9,
  openToday: true,
}

beforeEach(async () => {
  await AsyncStorage.clear()
})

describe('cardRating', () => {
  it('shows a real rating to one decimal', () => {
    expect(cardRating({ id: 'x', displayName: 'A', averageRating: 4.9 })).toBe('4.9')
    expect(cardRating({ id: 'x', displayName: 'A', averageRating: 5 })).toBe('5.0')
    // Same `toFixed(1)` the provider profile uses, so one provider cannot read
    // as 4.9 on a card and 4.85 on their page.
    expect(cardRating({ id: 'x', displayName: 'A', averageRating: 4.44 })).toBe('4.4')
  })

  it('treats an unrated provider as an absence, never 0.0', () => {
    // average_rating is NOT NULL DEFAULT 0, so 0 is the value an unreviewed
    // provider actually arrives with — the one that must never render.
    expect(cardRating({ id: 'x', displayName: 'A', averageRating: 0 })).toBeNull()
    expect(cardRating({ id: 'x', displayName: 'A' })).toBeNull()
  })
})

describe('providerSubtitle', () => {
  it('joins trade and neighbourhood', () => {
    expect(providerSubtitle(RATED)).toBe('Barber  ·  Midtown')
  })
  it('drops what is missing rather than leaving a separator', () => {
    expect(providerSubtitle({ id: 'x', displayName: 'A', trade: 'Braider' })).toBe('Braider')
    expect(providerSubtitle({ id: 'x', displayName: 'A' })).toBeNull()
  })
})

describe('ProviderCard — what a client may see before tapping', () => {
  it('shows identity, trade, neighbourhood and a real rating', async () => {
    await renderIn('light', <ProviderCard provider={RATED} variant="grid" width={160} />)
    await waitFor(() => expect(screen.getByText('Southline Grooming')).toBeTruthy())
    expect(screen.getByText('Barber  ·  Midtown')).toBeTruthy()
    expect(screen.getByText('4.9')).toBeTruthy()
  })

  it('omits the rating entirely when the provider is unrated', async () => {
    await renderIn(
      'light',
      <ProviderCard provider={{ ...RATED, averageRating: 0, openToday: false }} variant="grid" width={160} />,
    )
    await waitFor(() => expect(screen.getByText('Southline Grooming')).toBeTruthy())
    expect(screen.queryByText('0.0')).toBeNull()
    expect(screen.queryByText('0')).toBeNull()
    expect(screen.queryByText('New')).toBeNull()
  })

  it('shows Open today ONLY when the server said true', async () => {
    const { unmount } = await renderIn(
      'light',
      <ProviderCard provider={RATED} variant="grid" width={160} />,
    )
    await waitFor(() => expect(screen.getByText('Open today')).toBeTruthy())
    unmount()

    // null means nobody asked — an unanswered question is not a fact.
    await renderIn(
      'light',
      <ProviderCard provider={{ ...RATED, openToday: null }} variant="grid" width={160} />,
    )
    await waitFor(() => expect(screen.getByText('Southline Grooming')).toBeTruthy())
    expect(screen.queryByText('Open today')).toBeNull()
  })

  it('never repeats Open today inside a lane that already states it', async () => {
    await renderIn('light', <ProviderCard provider={RATED} variant="lane" width={148} />)
    await waitFor(() => expect(screen.getByText('Southline Grooming')).toBeTruthy())
    expect(screen.queryByText('Open today')).toBeNull()
  })

  it('claims nothing it cannot support', async () => {
    await renderIn('light', <ProviderCard provider={RATED} variant="grid" width={160} />)
    await waitFor(() => expect(screen.getByText('Southline Grooming')).toBeTruthy())
    for (const forbidden of [/featured/i, /trending/i, /verified/i, /booking/i, /follower/i, /popular/i, /\$/]) {
      expect(screen.queryByText(forbidden)).toBeNull()
    }
  })

  it('falls back to a neutral tile, not a person-shaped one', async () => {
    await renderIn(
      'light',
      <ProviderCard provider={{ ...RATED, image: null }} variant="grid" width={160} />,
    )
    // The absence of a photo is not the absence of a provider.
    await waitFor(() => expect(screen.getByLabelText('Southline Grooming, no photo yet')).toBeTruthy())
  })

  it('opens the provider profile on tap', async () => {
    await renderIn('light', <ProviderCard provider={RATED} variant="grid" width={160} testID="c" />)
    await waitFor(() => expect(screen.getByTestId('c')).toBeTruthy())
    fireEvent.press(screen.getByTestId('c'))
    expect(router.push).toHaveBeenCalledWith({ pathname: '/providers/[id]', params: { id: 'p1' } })
  })

  it('gives both variants the same structural width it is handed', async () => {
    // Uniformity is the point: no card earns extra size from its position.
    const { unmount } = await renderIn(
      'light',
      <ProviderCard provider={RATED} variant="grid" width={160} testID="g" />,
    )
    await waitFor(() => expect(screen.getByTestId('g')).toBeTruthy())
    expect(flatten(screen.getByTestId('g').props.style).width).toBe(160)
    unmount()
    await renderIn('light', <ProviderCard provider={RATED} variant="lane" width={148} testID="l" />)
    await waitFor(() => expect(screen.getByTestId('l')).toBeTruthy())
    expect(flatten(screen.getByTestId('l').props.style).width).toBe(148)
  })

  it('resolves from the theme in Light and Dark', async () => {
    const { unmount } = await renderIn(
      'light',
      <ProviderCard provider={RATED} variant="grid" width={160} />,
    )
    await waitFor(() =>
      expect(flatten(screen.getByText('Southline Grooming').props.style).color).toBe(
        LIGHT_COLORS.textPrimary,
      ),
    )
    expect(flatten(screen.getByText('Open today').props.style).color).toBe(LIGHT_COLORS.statusLocal)
    unmount()

    await renderIn('dark', <ProviderCard provider={RATED} variant="grid" width={160} />)
    await waitFor(() =>
      expect(flatten(screen.getByText('Southline Grooming').props.style).color).toBe(
        DARK_COLORS.textPrimary,
      ),
    )
    expect(flatten(screen.getByText('Open today').props.style).color).toBe(DARK_COLORS.statusLocal)
  })
})
