// THE SEMANTIC TOKEN SET. Pure data and pure functions, NO React and NO I/O — the
// same split as lib/discovery.ts and lib/bookingProgress.ts, and for the same
// reason: what a colour MEANS is a product decision, and it should be readable and
// testable on its own rather than buried inside a provider.
//
// ══ WHY THIS EXISTS ═══════════════════════════════════════════════════════
//
// The app had no theme layer. Colour was inline literals across `app/` and
// `components/` — `#080808`, `#F0E8D5`, `#C8922A` repeated hundreds of times — so
// there was no way to express "the same role, a different appearance". PD-119 needs
// exactly that, and it cannot be bolted onto literals.
//
// ══ TWO MODES. NOT THREE. ═════════════════════════════════════════════════
//
// PD-119: **System is a preference, not a mode.** It resolves at runtime to `light`
// or `dark`, and there are exactly two palettes here. If a third ever appears in
// this file, the decision has been broken.
//
// ══ CHARACTER IS DESIGNED, NOT DERIVED ════════════════════════════════════
//
// These are not inverses of one another. `border/subtle` is Clay Dust on light and
// Moss Gray on dark; `status/local` LIFTS from Cypress 600 to Cypress 300 because
// #356A62 on #151719 is about 2.4:1 and fails WCAG AA as text. Mechanically
// inverting the light palette would produce neither.
//
// Values are the approved Figma Foundations v1 set
// (file 0GRAazeDlhllwCRvpLmQMg, node 50:12). Do not edit a value here without
// changing it there — this file is the mirror, not the source.

/** What the user chose. `system` follows the device. */
export type Appearance = 'system' | 'light' | 'dark'

/** What actually gets rendered. Only ever one of two. */
export type ColorScheme = 'light' | 'dark'

/** Every appearance value, for validating persisted input. */
export const APPEARANCES: readonly Appearance[] = ['system', 'light', 'dark'] as const

/**
 * The semantic roles. Components name a ROLE, never a colour — that is the whole
 * point, and it is what makes one component render correctly under both schemes.
 */
export const THEME_ROLES = [
  'bgCanvas',
  'bgSurface',
  'bgElevated',
  'bgSubtle',
  'textPrimary',
  'textSecondary',
  'textOnAction',
  'borderSubtle',
  'actionPrimary',
  'actionSecondary',
  'actionText',
  'statusLocal',
  'statusOutcome',
  'statusDanger',
  'iconPrimary',
  'mediaScrim',
] as const

export type ThemeRole = (typeof THEME_ROLES)[number]
export type ThemeColors = Readonly<Record<ThemeRole, string>>

// ── LIGHT ─────────────────────────────────────────────────────────────────
export const LIGHT_COLORS: ThemeColors = Object.freeze({
  bgCanvas: '#F0EAE2', // Porch — the warm light canvas
  bgSurface: '#F8F4EE', // Paper — a LIGHT SURFACE/FORM role, never text on dark
  bgElevated: '#FFFFFF', // raised material: docked bars, sheets
  bgSubtle: '#F1ECE5', // Linen as a quiet fill here
  textPrimary: '#211F1D', // Ink
  textSecondary: '#72766D', // Moss Gray
  textOnAction: '#F1ECE5', // Linen — on Mulberry, and on media in BOTH schemes
  borderSubtle: '#D8CEC2', // Clay Dust
  actionPrimary: '#713652', // Mulberry — the one primary action fill
  actionSecondary: '#D8CEC2', // see note below
  actionText: '#713652', // Mulberry as a link/label colour
  statusLocal: '#356A62', // Cypress — neighbourhood, connection, truthful status
  statusOutcome: '#72766D', // Moss Gray — neutral transaction outcomes
  statusDanger: '#9A4D4D', // genuine error / destructive ONLY
  iconPrimary: '#211F1D',
  mediaScrim: '#211F1D',
})

// ── DARK ──────────────────────────────────────────────────────────────────
export const DARK_COLORS: ThemeColors = Object.freeze({
  bgCanvas: '#151719', // Night Porch
  bgSurface: '#202326', // Iron
  bgElevated: '#2A2E32', // a step ABOVE Iron, so dark can express raised material
  bgSubtle: '#211F1D', // Ink
  // FOUNDER RULING: Linen is the primary text colour on dark. Paper stays a light
  // surface/form role and does not double as text here.
  textPrimary: '#F1ECE5', // Linen
  textSecondary: '#D8CEC2', // Clay Dust
  textOnAction: '#F1ECE5', // Linen, same in both — that is why media overlays hold
  borderSubtle: '#72766D', // Moss Gray
  actionPrimary: '#713652', // Mulberry fill is constant, so the button keeps identity
  actionSecondary: '#72766D',
  // …but Mulberry as TEXT on Night is ~1.8:1 and unreadable, so the link role lifts.
  actionText: '#D49BB8',
  statusLocal: '#7FBDB2', // Cypress lifted: #356A62 on #151719 is ~2.4:1
  statusOutcome: '#D8CEC2',
  statusDanger: '#E09A9A', // lifted for legibility; still danger-only in meaning
  iconPrimary: '#F8F4EE',
  mediaScrim: '#211F1D',
})

// ── A NOTE ON actionSecondary ─────────────────────────────────────────────
//
// The approved Button/Secondary has NO fill. Its identity is a hairline border and
// a `textPrimary` label. So `actionSecondary` is the role name PM asked for, and it
// resolves to the border colour the approved component actually draws. It is here so
// a component can say what it means; it is deliberately not a new brand colour.

const PALETTES: Readonly<Record<ColorScheme, ThemeColors>> = Object.freeze({
  light: LIGHT_COLORS,
  dark: DARK_COLORS,
})

/** The palette for a resolved scheme. */
export function colorsFor(scheme: ColorScheme): ThemeColors {
  return PALETTES[scheme] ?? LIGHT_COLORS
}

/**
 * Turn the stored preference into the one scheme that will actually render.
 *
 * `systemScheme` is what the OS reports — React Native's `useColorScheme()` returns
 * `'light' | 'dark' | null`, and null is real: it happens before the native module
 * answers. When the device cannot tell us, `system` falls back to **light**, which
 * matches the warm-light character Discover and Bookings were designed around.
 */
export function resolveScheme(
  appearance: Appearance,
  systemScheme: ColorScheme | null | undefined,
): ColorScheme {
  if (appearance === 'light' || appearance === 'dark') return appearance
  return systemScheme === 'dark' ? 'dark' : 'light'
}

/** Is this a value we are willing to restore from storage? */
export function isAppearance(value: unknown): value is Appearance {
  return typeof value === 'string' && (APPEARANCES as readonly string[]).includes(value)
}

// ── SHAPE AND RHYTHM ──────────────────────────────────────────────────────
export const RADIUS = Object.freeze({
  none: 0,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 999,
})

export const SPACING = Object.freeze({
  '2xs': 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
  '4xl': 64,
})

// ── TYPE ──────────────────────────────────────────────────────────────────
//
// The families match the loaded `@expo-google-fonts/manrope` exports. ExtraBold is
// new in this phase: the approved display scale uses it, and the app previously
// loaded only 400/500/600/700.
export const FONT = Object.freeze({
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  extrabold: 'Manrope_800ExtraBold',
})

export type TypeStyle = Readonly<{
  fontFamily: string
  fontSize: number
  lineHeight: number
  letterSpacing: number
}>

export const TYPE: Readonly<Record<string, TypeStyle>> = Object.freeze({
  displayHero: { fontFamily: FONT.extrabold, fontSize: 44, lineHeight: 46, letterSpacing: -1.6 },
  displayScreen: { fontFamily: FONT.extrabold, fontSize: 34, lineHeight: 38, letterSpacing: -1 },
  titleLarge: { fontFamily: FONT.extrabold, fontSize: 26, lineHeight: 32, letterSpacing: -0.5 },
  titleSection: { fontFamily: FONT.extrabold, fontSize: 22, lineHeight: 28, letterSpacing: -0.4 },
  titleCard: { fontFamily: FONT.semibold, fontSize: 18, lineHeight: 24, letterSpacing: -0.15 },
  bodyLarge: { fontFamily: FONT.regular, fontSize: 17, lineHeight: 25, letterSpacing: 0 },
  bodyDefault: { fontFamily: FONT.regular, fontSize: 15, lineHeight: 22, letterSpacing: 0 },
  bodySmall: { fontFamily: FONT.regular, fontSize: 13, lineHeight: 18, letterSpacing: 0 },
  labelAction: { fontFamily: FONT.semibold, fontSize: 14, lineHeight: 20, letterSpacing: 0 },
  labelMeta: { fontFamily: FONT.medium, fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
  caption: { fontFamily: FONT.medium, fontSize: 11, lineHeight: 15, letterSpacing: 0.15 },
})

/** Everything a component needs, resolved for one scheme. */
export type Theme = Readonly<{
  scheme: ColorScheme
  colors: ThemeColors
  radius: typeof RADIUS
  spacing: typeof SPACING
  type: typeof TYPE
  font: typeof FONT
}>

export function themeFor(scheme: ColorScheme): Theme {
  return Object.freeze({
    scheme,
    colors: colorsFor(scheme),
    radius: RADIUS,
    spacing: SPACING,
    type: TYPE,
    font: FONT,
  })
}
