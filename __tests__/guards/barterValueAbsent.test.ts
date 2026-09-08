import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ── PD-069 HAS NO CLIENT-SIDE TEST, SO IT GETS A SOURCE-LEVEL ONE ─────────
//
// The Book does not appraise, equalize or compare the value of a barter trade, and as of
// 2026-09-08 it does not ask for one either: the composer input and the `~$N value` board badge
// are gone and `offering_value` is not selected, mapped or typed.
//
// The SERVER half of that is well covered — `supabase/tests/barter.test.sql` proves the insert
// is nulled, the value cannot be introduced or swapped, a legacy row stays editable, and no
// replacement valuation column or function exists anywhere in the schema. The CLIENT half had
// nothing: `lib/barter.ts` imports the Supabase client, so it cannot be unit-tested without live
// configuration, and re-adding `offering_value` to the select plus one field to `BarterOffer` is
// a two-line change that would silently resurrect the read path for legacy rows.
//
// So this reads the source, in the spirit of the production-target guard beside it. Comments are
// stripped first: every one of these files deliberately CONTAINS the column name in a comment
// explaining why the code does not, and an assertion that prose could satisfy proves nothing.
const ROOT = join(__dirname, '..', '..')

const FILES = [
  'lib/barter.ts',
  'app/community/barter-compose.tsx',
  'app/community/index.tsx',
]

/** Source with `//` line comments and `/* *​/` block comments removed. */
function code(rel: string): string {
  const raw = readFileSync(join(ROOT, rel), 'utf8')
  return raw
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
}

describe('no live surface reads or writes a barter dollar value (PD-069)', () => {
  it.each(FILES)('%s does not reference offering_value outside a comment', (rel) => {
    const src = code(rel)
    expect(src).not.toMatch(/offering_value/)
    expect(src).not.toMatch(/offeringValue/)
  })

  it('the offer select list does not fetch the deprecated column', () => {
    // The surest way for a value never to reach a screen is for the read never to ask for it.
    const src = code('lib/barter.ts')
    const select = /'(id, provider_id[^']*)'/.exec(src)
    expect(select).not.toBeNull()
    expect(select![1]).not.toContain('offering_value')
    // And the columns that must still be there, so this cannot pass by the select disappearing.
    for (const col of ['offering_service', 'seeking_service', 'notes', 'is_active']) {
      expect(select![1]).toContain(col)
    }
  })

  it('the composer collects no monetary input of any name', () => {
    const src = code('app/community/barter-compose.tsx')
    // keyboardType="number-pad" was the value field's tell; the remaining inputs are all text.
    expect(src).not.toMatch(/number-pad/)
    expect(src.toLowerCase()).not.toMatch(/estimated value|market value|retail price/)
  })

  it('no barter surface renders a dollar figure', () => {
    for (const rel of ['app/community/index.tsx', 'app/community/barter-compose.tsx']) {
      // A `$` inside a template literal next to a value is how the badge read: `~${v} value`.
      expect(code(rel)).not.toMatch(/~\$\{/)
    }
  })
})
