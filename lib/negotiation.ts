import { supabase } from './supabase'
import type { ProposalDraft, ProposalSide, TradeSide } from './negotiationState'
import { draftPayload } from './negotiationState'
import type { ObligationStatus, ReceiverWindowState, TerminalOutcome } from './obligationState'

/** What the server reports after a cancellation act. Derived there from the acts on record. */
export type TradeCancellationResult = 'cancelled_by_participant' | 'mutually_cancelled'

// Barter negotiation data layer (Slice 3a). Reads come from `my_barter_proposals` and the three
// participant-scoped tables; every WRITE goes through a SECURITY DEFINER RPC, because the rules
// that matter — who may propose, which terms are current, who accepted — are decided from
// auth.uid() on the server and must not be re-derived here.
//
// Agreement finalization is separate from obligation and fulfilment. `bothAccepted` is a
// ready-to-confirm fact; `agreementId` is the official agreement once finalization succeeds.

export interface NegotiationRow {
  proposalId: string
  interestId: string
  offerId: string
  currentVersionNo: number
  currentVersionId: string
  currentVersionAuthorId: string
  currentVersionAt: string
  interestStatus: 'pending' | 'accepted' | 'declined' | 'released'
  offerIsActive: boolean
  myRole: TradeSide
  counterpartyUserId: string
  iAcceptedCurrent: boolean
  theyAcceptedCurrent: boolean
  bothAccepted: boolean
  /** Set once the agreement is official. Distinct from bothAccepted, which is "ready". */
  agreementId: string | null
  officializedAt: string | null
  /** This viewer recorded their own pre-delivery cancellation. Server-derived. */
  iCancelled: boolean
  /** The other participant recorded theirs. Both true is "mutually cancelled". */
  theyCancelled: boolean
  /** When the FIRST of the two acts was recorded; null when neither has. */
  cancelledAt: string | null
  /**
   * The reason THIS viewer gave, if any. Null when they have not cancelled or gave none.
   *
   * Founder ruling on PR #58: the reason is participant-visible context, shared with the other
   * provider — not a private note, and not a verdict, a no-show determination, adjudication or
   * proof of fault, none of which exist. The composer says so before submission.
   */
  myCancelReason: string | null
  /** The reason the OTHER provider gave, if any. Same posture. */
  theirCancelReason: string | null
}

export interface ProposalTerm {
  id: string
  versionId: string
  /** Server-assigned side. Never sent by the client. */
  providedBy: ProposalSide
  serviceDescription: string
  dueAt: string
  scheduledAt: string | null
}

export interface ProposalVersion {
  id: string
  versionNo: number
  authorUserId: string
  createdAt: string
  terms: ProposalTerm[]
  /** Who has accepted THIS version. Kept per version because acceptance is version-bound. */
  acceptedBy: string[]
}

export interface BarterObligation {
  id: string
  agreementId: string
  /** Server-derived side from the accepted proposal term. */
  side: ProposalSide
  agreedDescription: string
  dueAt: string
  scheduledAt: string | null
  /** What has happened to it. Server-owned; every transition goes through an RPC. */
  status: ObligationStatus
  /** Server-stamped when the deliverer marked it delivered. Never client-supplied. */
  deliveredAt: string | null
  /** Server-stamped when the receiver answered. */
  receiptRespondedAt: string | null
  /**
   * PD-057 receiver-response window, DERIVED AND DECIDED BY THE SERVER.
   *
   * `confirmationAnchor` is `max(delivered_at, scheduled_at ?? due_at)` and
   * `confirmationDeadline` is that plus 7 days; both are null until a delivery exists.
   * `receiverWindowState` is the server's comparison of its own clock against that deadline —
   * never recomputed here, so a wrong device clock cannot invent or hide Needs Attention.
   */
  confirmationAnchor: string | null
  confirmationDeadline: string | null
  receiverWindowState: ReceiverWindowState
  /**
   * Whether THIS obligation needs manual resolution, DERIVED AND DECIDED BY THE SERVER from a
   * no-show report or a `not_received` answer.
   *
   * OBLIGATION-GRANULAR, and the name says so: one side of a trade can be under review while
   * the other is untouched, and this says nothing about the other side. The AGREEMENT-level
   * roll-up is NOT derived from these anywhere on the client — it is the SERVER's
   * `my_trade_activity.agreement_under_review`, mapped in lib/barter.ts and named
   * `agreementUnderReview` on `TradeRowFacts`. Deriving it a second time here is exactly what
   * that split exists to prevent. Under review means a human must look — never that anyone is at
   * fault, and never an outcome: an outcome is `terminalOutcome` below, and only an operator
   * can produce one. A cancelled trade is always false.
   */
  obligationUnderReview: boolean
  /**
   * When the no-show was reported, or null. The server owns the timestamp.
   *
   * **LOAD-BEARING, not decorative.** This is the fact the PD-063 client gate reads — the SAME
   * predicate `PT423` evaluates server-side — so the trade detail derives "may this still be
   * cancelled" from it. It is deliberately NOT the broader `obligationUnderReview`, which also
   * counts `not_received`.
   *
   * Fail direction: absent reads as "no report", which OPENS the exit. That is safe only because
   * the server refuses independently in both the RPC and the row trigger, and because a
   * `not_received` obligation is necessarily delivered and is closed by `anyDelivered` instead.
   * **Do not drop this column from the select** on the grounds that nothing renders it.
   */
  noShowReportedAt: string | null
  /**
   * Whether the receiver may report a no-show right now — the SERVER's answer, decided against
   * its own clock. The client renders a control from this and never compares `scheduledAt` to
   * the device clock, exactly as it never recomputes the PD-057 window.
   */
  canReportNoShow: boolean
  /**
   * The operator's TERMINAL resolution of this obligation, or null.
   *
   * Obligation-granular: the other side of the same agreement is unaffected and may still be
   * unresolved. There is deliberately no agreement-level outcome — none exists in this product.
   * The operator's rationale is NOT exposed; participants hold no privilege on that column.
   */
  terminalOutcome: TerminalOutcome | null
  /** When it was resolved, or null. Display only; the server owns the timestamp. */
  adjudicatedAt: string | null
  /**
   * The reporting participant's own words, or null. The reporter is always this obligation's
   * RECEIVER, so the viewer's role attributes it — there is no second column saying who wrote it.
   *
   * PARTICIPANT-VISIBLE CONTEXT, not a platform finding (Founder ruling 2026-09-07). It is not
   * proof of fault, an adjudication, a reliability judgment or a reputation impact, and copy
   * rendering it must attribute it as a STATEMENT.
   */
  noShowReason: string | null
}

const ROW_COLUMNS =
  'proposal_id, interest_id, offer_id, current_version_no, current_version_id, current_version_author_id, current_version_at, interest_status, offer_is_active, my_role, counterparty_user_id, i_accepted_current, they_accepted_current, both_accepted, agreement_id, officialized_at, i_cancelled, they_cancelled, cancelled_at, my_cancel_reason, their_cancel_reason'

interface RawRow {
  proposal_id: string
  interest_id: string
  offer_id: string
  current_version_no: number
  current_version_id: string
  current_version_author_id: string
  current_version_at: string
  interest_status: NegotiationRow['interestStatus']
  offer_is_active: boolean
  my_role: TradeSide
  counterparty_user_id: string
  i_accepted_current: boolean
  they_accepted_current: boolean
  both_accepted: boolean
  agreement_id: string | null
  officialized_at: string | null
  i_cancelled: boolean
  they_cancelled: boolean
  cancelled_at: string | null
  my_cancel_reason: string | null
  their_cancel_reason: string | null
}

function mapRow(r: RawRow): NegotiationRow {
  return {
    proposalId: r.proposal_id,
    interestId: r.interest_id,
    offerId: r.offer_id,
    currentVersionNo: r.current_version_no,
    currentVersionId: r.current_version_id,
    currentVersionAuthorId: r.current_version_author_id,
    currentVersionAt: r.current_version_at,
    interestStatus: r.interest_status,
    offerIsActive: r.offer_is_active,
    myRole: r.my_role,
    counterpartyUserId: r.counterparty_user_id,
    iAcceptedCurrent: r.i_accepted_current,
    theyAcceptedCurrent: r.they_accepted_current,
    bothAccepted: r.both_accepted,
    agreementId: r.agreement_id,
    officializedAt: r.officialized_at,
    iCancelled: r.i_cancelled,
    theyCancelled: r.they_cancelled,
    cancelledAt: r.cancelled_at,
    myCancelReason: r.my_cancel_reason,
    theirCancelReason: r.their_cancel_reason,
  }
}

/**
 * The interest's own state, for the case where no negotiation exists yet.
 *
 * Read from `my_trade_activity`, which carries both the status and the SERVER-derived role.
 * Without it the screen cannot tell "no terms proposed yet, go ahead" from "this ended before
 * anyone proposed anything" — and it offered the first to both, on a route that had just been
 * opened to ended negotiations. It also removes the last place a route param decided which side
 * of the trade the viewer is on.
 */
export async function fetchInterestContext(interestId: string): Promise<{
  status: NegotiationRow['interestStatus'] | null
  myRole: TradeSide | null
  ok: boolean
}> {
  const { data, error } = await supabase
    .from('my_trade_activity')
    .select('status, my_role')
    .eq('interest_id', interestId)
    .maybeSingle()
  if (error) return { status: null, myRole: null, ok: false }
  const row = data as unknown as { status: NegotiationRow['interestStatus']; my_role: TradeSide } | null
  return { status: row?.status ?? null, myRole: row?.my_role ?? null, ok: true }
}

/**
 * The negotiation attached to one accepted response, if any has been opened.
 *
 * Returns `{ row: null, ok: true }` when none exists — that is a real state (nobody has
 * proposed terms yet), and it must be distinguishable from a failed read, which is what let a
 * connection problem render as "nothing here" on the Trade Activity surface.
 */
export async function fetchNegotiationForInterest(
  interestId: string,
): Promise<{ row: NegotiationRow | null; ok: boolean }> {
  const { data, error } = await supabase
    .from('my_barter_proposals')
    .select(ROW_COLUMNS)
    .eq('interest_id', interestId)
    .maybeSingle()
  if (error) return { row: null, ok: false }
  return { row: data ? mapRow(data as unknown as RawRow) : null, ok: true }
}

/**
 * The whole negotiation: its current state plus every version, its terms and who accepted it.
 *
 * History is fetched in full rather than paged: a negotiation is capped at 20 versions per
 * participant per day and is read once when the screen opens, so paging would add a failure
 * mode without removing one.
 */
export async function fetchNegotiation(proposalId: string): Promise<{
  row: NegotiationRow | null
  versions: ProposalVersion[]
  obligations: BarterObligation[]
  ok: boolean
}> {
  const [rowRes, versionRes] = await Promise.all([
    supabase.from('my_barter_proposals').select(ROW_COLUMNS).eq('proposal_id', proposalId).maybeSingle(),
    supabase
      .from('barter_proposal_versions')
      .select('id, version_no, author_user_id, created_at')
      .eq('proposal_id', proposalId)
      .order('version_no', { ascending: false }),
  ])
  if (rowRes.error || versionRes.error) {
    return { row: null, versions: [], obligations: [], ok: false }
  }

  const rawVersions =
    (versionRes.data as unknown as {
      id: string
      version_no: number
      author_user_id: string
      created_at: string
    }[] | null) ?? []
  const versionIds = rawVersions.map((v) => v.id)

  if (versionIds.length === 0) {
    return {
      row: rowRes.data ? mapRow(rowRes.data as unknown as RawRow) : null,
      versions: [],
      obligations: [],
      ok: true,
    }
  }

  const [termRes, acceptRes] = await Promise.all([
    supabase
      .from('barter_proposal_terms')
      .select('id, version_id, provided_by, service_description, due_at, scheduled_at')
      .in('version_id', versionIds)
      // Owner side first: 'offer_owner' sorts before 'responder', and there are exactly two.
      .order('provided_by', { ascending: true }),
    supabase
      .from('barter_version_acceptances')
      .select('version_id, participant_user_id')
      .in('version_id', versionIds),
  ])
  if (termRes.error || acceptRes.error) {
    return { row: null, versions: [], obligations: [], ok: false }
  }

  const terms = (termRes.data as unknown as {
    id: string
    version_id: string
    provided_by: ProposalSide
    service_description: string
    due_at: string
    scheduled_at: string | null
  }[] | null) ?? []
  const accepts = (acceptRes.data as unknown as {
    version_id: string
    participant_user_id: string
  }[] | null) ?? []

  const versions: ProposalVersion[] = rawVersions.map((v) => ({
    id: v.id,
    versionNo: v.version_no,
    authorUserId: v.author_user_id,
    createdAt: v.created_at,
    terms: terms
      .filter((t) => t.version_id === v.id)
      .map((t) => ({
        id: t.id,
        versionId: t.version_id,
        providedBy: t.provided_by,
        serviceDescription: t.service_description,
        dueAt: t.due_at,
        scheduledAt: t.scheduled_at,
      })),
    acceptedBy: accepts.filter((a) => a.version_id === v.id).map((a) => a.participant_user_id),
  }))
  const row = rowRes.data ? mapRow(rowRes.data as unknown as RawRow) : null
  let obligations: BarterObligation[] = []
  if (row?.agreementId) {
    // Reads `my_barter_obligations`, not the table: the PD-057 window is derived server-side and
    // arrives with the row, so the client never compares a deadline against its own clock. The
    // view is security_invoker over the same participant policy, so this is the same read
    // authority as before — one extra column set, no extra reach.
    const obligationRes = await supabase
      .from('my_barter_obligations')
      .select(
        'id, agreement_id, side, agreed_description, due_at, scheduled_at, status,'
        + ' delivered_at, receipt_responded_at, confirmation_anchor, confirmation_deadline,'
        + ' receiver_window_state, under_review, no_show_reported_at,'
        + ' can_report_no_show, no_show_reason, terminal_outcome, adjudicated_at',
      )
      .eq('agreement_id', row.agreementId)
      .order('side', { ascending: true })
    if (obligationRes.error) return { row: null, versions: [], obligations: [], ok: false }
    obligations = ((obligationRes.data as unknown as {
      id: string
      agreement_id: string
      side: ProposalSide
      agreed_description: string
      due_at: string
      scheduled_at: string | null
      status: ObligationStatus
      delivered_at: string | null
      receipt_responded_at: string | null
      confirmation_anchor: string | null
      confirmation_deadline: string | null
      receiver_window_state: ReceiverWindowState
      under_review: boolean | null
      no_show_reported_at: string | null
      can_report_no_show: boolean | null
      no_show_reason: string | null
      terminal_outcome: TerminalOutcome | null
      adjudicated_at: string | null
    }[] | null) ?? []).map((o) => ({
      id: o.id,
      agreementId: o.agreement_id,
      side: o.side,
      agreedDescription: o.agreed_description,
      dueAt: o.due_at,
      scheduledAt: o.scheduled_at,
      status: o.status,
      deliveredAt: o.delivered_at,
      receiptRespondedAt: o.receipt_responded_at,
      confirmationAnchor: o.confirmation_anchor,
      confirmationDeadline: o.confirmation_deadline,
      // Fail closed on a missing value: no window state means say nothing about a window, never
      // assert one. A row the server declined to classify must not become Needs Attention here.
      receiverWindowState: o.receiver_window_state ?? 'none',
      // Fail closed the same way: a missing value means say NOTHING about a review, never
      // assert one. Claiming "Under Review" from an absent field would put a trade into a
      // state a human is expected to resolve, on no evidence at all.
      obligationUnderReview: o.under_review ?? false,
      noShowReportedAt: o.no_show_reported_at,
      // Fail closed: a missing value withholds the control rather than offering one that can
      // only be refused.
      canReportNoShow: o.can_report_no_show ?? false,
      noShowReason: o.no_show_reason,
      // Fail closed: absent means NOT resolved. Manufacturing an outcome from a missing field
      // would tell two providers their trade was decided when nobody decided it.
      terminalOutcome: o.terminal_outcome ?? null,
      adjudicatedAt: o.adjudicated_at,
    }))
  }

  return {
    row,
    versions,
    obligations,
    ok: true,
  }
}

/** Open a negotiation on an accepted response. The server refuses a cold or duplicate open. */
export async function createProposal(
  interestId: string,
  draft: ProposalDraft,
): Promise<{ ok: boolean; proposalId: string | null; error: unknown }> {
  // Content only. Which participant each side is bound to is derived by the server from the
  // accepted interest — there is no parameter here through which identity could be asserted.
  const { data, error } = await supabase.rpc('create_barter_proposal', {
    p_interest_id: interestId,
    ...draftPayload(draft),
  })
  if (error) return { ok: false, proposalId: null, error }
  return { ok: true, proposalId: (data as string | null) ?? null, error: null }
}

/**
 * Send changed terms. The version number is NOT a parameter: the server derives it under a
 * lock, so two providers sending at once cannot land on the same number or reorder history.
 */
export async function submitCounter(
  proposalId: string,
  draft: ProposalDraft,
): Promise<{ ok: boolean; versionNo: number | null; error: unknown }> {
  const { data, error } = await supabase.rpc('submit_barter_counter', {
    p_proposal_id: proposalId,
    ...draftPayload(draft),
  })
  if (error) return { ok: false, versionNo: null, error }
  return { ok: true, versionNo: (data as number | null) ?? null, error: null }
}

/**
 * Accept the terms on the table. Returns whether BOTH participants have now accepted them.
 *
 * The version is named so the server can check it is still the current one — if the other
 * provider changed the terms in between, this is refused rather than recording agreement to
 * something that is no longer offered.
 */
export async function acceptVersion(
  versionId: string,
): Promise<{ ok: boolean; bothAccepted: boolean; error: unknown }> {
  const { data, error } = await supabase.rpc('accept_barter_version', {
    p_version_id: versionId,
  })
  if (error) return { ok: false, bothAccepted: false, error }
  return { ok: true, bothAccepted: data === true, error: null }
}

// Re-exported so a screen takes the negotiation vocabulary from one import. Tests and pure
// modules must import from './negotiationState' directly — coming through here pulls in the
// Supabase client and needs live configuration to run.
export type { ProposalDraft, ProposalSide, TradeSide } from './negotiationState'

/**
 * Make the agreement official. Returns the agreement id — the EXISTING one if this negotiation
 * was already confirmed, so a double tap or a second device cannot create a duplicate.
 *
 * Only the negotiation is named. The server derives and re-verifies the caller, the current
 * version, both acceptances and the post, and closes the post in the same transaction.
 */
export async function finalizeAgreement(
  proposalId: string,
): Promise<{ ok: boolean; agreementId: string | null; error: unknown }> {
  const { data, error } = await supabase.rpc('finalize_barter_agreement', {
    p_proposal_id: proposalId,
  })
  if (error) return { ok: false, agreementId: null, error }
  return { ok: true, agreementId: (data as string | null) ?? null, error: null }
}

/**
 * Mark an obligation delivered. Only the obligation is named: the server derives that the
 * caller is its deliverer and stamps the time itself, so a client cannot mark the
 * counterparty's obligation delivered or supply its own `delivered_at`.
 *
 * IDEMPOTENT. A second attempt returns the state that already exists and re-stamps nothing.
 */
export async function markObligationDelivered(
  obligationId: string,
): Promise<{ ok: boolean; status: ObligationStatus | null; error: unknown }> {
  const { data, error } = await supabase.rpc('mark_barter_obligation_delivered', {
    p_obligation_id: obligationId,
  })
  if (error) return { ok: false, status: null, error }
  return { ok: true, status: (data as ObligationStatus | null) ?? null, error: null }
}

/**
 * The receiver confirms they received the delivery. Refused before delivery, refused for
 * anyone but the receiver, and refused if a different answer is already recorded.
 */
export async function confirmObligationReceived(
  obligationId: string,
): Promise<{ ok: boolean; status: ObligationStatus | null; error: unknown }> {
  const { data, error } = await supabase.rpc('confirm_barter_obligation_received', {
    p_obligation_id: obligationId,
  })
  if (error) return { ok: false, status: null, error }
  return { ok: true, status: (data as ObligationStatus | null) ?? null, error: null }
}

/**
 * The receiver records that they did not receive the delivery.
 *
 * This records a STATEMENT and nothing else. It does not cancel, adjudicate, mark the
 * obligation unfulfilled or change the agreement — none of which exist yet.
 */
export async function reportObligationNotReceived(
  obligationId: string,
): Promise<{ ok: boolean; status: ObligationStatus | null; error: unknown }> {
  const { data, error } = await supabase.rpc('report_barter_obligation_not_received', {
    p_obligation_id: obligationId,
  })
  if (error) return { ok: false, status: null, error }
  return { ok: true, status: (data as ObligationStatus | null) ?? null, error: null }
}

/**
 * The receiver reports that a SCHEDULED service did not happen.
 *
 * Only the obligation and an optional reason are sent. The server derives that the caller is
 * its receiver, reads the appointment from the obligation, stamps the time against its OWN
 * clock, and refuses before the scheduled time — so a device with a wrong clock cannot bring an
 * appointment forward, and nobody can file in another participant's name.
 *
 * This records a REPORTED EVENT and routes the trade into the derived Under Review state. It
 * decides no fault, creates no outcome, touches no reputation and does not erase or contradict
 * `delivered_at` — a report and a delivery record simply both stand.
 *
 * IDEMPOTENT. A repeat returns the ORIGINAL timestamp and does not overwrite the original
 * report or its reason.
 */
export async function reportObligationNoShow(
  obligationId: string,
  reason?: string | null,
): Promise<{ ok: boolean; reportedAt: string | null; error: unknown }> {
  const { data, error } = await supabase.rpc('report_barter_obligation_no_show', {
    p_obligation_id: obligationId,
    p_reason: reason ?? null,
  })
  if (error) return { ok: false, reportedAt: null, error }
  return { ok: true, reportedAt: (data as string | null) ?? null, error: null }
}

/**
 * Cancel a confirmed trade before either side has delivered, or record that you agree with a
 * cancellation the other provider started.
 *
 * ONE call for both, because they are the same act: each participant records their own
 * cancellation, and the server decides from how many exist whether the trade is cancelled by
 * one participant or mutually cancelled. The client names the trade and, optionally, a reason;
 * it cannot supply who is acting, which provider that is, when it happened, or whether the
 * result is mutual.
 *
 * IDEMPOTENT per participant: a repeat returns the existing classification and overwrites
 * neither the original time nor the original reason.
 */
export async function cancelTrade(
  agreementId: string,
  reason: string | null,
): Promise<{ ok: boolean; state: TradeCancellationResult | null; error: unknown }> {
  const { data, error } = await supabase.rpc('cancel_barter_agreement', {
    p_agreement_id: agreementId,
    p_reason: reason,
  })
  if (error) return { ok: false, state: null, error }
  return { ok: true, state: (data as TradeCancellationResult | null) ?? null, error: null }
}

// No `interpretWrite` here, deliberately. That helper exists for a PostgREST write FILTERED to
// zero rows by an RLS USING clause; every negotiation write is an RPC returning a scalar, and
// these tables have no write policy or grant at all, so the zero-row case cannot arise. An
// alias "kept for symmetry" only invites the next contributor to report an RPC error as a
// filtered write.
