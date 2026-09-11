import * as Sentry from '@sentry/react-native'
import { File } from 'expo-file-system'
import { supabase } from './supabase'

// Reference photos a client attaches to a booking request (requirement B).
//
// ── WHY THIS MODULE EXISTS ────────────────────────────────────────────────
//
// The picker shipped before any of this did: photos were held in a Zustand
// field, never uploaded, and discarded on reset. The provider — the one person
// they were for — never saw them. A control that collects files and drops them
// is worse than no control, because the client believes their provider has
// context they do not have.
//
// ── THE RULE THAT SHAPES EVERY FUNCTION HERE ──────────────────────────────
//
// **A request must never claim photos were attached when they were not.** So
// upload happens BEFORE the request is submitted, the caller is told exactly how
// many landed, and a partial failure is surfaced rather than rounded up. The
// booking is still sendable without them — losing a reference photo should not
// cost someone their appointment — but it is sent honestly.

export const BOOKING_PHOTO_BUCKET = 'booking-photos'
export const MAX_BOOKING_PHOTOS = 3

export interface BookingPhotoUploadResult {
  /** How many of the requested files are now attached to the booking. */
  attached: number
  /** How many were requested. `attached < requested` means some were lost. */
  requested: number
  failed: boolean
}

function extensionFor(uri: string): string {
  const m = uri.toLowerCase().match(/\.(jpe?g|png|webp|heic)(\?|$)/)
  return m ? m[1].replace('jpeg', 'jpg') : 'jpg'
}

function contentTypeFor(ext: string): string {
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'heic') return 'image/heic'
  return 'image/jpeg'
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = global.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

/**
 * Upload the client's reference photos and attach them to the booking.
 *
 * Idempotent per booking: existing rows are counted first and the total is
 * capped at three, so a retry after a partial failure tops up rather than
 * duplicating or being refused outright by the server-side limit.
 */
export async function attachBookingPhotos(
  bookingId: string,
  userId: string,
  localUris: string[],
): Promise<BookingPhotoUploadResult> {
  const requested = localUris.length
  if (requested === 0) return { attached: 0, requested: 0, failed: false }

  // What is already attached — a retry must not re-upload what landed last time.
  const { data: existing } = await supabase
    .from('booking_reference_photos')
    .select('id')
    .eq('booking_id', bookingId)
  const already = ((existing as { id: string }[] | null) ?? []).length
  if (already >= MAX_BOOKING_PHOTOS) {
    return { attached: already, requested, failed: false }
  }

  let attached = already
  let failed = false

  for (let i = already; i < localUris.length && attached < MAX_BOOKING_PHOTOS; i++) {
    const uri = localUris[i]
    try {
      const ext = extensionFor(uri)
      // Folder is the uploader's id: the storage INSERT policy is folder-scoped,
      // and the booking id in the name keeps objects from one client's separate
      // requests distinguishable without a second lookup.
      const path = `${userId}/${bookingId}/${Date.now()}_${i}.${ext}`
      const base64 = await new File(uri).base64()
      const { error: upErr } = await supabase.storage
        .from(BOOKING_PHOTO_BUCKET)
        .upload(path, base64ToArrayBuffer(base64), { contentType: contentTypeFor(ext) })
      if (upErr) {
        failed = true
        continue
      }
      const { error: rowErr } = await supabase.from('booking_reference_photos').insert({
        booking_id: bookingId,
        storage_path: path,
        uploaded_by_user_id: userId,
      })
      if (rowErr) {
        // The object landed but the record did not, so nothing can find or
        // authorize it — `can_read_booking_photo` returns false for an object
        // with no row, which makes the orphan harmless rather than exposed.
        failed = true
        continue
      }
      attached += 1
    } catch (err) {
      Sentry.captureException(err)
      failed = true
    }
  }

  return { attached, requested, failed }
}

/** Signed URLs for a booking's reference photos, for whichever party is reading. */
export async function bookingPhotoUrls(bookingId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('booking_reference_photos')
    .select('storage_path')
    .eq('booking_id', bookingId)
    .order('created_at', { ascending: true })
  if (error || !data) return []
  const paths = (data as { storage_path: string }[]).map((r) => r.storage_path)
  if (paths.length === 0) return []

  const signed = await Promise.all(
    paths.map(async (p) => {
      const { data: s } = await supabase.storage
        .from(BOOKING_PHOTO_BUCKET)
        .createSignedUrl(p, 60 * 60)
      return s?.signedUrl ?? null
    }),
  )
  return signed.filter((u): u is string => !!u)
}

/**
 * What the client is told when some photos did not attach.
 *
 * It does NOT offer a retry of the whole request — the request itself is fine
 * and may already be sent. It says what is true so the client can mention the
 * missing context in a message, which is the thing they would actually want.
 */
export const PHOTO_PARTIAL_COPY = {
  title: 'Some photos were not attached',
  body:
    'Your request was sent, but not every photo uploaded. Your provider can see the'
    + ' ones that did. You can describe the rest in a message.',
}
