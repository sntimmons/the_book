// Supabase Storage helpers for media uploads.
//
// Buckets in use (confirmed configured in Supabase):
//   provider-media  — public  (profile + banner + client avatars)
//   posts-media     — public  (portfolio, posts, reels)
//   contract-pdfs   — private (uploaded contract PDFs; viewed via signed URLs)
//   contract-signatures — private (signature images; not written yet)
// Public buckets serve via getPublicUrl; private buckets via createSignedUrl.
import { File } from 'expo-file-system'
import * as Sentry from '@sentry/react-native'
import { supabase } from './supabase'

export type UploadResult = {
  url: string | null
  /**
   * A still generated from the uploaded VIDEO, already in storage. Null for an
   * image (which is its own still) and for a remote passthrough.
   *
   * ── THE INVARIANT THIS EXISTS FOR ─────────────────────────────────────
   *
   * **Every product-created video post must have a usable still for surfaces
   * that cannot play video.** Discover's "See the work", provider search and the
   * business posts grid all draw `posts.thumbnail_url`; only the Reels tab plays
   * `media_url`. Before this, nothing wrote the column, so a provider's reel
   * played in Reels and was blank or absent everywhere else — one upload, three
   * broken surfaces, and no error anywhere.
   *
   * It is returned from the shared boundary rather than produced per caller so
   * the two video-creating paths cannot drift apart on it.
   */
  thumbnailUrl: string | null
  error: string | null
}

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'mp4', 'mov', 'm4v']

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic']
const VIDEO_EXT = ['mp4', 'mov', 'm4v']

// Extension-based upload validation. True MIME validation would require reading
// the file's magic bytes, which is expensive/awkward on mobile; extension
// checking is the practical guard here. Remote (http) URIs are already uploaded
// and skip this check in uploadMedia.
export function validateUpload(uri: string): { valid: boolean; error?: string } {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  if (IMAGE_EXT.includes(ext) || VIDEO_EXT.includes(ext)) {
    return { valid: true }
  }
  return {
    valid: false,
    error: 'File type not supported. Please upload a JPG, PNG, or MP4 file.',
  }
}

function generatePath(userId: string, folder: string, extension: string): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substring(7)
  return `${userId}/${folder}/${timestamp}_${random}.${extension}`
}

function getExtension(uri: string): string {
  const parts = uri.split('.')
  const ext = parts[parts.length - 1].toLowerCase().split('?')[0]
  return ALLOWED_EXT.includes(ext) ? ext : 'jpg'
}

// EVERY VALUE OF `UploadResult.error` IS SHOWN TO A PROVIDER, so every value is
// written for one. Raw storage messages used to be returned here and a caller now
// renders this field verbatim, which would have put lines like `new row violates
// row-level security policy for table "objects"` in front of someone trying to
// post a photo. The diagnostic is not lost — both paths capture the real error to
// Sentry first.
const UPLOAD_FAILED = 'That file could not be uploaded. Please try again.'

export async function uploadMedia(
  uri: string,
  userId: string,
  folder: 'profile' | 'banner' | 'portfolio' | 'reels',
  bucketName: string = 'provider-media',
): Promise<UploadResult> {
  try {
    if (!uri) {
      return { url: null, thumbnailUrl: null, error: 'Invalid URI' }
    }

    // Already remote: pass through. Lets us re-run uploads idempotently
    // when a provider edits and re-saves.
    if (uri.startsWith('http')) {
      // Already uploaded on a previous save. There is no local file to derive a
      // still from, so none is CLAIMED — `null` here means "unknown", not "this
      // media has no still".
      //
      // A CALLER MUST NOT WRITE THIS NULL ONTO A VIDEO ROW. Every video-creating
      // path today INSERTs, so writing it would put back exactly the NULL
      // `thumbnail_url` this boundary exists to prevent; a future path that
      // UPDATEs must leave the column alone rather than overwrite it. The one
      // caller that can receive this for a video (app/onboarding/provider/golive.tsx)
      // drops such an item instead of inserting it.
      return { url: uri, thumbnailUrl: null, error: null }
    }

    if (!uri.startsWith('file://')) {
      return { url: null, thumbnailUrl: null, error: 'Invalid URI' }
    }

    // Reject unsupported file types up front. Returned (not thrown) so the
    // caller gets a clean error and it is not captured to Sentry as an
    // exception — a bad file type is expected user input, not a system fault.
    const validation = validateUpload(uri)
    if (!validation.valid) {
      return { url: null, thumbnailUrl: null, error: validation.error ?? 'File type not supported.' }
    }

    const ext = getExtension(uri)
    const path = generatePath(userId, folder, ext)

    // Read the file straight off the native filesystem via expo-file-system's
    // File API. fetch(uri).blob() is unreliable for file:// URIs on React
    // Native — it can return a 0-byte blob, which previously uploaded an empty
    // file that looked successful. File reads the real bytes, and File.exists /
    // bytes.length let us refuse a missing or empty file before touching storage.
    const file = new File(uri)
    if (!file.exists) {
      return {
        url: null,
        thumbnailUrl: null,
        error: 'The selected file could not be found on your device.',
      }
    }

    const bytes = await file.bytes()
    if (bytes.length === 0) {
      // ABORT: never write an empty file and never return a URL for one.
      Sentry.captureException(
        new Error(`Upload aborted: 0-byte file (bucket=${bucketName}, path=${path})`),
      )
      return {
        url: null,
        thumbnailUrl: null,
        error: 'That file appears to be empty. Please pick a different photo or video and try again.',
      }
    }

    const contentType =
      file.type || (VIDEO_EXT.includes(ext) ? 'video/mp4' : 'image/jpeg')

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(path, bytes, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.log('Storage upload error:', error)
      Sentry.captureException(error, { extra: { bucketName, path, byteLength: bytes.length } })
      return { url: null, thumbnailUrl: null, error: UPLOAD_FAILED }
    }

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path)

    // ── THE VIDEO'S STILL, OR NO VIDEO AT ALL ────────────────────────────
    //
    // A video without a still is publishable but half-broken: it plays in Reels
    // and is blank or missing in Discover, search and the business grid. So the
    // still is part of the upload rather than a nice-to-have after it, and a
    // failure here fails the whole upload. The already-stored video object is
    // removed so storage does not accumulate media no row will ever point at.
    //
    // We do NOT fall back to an unrelated image. A still that is not a frame of
    // this video is a picture of somebody else's work on somebody's post.
    if (VIDEO_EXT.includes(ext)) {
      const still = await uploadVideoStill(uri, userId, folder, bucketName)
      if (!still.url) {
        // The rollback is CHECKED, not assumed. Storage RLS filters a refused
        // remove rather than raising, and an empty removed-set is how it says
        // it removed nothing — verified against the Storage API, where removing
        // a real object returns one entry and removing nothing returns zero. An
        // unverified rollback would let us tell a provider nothing was stored
        // while their video sat in a public bucket that no row points at.
        const { data: removed, error: removeError } = await supabase.storage
          .from(bucketName)
          .remove([data.path])
        if (removeError || ((removed as { name: string }[] | null) ?? []).length === 0) {
          Sentry.captureException(removeError ?? new Error('Upload rollback removed nothing'), {
            extra: { bucket: bucketName, path: data.path },
          })
        }
        return { url: null, thumbnailUrl: null, error: still.error }
      }
      return { url: urlData.publicUrl, thumbnailUrl: still.url, error: null }
    }

    return { url: urlData.publicUrl, thumbnailUrl: null, error: null }
  } catch (err: any) {
    console.log('Upload exception:', err)
    Sentry.captureException(err)
    return { url: null, thumbnailUrl: null, error: UPLOAD_FAILED }
  }
}

/** Where in the video to sample. Early enough to be quick, late enough to have
 *  left a black first frame behind. */
const STILL_AT_MS = 1000

/**
 * Generate a still from a local video and upload it beside the video.
 *
 * `expo-video-thumbnails` is imported LAZILY and defensively. It is a native
 * module, so a JS bundle running on a client built before it was added has no
 * implementation behind it — a top-level import would throw at module load and
 * take down every screen that touches storage. Required here instead, a client
 * without the native module fails THIS UPLOAD with a clear message, which is the
 * failure we want.
 */
async function uploadVideoStill(
  videoUri: string,
  userId: string,
  folder: string,
  bucketName: string,
): Promise<{ url: string | null; error: string | null }> {
  const GENERIC =
    'We could not create a preview image for that video. Please try again, or pick a different clip.'
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const VideoThumbnails = require('expo-video-thumbnails')
    if (typeof VideoThumbnails?.getThumbnailAsync !== 'function') {
      Sentry.captureException(new Error('expo-video-thumbnails unavailable in this build'))
      return { url: null, error: GENERIC }
    }

    const { uri } = await VideoThumbnails.getThumbnailAsync(videoUri, {
      time: STILL_AT_MS,
      quality: 0.7,
    })

    const stillFile = new File(uri)
    if (!stillFile.exists) return { url: null, error: GENERIC }
    const bytes = await stillFile.bytes()
    if (bytes.length === 0) return { url: null, error: GENERIC }

    const path = generatePath(userId, folder, 'jpg')
    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: false })
    if (error) {
      Sentry.captureException(error, { extra: { bucketName, path, kind: 'video-still' } })
      return { url: null, error: GENERIC }
    }

    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(data.path)
    return { url: urlData.publicUrl, error: null }
  } catch (err: any) {
    // Sentry only: this path is reached on a device, where a console line helps
    // nobody, and the surrounding branches already carry their own logging.
    Sentry.captureException(err)
    return { url: null, error: GENERIC }
  }
}

/** One uploaded item: the media, and its still when the media was a video. */
export interface UploadedMedia {
  url: string
  thumbnailUrl: string | null
}

export interface UploadMultipleResult {
  /**
   * Carries the thumbnail alongside the url rather than a bare string, so a
   * caller inserting video rows cannot lose the still between here and the
   * insert — which is exactly how `posts.thumbnail_url` came to be unset.
   */
  successful: UploadedMedia[]
  failed: { uri: string; error: string }[]
}

export async function uploadMultiple(
  uris: string[],
  userId: string,
  folder: 'portfolio' | 'reels',
  bucketName: string = 'provider-media',
  onProgress?: (completed: number, total: number) => void,
): Promise<UploadMultipleResult> {
  const successful: UploadedMedia[] = []
  const failed: { uri: string; error: string }[] = []

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i]

    if (uri.startsWith('http')) {
      successful.push({ url: uri, thumbnailUrl: null })
      onProgress?.(i + 1, uris.length)
      continue
    }

    const result = await uploadMedia(uri, userId, folder, bucketName)
    if (result.url) {
      successful.push({ url: result.url, thumbnailUrl: result.thumbnailUrl })
    } else {
      // Surface the failure to the caller instead of silently dropping it, so
      // the provider can be told which files did not upload.
      failed.push({ uri, error: result.error ?? 'Upload failed' })
    }

    onProgress?.(i + 1, uris.length)
  }

  return { successful, failed }
}
