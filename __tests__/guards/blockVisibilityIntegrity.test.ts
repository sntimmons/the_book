import { readFileSync } from 'fs'
import { join } from 'path'

// ORDINARY VIEWER-FACING SURFACES READ THE BLOCK-AWARE VIEWS (CODE-DRIFT-008).
//
// PD-089 says a blocked person disappears from each other's ordinary discovery
// and content surfaces. The VIEWS enforce that; a screen only inherits it by
// reading them. Discover and search did. The public provider profile — the
// surface the whole funnel navigates into — did not, and rendered a blocked
// provider's identity and portfolio in full.
//
// Source-level because the failure is a one-word substitution that renders
// perfectly: `from('providers')` instead of `from('providers_visible')` throws
// nothing, shows a complete screen, and is invisible to anyone not holding two
// accounts and a block between them.
//
// PD-090 is not a defence for it. Inferring that a block exists by diffing a
// table against its view is the accepted residual; the app itself serving the
// blocked person in ordinary navigation is not.

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

describe('the public provider profile reads the block-aware views', () => {
  it('its identity comes from providers_visible, not the base table', () => {
    const src = stripComments(code(PROVIDER_HOOK))
    const fetchBlock = src.slice(src.indexOf('const fetchProvider'), src.indexOf('export function useCategories'))
    expect(fetchBlock).toMatch(/from\(\s*['"]providers_visible['"]\s*\)/)
    expect(fetchBlock).not.toMatch(/from\(\s*['"]providers['"]\s*\)/)
  })

  it('its media comes from posts_visible, not the base table', () => {
    const src = stripComments(code(PROFILE_SCREEN))
    expect(src).toMatch(/from\(\s*['"]posts_visible['"]\s*\)/)
    expect(src).not.toMatch(/from\(\s*['"]posts['"]\s*\)/)
  })

  it('still orders by the provider\'s own curation', () => {
    // The reason this screen had a motive to stay on the base table. If the
    // ordering is dropped the next person will "fix" it by going back.
    const src = stripComments(code(PROFILE_SCREEN))
    expect(src).toMatch(/\.order\('sort_order', \{ ascending: true \}\)/)
  })

  it('a filtered provider falls into the EXISTING not-found state', () => {
    // Not a block-specific screen, and not block-specific copy: the same words a
    // genuine missing id produces. Anything else would announce the block.
    const src = stripComments(code(PROFILE_SCREEN))
    const start = src.indexOf('if (!provider)')
    expect(start).toBeGreaterThan(-1)
    const notFound = src.slice(start, start + 900)
    expect(notFound).toMatch(/Provider not found/)
    // Scoped to the NOT-FOUND RENDER, not the whole file. `blockedByMe` and
    // `iBlocked` live elsewhere on this screen and are correct: PD-082 lets the
    // BLOCKER see their own block, and only them. What must never happen is the
    // unavailable state explaining itself.
    for (const reveal of ['blocked', 'Blocked', 'unavailable to you']) {
      expect(notFound).not.toContain(reveal)
    }
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
    const walk = (dir: string) => {
      for (const e of require('fs').readdirSync(join(process.cwd(), dir), { withFileTypes: true })) {
        const rel = `${dir}/${e.name}`
        if (e.isDirectory()) walk(rel)
        else if (/\.tsx?$/.test(e.name) && code(rel).includes("from('saved_providers')")) {
          found.push(rel)
        }
      }
    }
    ;['app', 'components', 'lib', 'hooks'].forEach(walk)
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

describe('the view change is additive only', () => {
  it('posts_visible gained sort_order and kept every predicate', () => {
    const mig = code('supabase/migrations/20261138000000_a_profile_is_an_ordinary_surface.sql')
    expect(mig).toMatch(/p\.sort_order/)
    expect(mig).toMatch(/security_invoker = false/)
    // Bidirectional block filter, both legs.
    expect(mig).toMatch(/b\.blocker_user_id = \(select auth\.uid\(\)\) and b\.blocked_user_id = pr\.user_id/)
    expect(mig).toMatch(/b\.blocked_user_id = \(select auth\.uid\(\)\) and b\.blocker_user_id = pr\.user_id/)
    // Deletion / unavailability rule.
    expect(mig).toMatch(/public\.account_unavailable\(pr2\.user_id\)/)
    // Grants restated, not widened.
    expect(mig).toMatch(/grant select on public\.posts_visible to anon, authenticated;/)
    expect(mig).not.toMatch(/grant all|to public;/)
  })

  it('does not edit the migration it supersedes', () => {
    const superseded = code('supabase/migrations/20261111000000_hidden_is_a_property_of_the_row.sql')
    // The old definition is still there, untouched, without sort_order.
    const view = superseded.slice(
      superseded.indexOf('create or replace view public.posts_visible'),
      superseded.indexOf('alter view public.posts_visible owner'),
    )
    expect(view).not.toMatch(/sort_order/)
  })
})
