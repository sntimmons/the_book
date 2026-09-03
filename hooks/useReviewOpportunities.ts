import { useEffect, useState } from 'react'
import {
  getReviewOpportunities,
  ReviewDirection,
  ReviewOpportunity,
} from '../lib/reviews'

// Batch sibling of useReviewOpportunity, for list screens.
//
// Same contract, same authority: `loading` distinguishes "not read yet" from "read
// failed", and a booking with no entry once loading is false is 'unknown' — which is
// deliberately non-terminal and must never be rendered as a verdict.
//
// The join key is a sorted, stable string so a re-render with an equivalent array does
// not refetch; passing a fresh array literal each render is therefore safe.
export function useReviewOpportunities(
  bookingIds: string[],
  direction: ReviewDirection,
  enabled = true,
): {
  opportunities: Map<string, ReviewOpportunity>
  loading: boolean
  // True when the last read FAILED, as opposed to succeeding with nothing to say.
  // A failed read must not look like "no review available" — that would silently
  // strip a real capability with no way back (QA-UX-004) — so callers can offer a
  // retry and say why the control is missing.
  failed: boolean
  reload: () => void
} {
  const [opportunities, setOpportunities] = useState<Map<string, ReviewOpportunity>>(
    new Map(),
  )
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const key = Array.from(new Set(bookingIds.filter(Boolean))).sort().join(',')

  useEffect(() => {
    let cancelled = false
    const ids = key ? key.split(',') : []
    if (!enabled || ids.length === 0) {
      setOpportunities(new Map())
      setFailed(false)
      setLoading(false)
      return
    }
    setLoading(true)
    getReviewOpportunities(ids, direction)
      .then((m) => {
        if (cancelled) return
        setOpportunities(m)
        // getReviewOpportunities returns an empty map on a read error, so an empty
        // result for a non-empty request means the read did not succeed.
        setFailed(m.size === 0 && ids.length > 0)
        setLoading(false)
      })
      .catch(() => {
        // Never strand a list in a loading state; an empty map reads as 'unknown'.
        if (cancelled) return
        setOpportunities(new Map())
        setFailed(true)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [key, direction, enabled, attempt])

  return { opportunities, loading, failed, reload: () => setAttempt((n) => n + 1) }
}
