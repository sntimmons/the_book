import { render, screen, waitFor } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { APPEARANCE_STORAGE_KEY, ThemeProvider } from '@/context/ThemeContext'
import { DARK_COLORS, LIGHT_COLORS, type ColorScheme } from '@/lib/theme/tokens'
import ReferencePhotos, { referencePhotosLabel } from '@/components/ui/ReferencePhotos'

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

const URLS = [
  'https://example.test/signed/a.jpg?token=1',
  'https://example.test/signed/b.jpg?token=2',
]

beforeEach(async () => {
  await AsyncStorage.clear()
})

describe('referencePhotosLabel', () => {
  it('says whose photos these are, from the viewer’s side', () => {
    // Matches the adjacent note card, which is already CLIENT'S NOTE / YOUR NOTE.
    expect(referencePhotosLabel(2, false)).toBe('YOUR REFERENCE PHOTOS')
    expect(referencePhotosLabel(2, true)).toBe("CLIENT'S REFERENCE PHOTOS")
  })

  it('does not say "1 photos"', () => {
    expect(referencePhotosLabel(1, false)).toBe('YOUR REFERENCE PHOTO')
    expect(referencePhotosLabel(1, true)).toBe("CLIENT'S REFERENCE PHOTO")
  })
})

describe('ReferencePhotos', () => {
  it('renders one image per URL, in the order given', async () => {
    await renderIn('light', <ReferencePhotos urls={URLS} />)
    await waitFor(() => expect(screen.getByText('YOUR REFERENCE PHOTOS')).toBeTruthy())

    const images = screen.UNSAFE_getAllByType(require('react-native').Image)
    expect(images).toHaveLength(2)
    expect(images.map((i) => i.props.source.uri)).toEqual(URLS)
  })

  it('labels each image by position, since nobody captioned them', async () => {
    await renderIn('light', <ReferencePhotos urls={URLS} />)
    await waitFor(() =>
      expect(screen.getByLabelText('Reference photo 1 of 2')).toBeTruthy(),
    )
    expect(screen.getByLabelText('Reference photo 2 of 2')).toBeTruthy()
  })

  it('is ABSENT with no photos — no empty state, no placeholder frames', async () => {
    // A booking without reference photos is not missing anything. An empty state
    // would invent a gap the client never left, and a grey frame would imply a
    // photo the viewer cannot open.
    const { toJSON } = await renderIn('light', <ReferencePhotos urls={[]} />)
    expect(toJSON()).toBeNull()
    expect(screen.queryByText(/REFERENCE PHOTO/)).toBeNull()
  })

  it('resolves its surface from the theme in Light', async () => {
    await renderIn('light', <ReferencePhotos urls={URLS} />)
    await waitFor(() => expect(screen.getByText('YOUR REFERENCE PHOTOS')).toBeTruthy())
    expect(flatten(screen.getByText('YOUR REFERENCE PHOTOS').props.style).color).toBe(
      LIGHT_COLORS.textSecondary,
    )
    const image = screen.getByLabelText('Reference photo 1 of 2')
    expect(flatten(image.props.style).backgroundColor).toBe(LIGHT_COLORS.bgSubtle)
  })

  it('resolves its surface from the theme in Dark', async () => {
    await renderIn('dark', <ReferencePhotos urls={URLS} />)
    await waitFor(() =>
      expect(
        flatten(screen.getByText('YOUR REFERENCE PHOTOS').props.style).color,
      ).toBe(DARK_COLORS.textSecondary),
    )
    const image = screen.getByLabelText('Reference photo 1 of 2')
    // The fill under a decoding image must be the dark surface, not a white flash.
    expect(flatten(image.props.style).backgroundColor).toBe(DARK_COLORS.bgSubtle)
  })

  it('carries no colour literal of its own', () => {
    const src = require('fs').readFileSync(
      require('path').join(process.cwd(), 'components/ui/ReferencePhotos.tsx'),
      'utf8',
    )
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(code).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(code).not.toMatch(/rgba?\(/)
  })
})
