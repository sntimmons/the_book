import { useEffect, useState } from 'react'
import {
  getReviewOpportunity,
  ReviewDirection,
  ReviewOpportunity,
} from '../lib/reviews'

// One place that reads the server-authoritative review opportunity for a booking.
//
// CODE-STATE-002: "not read yet" and "read failed" are DIFFERENT states and must not
// share a value. Initializing to 'unknown' made them identical, so a screen rendered
// the star picker for one RPC round trip before swapping to a terminal state — the
// user could tap a rating on a booking that was never reviewable. Here `loading` is
// explicit: while it is true, callers render NEITHER the form NOR a verdict.
// `opportunity` is only meaningful once loading is false; 'unknown' then means a real
// read failure, which is deliberately non-terminal (never presented as a verdict).
export function useReviewOpportunity(
  bookingId: string | undefined,
  direction: ReviewDirection,
  enabled = true,
): { opportunity: ReviewOpportunity; loading: boolean } {
  const [opportunity, setOpportunity] = useState<ReviewOpportunity>('unknown')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    if (!bookingId || !enabled) {
      // Nothing to read. Not loading, and no verdict either.
      setOpportunity('unknown')
      setLoading(false)
      return
    }
    setLoading(true)
    getReviewOpportunity(bookingId, direction)
      .then((o) => {
        if (cancelled) return
        setOpportunity(o)
        setLoading(false)
      })
      .catch(() => {
        // getReviewOpportunity resolves supabase errors to 'unknown', but a REJECTED
        // promise must not strand the screen on a blank loading view with no exit
        // (NAVIGATION.md: no screen without a visible exit). Fail to 'unknown',
        // which is non-terminal — never presented as a verdict.
        if (cancelled) return
        setOpportunity('unknown')
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [bookingId, direction, enabled])

  return { opportunity, loading }
}
