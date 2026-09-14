import { Text } from 'react-native'
import { render, screen, waitFor, act } from '@testing-library/react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  APPEARANCE_STORAGE_KEY,
  ThemeProvider,
  useAppearance,
} from '@/context/ThemeContext'

// PD-119 persistence. The preference is device-local on purpose — it describes this
// device's screen, not the account — so AsyncStorage is the whole mechanism and
// nothing here should reach Supabase.

let mockSystemScheme: 'light' | 'dark' | null = 'light'
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => mockSystemScheme,
}))

function Probe() {
  const { appearance, scheme, hydrated, setAppearance, theme } = useAppearance()
  return (
    <>
      <Text testID="appearance">{appearance}</Text>
      <Text testID="scheme">{scheme}</Text>
      <Text testID="hydrated">{String(hydrated)}</Text>
      <Text testID="canvas">{theme.colors.bgCanvas}</Text>
      <Text testID="set-dark" onPress={() => setAppearance('dark')}>
        dark
      </Text>
      <Text testID="set-system" onPress={() => setAppearance('system')}>
        system
      </Text>
    </>
  )
}

const renderProbe = () =>
  render(
    <ThemeProvider>
      <Probe />
    </ThemeProvider>,
  )

beforeEach(async () => {
  mockSystemScheme = 'light'
  await AsyncStorage.clear()
  jest.clearAllMocks()
})

describe('default', () => {
  it('starts on system with nothing stored', async () => {
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'))
    expect(screen.getByTestId('appearance')).toHaveTextContent('system')
  })

  it('renders immediately rather than blocking on storage', () => {
    renderProbe()
    // Before hydration finishes there is still a usable theme on screen.
    expect(screen.getByTestId('appearance')).toHaveTextContent('system')
    expect(screen.getByTestId('scheme')).toHaveTextContent('light')
  })
})

describe('persistence', () => {
  it('restores a stored preference', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark')
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('appearance')).toHaveTextContent('dark'))
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark')
  })

  it('writes the choice so it survives a restart', async () => {
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'))
    await act(async () => {
      screen.getByTestId('set-dark').props.onPress()
    })
    await waitFor(() => expect(screen.getByTestId('appearance')).toHaveTextContent('dark'))
    expect(await AsyncStorage.getItem(APPEARANCE_STORAGE_KEY)).toBe('dark')
  })

  it('ignores a corrupt stored value instead of breaking launch', async () => {
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'ultraviolet')
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'))
    expect(screen.getByTestId('appearance')).toHaveTextContent('system')
  })

  it('survives storage being unavailable', async () => {
    // Swap the function by hand and put it back. `jest.spyOn(...).mockRestore()`
    // over a method of an already-mocked module leaves `getItem` unusable for every
    // later test in the file, which is a far more confusing failure than this is.
    const original = AsyncStorage.getItem
    AsyncStorage.getItem = jest.fn().mockRejectedValue(new Error('no storage'))
    try {
      renderProbe()
      await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'))
      expect(screen.getByTestId('appearance')).toHaveTextContent('system')
    } finally {
      AsyncStorage.getItem = original
    }
  })
})

describe('resolution', () => {
  it('follows the device while the preference is system', async () => {
    mockSystemScheme = 'dark'
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('hydrated')).toHaveTextContent('true'))
    expect(screen.getByTestId('scheme')).toHaveTextContent('dark')
    expect(screen.getByTestId('canvas')).toHaveTextContent('#151719')
  })

  it('an explicit choice overrides the device', async () => {
    mockSystemScheme = 'light'
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'dark')
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('scheme')).toHaveTextContent('dark'))
    expect(screen.getByTestId('canvas')).toHaveTextContent('#151719')
  })

  it('light preference yields the warm light canvas', async () => {
    mockSystemScheme = 'dark'
    await AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, 'light')
    renderProbe()
    await waitFor(() => expect(screen.getByTestId('scheme')).toHaveTextContent('light'))
    expect(screen.getByTestId('canvas')).toHaveTextContent('#F0EAE2')
  })
})
