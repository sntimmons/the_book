import { readFileSync } from 'fs'
import { join } from 'path'

// ORDINARY SAVED-PROVIDER LIST AND SELECTION SURFACES HONOUR PD-089.
//
// SCOPE, BECAUSE THE SCOPE IS THE DECISION (founder ruling, 2026-09-15):
//
//   * A DIRECTLY-OPENED PROVIDER PROFILE IS **OUT** OF PD-089'S HIDING RULE for
//     the Houston closed beta. It reads base `providers` and base `posts` ON
//     PURPOSE, preserving PD-090, PD-104 and the reaffirmed OQ-076. That is
//     ACCEPTED BEHAVIOUR, NOT A DEFECT, and this file asserts it stays that way
//     so nobody "fixes" it again. The safety reasoning is the point: a profile
//     that 404s for one viewer and resolves for another is a louder block signal
//     than the diffability the closed beta already accepts.
//
//   * ORDINARY LISTS AND SELECTION SURFACES are **in**. Me -> Saved, the Care Hub
//     saved list and the Add Reminder chips each rendered a provider the viewer
//     was blocked with, from an un-gated `saved_providers -> providers` embed.
//     Those are corrected here.
//
// Source-level because the failure is a one-word substitution that renders
// perfectly. The census below exists because the first version of this guard was
// an allow-list of three files and was GREEN while a fourth surface leaked.

const code = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function stripComments(src: string): string {
  let inBlock = false
  return src
    .split('\n')
    .map((line) => {
      let out = ''
      let i = 0
      while (i < line.length) {
        if (inBlock) {
          const close = line.indexOf('*/', i)
          if (close === -1) return out
          inBlock = false
          i = close + 2
          continue
        }
        const block = line.indexOf('/*', i)
        const lineComment = line.indexOf('//', i)
        if (lineComment !== -1 && (block === -1 || lineComment < block)) {
          return out + line.slice(i, lineComment)
        }
        if (block !== -1) {
          out += line.slice(i, block)
          inBlock = true
          i = block + 2
          continue
        }
        return out + line.slice(i)
      }
      return out
    })
    .join('\n')
}

const PROFILE_SCREEN = 'app/providers/[id].tsx'
const PROVIDER_HOOK = 'hooks/useProviders.ts'
const CLIENT_ME = 'components/ClientMe.tsx'
// THE LIST WAS THREE FILES AND IT WAS GREEN WHILE A FOURTH SURFACE LEAKED.
// `app/care/index.tsx` renders a SECOND saved-providers list, one tap from the
// first, and `app/care/add-reminder.tsx` offers the same set as chips. Both were
// in the original census output and both were missed. Every surface that renders
// a saved provider belongs here.
const CARE_HUB = 'app/care/index.tsx'
const CARE_ADD_REMINDER = 'app/care/add-reminder.tsx'
const SAVED_SURFACES = [CLIENT_ME, CARE_HUB, CARE_ADD_REMINDER] as const

describe('the directly-opened profile is deliberately OUT of scope', () => {
  it('identity still reads base providers, by founder ruling', () => {
    const src = stripComments(code(PROVIDER_HOOK))
    const fetchBlock = src.slice(
      src.indexOf('const fetchProvider'),
      src.indexOf('export function useCategories'),
    )
    expect(fetchBlock).toMatch(/from\('providers'\)\.select\(PUBLIC_PROVIDER_FIELDS\)/)
    expect(fetchBlock).not.toMatch(/providers_visible/)
  })

  it('profile media still reads base posts, so identity and media agree', () => {
    // A profile that resolves the provider but empties their portfolio under a
    // block is a PARTIAL state, and it signals the block louder than either
    // consistent answer.
    const src = stripComments(code(PROFILE_SCREEN))
    expect(src).toMatch(/from\('posts'\)/)
    expect(src).not.toMatch(/posts_visible/)
  })

  it('no migration newer than the recorded baseline alters a visibility view', () => {
    // EXPRESSES THE RULE, NOT THE DATE. This asserted the exact filename of the
    // latest migration, so ANY unrelated future migration turned a block-safety
    // guard red — and the repair would be to edit a constant inside a safety
    // guard, which is how a guard stops being trusted. Now an unrelated
    // migration passes and one that touches a `_visible` view fails.
    const fs = require('fs')
    const BASELINE = '20261137000000'
    const dir = join(process.cwd(), 'supabase/migrations')
    const offenders = fs
      .readdirSync(dir)
      .filter((f: string) => f.endsWith('.sql') && f.slice(0, 14) > BASELINE)
      .filter((f: string) => /providers_visible|posts_visible|community_posts_visible/.test(
        fs.readFileSync(join(dir, f), 'utf8'),
      ))
    expect(offenders).toEqual([])
  })
})

describe('Saved does not surface a provider the viewer is blocked with', () => {
  it.each(SAVED_SURFACES)('%s gates its rendered list through providers_visible', (rel) => {
    const src = stripComments(code(rel))
    expect(src).toMatch(/from\(\s*['"]providers_visible['"]\s*\)/)
    // The gate has to be APPLIED, not merely fetched.
    expect(src).toMatch(/\.filter\(\([^)]*\) => visible(Saved)?\.has\(/)
  })

  it('every saved_providers reader is on the list above', () => {
    // A census, not an allow-list: the previous version of this guard could not
    // fail on a file it did not name, which is exactly how the Care Hub survived.
    const found: string[] = []
    // Widened after review: the first version walked four directories and matched
    // ONE exact single-quoted literal on RAW source, so a reader in `store/` or
    // `context/`, or one written with double quotes or wrapped by Prettier, was
    // invisible to a test whose whole purpose is not being blind.
    const READER = /\.from\(\s*['"]saved_providers['"]\s*\)/
    const walk = (dir: string) => {
      for (const e of require('fs').readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(e.name) && READER.test(stripComments(code(rel)))) {
          found.push(rel)
        }
      }
    }
    ;['app', 'components', 'lib', 'hooks', 'store', 'context'].forEach(walk)
    // The profile screen reads saved_providers to drive its own Save toggle —
    // own-data, rendering no third party — so it is listed as a known reader
    // rather than gated.
    const OWN_DATA = ['app/providers/[id].tsx']
    expect(found.sort()).toEqual([...SAVED_SURFACES, ...OWN_DATA].sort())
  })

  it.each(SAVED_SURFACES)('%s NEVER DELETES THE SAVED ROW', (rel) => {
    const src = stripComments(code(rel))
    expect(src).not.toMatch(/from\(\s*['"]saved_providers['"]\s*\)[\s\S]{0,200}\.delete\(\)/)
  })

  it('NEVER DELETES THE SAVED ROW', () => {
    // A block is not an unsave. Deleting here would destroy a choice the viewer
    // made and could not get back on unblock.
    const src = stripComments(code(CLIENT_ME))
    const savedBlock = src.slice(src.indexOf("from('saved_providers')"), src.indexOf('setSaved(rows)'))
    expect(savedBlock).not.toMatch(/\.delete\(\)/)
  })

  it('fails closed when the visibility check itself fails', () => {
    // Falling back to the unfiltered list would put a blocked provider back on
    // screen at exactly the moment the check that would have caught it broke.
    const src = stripComments(code(CLIENT_ME))
    expect(src).toMatch(/if \(visError\)[\s\S]{0,200}setSaved\(\[\]\)/)
  })
})

describe('the block rule was not widened or reinterpreted', () => {
  it('no screen calls a block predicate directly', () => {
    // 20261055000000 removed the client-callable predicate deliberately: an
    // answerable "are we blocked" question is an oracle. The views return
    // already-filtered content instead, and an absent row is indistinguishable
    // from one deleted, deactivated or never created.
    for (const rel of [PROFILE_SCREEN, PROVIDER_HOOK, CLIENT_ME]) {
      const src = stripComments(code(rel))
      expect(src).not.toMatch(/contact_blocked|is_blocked_by|from\(\s*['"]user_blocks['"]\s*\)/)
    }
  })

  it('live-transaction surfaces still read base tables, as PD-089 requires', () => {
    // The exception is not a courtesy: two people inside a live obligation must
    // still see each other's name, terms and appointment, or a block would
    // strand a trade. These MUST NOT be "fixed" to use the views.
    for (const rel of ['app/bookings/[id].tsx', 'app/messages/[id].tsx']) {
      const src = stripComments(code(rel))
      expect(src).toMatch(/from\(\s*['"]providers['"]\s*\)/)
    }
  })

  it('the safety module still reads base providers, or you could not list your own blocks', () => {
    expect(stripComments(code('lib/safety.ts'))).toMatch(/from\(\s*['"]providers['"]\s*\)/)
  })
})

