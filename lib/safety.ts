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

/**
 * What a person is told AFTER blocking. QA-TRUTH-001.
 *
 * This used to be written at the call site as *"They can no longer message you
 * or send you booking requests."* — which **contradicted the dialog the person
 * had just agreed to** two taps earlier. `BLOCK_COPY.body` states the live
 * transaction exception plainly; the confirmation then denied it, and the
 * confirmation is the sentence someone remembers.
 *
 * That is the worse direction for a safety feature to be wrong in: it
 * overstates protection. Someone who blocks a provider mid-booking and reads
 * "they can no longer message you" has been told the thread is closed. It is
 * not, deliberately — closing it would strand both of them inside an obligation
 * neither could finish. So the confirmation repeats the exception rather than
 * quietly dropping it, and a test pins the two strings to each other.
 */
export const BLOCK_DONE_COPY = {
  title: 'Blocked',
  body:
    "They can't message you, send you booking requests, or respond to your barter"
    + " offers, and you can't do those things with them either. Anything already in"
    + ' progress stays open so you can both finish it, and your bookings, messages'
    + ' and history are unchanged.',
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
 * is blocked, not a business. Callers holding only a provider id read `user_id`
 * from the provider row they already have; there is deliberately no helper for
 * it, because a helper meant a second round trip for data every caller had
 * already fetched.
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

/**
 * The post-booking issue slugs, which are OLDER and more specific than the list
 * above and are kept exactly as they are.
 *
 * `app/post-booking/issue.tsx` asks a different question — "what went wrong with
 * this appointment" rather than "what is the problem with this person" — and
 * rows filed under these slugs already exist. Folding them into `ReportReason`
 * would relabel history; leaving that screen writing its own INSERT, which is
 * what it did, meant TWO client paths into `reports` and only one of them aware
 * of the column boundary in 20261052000000.
 *
 * So the taxonomy stays separate and the WRITE is shared. `billing_dispute` is
 * listed although the category is no longer offered (Correction 3, item E):
 * rows carrying it exist, and this type describes what may be in the column.
 */
export const BOOKING_ISSUE_REASONS = [
  'provider_late',
  'provider_cancelled',
  'results_unsatisfactory',
  'unprofessional_conduct',
  'location_issue',
  'safety_concern',
  'billing_dispute',
  'other',
] as const

export type BookingIssueReason = typeof BOOKING_ISSUE_REASONS[number]

export interface ReportInput {
  reporterUserId: string
  type: ReportTarget
  reason: ReportReason | BookingIssueReason
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
 * **This constant and this docstring disagreed.** The doc said it does NOT say
 * "we'll review it"; the string said "will be reviewed by The Book". The string
 * had been changed on the reasoning that a queue now exists, so the promise was
 * finally safe to make.
 *
 * It is not. A case row is created, which is a FACT — but there is no operator
 * UI, the operator RPCs are `service_role`-only, and PD-068 promises no SLA. So
 * the copy states the mechanism that actually happened and stops. "Sent to The
 * Book" is true the moment the row exists; "will be reviewed" is a commitment by
 * people who have no surface to review it on.
 *
 * The last sentence is borrowed verbatim from the eligibility-review copy, so
 * the two places The Book is asked to look at something say the same thing about
 * what happens next: nothing is promised.
 */
export const REPORT_SUBMITTED_COPY = {
  title: 'Report submitted',
  body: 'Thanks — your report has been recorded and sent to The Book. There is no set'
    + ' response time.',
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

/**
 * Renamed from `REQUEST_REVIEW_COPY`, which lib/obligationState.ts also exports
 * for a completely different act — asking The Book to look at a barter
 * obligation. Two constants with one name, both reading "Ask The Book to review
 * this?", is a mis-import that typechecks.
 */
export const REQUEST_ELIGIBILITY_REVIEW_COPY = {
  title: 'Ask The Book to review this?',
  body:
    'This asks The Book to look at why your business is not currently available for new'
    + ' bookings. Your existing bookings, messages and history are not affected. There is no'
    + ' set response time.',
  confirmLabel: 'Request review',
  cancelLabel: 'Not now',
}


// ── WHAT A BLOCKED PERSON'S PROFILE SAYS ──────────────────────────────────

/**
 * The booking bar on the profile of someone YOU have blocked. QA-JOURNEY-002.
 *
 * Book Now stayed on the bar after a block, so the one act a block is FOR — not
 * being able to start something new with that person — was still offered, and
 * would have failed at the end of the flow as a raw `PT427`. Correction 3 fixed
 * exactly this shape for de-approved providers (item H) and the block path was
 * built without inheriting it.
 *
 * Worded as YOUR OWN action rather than as availability. "Not currently
 * available for new bookings" is the de-approval line, and reusing it here would
 * tell you the business had been removed from the marketplace when what actually
 * happened is that you blocked them — and would leave you no way to understand
 * why Unblock was the control on offer.
 */
export const BLOCKED_PROFILE_COPY = {
  bookBar: 'You blocked this person',
  hint: 'Unblock them to book or message again.',
}

// ── WHEN A MESSAGE DOES NOT SEND ──────────────────────────────────────────

/**
 * QA-UX-001. A failed send restored the draft text and said NOTHING — no toast,
 * no alert, no error state. The message simply did not appear.
 *
 * That was survivable while every refusal was transient. Session 8 added a
 * PERMANENT one: a blocked pair with no live transaction is refused every time,
 * so the silent path became "type, tap, watch nothing happen, repeat forever."
 *
 * The copy is deliberately the same for a block and for any other refusal the
 * server states, and names no cause. PD-082: a blocked person is never told they
 * were blocked, so this may not say "you were blocked" — and must not say
 * "try again" either, because for the block case that is false.
 */
export const MESSAGE_REFUSED_COPY = {
  title: 'Message not sent',
  body: 'This conversation is not available right now.',
}

export const MESSAGE_FAILED_COPY = {
  title: 'Message not sent',
  body: 'Please check your connection and try again.',
}


// ── THE FAILURE SENTENCES ─────────────────────────────────────────────────
//
// These were written inline at five call sites across three screens. That put
// them OUTSIDE `__tests__/lib/safety.test.ts`, which can only see what this
// module exports — and the copy guard is the whole reason this module exists.
// It is also how QA-TRUTH-001 happened: the post-block confirmation was written
// at a call site and contradicted the dialog the user had just agreed to.
//
// None of them says "try again" for a refusal that will not change on a retry.

export const BLOCK_FAILED_COPY = {
  title: 'Could not block',
  body: 'Please check your connection and try again.',
}

export const UNBLOCK_FAILED_COPY = {
  title: 'Could not unblock',
  body: 'Please check your connection and try again.',
}

/**
 * Shown when we could not determine the block state, so the menu is withheld.
 *
 * Withholding is deliberate: a control reading "Block" for someone you have
 * already blocked, or "Unblock" for someone you have not, is worse than a
 * moment's wait — it makes a safety action look like it did not take.
 */
export const SAFETY_UNAVAILABLE_COPY = {
  title: 'Not available right now',
  body: 'Please check your connection and try again.',
}

/**
 * What a thread tells the BLOCKER, and only them.
 *
 * The blocked party sees nothing (PD-082). The blocker is the one person
 * entitled to know why their own messages are being refused, and without this
 * they get a cause-free "This conversation is not available right now" on a
 * thread that still looks writable.
 *
 * It does NOT say the composer is closed, because sometimes it is not: a pair
 * with a live booking keeps a working thread by design, and the client cannot
 * evaluate that condition (`has_live_transaction` is deliberately not callable).
 * So this states the fact and the remedy, and lets the send answer for itself.
 */
export const BLOCKED_THREAD_COPY = {
  notice: 'You blocked this person. Unblock them to message freely again.',
  action: 'Unblock',
}


// ── THE LIST OF PEOPLE YOU HAVE BLOCKED ───────────────────────────────────

export interface BlockedPerson {
  userId: string
  name: string
  /** Their provider row, when they have one — so the list can link to it. */
  providerId: string | null
  blockedAt: string
}

/**
 * Everyone the caller has blocked.
 *
 * **Why this exists at all.** Blocking shipped with no inventory: the only way
 * to unblock was to find the person's profile or an existing thread, and
 * Settings → Blocked Accounts was a `stub()` reading "Coming soon" — a dead
 * button in front of a live feature, which is the exact thing Correction 3
 * refused to ship on the de-approval card.
 *
 * It was also a genuine dead end rather than an inconvenience. Discovery and
 * search filter on `is_approved`, so a client who blocked a provider they had
 * never messaged, and who was later de-approved, lost every route to that
 * profile — and with it the only control that could undo their own block.
 *
 * Reads only the caller's own rows (that is all the RLS policy shows) and
 * resolves names in two batched lookups rather than one per row. A block whose
 * counterparty cannot be named still appears, under a neutral label: the row is
 * the fact, and being unable to render a name must never hide it.
 */
export async function myBlocks(blockerUserId: string): Promise<BlockedPerson[] | null> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_user_id, created_at')
    .eq('blocker_user_id', blockerUserId)
    .order('created_at', { ascending: false })
  if (error) {
    Sentry.captureException(error)
    return null
  }
  const rows = (data as { blocked_user_id: string; created_at: string }[] | null) ?? []
  if (rows.length === 0) return []

  const ids = rows.map((r) => r.blocked_user_id)
  const [{ data: providers }, { data: clients }] = await Promise.all([
    supabase.from('providers').select('id, user_id, display_name').in('user_id', ids),
    supabase.from('clients_provider').select('id, name').in('id', ids),
  ])
  const byProvider = new Map(
    ((providers as { id: string; user_id: string; display_name: string }[] | null) ?? [])
      .map((p) => [p.user_id, p]),
  )
  const byClient = new Map(
    ((clients as { id: string; name: string }[] | null) ?? []).map((c) => [c.id, c.name]),
  )

  return rows.map((r) => {
    const p = byProvider.get(r.blocked_user_id)
    return {
      userId: r.blocked_user_id,
      // A name we cannot resolve is not a reason to drop the row.
      name: p?.display_name || byClient.get(r.blocked_user_id) || 'Blocked account',
      providerId: p?.id ?? null,
      blockedAt: r.created_at,
    }
  })
}

export const BLOCKED_LIST_COPY = {
  title: 'Blocked Accounts',
  empty: "You haven't blocked anyone.",
  // States what a block does, in the same terms as the dialog that made it, so
  // this screen and BLOCK_COPY cannot drift apart.
  hint:
    "Blocked people can't message you, send you booking requests, or respond to your"
    + " barter offers, and you can't do those things with them. Anything already in"
    + ' progress stays open so you can both finish it.',
  failed: 'Could not load your blocked accounts. Please check your connection and try again.',
}
