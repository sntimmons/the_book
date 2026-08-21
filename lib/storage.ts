// Supabase Storage helpers for media uploads.
//
// Buckets in use (confirmed configured in Supabase):
//   provider-media  — public  (profile + banner + client avatars)
//   posts-media     — public  (portfolio, posts, reels)
//   contract-pdfs   — private (uploaded contract PDFs; viewed via signed URLs)
//   contract-signatures — private (signature images; not written yet)
// Public buckets serve via getPublicUrl; private buckets via createSignedUrl.
import * as Sentry from '@sentry/react-native'
import { supabase } from './supabase'

export type UploadResult = {
  url: string | null
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

async function uriToBlob(uri: string): Promise<Blob> {
  // NOTE: React Native's fetch().blob() has historically returned 0-byte
  // blobs for file:// URIs on some Expo SDKs. If uploads succeed but the
  // stored file is empty, swap to an ArrayBuffer / FileSystem.readAsync
  // approach. SDK 54 should be fine, but flag it during the first
  // end-to-end test.
  const response = await fetch(uri)
  return await response.blob()
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

export async function uploadMedia(
  uri: string,
  userId: string,
  folder: 'profile' | 'banner' | 'portfolio' | 'reels',
  bucketName: string = 'provider-media',
): Promise<UploadResult> {
  try {
    if (!uri) {
      return { url: null, error: 'Invalid URI' }
    }

    // Already remote: pass through. Lets us re-run uploads idempotently
    // when a provider edits and re-saves.
    if (uri.startsWith('http')) {
      return { url: uri, error: null }
    }

    if (!uri.startsWith('file://')) {
      return { url: null, error: 'Invalid URI' }
    }

    // Reject unsupported file types up front. Returned (not thrown) so the
    // caller gets a clean error and it is not captured to Sentry as an
    // exception — a bad file type is expected user input, not a system fault.
    const validation = validateUpload(uri)
    if (!validation.valid) {
      return { url: null, error: validation.error ?? 'File type not supported.' }
    }

    const ext = getExtension(uri)
    const path = generatePath(userId, folder, ext)
    const blob = await uriToBlob(uri)

    // Diagnose the 0-byte-blob issue: fetch().blob() has returned empty blobs for
    // file:// URIs on some Expo SDKs, producing "successful" but empty uploads.
    if (blob.size === 0) {
      Sentry.captureException(
        new Error(`Upload produced a 0-byte blob (bucket=${bucketName}, path=${path})`),
      )
    }

    const contentType =
      blob.type ||
      (ext === 'mp4' || ext === 'mov' ? 'video/mp4' : 'image/jpeg')

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(path, blob, {
        contentType,
        upsert: false,
      })

    if (error) {
      console.log('Storage upload error:', error)
      Sentry.captureException(error, { extra: { bucketName, path, blobSize: blob.size } })
      return { url: null, error: error.message }
    }

    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(data.path)

    return { url: urlData.publicUrl, error: null }
  } catch (err: any) {
    console.log('Upload exception:', err)
    Sentry.captureException(err)
    return { url: null, error: err.message ?? 'Upload failed' }
  }
}

export interface UploadMultipleResult {
  successful: string[]
  failed: { uri: string; error: string }[]
}

export async function uploadMultiple(
  uris: string[],
  userId: string,
  folder: 'portfolio' | 'reels',
  bucketName: string = 'provider-media',
  onProgress?: (completed: number, total: number) => void,
): Promise<UploadMultipleResult> {
  const successful: string[] = []
  const failed: { uri: string; error: string }[] = []

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i]

    if (uri.startsWith('http')) {
      successful.push(uri)
      onProgress?.(i + 1, uris.length)
      continue
    }

    const result = await uploadMedia(uri, userId, folder, bucketName)
    if (result.url) {
      successful.push(result.url)
    } else {
      // Surface the failure to the caller instead of silently dropping it, so
      // the provider can be told which files did not upload.
      failed.push({ uri, error: result.error ?? 'Upload failed' })
    }

    onProgress?.(i + 1, uris.length)
  }

  return { successful, failed }
}
