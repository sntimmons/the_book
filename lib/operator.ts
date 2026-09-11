import * as Sentry from '@sentry/react-native'
import { supabase } from './supabase'

// The operator's client path (Session 8B, PD-068).
//
// ── WHAT THIS IS, AND WHAT IT IS NOT ──────────────────────────────────────
//
// It is the minimum a person needs to work the Review Queue: see what is
// waiting, open one, read the facts behind it, write an internal note, and take
// the one supported action. It is NOT an admin platform, and the absence of
// user search, bulk actions and message-thread reading is the design rather
// than a backlog.
//
// ── AUTHORITY LIVES IN THE DATABASE, NOT HERE ─────────────────────────────
//
// Every function below is a thin call onto an RPC that checks `is_operator()`
// itself. `amIOperator()` decides what to DRAW; it never decides what is
// ALLOWED. A client that lied about it would get nothing but refusals.

export type CaseType = 'barter_review' | 'provider_appeal' | 'user_report'
export type CaseStatus = 'open' | 'under_review' | 'resolved' | 'dismissed'
export type CaseAction = 'claimed' | 'resolved' | 'dismissed' | 'noted'

/**
 * A Community post or reply a report is about, with the two things an operator
 * has to know before deciding: whether it is hidden RIGHT NOW, and whether it
 * has been hidden before. A boolean alone cannot tell "visible" from "restored
 * after being hidden", and those call for different decisions.
 */
export interface ModerationAction {
  id: string
  action: 'hidden' | 'restored'
  actor_user_id: string | null
  case_id: string | null
  note: string | null
  created_at: string
}

export interface ReportedContent {
  kind: 'post' | 'reply' | 'community_post' | 'community_reply'
  id: string
  /** True when the content is gone — the author removed it, or it cascaded. */
  missing?: boolean
  content?: string
  intent?: string | null
  author_kind?: 'client' | 'provider'
  author_user_id?: string
  provider_id?: string | null
  created_at?: string
  is_hidden?: boolean
  reply_count?: number
  post_id?: string
  history?: ModerationAction[]
}

export interface QueueCase {
  caseId: string
  caseType: CaseType
  status: CaseStatus
  subject: string
  requestedByUserId: string | null
  createdAt: string
  updatedAt: string
  eventCount: number
}

export interface CaseEvent {
  id: string
  action: string
  actor_user_id: string | null
  from_status: string | null
  to_status: string | null
  note: string | null
  created_at: string
}

export interface CaseDetail {
  case_id: string
  case_type: CaseType
  status: CaseStatus
  created_at: string
  updated_at: string
  resolved_at: string | null
  resolved_by_user_id: string | null
  requested_by_user_id: string | null
  operator_notes: string | null
  facts: Record<string, unknown> | null
  history: CaseEvent[]
}

/**
 * Am I an operator?
 *
 * Answers about the CALLER and nobody else — the RPC takes no arguments, which
 * is the property that makes granting it safe where granting the block
 * predicates was not (`20261055000000`). Null means "could not tell", and every
 * caller treats that as "draw nothing": showing an operator entry point to a
 * user who is not one is a worse failure than hiding it from one who is.
 */
export async function amIOperator(): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('is_operator')
  if (error) return null
  return data === true
}

export async function listCases(
  status?: CaseStatus | null,
  caseType?: CaseType | null,
): Promise<QueueCase[] | null> {
  const { data, error } = await supabase.rpc('operator_list_cases', {
    p_status: status ?? null,
    p_case_type: caseType ?? null,
  })
  if (error) {
    Sentry.captureException(error)
    return null
  }
  const rows = (data as Record<string, unknown>[] | null) ?? []
  return rows.map((r) => ({
    caseId: r.case_id as string,
    caseType: r.case_type as CaseType,
    status: r.status as CaseStatus,
    subject: (r.subject as string) ?? '',
    requestedByUserId: (r.requested_by_user_id as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    eventCount: (r.event_count as number) ?? 0,
  }))
}

export async function caseDetail(caseId: string): Promise<CaseDetail | null> {
  const { data, error } = await supabase.rpc('operator_case_detail', { p_case_id: caseId })
  if (error) {
    Sentry.captureException(error)
    return null
  }
  return (data as CaseDetail | null) ?? null
}

/**
 * Take an action on a case.
 *
 * `actorUserId` is a RECORD of who acted, never a claim of authority — the RPC
 * says so in its own comment, and `is_operator()` is what actually decides.
 * Passing someone else's id would not grant anything; it would only file a
 * false record, which is why the caller passes their own and nothing else.
 */
export async function updateCase(
  caseId: string,
  action: CaseAction,
  actorUserId: string,
  note?: string | null,
): Promise<{ ok: boolean; status: string | null; error: unknown }> {
  const { data, error } = await supabase.rpc('operator_update_case', {
    p_case_id: caseId,
    p_action: action,
    p_actor_user_id: actorUserId,
    p_note: note?.trim() || null,
  })
  if (error) return { ok: false, status: null, error }
  return { ok: true, status: (data as string | null) ?? null, error: null }
}

/**
 * The Community content a case is about, or null when it is about none.
 *
 * Null is the ordinary answer: every non-Community report, and every report
 * filed before the content reference became a column, has nothing to return.
 * The screen must render that as "no content attached", not as an error.
 */
export async function communityContentForCase(
  caseId: string,
): Promise<ReportedContent | null> {
  const { data, error } = await supabase.rpc('operator_community_content', {
    p_case_id: caseId,
  })
  if (error) {
    Sentry.captureException(error)
    return null
  }
  return (data as ReportedContent | null) ?? null
}

/**
 * Hide or restore Community content.
 *
 * HIDING IS NOT DELETION. The row, the report, the case and every previous
 * moderation action survive it, and the same call with `hidden: false` puts the
 * content back. That is deliberate: a moderation decision has to be reviewable,
 * reversible and attributable, and a deleted row is none of those.
 *
 * It also does exactly this and nothing else — it does not resolve the case,
 * suspend anyone or restrict a provider. Those are separate actions with their
 * own audit rows, and bundling them would hide three decisions behind one click.
 */
export async function setCommunityVisibility(
  target: { kind: 'post' | 'reply'; id: string },
  hidden: boolean,
  actorUserId: string,
  opts: { caseId?: string | null; note?: string | null } = {},
): Promise<{ ok: boolean; error: unknown }> {
  const { error } = await supabase.rpc('operator_set_community_visibility', {
    p_target_kind: target.kind,
    p_target_id: target.id,
    p_hidden: hidden,
    p_actor_user_id: actorUserId,
    p_case_id: opts.caseId ?? null,
    p_note: opts.note?.trim() || null,
  })
  return { ok: !error, error: error ?? null }
}

export async function setProviderEligibility(
  providerId: string,
  approved: boolean,
  actorUserId: string,
  note?: string | null,
): Promise<{ ok: boolean; error: unknown }> {
  const { error } = await supabase.rpc('operator_set_provider_eligibility', {
    p_provider_id: providerId,
    p_approved: approved,
    p_actor_user_id: actorUserId,
    p_note: note?.trim() || null,
  })
  return { ok: !error, error: error ?? null }
}

/**
 * Record a terminal outcome on a barter obligation.
 *
 * A rationale is REQUIRED by the server and there is no way to skip it here
 * either. It is internal — PD-067 keeps the rationale and the adjudicator's
 * identity from participants — but "internal" is not "optional": a decision
 * nobody has to justify is a decision nobody can review.
 */
export async function adjudicateObligation(
  obligationId: string,
  outcome: 'fulfilled' | 'unfulfilled' | 'closed_without_resolution',
  actorUserId: string,
  rationale: string,
): Promise<{ ok: boolean; outcome: string | null; error: unknown }> {
  const { data, error } = await supabase.rpc('adjudicate_barter_obligation', {
    p_obligation_id: obligationId,
    p_outcome: outcome,
    p_adjudicator_user_id: actorUserId,
    p_rationale: rationale.trim(),
  })
  if (error) return { ok: false, outcome: null, error }
  return { ok: true, outcome: (data as string | null) ?? null, error: null }
}

// ── COPY ──────────────────────────────────────────────────────────────────
//
// Operator-facing, so it uses operator vocabulary deliberately — the rule that
// bans "case", "queue" and "dismissed" applies to what a PROVIDER sees
// (lib/safety.ts), because they should not have to learn our filing system.
// This is our filing system.

export const CASE_TYPE_LABEL: Record<CaseType, string> = {
  barter_review: 'Trade review',
  provider_appeal: 'Provider appeal',
  user_report: 'Report',
}

export const OUTCOME_LABEL: Record<string, string> = {
  fulfilled: 'Fulfilled',
  unfulfilled: 'Unfulfilled',
  closed_without_resolution: 'Closed without resolution',
}

/**
 * The third outcome, spelled out where the decision is made.
 *
 * PD-065: `closed_without_resolution` records that the information supported
 * NEITHER finding. It is not a softer *unfulfilled*, it is not a finding of
 * fault, and it carries no reputation effect. An operator reading a one-word
 * label under time pressure will otherwise reach for it as "unfulfilled but
 * kinder", which is exactly what it is not.
 */
export const OUTCOME_HELP: Record<string, string> = {
  fulfilled: 'The evidence supports that this was delivered.',
  unfulfilled: 'The evidence supports that this was not delivered.',
  closed_without_resolution:
    'The evidence supports NEITHER finding. Not a softer "unfulfilled", not a '
    + 'finding of fault, and it carries no reputation effect.',
}

/**
 * What the three visibility states mean, in operator words. Written here rather
 * than in the screen because the distinction is a product rule: hiding removes
 * content from ordinary surfaces and keeps everything; it is not a deletion and
 * it is not a punishment applied to the person.
 */
export const MODERATION_STATE_LABEL = {
  visible: 'Visible',
  hidden: 'Hidden by operator',
  restored: 'Restored',
} as const

export const MODERATION_HELP =
  'Hiding removes this from the feed, threads and Discover. The post, the report ' +
  'and this case are all kept, and it can be restored. It does not suspend anyone ' +
  'or restrict a provider — those are separate actions.'

export const NO_SLA_NOTE =
  'The Book promises no response time for any of this (PD-068). Nothing here tells '
  + 'the person waiting that you have looked.'
