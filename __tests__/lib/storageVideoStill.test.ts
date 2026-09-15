import { uploadMedia } from '@/lib/storage'
import { supabase } from '@/lib/supabase'

jest.mock('@/lib/supabase', () => ({
  supabase: { storage: { from: jest.fn() } },
}))
jest.mock('@sentry/react-native', () => ({ captureException: jest.fn() }))

const mockGetThumbnail = jest.fn()
jest.mock('expo-video-thumbnails', () => ({ getThumbnailAsync: (...a: unknown[]) => mockGetThumbnail(...a) }), {
  virtual: true,
})

const mockFile = jest.fn()
jest.mock('expo-file-system', () => ({
  File: class {
    constructor(uri: string) { return mockFile(uri) }
  },
}))

const storageFrom = supabase.storage.from as unknown as jest.Mock

/** A storage bucket double that records every upload it is asked to perform. */
function bucket() {
  const uploads: { path: string; contentType: string }[] = []
  const removed: string[][] = []
  const api = {
    uploads,
    removed,
    uploadShouldFail: false,
    upload: jest.fn(async (path: string, _bytes: unknown, opts: { contentType: string }) => {
      if (api.uploadShouldFail) return { data: null, error: { message: 'storage down' } }
      uploads.push({ path, contentType: opts.contentType })
      return { data: { path }, error: null }
    }),
    getPublicUrl: jest.fn((p: string) => ({ data: { publicUrl: `https://cdn.test/${p}` } })),
    remove: jest.fn(async (paths: string[]) => { removed.push(paths); return { data: null, error: null } }),
  }
  return api
}

const realFile = (bytes = 10) => ({ exists: true, type: '', bytes: async () => new Uint8Array(bytes) })

let b: ReturnType<typeof bucket>
beforeEach(() => {
  b = bucket()
  storageFrom.mockReturnValue(b)
  mockFile.mockReset().mockReturnValue(realFile())
  mockGetThumbnail.mockReset().mockResolvedValue({ uri: 'file:///cache/still.jpg', width: 1, height: 1 })
})

// THE INVARIANT: every product-created video post must have a usable still for
// surfaces that cannot play video. It is enforced HERE, at the shared boundary,
// so the two video-creating paths cannot drift apart on it.
describe('uploadMedia — video', () => {
  it('returns the video AND a still generated from that video', async () => {
    const res = await uploadMedia('file:///clip.mp4', 'user-1', 'reels', 'posts-media')
    expect(res.error).toBeNull()
    expect(res.url).toMatch(/^https:\/\/cdn\.test\/user-1\/reels\/.*\.mp4$/)
    expect(res.thumbnailUrl).toMatch(/^https:\/\/cdn\.test\/user-1\/reels\/.*\.jpg$/)
    // The still comes from THIS video, not from anywhere else.
    expect(mockGetThumbnail).toHaveBeenCalledWith('file:///clip.mp4', expect.any(Object))
  })

  it('stores the still as a real image beside the video', async () => {
    await uploadMedia('file:///clip.mp4', 'user-1', 'reels', 'posts-media')
    expect(b.uploads).toHaveLength(2)
    expect(b.uploads[0].contentType).toBe('video/mp4')
    expect(b.uploads[1].contentType).toBe('image/jpeg')
  })

  it('FAILS THE WHOLE UPLOAD when no still can be produced', async () => {
    // A video row with no still plays in Reels and is blank in Discover, search
    // and the business grid. Publishing one is the defect; refusing is the fix.
    mockGetThumbnail.mockRejectedValue(new Error('decoder unavailable'))
    const res = await uploadMedia('file:///clip.mp4', 'user-1', 'reels', 'posts-media')
    expect(res.url).toBeNull()
    expect(res.thumbnailUrl).toBeNull()
    expect(res.error).toMatch(/preview image/i)
  })

  it('removes the orphaned video so storage does not keep media no row points at', async () => {
    mockGetThumbnail.mockRejectedValue(new Error('decoder unavailable'))
    await uploadMedia('file:///clip.mp4', 'user-1', 'reels', 'posts-media')
    expect(b.removed).toHaveLength(1)
    expect(b.removed[0][0]).toMatch(/\.mp4$/)
  })

  it('fails rather than publishing when the still itself cannot be stored', async () => {
    mockFile.mockImplementation((uri: string) =>
      uri.endsWith('still.jpg') ? { exists: false, bytes: async () => new Uint8Array(0) } : realFile(),
    )
    const res = await uploadMedia('file:///clip.mp4', 'user-1', 'reels', 'posts-media')
    expect(res.url).toBeNull()
    expect(res.error).toMatch(/preview image/i)
  })

  it('never substitutes an unrelated image as the still', async () => {
    mockGetThumbnail.mockRejectedValue(new Error('nope'))
    const res = await uploadMedia('file:///clip.mp4', 'user-1', 'reels', 'posts-media')
    expect(res.thumbnailUrl).toBeNull()
    // Only the video was ever uploaded, and it was then removed.
    expect(b.uploads.every((u) => u.contentType === 'video/mp4')).toBe(true)
  })
})

describe('uploadMedia — image behaviour is unchanged', () => {
  it('uploads once and claims no thumbnail', async () => {
    const res = await uploadMedia('file:///shot.jpg', 'user-1', 'portfolio', 'posts-media')
    expect(res.error).toBeNull()
    expect(res.url).toMatch(/\.jpg$/)
    expect(res.thumbnailUrl).toBeNull()
    expect(b.uploads).toHaveLength(1)
    // An image is its own still; no video decoding is attempted for one.
    expect(mockGetThumbnail).not.toHaveBeenCalled()
  })

  it('still refuses an empty file', async () => {
    mockFile.mockReturnValue({ exists: true, type: '', bytes: async () => new Uint8Array(0) })
    const res = await uploadMedia('file:///shot.jpg', 'user-1', 'portfolio', 'posts-media')
    expect(res.url).toBeNull()
    expect(res.thumbnailUrl).toBeNull()
    expect(res.error).toMatch(/empty/i)
  })

  it('still refuses an unsupported type', async () => {
    const res = await uploadMedia('file:///doc.pdf', 'user-1', 'portfolio', 'posts-media')
    expect(res.url).toBeNull()
    expect(res.thumbnailUrl).toBeNull()
  })
})

describe('uploadMedia — remote passthrough', () => {
  it('claims no thumbnail for already-uploaded media, so a re-save cannot null one out', async () => {
    const res = await uploadMedia('https://cdn.test/existing.mp4', 'user-1', 'reels', 'posts-media')
    expect(res.url).toBe('https://cdn.test/existing.mp4')
    expect(res.thumbnailUrl).toBeNull()
    expect(mockGetThumbnail).not.toHaveBeenCalled()
    expect(b.uploads).toHaveLength(0)
  })
})
