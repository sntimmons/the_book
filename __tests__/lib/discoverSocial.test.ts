import {
  FOLLOWED_ACTIVITY_DAYS,
  FOLLOWED_ACTIVITY_LIMIT,
  fetchDiscoverReels,
  fetchFollowedActivity,
  isRecentActivity,
} from '@/lib/discoverSocial'
import { supabase } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({ supabase: { from: jest.fn() } }))
const from = supabase.from as unknown as jest.Mock

const DAY = 24 * 60 * 60 * 1000
const NOW = Date.UTC(2026, 8, 14)

/** A chainable PostgREST double that resolves to `result` on await. */
function q(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'order', 'limit']) {
    chain[m] = jest.fn(() => chain)
  }
  ;(chain as { then: unknown }).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res)
  return chain
}
const post = (over: Record<string, unknown> = {}) => ({
  id: 'post-1',
  provider_id: 'prov-1',
  media_url: 'https://x.test/a.jpg',
  media_type: 'image',
  thumbnail_url: null,
  created_at: new Date(NOW - DAY).toISOString(),
  ...over,
})

beforeEach(() => from.mockReset())

describe('isRecentActivity', () => {
  it('accepts activity inside the window and rejects activity outside it', () => {
    expect(isRecentActivity(new Date(NOW - DAY).toISOString(), NOW)).toBe(true)
    expect(isRecentActivity(new Date(NOW - (FOLLOWED_ACTIVITY_DAYS + 1) * DAY).toISOString(), NOW)).toBe(false)
  })

  it('rejects a missing, unparseable or future timestamp rather than guessing', () => {
    expect(isRecentActivity(null, NOW)).toBe(false)
    expect(isRecentActivity('not a date', NOW)).toBe(false)
    expect(isRecentActivity(new Date(NOW + DAY).toISOString(), NOW)).toBe(false)
  })
})

describe('fetchFollowedActivity — only providers the viewer follows', () => {
  it('returns nothing for a signed-out viewer, and asks the database nothing', async () => {
    await expect(fetchFollowedActivity(null)).resolves.toEqual([])
    await expect(fetchFollowedActivity(undefined)).resolves.toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('returns nothing when the viewer follows nobody — and does NOT fall back', async () => {
    from.mockImplementationOnce(() => q({ data: [], error: null }))
    await expect(fetchFollowedActivity('u1', NOW)).resolves.toEqual([])
    // One query only: no second "popular providers" read exists to fall back to.
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('provider_follows')
  })

  it('bounds the post query BY THE FOLLOW SET, so a stranger has no path in', async () => {
    const follows = q({ data: [{ provider_id: 'prov-1' }], error: null })
    const posts = q({ data: [post()], error: null })
    const providers = q({ data: [{ id: 'prov-1', display_name: 'Jordan', business_name: null }], error: null })
    from.mockImplementationOnce(() => follows)
        .mockImplementationOnce(() => posts)
        .mockImplementationOnce(() => providers)

    const items = await fetchFollowedActivity('u1', NOW)
    expect(items).toHaveLength(1)
    expect(items[0].providerId).toBe('prov-1')
    // The `.in()` filter is the guarantee: it carries exactly the followed ids.
    expect(posts.in).toHaveBeenCalledWith('provider_id', ['prov-1'])
    expect(from.mock.calls.map((c) => c[0])).toEqual(['provider_follows', 'posts_visible', 'providers'])
  })

  it('reads posts_visible, not posts — blocks and departed providers stay filtered', async () => {
    from.mockImplementationOnce(() => q({ data: [{ provider_id: 'p' }], error: null }))
        .mockImplementationOnce(() => q({ data: [], error: null }))
    await fetchFollowedActivity('u1', NOW)
    expect(from).toHaveBeenCalledWith('posts_visible')
    expect(from).not.toHaveBeenCalledWith('posts')
  })

  it('drops activity older than the window rather than padding the row', async () => {
    from.mockImplementationOnce(() => q({ data: [{ provider_id: 'prov-1' }], error: null }))
        .mockImplementationOnce(() =>
          q({ data: [post({ created_at: new Date(NOW - 90 * DAY).toISOString() })], error: null }),
        )
    await expect(fetchFollowedActivity('u1', NOW)).resolves.toEqual([])
  })

  it('uses a video’s thumbnail rather than autoplaying a row of players', async () => {
    from.mockImplementationOnce(() => q({ data: [{ provider_id: 'prov-1' }], error: null }))
        .mockImplementationOnce(() =>
          q({ data: [post({ media_type: 'video', thumbnail_url: 'https://x.test/t.jpg' })], error: null }),
        )
        .mockImplementationOnce(() =>
          q({ data: [{ id: 'prov-1', display_name: 'Jordan', business_name: null }], error: null }),
        )
    const items = await fetchFollowedActivity('u1', NOW)
    expect(items[0]).toMatchObject({ media: 'https://x.test/t.jpg', isVideo: true })
  })

  it('omits a card it cannot attribute, because it could not state its source', async () => {
    from.mockImplementationOnce(() => q({ data: [{ provider_id: 'prov-1' }], error: null }))
        .mockImplementationOnce(() => q({ data: [post()], error: null }))
        .mockImplementationOnce(() => q({ data: [], error: null })) // no provider name
    await expect(fetchFollowedActivity('u1', NOW)).resolves.toEqual([])
  })

  it('fails closed — a query error hides the row rather than showing strangers', async () => {
    from.mockImplementationOnce(() => q({ data: null, error: { message: 'down' } }))
    await expect(fetchFollowedActivity('u1', NOW)).resolves.toEqual([])
  })

  it('caps the row', async () => {
    const many = Array.from({ length: 40 }, (_, i) => post({ id: `p${i}` }))
    from.mockImplementationOnce(() => q({ data: [{ provider_id: 'prov-1' }], error: null }))
        .mockImplementationOnce(() => q({ data: many, error: null }))
        .mockImplementationOnce(() =>
          q({ data: [{ id: 'prov-1', display_name: 'Jordan', business_name: null }], error: null }),
        )
    const items = await fetchFollowedActivity('u1', NOW)
    expect(items).toHaveLength(FOLLOWED_ACTIVITY_LIMIT)
  })
})

describe('fetchDiscoverReels — real content, recency only', () => {
  it('reads real video posts from posts_visible, newest first', async () => {
    const chain = q({ data: [post({ media_type: 'video', thumbnail_url: 'https://x.test/t.jpg' })], error: null })
    from.mockImplementationOnce(() => chain)
    from.mockImplementationOnce(() =>
      q({ data: [{ id: 'prov-1', display_name: 'Jordan', business_name: 'Southline Grooming' }], error: null }),
    )
    const reels = await fetchDiscoverReels()
    expect(from).toHaveBeenCalledWith('posts_visible')
    expect(chain.eq).toHaveBeenCalledWith('media_type', 'video')
    expect(chain.eq).toHaveBeenCalledWith('is_demo', false)
    expect(chain.order).toHaveBeenCalledWith('created_at', { ascending: false })
    // Attribution rides along; the business name wins when there is one.
    expect(reels).toEqual([
      { postId: 'post-1', media: 'https://x.test/t.jpg', providerName: 'Southline Grooming' },
    ])
  })

  it('orders on nothing but recency — no engagement signal is read', async () => {
    const chain = q({ data: [], error: null })
    from.mockImplementationOnce(() => chain)
    await fetchDiscoverReels()
    const ordered = chain.order as jest.Mock
    for (const call of ordered.mock.calls) {
      expect(call[0]).toBe('created_at')
    }
    const selected = (chain.select as jest.Mock).mock.calls[0][0] as string
    expect(selected).not.toMatch(/like_count|comment_count|view|follower|rating|is_featured|is_trending/)
  })

  it('names the provider AFTER the set is decided, never as a filter', async () => {
    // A reel whose provider name cannot be read still appears — the tile is the
    // work, the name is a caption on it. Attribution must never remove content.
    const chain = q({ data: [post({ media_type: 'video', thumbnail_url: 'https://x.test/t.jpg' })], error: null })
    from.mockImplementationOnce(() => chain).mockImplementationOnce(() => q({ data: [], error: null }))
    const reels = await fetchDiscoverReels()
    expect(reels).toHaveLength(1)
    expect(reels[0].providerName).toBe('')
  })

  it('drops a reel with no still rather than showing a placeholder tile', async () => {
    from.mockImplementationOnce(() =>
      q({ data: [post({ media_type: 'video', thumbnail_url: null, media_url: null })], error: null }),
    )
    await expect(fetchDiscoverReels()).resolves.toEqual([])
  })

  it('fails closed', async () => {
    from.mockImplementationOnce(() => q({ data: null, error: { message: 'down' } }))
    await expect(fetchDiscoverReels()).resolves.toEqual([])
  })
})
