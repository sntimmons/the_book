import * as Sentry from '@sentry/react-native'
import { supabase } from './supabase'

// Deleting provider-authored media (Correction 3, item L).
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────
//
// `public.posts` holds every piece of provider-authored media in the product —
// portfolio photos, posts, and the video content Reels plays — and until item L
// there was no way for a provider to remove any of it. No control on any screen,
// and no DELETE policy on the table behind it. A provider who uploaded the wrong
// photo, or a photo of a client who later asked for it to come down, could do
// nothing about it. `20261043000000` added the owner-scoped policy; this is the
// one place the client acts on it, so the ordering and the failure handling below
// exist once rather than in each of the two screens that offer it (the portfolio
// grid and the posts/reels grid; the Reels player has no delete).
//
// ── OWNERSHIP IS THE SERVER'S ANSWER, NOT THIS MODULE'S ───────────────────
//
// Nothing here checks who owns anything. `posts_delete_own` and the `posts-media`
// storage policies from `20261033000000` both answer that, and a client-side
// check would only decide whether to draw the button — it could never be the
// boundary. What this module owes the caller is an honest report of what actually
// happened, which is why a filtered delete is reported as a failure rather than
// as success (see below).

export interface MediaDeleteResult {
  ok: boolean
  /** True when the row is gone but its file was left behind. Not a user-facing failure. */
  fileOrphaned: boolean
  error: unknown
}

// The storage path inside a bucket, recovered from the public URL the row stores.
//
// Public URLs are `.../storage/v1/object/public/<bucket>/<path>`. Returns null
// rather than guessing when the shape is anything else — a wrong path would ask
// storage to delete a file that is not the one being removed, and the policy
// would (correctly) refuse it, so there is nothing to gain by trying.
export function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${bucket}/`
  const at = url.indexOf(marker)
  if (at === -1) return null
  const path = url.slice(at + marker.length).split('?')[0]
  return path.length > 0 ? decodeURIComponent(path) : null
}

// Delete one piece of media: the row first, then its file.
//
// THE ORDER IS DELIBERATE AND THE FAILURE IT ACCEPTS IS DELIBERATE. If the file
// delete fails after the row is gone, the file is orphaned in a bucket — it costs
// storage and nothing else, because nothing links to it, it is in no feed and it
// is on no profile. The reverse order can leave the row present with its image
// gone, which is a broken card on a PUBLIC profile. One of the two must be
// possible, and the orphan is the one to accept.
//
// A ZERO-ROW DELETE IS A FAILURE, NOT A SUCCESS. RLS expresses authorization as a
// USING clause, which FILTERS rows rather than raising — so a delete the policy
// refuses returns no error and no rows. Reporting that as success would tell a
// provider their photo was removed while it was still on their public profile,
// which is the worst outcome this function has. The count is checked explicitly.
export async function deleteProviderMedia(
  postId: string,
  mediaUrl: string,
  bucket: string = 'posts-media',
  thumbnailUrl: string | null = null,
): Promise<MediaDeleteResult> {
  const { data, error } = await supabase
    .from('posts')
    .delete()
    .eq('id', postId)
    .select('id')

  if (error) {
    Sentry.captureException(error)
    return { ok: false, fileOrphaned: false, error }
  }
  const deleted = ((data as { id: string }[] | null) ?? []).length
  if (deleted === 0) {
    // Filtered by the policy, or already gone. The client cannot tell those apart
    // and must not claim either — the caller's copy says the item could not be
    // removed and offers a re-read.
    return { ok: false, fileOrphaned: false, error: { code: 'no_rows' } }
  }

  // A VIDEO POST IS TWO OBJECTS, NOT ONE. The upload boundary stores the clip
  // and a still generated from it (lib/storage.ts), so a delete that removes
  // only `media_url` leaves a recognisable frame of that video publicly
  // readable in a public bucket. This function exists for the case named at the
  // top of this file — a photo of a client who later asked for it to come down
  // — and a frame of the same client from the same clip is that photo. Both
  // objects go, or the delete is reported as orphaned.
  const paths = [
    storagePathFromPublicUrl(mediaUrl, bucket),
    thumbnailUrl ? storagePathFromPublicUrl(thumbnailUrl, bucket) : null,
  ].filter((p): p is string => p !== null && p.length > 0)

  // Every URL we were given failed to parse into a path in this bucket — there
  // is nothing we can address, so the file is orphaned by definition.
  if (paths.length === 0) return { ok: true, fileOrphaned: true, error: null }

  // A URL that did not parse while another did still leaves something behind.
  const unaddressable = thumbnailUrl !== null && paths.length < 2

  const { data: removed, error: fileError } = await supabase.storage
    .from(bucket)
    .remove(paths)
  if (fileError) {
    // NOT surfaced to the provider. From where they stand the photo is gone: it
    // has left their profile, the feed and Reels. Captured so the orphan is
    // visible to us rather than silent.
    Sentry.captureException(fileError, { extra: { bucket, paths, postId } })
    return { ok: true, fileOrphaned: true, error: null }
  }

  // Same rule the row delete follows above: storage RLS FILTERS rather than
  // raising, so a refused remove returns no error and simply omits the object
  // from the removed set. Fewer objects back than asked for means something is
  // still there.
  const removedCount = ((removed as { name: string }[] | null) ?? []).length
  if (removedCount < paths.length) {
    Sentry.captureException(new Error('Storage remove did not remove every object'), {
      extra: { bucket, paths, removedCount, postId },
    })
    return { ok: true, fileOrphaned: true, error: null }
  }

  return { ok: true, fileOrphaned: unaddressable, error: null }
}

/**
 * What a provider is told before a delete they cannot undo.
 *
 * Says the two things that are actually true and stops. It does NOT promise that
 * copies elsewhere disappear — anyone who already saw the photo may have saved
 * it, and claiming otherwise to a provider taking down a client's picture would
 * be the most damaging kind of false reassurance this product could offer.
 */
export const DELETE_MEDIA_COPY = {
  title: 'Delete this?',
  body:
    'This removes it from your profile and from Third. It cannot be undone, and it does not'
    + ' remove copies anyone has already saved.',
  confirmLabel: 'Delete',
  cancelLabel: 'Keep it',
}

/** Shown when the delete did not take effect. Never says why — the client cannot know. */
export const DELETE_MEDIA_FAILED =
  'We could not remove that. It may have already been removed — pull to refresh and check.'
