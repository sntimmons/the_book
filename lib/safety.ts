import * as Sentry from '@sentry/react-native'
import { supabase } from './supabase'

// Blocking, reporting, and asking for a review (Session 8).
//
// ── ONE MODULE, BECAUSE THESE ARE ONE PROMISE ─────────────────────────────
//
// A person who feels unsafe should be able to act once and have it mean
// something. Splitting block, report and appeal across three places is how a
// product ends up with a Report button that writes nowhere and a Block that only
// hides an avatar. The rules live in the database — `20261046000000` through
// `20261052000000` — and this is the single client path to them, so every surface
// asks the same question the same way.
//
// ── WHAT THE COPY MAY AND MAY NOT SAY ─────────────────────────────────────
//
// Every string below says what HAPPENED, never what will happen next. There is
// no SLA (PD-068), no notification channel of any kind, and no promise of an
// outcome. "Your report was submitted." is the whole claim, because it is the
// whole truth.

// ── BLOCKING ───────────────────────────────────────────────────────────────

/**
 * What a person is told before blocking someone.
 *
 * States the exception rather than hiding it. A client blocking a provider with
 * an appointment tomorrow needs to know the thread stays open, or they will
 * block, discover the message anyway, and conclude the feature is broken — or
 * worse, trust it and be surprised.
 */
export const BLOCK_COPY = {
  title: 'Block this person?',
  body:
    "They won't be able to message you, send you booking requests, or respond to your"
    + ' barter offers, and you won\'t be able to do those things with them. Your existing'
    + ' bookings, messages and history stay exactly as they are — and if you have a booking'
    + ' or trade in progress, that conversation stays open so you can both finish it.',
  confirmLabel: 'Block',
  cancelLabel: 'Cancel',
}

export const UNBLOCK_COPY = {
  title: 'Unblock this person?',
  body: 'They will be able to message you and send booking requests again.',
  confirmLabel: 'Unblock',
  cancelLabel: 'Cancel',
}

/**
 * Block someone.
 *
 * `blockedUserId` is the USER behind a provider, not the provider row — a person
 * is blocked, not a business. Callers holding a provider id resolve it first with
 * `userIdForProvider`.
 *
 * A duplicate is success, not an error: the block already exists and the caller
 * got what they asked for.
 */
export async function blockUser(blockerUserId: string, blockedUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_blocks')
    .insert({ blocker_user_id: blockerUserId, blocked_user_id: blockedUserId })
  if (error && error.code !== '23505') {
    Sentry.captureException(error)
    return false
  }
  return true
}

export async function unblockUser(blockerUserId: string, blockedUserId: string): Promise<boolean> {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_user_id', blockerUserId)
    .eq('blocked_user_id', blockedUserId)
  if (error) {
    Sentry.captureException(error)
    return false
  }
  return true
}

/**
 * Have I blocked this person?
 *
 * Deliberately answers only about the CALLER'S OWN blocks, because that is all
 * the read policy shows and all a client surface legitimately needs — it decides
 * whether to draw "Block" or "Unblock". It cannot and must not be used to
 * discover that someone has blocked YOU: the database answers that question only
 * inside the write gates, and the refusals are worded identically in both
 * directions so a blocked person is never told.
 *
 * Null means "could not tell" — distinct from false — so a caller can withhold
 * the control rather than guess wrong about it.
 */
export async function iBlocked(
  blockerUserId: string,
  otherUserId: string,
): Promise<boolean | null> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_user_id', blockerUserId)
    .eq('blocked_user_id', otherUserId)
    .maybeSingle()
  if (error) return null
  return !!data
}

/** The user behind a provider row. Blocking is between people, not businesses. */
export async function userIdForProvider(providerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('providers')
    .select('user_id')
    .eq('id', providerId)
    .maybeSingle()
  if (error || !data) return null
  return (data as { user_id: string }).user_id
}

// ── REPORTING ──────────────────────────────────────────────────────────────

/**
 * The categories, grounded in what this product actually does.
 *
 * **No billing or payment category**, deliberately: The Book processes no payment
 * (PD-042), and Correction 3 removed exactly that option from the post-booking
 * issue flow for the same reason. Offering it invites a report about a
 * transaction the product never made and cannot resolve.
 *
 * Eight, not forty. A taxonomy a reporter has to study is a taxonomy that gets
 * the wrong answer — `other` plus free text carries anything this list misses,
 * and the operator reads the words, not the label.
 */
export const REPORT_REASONS = [
  { value: 'harassment', label: 'Harassment or inappropriate behavior' },
  { value: 'safety_concern', label: 'Safety concern' },
  { value: 'scam_or_fraud', label: 'Scam or fraud' },
  { value: 'provider_conduct', label: 'Provider conduct' },
  { value: 'client_conduct', label: 'Client conduct' },
  { value: 'service_issue', label: 'Service issue' },
  { value: 'barter_issue', label: 'Barter issue' },
  { value: 'profile_or_content', label: 'Profile or content' },
  { value: 'other', label: 'Something else' },
] as const

export type ReportReason = typeof REPORT_REASONS[number]['value']
export type ReportTarget = 'provider' | 'client' | 'booking' | 'content'

export interface ReportInput {
  reporterUserId: string
  type: ReportTarget
  reason: ReportReason
  notes?: string | null
  reportedUserId?: string | null
  reportedProviderId?: string | null
  bookingId?: string | null
}

/**
 * File a report.
 *
 * The row is the durable record; a database trigger opens the operator case, so
 * there is no second call to forget and no way to file a report that lands
 * nowhere. The caller cannot set status, `admin_notes`, `resolved_by` or
 * `resolved_at` — those columns are not in the INSERT grant (`20261052000000`).
 */
export async function submitReport(input: ReportInput): Promise<boolean> {
  const { error } = await supabase.from('reports').insert({
    reporter_user_id: input.reporterUserId,
    report_type: input.type,
    report_reason: input.reason,
    notes: input.notes?.trim() || null,
    reported_user_id: input.reportedUserId ?? null,
    reported_provider_id: input.reportedProviderId ?? null,
    booking_id: input.bookingId ?? null,
  })
  if (error) {
    Sentry.captureException(error)
    return false
  }
  return true
}

/**
 * What a reporter is told afterwards.
 *
 * Says the report was recorded and stops. It does NOT say "we'll review it",
 * "we'll get back to you", or name any timeframe: PD-068 is explicit that there
 * is no SLA, and there is no channel through which anyone could be got back to.
 */
export const REPORT_SUBMITTED_COPY = {
  title: 'Report submitted',
  body: 'Thanks — your report has been recorded and will be reviewed by The Book.',
}

export const REPORT_FAILED_COPY = {
  title: 'Could not submit',
  body: 'Your report was not saved. Please check your connection and try again.',
}

// ── PROVIDER ELIGIBILITY REVIEW (PD-081) ──────────────────────────────────

export type ReviewCaseStatus = 'open' | 'under_review' | 'resolved' | 'dismissed'

export interface ProviderReviewStatus {
  caseId: string
  status: ReviewCaseStatus
  requestedAt: string
}

/**
 * A de-approved provider asks for their eligibility to be reviewed.
 *
 * Correction 3 deliberately shipped NO support control here, because the only
 * support entry in the product was a stub reading "Coming soon" and a dead button
 * on that screen would have been worse than honest silence. This is the real path
 * PD-081 recorded as owed: it creates a case in the same queue that handles barter
 * reviews and user reports.
 *
 * Idempotent server-side — a second request returns the existing case rather than
 * filling the queue with the same question.
 */
export async function requestProviderReview(message?: string | null): Promise<string | null> {
  const { data, error } = await supabase.rpc('request_provider_review', {
    p_message: message?.trim() || null,
  })
  if (error) {
    Sentry.captureException(error)
    return null
  }
  return (data as string | null) ?? null
}

/** Whether this provider has a review under way, and roughly where it stands. */
export async function myProviderReviewStatus(): Promise<ProviderReviewStatus | null> {
  const { data, error } = await supabase.rpc('my_provider_review_status')
  if (error) return null
  const rows = (data as { case_id: string; status: ReviewCaseStatus; requested_at: string }[] | null) ?? []
  if (rows.length === 0) return null
  return { caseId: rows[0].case_id, status: rows[0].status, requestedAt: rows[0].requested_at }
}

/**
 * What a provider sees about their own review — human words, not case states.
 *
 * A provider should not have to learn the internal vocabulary to understand what
 * is happening to their business. `open` and `under_review` are the same sentence
 * to them, because the difference is which operator has picked it up, which is not
 * their concern. And **no timeframe appears in any of these**.
 */
export function providerReviewCopy(status: ReviewCaseStatus | null): string | null {
  switch (status) {
    case 'open':
    case 'under_review':
      return 'You asked The Book to review this. Nothing has been decided yet.'
    case 'resolved':
    case 'dismissed':
      // Deliberately identical: the OUTCOME a provider cares about is whether
      // their business is available again, and that is shown by the availability
      // state itself — not by a case label. Saying "dismissed" here would tell a
      // provider they lost an appeal in a word chosen for an operator's filing
      // system rather than for them.
      return 'The Book has reviewed this.'
    default:
      return null
  }
}

export const REQUEST_REVIEW_COPY = {
  title: 'Ask The Book to review this?',
  body:
    'This asks The Book to look at why your business is not currently available for new'
    + ' bookings. Your existing bookings, messages and history are not affected. There is no'
    + ' set response time.',
  confirmLabel: 'Request review',
  cancelLabel: 'Not now',
}
