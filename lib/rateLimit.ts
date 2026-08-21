import { supabase } from './supabase'

// Client-side entry point to the server-side rate limiter (the `rate-limit`
// Supabase Edge Function). The real enforcement is server-side and cannot be
// bypassed; this helper just asks "may I proceed?" before a critical write and
// surfaces a friendly message when the answer is no.
//
// FAIL-OPEN: if the edge function is unreachable, not yet deployed, or errors
// for any reason other than a 429, we allow the action. A rate limiter being
// down must never block a legitimate user — it should only ever *add* friction
// when it explicitly says "too many".

export type RateLimitAction =
  | 'booking_create'
  | 'community_post'
  | 'barter_offer'
  | 'message_send'

// Canonical limits (kept here so callers don't hardcode numbers). Mirror the
// values documented for the edge function.
export const RATE_LIMITS: Record<
  RateLimitAction,
  { maxRequests: number; windowSeconds: number }
> = {
  booking_create: { maxRequests: 3, windowSeconds: 3600 }, // 3 / hour
  community_post: { maxRequests: 10, windowSeconds: 3600 }, // 10 / hour
  barter_offer: { maxRequests: 5, windowSeconds: 86400 }, // 5 / day
  message_send: { maxRequests: 30, windowSeconds: 60 }, // 30 / minute
}

const MESSAGES: Record<RateLimitAction, string> = {
  booking_create: 'You have too many pending requests. Please wait before sending another.',
  community_post: 'You are posting too quickly. Please wait a moment.',
  barter_offer: 'You have reached your daily limit for new barter offers.',
  message_send: 'You are sending messages too quickly. Please slow down.',
}

const DEFAULT_MESSAGE = 'You are doing that too often. Please wait a moment and try again.'

export interface RateLimitResult {
  allowed: boolean
  message?: string
}

export async function checkRateLimit(
  userId: string,
  action: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const message = MESSAGES[action as RateLimitAction] ?? DEFAULT_MESSAGE
  try {
    const { data, error } = await supabase.functions.invoke('rate-limit', {
      body: { userId, action, maxRequests, windowSeconds },
    })

    if (error) {
      // supabase-js raises a FunctionsHttpError on any non-2xx. A 429 is the
      // real "blocked" signal; anything else (function missing, network, 500)
      // fails open so real users are never blocked by limiter unavailability.
      const status = (error as { context?: { status?: number } })?.context?.status
      if (status === 429) return { allowed: false, message }
      return { allowed: true }
    }

    if (data && (data as { allowed?: boolean }).allowed === false) {
      return { allowed: false, message }
    }
    return { allowed: true }
  } catch {
    return { allowed: true }
  }
}
