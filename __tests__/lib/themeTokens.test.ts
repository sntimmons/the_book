import {
  APPEARANCES,
  DARK_COLORS,
  LIGHT_COLORS,
  THEME_ROLES,
  colorsFor,
  isAppearance,
  resolveScheme,
  themeFor,
  type ThemeRole,
} from '@/lib/theme/tokens'

// PD-119 lives or dies on these. The palettes are data, so the decisions they encode
// are assertable rather than merely commented.

describe('resolveScheme — System is a preference, not a mode', () => {
  it('follows the device when the preference is system', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark')
    expect(resolveScheme('system', 'light')).toBe('light')
  })

  it('falls back to light when the device cannot say', () => {
    // useColorScheme() genuinely returns null before the native module answers.
    expect(resolveScheme('system', null)).toBe('light')
    expect(resolveScheme('system', undefined)).toBe('light')
  })

  it('lets an explicit choice override the device in both directions', () => {
    expect(resolveScheme('dark', 'light')).toBe('dark')
    expect(resolveScheme('light', 'dark')).toBe('light')
  })

  it('only ever resolves to one of two schemes', () => {
    const seen = new Set<string>()
    for (const appearance of APPEARANCES) {
      for (const system of ['light', 'dark', null] as const) {
        seen.add(resolveScheme(appearance, system))
      }
    }
    expect([...seen].sort()).toEqual(['dark', 'light'])
  })
})

describe('palettes', () => {
  it('define every semantic role in both schemes', () => {
    for (const role of THEME_ROLES) {
      expect(typeof LIGHT_COLORS[role]).toBe('string')
      expect(typeof DARK_COLORS[role]).toBe('string')
    }
  })

  it('uses only 6-digit hex, so no role can carry hidden alpha', () => {
    for (const role of THEME_ROLES) {
      expect(LIGHT_COLORS[role]).toMatch(/^#[0-9A-F]{6}$/)
      expect(DARK_COLORS[role]).toMatch(/^#[0-9A-F]{6}$/)
    }
  })

  it('adds no role beyond the declared set', () => {
    expect(Object.keys(LIGHT_COLORS).sort()).toEqual([...THEME_ROLES].sort())
    expect(Object.keys(DARK_COLORS).sort()).toEqual([...THEME_ROLES].sort())
  })

  it('is not a mechanical inversion — character is designed per scheme', () => {
    // If dark were derived from light, these pairs would be forced equal or forced
    // to swap. They are neither: borderSubtle and statusLocal are chosen per scheme.
    expect(DARK_COLORS.borderSubtle).not.toBe(LIGHT_COLORS.borderSubtle)
    expect(DARK_COLORS.statusLocal).not.toBe(LIGHT_COLORS.statusLocal)
    // The action FILL is constant so the button keeps its identity…
    expect(DARK_COLORS.actionPrimary).toBe(LIGHT_COLORS.actionPrimary)
    // …while the action TEXT lifts, because Mulberry on Night is ~1.8:1.
    expect(DARK_COLORS.actionText).not.toBe(LIGHT_COLORS.actionText)
  })
})

describe('founder rulings', () => {
  it('makes Linen the primary text colour on dark', () => {
    expect(DARK_COLORS.textPrimary).toBe('#F1ECE5')
  })

  it('keeps Paper as a light surface role and NOT text on dark', () => {
    expect(LIGHT_COLORS.bgSurface).toBe('#F8F4EE')
    expect(DARK_COLORS.textPrimary).not.toBe('#F8F4EE')
  })

  it('keeps danger out of every non-danger role', () => {
    const DANGER = new Set(['#9A4D4D', '#E09A9A'])
    for (const role of THEME_ROLES) {
      if (role === 'statusDanger') continue
      expect(DANGER.has(LIGHT_COLORS[role])).toBe(false)
      expect(DANGER.has(DARK_COLORS[role])).toBe(false)
    }
  })

  it('gives outcome a neutral value, distinct from danger', () => {
    expect(LIGHT_COLORS.statusOutcome).not.toBe(LIGHT_COLORS.statusDanger)
    expect(DARK_COLORS.statusOutcome).not.toBe(DARK_COLORS.statusDanger)
  })
})

describe('isAppearance', () => {
  it('accepts exactly the three appearances', () => {
    expect(APPEARANCES.every(isAppearance)).toBe(true)
  })

  it('rejects anything else, so a corrupt stored value cannot break launch', () => {
    for (const bad of ['Dark', '', 'auto', null, undefined, 7, {}]) {
      expect(isAppearance(bad)).toBe(false)
    }
  })
})

describe('themeFor', () => {
  it('bundles the palette with the shared scale', () => {
    const t = themeFor('dark')
    expect(t.scheme).toBe('dark')
    expect(t.colors).toBe(colorsFor('dark'))
    expect(t.radius.full).toBe(999)
    expect(t.spacing.lg).toBe(20)
    // The approved display scale needs ExtraBold, which the app now loads.
    expect(t.type.displayScreen.fontFamily).toBe('Manrope_800ExtraBold')
  })

  it('resolves an unknown scheme to light rather than throwing', () => {
    expect(colorsFor('nope' as unknown as 'light')).toBe(LIGHT_COLORS)
  })
})

describe('role coverage', () => {
  it('includes every role PM named for this phase', () => {
    const required: ThemeRole[] = [
      'bgCanvas', 'bgSurface', 'bgElevated',
      'textPrimary', 'textSecondary', 'textOnAction',
      'borderSubtle',
      'actionPrimary', 'actionSecondary',
      'statusLocal', 'statusOutcome', 'statusDanger',
    ]
    for (const role of required) expect(THEME_ROLES).toContain(role)
  })
})
