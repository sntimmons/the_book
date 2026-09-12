import { supabase } from './supabase'
import * as Sentry from '@sentry/react-native'

// ── ACCOUNT DELETION — the client side of a job the server owns ───────────
//
// Nothing in this module deletes anything. It creates a REQUEST, reads its
// state, and cancels it — the erasure itself is a server job with its own
// memory (`account_deletion_requests` and its steps), because a deletion that
// depended on a phone staying awake would be a deletion that half happened.
//
// THE ONE RULE THIS FILE EXISTS TO KEEP: it never tells a user something the
// server has not recorded. No "we've emailed you", no "you'll hear from us",
// no countdown the client computed. The scheduled date comes from the row.

/** Job states, mirroring the CHECK on `account_deletion_requests.status`. */
export type DeletionStatus =
  | 'requested'
  | 'grace_period'
  | 'cancelled'
  | 'finalizing'
  | 'completed'
  | 'failed'

export interface DeletionRequest {
  id: string
  status: DeletionStatus
  requestedAt: string
  /** When permanent erasure becomes due. The SERVER's date, not a local sum. */
  graceEndsAt: string
  /** What the user was told the grace period was, at the time they were told. */
  disclosedGraceDays: number
}

/**
 * An active transaction the user should resolve before their account goes.
 *
 * Surfaced rather than silently destroyed: the policy is explicit that an
 * erasure must not evade an active obligation, and a counterparty mid-booking is
 * a person, not a row.
 */
export interface UnresolvedTransaction {
  kind: 'booking' | 'barter'
  id: string
  label: string
  detail: string
}

/** What the deletion screen shows, all of it read from the server. */
export interface DeletionOverview {
  request: DeletionRequest | null
  graceDays: number
  unresolved: UnresolvedTransaction[]
}

/**
 * The grace period, from `retention_policy`. Read rather than hard-coded so the
 * number a person is shown is the number the engine will actually use — the
 * whole reason that table exists.
 *
 * Falls back to null rather than to 30: a wrong number here is a promise the
 * product would then break.
 */
export async function fetchGraceDays(): Promise<number | null> {
  const { data, error } = await supabase
    .from('retention_policy')
    .select('days')
    .eq('key', 'account_grace_period')
    .maybeSingle()
  if (error || !data) {
    // Reported, not logged to the console: the grace period is what a person is
    // about to be told, so a failure to read it must reach Sentry rather than a
    // dev terminal — and the caller renders nothing rather than a wrong number.
    if (error) Sentry.captureException(error)
    return null
  }
  const d = (data as { days: number | null }).days
  return d ?? null
}

export async function fetchDeletionRequest(userId: string): Promise<DeletionRequest | null> {
  const { data, error } = await supabase
    .from('account_deletion_requests')
    .select('id, status, requested_at, grace_ends_at, disclosed_grace_days')
    .eq('subject_user_id', userId)
    .in('status', ['requested', 'grace_period', 'finalizing', 'failed'])
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) {
    if (error) Sentry.captureException(error)
    return null
  }
  const r = data as {
    id: string
    status: DeletionStatus
    requested_at: string
    grace_ends_at: string
    disclosed_grace_days: number
  }
  return {
    id: r.id,
    status: r.status,
    requestedAt: r.requested_at,
    graceEndsAt: r.grace_ends_at,
    disclosedGraceDays: r.disclosed_grace_days,
  }
}

/**
 * Bookings and barter obligations that are still live.
 *
 * Deliberately does NOT block the request — the policy says a user may initiate
 * "even when some records must be retained", and holding somebody's account
 * hostage to a booking the other side has not answered would be its own harm.
 * They are shown so the decision is informed, and they stay resolvable
 * afterwards.
 */
export async function fetchUnresolvedTransactions(
  userId: string,
  providerId: string | null,
): Promise<UnresolvedTransaction[]> {
  const out: UnresolvedTransaction[] = []

  const { data: asClient } = await supabase
    .from('bookings')
    .select('id, service_name, requested_date, status')
    .eq('user_id', userId)
    .in('status', ['pending', 'accepted', 'confirmed', 'in_progress'])
    .not('submitted_at', 'is', null)
    .order('requested_date', { ascending: true })
    .limit(20)
  for (const b of (asClient as
    | { id: string; service_name: string | null; requested_date: string; status: string }[]
    | null) ?? []) {
    out.push({
      kind: 'booking',
      id: b.id,
      label: b.service_name || 'A booking',
      detail: `${b.status.replace(/_/g, ' ')} · ${b.requested_date}`,
    })
  }

  if (providerId) {
    const { data: asProvider } = await supabase
      .from('bookings')
      .select('id, service_name, requested_date, status')
      .eq('provider_id', providerId)
      .in('status', ['pending', 'accepted', 'confirmed', 'in_progress'])
      .not('submitted_at', 'is', null)
      .order('requested_date', { ascending: true })
      .limit(20)
    for (const b of (asProvider as
      | { id: string; service_name: string | null; requested_date: string; status: string }[]
      | null) ?? []) {
      out.push({
        kind: 'booking',
        id: b.id,
        label: b.service_name || 'A client booking',
        detail: `${b.status.replace(/_/g, ' ')} · ${b.requested_date}`,
      })
    }

    // Barter obligations that are still owed in either direction.
    const { data: obligations } = await supabase
      .from('my_barter_obligations')
      .select('id, status, agreed_description, side')
      .in('status', ['pending', 'delivered'])
      .limit(20)
    for (const o of (obligations as
      | { id: string; status: string; agreed_description: string | null; side: string }[]
      | null) ?? []) {
      out.push({
        kind: 'barter',
        id: o.id,
        label: o.agreed_description || 'A trade obligation',
        detail: `${o.side} · ${o.status}`,
      })
    }
  }

  return out
}

export async function fetchDeletionOverview(
  userId: string,
  providerId: string | null,
): Promise<DeletionOverview> {
  const [request, graceDays, unresolved] = await Promise.all([
    fetchDeletionRequest(userId),
    fetchGraceDays(),
    fetchUnresolvedTransactions(userId, providerId),
  ])
  return { request, graceDays: graceDays ?? 0, unresolved }
}

export interface DeletionActionResult {
  ok: boolean
  /** Written for the person who hit it. Null on success. */
  message: string | null
  /** True when the refusal is "prove it's you again" rather than a failure. */
  needsReauth: boolean
}

function deletionError(err: { code?: string; message?: string } | null): DeletionActionResult {
  const code = err?.code ?? ''
  switch (code) {
    case 'PT442':
      return {
        ok: false,
        needsReauth: true,
        message: 'For your security, sign in again before deleting your account.',
      }
    case 'PT443':
      return { ok: false, needsReauth: false, message: 'Type DELETE to confirm.' }
    case 'PT444':
      return {
        ok: false,
        needsReauth: false,
        message:
          'Account deletion is unavailable right now. Contact support and they can start it for you.',
      }
    case 'PT445':
      return {
        ok: false,
        needsReauth: false,
        message: 'This deletion is already being carried out and can no longer be stopped.',
      }
    case '42501':
      return { ok: false, needsReauth: true, message: 'Sign in to manage your account.' }
    default:
      return { ok: false, needsReauth: false, message: 'That didn’t go through. Try again.' }
  }
}

/**
 * Ask for the account to be deleted.
 *
 * REAUTHENTICATION IS THE SERVER'S TEST, not this function's. It requires a
 * token issued in the last fifteen minutes, so a stolen or long-idle session
 * cannot do this unattended — and `PT442` is how it says so, which is why the
 * caller is handed `needsReauth` rather than a generic failure.
 */
export async function requestAccountDeletion(
  confirmText: string,
): Promise<DeletionActionResult> {
  const { error } = await supabase.rpc('request_account_deletion', {
    p_confirm_text: confirmText,
  })
  if (error) {
    if ((error as { code?: string }).code !== 'PT442' &&
        (error as { code?: string }).code !== 'PT443') {
      Sentry.captureException(error)
    }
    return deletionError(error)
  }
  return { ok: true, message: null, needsReauth: false }
}

/** Restore during the grace period. Takes no id — it can only be your own. */
export async function cancelAccountDeletion(): Promise<DeletionActionResult> {
  const { data, error } = await supabase.rpc('cancel_account_deletion')
  if (error) {
    Sentry.captureException(error)
    return deletionError(error)
  }
  if (data === false) {
    return {
      ok: false,
      needsReauth: false,
      message: 'There is nothing to restore on this account.',
    }
  }
  return { ok: true, message: null, needsReauth: false }
}

/**
 * Re-prove identity with a password, so the freshness test above can pass.
 *
 * Uses the signed-in user's own email; a wrong password fails here rather than
 * being reported as a deletion failure, which are different problems.
 */
export async function reauthenticate(password: string): Promise<boolean> {
  const { data: sess } = await supabase.auth.getUser()
  const email = sess?.user?.email
  if (!email) return false
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return !error
}

/** The date a person is shown, formatted once so every surface agrees. */
export function formatDeletionDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

export function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}
