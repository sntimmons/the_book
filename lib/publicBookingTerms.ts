import { supabase } from './supabase'

// THE TWO BOOKING TERMS A CLIENT IS ENTITLED TO, AND ONLY THOSE.
//
// `provider_booking_preferences` is owner-only and stays that way — the same row
// carries vacation mode, daily caps, buffers and timezone, which are how a
// business is run rather than what a client agreed to. The
// `provider_public_booking_terms` RPC (20261137000000) returns exactly the
// cancellation window and the lateness grace, behind the same
// `provider_content_hidden` gate as every other public provider surface.
//
// ── THE RULE THAT SHAPES EVERY FUNCTION HERE ──────────────────────────────
//
// **A term the product cannot read is NOT PUBLISHED, never a default.** The
// screen this replaces substituted `DEFAULT_POLICY` for both fields and rendered
// them beside the provider's real terms in identical formatting, which the client
// then agreed to. `null` travels all the way to the copy here, so no caller can
// accidentally re-introduce a constant by destructuring a fallback.

export interface PublicBookingTerms {
  cancellationWindowHours: number | null
  latenessGraceMinutes: number | null
}

export const NO_PUBLIC_BOOKING_TERMS: PublicBookingTerms = {
  cancellationWindowHours: null,
  latenessGraceMinutes: null,
}

function wholeHours(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n)
  return Number.isFinite(v) && v >= 0 ? Math.round(v) : null
}

/**
 * Reads the provider's REAL terms. Returns nulls — never defaults — when the
 * provider has not set them, when the RPC fails, and when the provider's public
 * content is withheld.
 */
export async function fetchPublicBookingTerms(
  providerId: string,
): Promise<PublicBookingTerms> {
  if (!providerId) return NO_PUBLIC_BOOKING_TERMS
  const { data, error } = await supabase.rpc('provider_public_booking_terms', {
    p_provider_id: providerId,
  })
  if (error) return NO_PUBLIC_BOOKING_TERMS
  // A set-returning function comes back as an array; no row means not published.
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return NO_PUBLIC_BOOKING_TERMS
  return {
    cancellationWindowHours: wholeHours(
      (row as { cancellation_window_hours?: unknown }).cancellation_window_hours,
    ),
    latenessGraceMinutes: wholeHours(
      (row as { lateness_grace_minutes?: unknown }).lateness_grace_minutes,
    ),
  }
}

/** "24 hours" / "1 hour", for embedding in a sentence. */
export function hoursPhrase(hours: number): string {
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`
}

export interface BookingTermsCopy {
  /** Null when the provider has not published a window. */
  cancellation: string | null
  /** Null when the provider has not published a grace period. */
  grace: string | null
  /** True when NEITHER term is published — the screen says so once, not twice. */
  nonedPublished: boolean
}

/**
 * Client-facing sentences for the two terms.
 *
 * Absence is expressed as `null` and named by the caller, because "not
 * published" is a different statement on a screen you are agreeing on than on a
 * profile you are browsing.
 */
export function bookingTermsCopy(terms: PublicBookingTerms): BookingTermsCopy {
  const h = terms.cancellationWindowHours
  const g = terms.latenessGraceMinutes
  return {
    cancellation: h == null ? null : `Free cancellation up to ${hoursPhrase(h)} before`,
    grace:
      g == null
        ? null
        : g === 0
          ? 'No grace period if you are running late'
          : `${g} minute grace if you are running late`,
    nonedPublished: h == null && g == null,
  }
}

/**
 * What a client is told when a term is not published.
 *
 * It does NOT guess, and it does not imply the provider is lax or strict — an
 * unset field says nothing about how they will behave. It says the term is not
 * published and points at the one thing the client can actually do.
 */
export const UNPUBLISHED_TERMS_COPY = {
  cancellation: 'Cancellation window not published',
  grace: 'Lateness grace not published',
  hint: 'Ask your provider directly if you need to change or cancel this booking.',
}
