import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

// ── WHAT COMMUNITY IS, ENFORCED WHERE IT CAN DRIFT ────────────────────────
//
// The reshape's product rules are enforced in SQL wherever they are about DATA
// (supabase/tests/community.test.sql is the access matrix). The rules below are
// about SHAPE — which routes exist, which screen owns which job, and what the
// app is allowed to rank on — and SQL cannot see any of them.
//
// Every assertion here corresponds to a sentence somebody could undo in one
// commit without noticing.

const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (/\.tsx?$/.test(entry)) out.push(full)
  }
  return out
}

describe('Community is a route, not a tab', () => {
  const tabs = read('app/(tabs)/_layout.tsx')

  it('there is no sixth bottom tab', () => {
    // The five are Discover, Reels, Bookings, Messages, Me. Anything else
    // registered in this layout must be explicitly hidden with `href: null`,
    // which is how `new`, `search` and `business` already live here.
    const visible = Array.from(
      tabs.matchAll(/<Tabs\.Screen\s+name="([^"]+)"\s*\/>/g),
    ).map((m) => m[1])
    expect(visible).toEqual(['index', 'reels', 'bookings', 'messages', 'me'])
    // Anything else registered here must be explicitly hidden, which is how
    // `new`, `search` and `business` already live in this file.
    const declared = Array.from(tabs.matchAll(/<Tabs\.Screen\s+name="([^"]+)"/g)).map(
      (m) => m[1],
    )
    // Counted from the OPTIONS, not from every mention of the phrase: the file
    // also explains in a comment why `business` is hidden, and a guard that
    // counts prose is a guard that a comment can break.
    const hidden = Array.from(
      tabs.matchAll(/<Tabs\.Screen\s+name="[^"]+"\s+options=\{\{\s*href:\s*null/g),
    ).length
    expect(declared.length - hidden).toBe(5)
  })

  it('and Community is not one of them', () => {
    expect(tabs).not.toContain('name="community"')
  })

  it('Community is reachable from Discover', () => {
    const discover = read('app/(tabs)/index.tsx')
    expect(discover).toContain('DiscoverCommunity')
    const mod = read('components/DiscoverCommunity.tsx')
    expect(mod).toContain("'/community'")
  })

  it('and from Business, under GROW, where provider work lives', () => {
    const business = read('app/(tabs)/business/_layout.tsx')
    expect(business).toContain("label: 'GROW'")
    expect(business).toContain('/(tabs)/business/community')
    expect(existsSync(join(ROOT, 'app/(tabs)/business/community.tsx'))).toBe(true)
  })

  it('the dead "coming soon" screen for a live surface is gone', () => {
    // It advertised Community as unreleased, was referenced by nothing, and was
    // still deep-linkable — so a shared link told a user the live hub did not
    // exist yet.
    expect(existsSync(join(ROOT, 'app/preview/community.tsx'))).toBe(false)
    const files = walk(join(ROOT, 'app')).concat(walk(join(ROOT, 'components')))
    for (const f of files) {
      expect(readFileSync(f, 'utf8')).not.toContain('preview/community')
    }
  })
})

describe('Community does not rank the marketplace', () => {
  it('no discovery or provider-search module imports the community layer', () => {
    for (const f of ['lib/discovery.ts', 'hooks/useProviders.ts']) {
      const src = read(f)
      expect(src).not.toContain('lib/community')
      expect(src).not.toContain('community_post')
    }
  })

  it('the Discover module only ADDS a row — it reorders nothing', () => {
    const mod = read('components/DiscoverCommunity.tsx')
    // It must not touch the provider list, the lanes, or any sort.
    expect(mod).not.toContain('DiscoveryLanes')
    expect(mod).not.toContain('useProviders')
    expect(mod).not.toMatch(/\.sort\(/)
  })

  it('and the community feed itself is ordered by time, never by engagement', () => {
    const lib = read('lib/community.ts')
    const orders = Array.from(lib.matchAll(/\.order\('([^']+)'/g)).map((m) => m[1])
    expect(orders.length).toBeGreaterThan(0)
    for (const col of orders) {
      expect(['created_at', 'completed_at']).toContain(col)
    }
    expect(lib).not.toMatch(/\.order\('like_count'/)
    expect(lib).not.toMatch(/\.order\('reply_count'/)
  })
})

describe('a client cannot post generic social content', () => {
  const lib = read('lib/community.ts')

  it('the client intents are exactly the four approved ones', () => {
    const block = lib.slice(lib.indexOf('export const CLIENT_INTENTS'), lib.indexOf('export const PROVIDER_INTENTS'))
    const keys = Array.from(block.matchAll(/key:\s*'([a-z_]+)'/g)).map((m) => m[1])
    expect(keys.sort()).toEqual(['looking_for', 'need_advice', 'shoutout', 'who_does_this'])
  })

  it('and the provider ones are exactly the three approved ones', () => {
    const block = lib.slice(lib.indexOf('export const PROVIDER_INTENTS'))
    const keys = Array.from(
      block.slice(0, block.indexOf('const INTENT_BY_KEY')).matchAll(/key:\s*'([a-z_]+)'/g),
    ).map((m) => m[1])
    expect(keys.sort()).toEqual(['announcement', 'open_today', 'update'])
  })

  it('the composer has no blank-canvas mode', () => {
    const composer = read('app/community/compose.tsx')
    // Every post carries an intent chosen from the list; there is no path that
    // submits without one, and no "what's on your mind" prompt anywhere.
    expect(composer).toContain('intent,')
    expect(composer.toLowerCase()).not.toContain("what's on your mind")
    expect(composer.toLowerCase()).not.toContain('whats on your mind')
  })

  it('and the intent decides the actor, so the two cannot disagree', () => {
    expect(lib).toContain('isClientIntent(post.intent)')
  })
})

describe('a shoutout is not a review', () => {
  it('nothing in the community layer writes a rating or a review', () => {
    const lib = read('lib/community.ts')
    expect(lib).not.toContain('provider_reviews')
    expect(lib).not.toContain('client_reviews')
    expect(lib).not.toContain('average_rating')
    expect(lib).not.toContain('rating_client_count')
    expect(lib).not.toContain('recompute_provider_rating')
  })

  it('and the community screens say so where a shoutout is written', () => {
    const composer = read('app/community/compose.tsx')
    expect(composer).toContain('not a review')
  })

  it('the reputation layer does not read community', () => {
    const reviews = read('lib/reviews.ts')
    expect(reviews).not.toContain('community')
  })
})

describe('Open Today rides on availability and cannot outlive the day', () => {
  it('the client never invents the expiry', () => {
    const lib = read('lib/community.ts')
    // Reading `expires_at` back is fine and necessary — the badge needs it. What
    // must never happen is SENDING one: the time bound is the server's, derived
    // from the provider's own timezone, and a client-supplied value would be an
    // Open Today note that decides for itself when it ends.
    const insertBody = lib.slice(
      lib.indexOf("from('community_posts').insert("),
      lib.indexOf('if (error) return { ok: false, message: communityWriteError(error) }'),
    )
    expect(insertBody.length).toBeGreaterThan(0)
    expect(insertBody).not.toContain('expires_at')
    // Nor the author's business: the server rewrites provider_id to the caller's
    // own approved provider, so there is no id worth guessing.
    expect(insertBody).not.toMatch(/(^|[^_])provider_id:/)
  })

  it('and the provider surface refuses to offer it when it could only fail', () => {
    const biz = read('app/(tabs)/business/community.tsx')
    expect(biz).toContain('providers_open_today')
    expect(biz).toContain('availability')
  })
})

describe('moderation is an operator action, and never a delete', () => {
  const lib = read('lib/operator.ts')

  it('the client layer can hide and restore, and cannot delete', () => {
    expect(lib).toContain('operator_set_community_visibility')
    // The whole design: hiding preserves the row, the report, the case and the
    // history. A delete path here would make every moderation decision
    // unreviewable, so there must not be one.
    expect(lib).not.toMatch(/from\('community_posts'\)[\s\S]{0,120}\.delete\(/)
    expect(lib).not.toMatch(/from\('community_replies'\)[\s\S]{0,120}\.delete\(/)
    expect(lib).not.toContain('community_moderation_actions')
  })

  it('and it does not bundle other decisions into the same click', () => {
    const fn = lib.slice(
      lib.indexOf('export async function setCommunityVisibility'),
      lib.indexOf('export async function setProviderEligibility'),
    )
    expect(fn.length).toBeGreaterThan(0)
    // Hiding content must not also resolve the case, restrict the provider or
    // touch a rating. Those are separate, separately audited actions.
    expect(fn).not.toContain('operator_update_case')
    expect(fn).not.toContain('operator_set_provider_eligibility')
    expect(fn).not.toContain('rating')
  })

  it('the operator screen tells the three states apart', () => {
    const screen = read('app/operator/[id].tsx')
    expect(screen).toContain('communityContentForCase')
    expect(screen).toContain('Hidden by operator')
    // "Visible" and "restored after being hidden" share a boolean and are
    // different situations; the screen must not collapse them.
    expect(screen).toContain('Restored')
    expect(screen).toContain('history')
  })

  it('and offers restore for hidden content rather than only hide', () => {
    const screen = read('app/operator/[id].tsx')
    expect(screen).toContain('setVisibility(false)')
    expect(screen).toContain('setVisibility(true)')
  })

  it('no client-facing module can change visibility', () => {
    for (const f of [
      'lib/community.ts',
      'app/community/index.tsx',
      'app/community/[id].tsx',
      'app/(tabs)/business/community.tsx',
      'components/DiscoverCommunity.tsx',
    ]) {
      const src = read(f)
      expect(src).not.toContain('operator_set_community_visibility')
      // `is_active` may be READ (an author is told their own post is hidden);
      // it must never be sent.
      expect(src).not.toMatch(/is_active:\s/)
    }
  })

  it('a report names the content structurally, not in prose', () => {
    const hub = read('app/community/index.tsx')
    const thread = read('app/community/[id].tsx')
    expect(hub).toContain("contentKind: 'community_post'")
    expect(thread).toContain("contentKind: 'community_reply'")
    // The id used to travel inside the notes. An operator now resolves a column.
    expect(hub).not.toMatch(/notes:\s*`community post/)
  })

  it('and a reply can be reported, because a reply can be hidden', () => {
    const thread = read('app/community/[id].tsx')
    expect(thread).toContain('ReportSheet')
    expect(thread).toContain('reportReply')
  })

  it('support copy names no timeframe, and says what it cannot do', () => {
    const ops = read('docs/operations/COMMUNITY_OPERATIONS.md').toLowerCase()
    // TIMEFRAMES are checked as absent strings because there is no legitimate
    // reason to write one here, in a promise OR a prohibition — the rule is that
    // the product states no response time at all.
    for (const timeframe of [
      'within 24 hours',
      'within 48 hours',
      'within 2 hours',
      'business day',
      'response time of',
    ]) {
      expect(ops).not.toContain(timeframe)
    }
    // PROMISES are checked POSITIVELY instead. A first version of this test
    // searched for 'will be removed' and failed on the sentence forbidding
    // support from saying it — a guard that cannot tell a promise from a
    // prohibition against that promise flags the document for being careful.
    expect(ops).toContain('no sla')
    expect(ops).toContain('not a delete')
    expect(ops).toContain('restore')
  })
})

describe('a shoutout indicator states a booking, not a verdict', () => {
  it('the badge is shown only from the server-verified flag', () => {
    for (const f of ['app/community/index.tsx', 'components/ProviderShoutouts.tsx']) {
      const src = read(f)
      expect(src).toContain('bookingBacked')
      expect(src).toContain('Booked on The Book')
    }
  })

  it('and the shoutout section still says it is not a review', () => {
    const src = read('components/ProviderShoutouts.tsx')
    expect(src).toContain('not reviews')
    // The word "rating" appears in the copy, saying these do NOT affect it. What
    // must be absent is a rating FIELD — reading or writing one is what would
    // make a recommendation into reputation.
    expect(src).not.toMatch(/average_rating|rating_client_count|\brating:/)
    expect(src).not.toContain('provider_reviews')
  })
})

describe('Barter is still there, and still provider-to-provider', () => {
  it('the trade board has its own route', () => {
    expect(existsSync(join(ROOT, 'app/community/barter.tsx'))).toBe(true)
  })

  it('and every barter route still exists', () => {
    for (const f of [
      'app/community/barter-compose.tsx',
      'app/community/barter-interests.tsx',
      'app/community/trade-activity.tsx',
      'app/community/negotiation/[id].tsx',
    ]) {
      expect(existsSync(join(ROOT, f))).toBe(true)
    }
  })

  it('the trade board is still gated to providers', () => {
    const board = read('app/community/barter.tsx')
    expect(board).toContain('isProvider')
  })

  it('and Community itself is not', () => {
    const hub = read('app/community/index.tsx')
    // `isProvider` may still be READ — a provider sees their own post options —
    // but there must be no gate that refuses the surface to a client.
    expect(hub).not.toContain('This space is for providers')
  })
})
