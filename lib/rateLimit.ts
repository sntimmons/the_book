import { supabase } from './supabase'

// Client entry point to the server-side rate limiter (the `rate-limit` Supabase
// Edge Function). The numeric limits live SERVER-SIDE only — the client just
// names an action and cannot define or influence the limits (a client sending
// its own maxRequests would otherwise bypass the limiter). This helper only asks
// "may I proceed?" and maps a 429 to a friendly message.
//
// FAIL-OPEN: if the edge function is unreachable, not yet deployed, or errors for
// any reason other than a 429, we allow the action. A rate limiter being down
// must never block a legitimate user — it should only ever add friction when it
// explicitly says "too many".

export type RateLimitAction =
  | 'booking_create'
  | 'community_post'
  | 'barter_offer'
  | 'message_send'

// Friendly, user-facing messages per action. The numeric limits (max requests /
// window) are defined server-side in the edge function, NOT here.
export const RATE_LIMITS: Record<RateLimitAction, string> = {
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

// `userId` is retained for call-site clarity but is NOT sent to the server: the
// edge function derives the user from the verified JWT, so a client cannot spoof
// or influence whose limit is checked. Only the action is sent.
export async function checkRateLimit(
  userId: string,
  action: string,
): Promise<RateLimitResult> {
  void userId
  const message = RATE_LIMITS[action as RateLimitAction] ?? DEFAULT_MESSAGE
  try {
    const { data, error } = await supabase.functions.invoke('rate-limit', {
      body: { action },
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
