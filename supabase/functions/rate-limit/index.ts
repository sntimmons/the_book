// Supabase Edge Function: rate-limit
// -----------------------------------------------------------------------------
// Server-side, cannot-be-bypassed rate limiter backed by the rate_limit_log
// table. Runs on Deno (NOT Node) — it is intentionally excluded from the app's
// tsconfig. Deploy with the Supabase CLI (see supabase/functions/README.md).
//
// Contract:
//   POST { action }
//   -> 200 { allowed: true,  remaining, resetAt }   (a slot was consumed)
//   -> 429 { allowed: false, remaining: 0, resetAt } (limit reached)
//   -> 400 { error: 'Unknown action' } for an unrecognized action
//   -> 401 if the caller has no valid JWT
//
// SECURITY: both inputs that matter are server-controlled.
//   * The LIMITS come from the RATE_LIMITS map below, never the request body —
//     otherwise a client could send maxRequests=1e9 and bypass the limiter.
//   * The USER ID comes only from the verified JWT, never the body — otherwise a
//     client could dodge its own limit by rotating ids, or target another user.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Server-defined limits. The caller only names an `action`; it CANNOT influence
// the numbers. (Previously maxRequests/windowSeconds came from the request body,
// so a client could send maxRequests=1e9 and bypass the limiter entirely.)
const RATE_LIMITS: Record<string, { maxRequests: number; windowSeconds: number }> = {
  booking_create: { maxRequests: 3, windowSeconds: 3600 },
  community_post: { maxRequests: 10, windowSeconds: 3600 },
  barter_offer: { maxRequests: 5, windowSeconds: 86400 },
  message_send: { maxRequests: 30, windowSeconds: 60 },
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: 'Server not configured' }, 500)
  }

  let payload: { action?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const { action } = payload
  if (!action || typeof action !== 'string') {
    return json({ error: 'Missing action' }, 400)
  }

  // Limits are looked up server-side only; the caller cannot supply them.
  const limit = RATE_LIMITS[action]
  if (!limit) {
    return json({ error: 'Unknown action' }, 400)
  }
  const { maxRequests, windowSeconds } = limit

  // Service-role client: bypasses RLS to read/write the log for any user.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  // Resolve the authoritative user id from the JWT — never from the body, so a
  // client cannot dodge its own limit (by rotating ids) or target another user.
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401)
  }
  const { data: userData } = await admin.auth.getUser(authHeader.slice('Bearer '.length))
  const userId = userData.user?.id ?? null
  if (!userId) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const now = Date.now()
  const windowStartIso = new Date(now - windowSeconds * 1000).toISOString()

  // Count this user's requests for this action inside the window.
  const { count, error: countError } = await admin
    .from('rate_limit_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('action', action)
    .gte('created_at', windowStartIso)

  if (countError) {
    // Fail OPEN: a limiter that errors should not block legitimate users.
    console.error('rate-limit count error:', countError.message)
    return json({ allowed: true, remaining: maxRequests, resetAt: new Date(now).toISOString() })
  }

  const used = count ?? 0
  const resetAt = new Date(now + windowSeconds * 1000).toISOString()

  if (used >= maxRequests) {
    return json({ allowed: false, remaining: 0, resetAt }, 429)
  }

  // Consume a slot.
  const { error: insertError } = await admin
    .from('rate_limit_log')
    .insert({ user_id: userId, action })
  if (insertError) {
    console.error('rate-limit insert error:', insertError.message)
    return json({ allowed: true, remaining: maxRequests - used, resetAt })
  }

  // Best-effort cleanup of this user+action's expired rows to keep the table small.
  admin
    .from('rate_limit_log')
    .delete()
    .eq('user_id', userId)
    .eq('action', action)
    .lt('created_at', windowStartIso)
    .then(() => {})

  return json({ allowed: true, remaining: Math.max(0, maxRequests - used - 1), resetAt })
})
