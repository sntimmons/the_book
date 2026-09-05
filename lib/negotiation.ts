import { supabase } from './supabase'
import type { TermInput, TradeSide } from './negotiationState'
import { termsPayload } from './negotiationState'

// Barter negotiation data layer (Slice 3a). Reads come from `my_barter_proposals` and the three
// participant-scoped tables; every WRITE goes through a SECURITY DEFINER RPC, because the rules
// that matter — who may propose, which terms are current, who accepted — are decided from
// auth.uid() on the server and must not be re-derived here.
//
// There is no agreement, obligation or fulfilment model. `bothAccepted` is a recorded FACT, not
// a finalised trade.

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
}

export interface ProposalTerm {
  id: string
  versionId: string
  providedBy: TradeSide
  serviceDescription: string
  estimatedValue: number | null
  sortOrder: number
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

const ROW_COLUMNS =
  'proposal_id, interest_id, offer_id, current_version_no, current_version_id, current_version_author_id, current_version_at, interest_status, offer_is_active, my_role, counterparty_user_id, i_accepted_current, they_accepted_current, both_accepted'

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
  if (rowRes.error || versionRes.error) return { row: null, versions: [], ok: false }

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
      ok: true,
    }
  }

  const [termRes, acceptRes] = await Promise.all([
    supabase
      .from('barter_proposal_terms')
      .select('id, version_id, provided_by, service_description, estimated_value, sort_order')
      .in('version_id', versionIds)
      .order('sort_order', { ascending: true }),
    supabase
      .from('barter_version_acceptances')
      .select('version_id, participant_user_id')
      .in('version_id', versionIds),
  ])
  if (termRes.error || acceptRes.error) return { row: null, versions: [], ok: false }

  const terms = (termRes.data as unknown as {
    id: string
    version_id: string
    provided_by: TradeSide
    service_description: string
    estimated_value: number | null
    sort_order: number
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
        estimatedValue: t.estimated_value,
        sortOrder: t.sort_order,
      })),
    acceptedBy: accepts.filter((a) => a.version_id === v.id).map((a) => a.participant_user_id),
  }))

  return {
    row: rowRes.data ? mapRow(rowRes.data as unknown as RawRow) : null,
    versions,
    ok: true,
  }
}

/** Open a negotiation on an accepted response. The server refuses a cold or duplicate open. */
export async function createProposal(
  interestId: string,
  terms: TermInput[],
): Promise<{ ok: boolean; proposalId: string | null; error: unknown }> {
  const { data, error } = await supabase.rpc('create_barter_proposal', {
    p_interest_id: interestId,
    p_terms: termsPayload(terms),
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
  terms: TermInput[],
): Promise<{ ok: boolean; versionNo: number | null; error: unknown }> {
  const { data, error } = await supabase.rpc('submit_barter_counter', {
    p_proposal_id: proposalId,
    p_terms: termsPayload(terms),
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
export type { TermInput, TradeSide } from './negotiationState'

// No `interpretWrite` here, deliberately. That helper exists for a PostgREST write FILTERED to
// zero rows by an RLS USING clause; every negotiation write is an RPC returning a scalar, and
// these tables have no write policy or grant at all, so the zero-row case cannot arise. An
// alias "kept for symmetry" only invites the next contributor to report an RPC error as a
// filtered write.
