import { deleteProviderMedia, storagePathFromPublicUrl } from '@/lib/providerMedia'
import { supabase } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({
  supabase: { from: jest.fn(), storage: { from: jest.fn() } },
}))

// Deleting provider-authored media (Correction 3, item L).
//
// The rule this module calls "the worst outcome this function has" is that a
// zero-row delete must never be reported as success. RLS FILTERS a refused delete
// rather than raising, so it returns `error === null` and no rows — and reporting
// that as done tells a provider their photo is gone while it is still on their
// public profile. That is the assertion this file exists for.

function deleteChain(result: unknown) {
  const c: any = {}
  c.delete = jest.fn(() => c)
  c.eq = jest.fn(() => c)
  c.select = jest.fn(() => Promise.resolve(result))
  return c
}

const URL = 'https://x.supabase.co/storage/v1/object/public/posts-media/user-1/portfolio/a.jpg'

beforeEach(() => {
  jest.clearAllMocks()
  ;(supabase.storage.from as jest.Mock).mockReturnValue({
    remove: jest.fn(() => Promise.resolve({ error: null })),
  })
})

describe('storagePathFromPublicUrl', () => {
  it('recovers the path inside the bucket', () => {
    expect(storagePathFromPublicUrl(URL, 'posts-media')).toBe('user-1/portfolio/a.jpg')
  })

  it('decodes an escaped path', () => {
    expect(
      storagePathFromPublicUrl(
        'https://x/storage/v1/object/public/posts-media/user%201/a%20b.jpg',
        'posts-media',
      ),
    ).toBe('user 1/a b.jpg')
  })

  it('drops a cache-busting query string', () => {
    expect(storagePathFromPublicUrl(`${URL}?t=123`, 'posts-media')).toBe('user-1/portfolio/a.jpg')
  })

  it('returns null rather than GUESSING when the shape is unfamiliar', () => {
    // A wrong path would ask storage to delete a file that is not the one being
    // removed. The owner-scoped policy would refuse it, so there is nothing to
    // gain by trying — and something to lose if it ever matched.
    expect(storagePathFromPublicUrl('https://cdn.example.com/a.jpg', 'posts-media')).toBeNull()
    expect(storagePathFromPublicUrl(URL, 'provider-media')).toBeNull()
    expect(storagePathFromPublicUrl('', 'posts-media')).toBeNull()
  })
})

describe('deleteProviderMedia', () => {
  it('deletes the row and then its file', async () => {
    ;(supabase.from as jest.Mock).mockReturnValue(deleteChain({ data: [{ id: 'p1' }], error: null }))
    const remove = jest.fn(() => Promise.resolve({ error: null }))
    ;(supabase.storage.from as jest.Mock).mockReturnValue({ remove })

    const r = await deleteProviderMedia('p1', URL)
    expect(r).toEqual({ ok: true, fileOrphaned: false, error: null })
    expect(remove).toHaveBeenCalledWith(['user-1/portfolio/a.jpg'])
  })

  it('REPORTS FAILURE when the delete affected zero rows', async () => {
    // The assertion this file exists for. No error, no rows — the policy filtered
    // it. Anything but `ok: false` here puts an empty tile on a provider's screen
    // for a photo still on their public profile.
    ;(supabase.from as jest.Mock).mockReturnValue(deleteChain({ data: [], error: null }))
    const remove = jest.fn()
    ;(supabase.storage.from as jest.Mock).mockReturnValue({ remove })

    const r = await deleteProviderMedia('p1', URL)
    expect(r.ok).toBe(false)
    // And it must NOT go on to delete the file for a row it did not remove.
    expect(remove).not.toHaveBeenCalled()
  })

  it('reports failure on a real error, and leaves the file alone', async () => {
    ;(supabase.from as jest.Mock).mockReturnValue(
      deleteChain({ data: null, error: { code: '42501' } }),
    )
    const remove = jest.fn()
    ;(supabase.storage.from as jest.Mock).mockReturnValue({ remove })

    const r = await deleteProviderMedia('p1', URL)
    expect(r.ok).toBe(false)
    expect(remove).not.toHaveBeenCalled()
  })

  it('still succeeds when the FILE delete fails, and says the file was orphaned', async () => {
    // Deliberate. From where the provider stands the photo is gone: it has left
    // their profile, the feed and Reels. An orphaned file costs storage and
    // nothing else — the reverse ordering would leave a broken card on a public
    // profile, which is the failure worth avoiding.
    ;(supabase.from as jest.Mock).mockReturnValue(deleteChain({ data: [{ id: 'p1' }], error: null }))
    ;(supabase.storage.from as jest.Mock).mockReturnValue({
      remove: jest.fn(() => Promise.resolve({ error: { message: 'nope' } })),
    })

    const r = await deleteProviderMedia('p1', URL)
    expect(r.ok).toBe(true)
    expect(r.fileOrphaned).toBe(true)
  })

  it('succeeds with the row gone when the URL yields no usable path', async () => {
    ;(supabase.from as jest.Mock).mockReturnValue(deleteChain({ data: [{ id: 'p1' }], error: null }))
    const remove = jest.fn()
    ;(supabase.storage.from as jest.Mock).mockReturnValue({ remove })

    const r = await deleteProviderMedia('p1', 'https://cdn.example.com/a.jpg')
    expect(r).toEqual({ ok: true, fileOrphaned: true, error: null })
    expect(remove).not.toHaveBeenCalled()
  })
})
