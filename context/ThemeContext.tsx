import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  isAppearance,
  resolveScheme,
  themeFor,
  type Appearance,
  type ColorScheme,
  type Theme,
} from '@/lib/theme/tokens'

// APPEARANCE, IMPLEMENTING PD-119.
//
// The RULES live in lib/theme/tokens.ts, which is pure and tested. This file only
// holds the preference, persists it, and hands the resolved theme down — the same
// split the rest of the app uses for product logic.
//
// ══ WHAT THIS IS NOT ══════════════════════════════════════════════════════
//
// It is not a capability, a privacy control, or a visibility setting. It changes
// how Third LOOKS and nothing else, and the Appearance screen says so in as many
// words. Nothing here reads or writes user data, touches permissions, or reaches
// Supabase — the preference is device-local on purpose, because it describes this
// device's screen and not the account.
//
// ══ WHY IT DOES NOT BLOCK RENDER ══════════════════════════════════════════
//
// Reading AsyncStorage is async. Gating the whole app on it would add a blank frame
// to every cold start to serve a preference most users never change. So we render
// immediately on `system` — which is the default anyway (PD-119) — and swap once the
// stored value arrives. `hydrated` is exposed so a settings screen can avoid drawing
// a selected state it is about to correct.

const STORAGE_KEY = 'appearance_preference'

type ThemeContextValue = {
  /** The resolved palette and scale. Never null — components can always render. */
  theme: Theme
  /** What actually rendered: 'light' or 'dark'. Never 'system'. */
  scheme: ColorScheme
  /** What the user chose, including 'system'. */
  appearance: Appearance
  /** Persist a new choice. Applies immediately; the write is fire-and-forget. */
  setAppearance: (next: Appearance) => void
  /** Has the stored preference been read yet? */
  hydrated: boolean
}

const DEFAULT_APPEARANCE: Appearance = 'system'

const ThemeContext = createContext<ThemeContextValue>({
  theme: themeFor('light'),
  scheme: 'light',
  appearance: DEFAULT_APPEARANCE,
  setAppearance: () => {},
  hydrated: false,
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme()
  const [appearance, setAppearanceState] = useState<Appearance>(DEFAULT_APPEARANCE)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY)
        // A corrupt or unknown value falls back to the default rather than
        // throwing. There is no scenario where a bad string should break launch.
        if (!cancelled && isAppearance(stored)) setAppearanceState(stored)
      } catch {
        // Storage unavailable is not an error worth surfacing: the default is a
        // perfectly good answer, and this setting is not load-bearing.
      } finally {
        if (!cancelled) setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const setAppearance = useCallback((next: Appearance) => {
    if (!isAppearance(next)) return
    // Apply first so the switch feels instant; persist behind it.
    setAppearanceState(next)
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Losing the write means the choice does not survive a restart. That is a
      // worse experience, not a broken one, and there is nothing useful to say.
    })
  }, [])

  const scheme = resolveScheme(appearance, systemScheme)
  const value = useMemo<ThemeContextValue>(
    () => ({ theme: themeFor(scheme), scheme, appearance, setAppearance, hydrated }),
    [scheme, appearance, setAppearance, hydrated],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

/** The resolved theme. The common case — most components want only this. */
export const useTheme = (): Theme => useContext(ThemeContext).theme

/** The whole appearance surface, for the settings screen. */
export const useAppearance = () => useContext(ThemeContext)

export { STORAGE_KEY as APPEARANCE_STORAGE_KEY }
