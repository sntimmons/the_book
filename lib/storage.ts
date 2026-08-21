// Supabase Storage helpers for media uploads.
//
// REQUIRED BUCKET (must exist in Supabase Storage dashboard):
//   Name: provider-media
//   Public: true (so profile photos load in the feed and on profiles)
//   File size limit: 50MB
//   Allowed MIME types: image/*, video/*
//
// As of this commit the project at kxregomuawwcqvisuhtr has NO buckets
// configured. Create the bucket above before any provider goes live, or
// every upload here will fail with "Bucket not found" and uploadMedia
// will return { url: null, error }.
import * as Sentry from '@sentry/react-native'
import { supabase } from './supabase'

export type UploadResult = {
  url: string | null
  error: string | null
}

const ALLOWED_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'mp4', 'mov']

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

export async function uploadMultiple(
  uris: string[],
  userId: string,
  folder: 'portfolio' | 'reels',
  bucketName: string = 'provider-media',
  onProgress?: (completed: number, total: number) => void,
): Promise<string[]> {
  const results: string[] = []

  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i]

    if (uri.startsWith('http')) {
      results.push(uri)
      onProgress?.(i + 1, uris.length)
      continue
    }

    const result = await uploadMedia(uri, userId, folder, bucketName)
    if (result.url) {
      results.push(result.url)
    }
    // Failed uploads are dropped silently so the provider keeps whatever
    // did upload successfully. The error is logged inside uploadMedia.

    onProgress?.(i + 1, uris.length)
  }

  return results
}
