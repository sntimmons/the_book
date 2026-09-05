-- Slice 3a — PROPOSAL / VERSIONING FOUNDATION.
--
-- Adds the machinery for two providers to negotiate concrete terms inside an accepted barter
-- interest, and to both explicitly accept the same version of those terms.
--
-- WHAT THIS SLICE DELIBERATELY DOES NOT BUILD. There is no obligation, fulfilment, delivery,
-- confirmation-window, adjudication or cancellation-after-agreement schema here, and nothing
-- closes the sourcing post. "Both parties have accepted the current version" is recorded as a
-- FACT and exposed for reading; turning that fact into an official agreement -- and closing the
-- post permanently, per PD-049 -- is the next bounded slice. The seam is
-- `my_barter_proposals.both_accepted`: it is derived, never stored, so this slice cannot be
-- mistaken for having finalised anything.
--
-- ── Shape, and why ──────────────────────────────────────────────────────────
--
-- ONE PROPOSAL PER ACCEPTED INTEREST. A counter is a new VERSION of the same proposal, not a
-- new proposal, so the proposal row IS the negotiation's durable identity. A separate
-- "negotiations" parent would carry the same key (`interest_id`) and the same lifetime, so it
-- would be a second name for one thing.
--
-- LIFECYCLE IS NOT DUPLICATED. There is no `status` column here. Whether a negotiation is live
-- is already answered by `barter_interests.status` ('accepted' = live, 'released' = ended), and
-- a second copy would be a second thing to keep in sync and a second thing to disagree. Every
-- RPC re-reads the interest.
--
-- TERMS ARE ROWS, NOT A BLOB. `barter_proposal_terms` is the authoritative negotiated-term
-- model: it can be constrained, queried and validated. `post_snapshot` stays JSONB precisely
-- because it is the opposite kind of thing -- historical source context, never negotiated,
-- never read as authority.
--
-- CURRENT-VERSION TRUTH LIVES ON THE PARENT. `barter_proposals.current_version_no` is the one
-- serialisation point: every mutation locks that row `for update`, so counters cannot race each
-- other and an acceptance cannot land against a version that stopped being current mid-flight.
-- Supersession is DERIVED (`version_no < current_version_no`) rather than stamped on the
-- version, which keeps versions genuinely immutable -- nothing ever writes to one after insert.
--
-- ACCEPTANCES ARE HISTORY, NOT STATE. A new version does not delete prior acceptance rows; it
-- moves `current_version_no` past them, so they stop counting. "Who accepted what, and when"
-- survives, and "is this negotiation agreed" is a question about the CURRENT version only.

-- ── 1. The proposal: one per accepted interest ───────────────────────────────
create table if not exists public.barter_proposals (
  id uuid primary key default gen_random_uuid(),
  -- UNIQUE: the negotiation slot is one-per-post (PD-049) and one-per-accepted-interest here.
  -- This is what makes duplicate initial creation a constraint violation rather than a race.
  interest_id uuid not null unique references public.barter_interests(id) on delete restrict,
  offer_id uuid not null references public.barter_offers(id) on delete restrict,
  -- Denormalised participants. Derivable from offer+interest, kept here so the child tables'
  -- RLS policies are ONE hop rather than three. Safe because both are set by a definer function
  -- from the offer and interest rows, are asserted against them at creation, and are immutable
  -- afterwards (enforce_barter_proposal_immutable). B5B pins that they still agree.
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  responder_user_id uuid not null references auth.users(id) on delete restrict,
  current_version_no integer not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint barter_proposals_distinct_participants check (owner_user_id <> responder_user_id),
  constraint barter_proposals_version_no_positive check (current_version_no >= 1)
);

create index if not exists barter_proposals_owner_idx on public.barter_proposals (owner_user_id);
create index if not exists barter_proposals_responder_idx
  on public.barter_proposals (responder_user_id);

-- ── 2. Versions: immutable, monotonic, server-authored ───────────────────────
create table if not exists public.barter_proposal_versions (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null references public.barter_proposals(id) on delete restrict,
  -- Monotonic per proposal. The unique constraint is what makes a forged or duplicated version
  -- number a hard failure rather than a silently accepted reordering, even if a future caller
  -- reaches this table without the parent lock.
  version_no integer not null,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  -- Historical source context: what the public post said when this version was authored. The
  -- post stays editable (PD-047), so this is the only durable record of what was on the board.
  -- NEVER read as authority for the negotiated terms; those are in barter_proposal_terms.
  post_snapshot jsonb not null,
  constraint barter_proposal_versions_no_positive check (version_no >= 1),
  constraint barter_proposal_versions_unique_no unique (proposal_id, version_no)
);

create index if not exists barter_proposal_versions_proposal_idx
  on public.barter_proposal_versions (proposal_id, version_no desc);
-- Supports the rolling rate-limit count without scanning a proposal's whole history.
create index if not exists barter_proposal_versions_author_recent_idx
  on public.barter_proposal_versions (proposal_id, author_user_id, created_at desc);

-- ── 3. Terms: the authoritative negotiated model, as rows ────────────────────
create table if not exists public.barter_proposal_terms (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.barter_proposal_versions(id) on delete restrict,
  -- Which side of the trade provides this. 'owner' is the post owner; 'responder' is the
  -- provider whose interest was accepted.
  provided_by text not null,
  service_description text not null,
  estimated_value integer,
  sort_order integer not null default 0,
  constraint barter_proposal_terms_side_check check (provided_by in ('owner', 'responder')),
  constraint barter_proposal_terms_description_check
    check (char_length(service_description) between 1 and 200),
  constraint barter_proposal_terms_value_check
    check (estimated_value is null or (estimated_value >= 0 and estimated_value <= 1000000))
);

create index if not exists barter_proposal_terms_version_idx
  on public.barter_proposal_terms (version_id, sort_order);

-- ── 4. Acceptances: participant-bound, version-bound, server-stamped ─────────
create table if not exists public.barter_version_acceptances (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.barter_proposal_versions(id) on delete restrict,
  participant_user_id uuid not null references auth.users(id) on delete restrict,
  accepted_at timestamptz not null default clock_timestamp(),
  -- One acceptance per participant per version. This is what makes a repeated accept
  -- IDEMPOTENT rather than a double-count, without the RPC having to read-then-write.
  constraint barter_version_acceptances_once unique (version_id, participant_user_id)
);

create index if not exists barter_version_acceptances_participant_idx
  on public.barter_version_acceptances (participant_user_id);

-- ── 5. Immutability ─────────────────────────────────────────────────────────
-- Versions, terms and acceptances are written once and never edited. These are ALLOW-LIST
-- style guards expressed as outright refusals, because there is no column any of these tables
-- should ever accept an update to -- a column added later is immutable by default rather than
-- by remembering to add it here.
create or replace function public.enforce_barter_negotiation_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- service_role and the no-JWT maintenance path, matching every sibling guard on the barter
  -- tables (see PD-051: operational recovery only, never an end-user capability).
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return coalesce(new, old);
  end if;
  raise exception 'Negotiation history is append-only; it cannot be edited or deleted.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_barter_negotiation_append_only() owner to postgres;
revoke all on function public.enforce_barter_negotiation_append_only() from public, anon;

drop trigger if exists barter_proposal_versions_append_only on public.barter_proposal_versions;
create trigger barter_proposal_versions_append_only
  before update or delete on public.barter_proposal_versions
  for each row execute function public.enforce_barter_negotiation_append_only();

drop trigger if exists barter_proposal_terms_append_only on public.barter_proposal_terms;
create trigger barter_proposal_terms_append_only
  before update or delete on public.barter_proposal_terms
  for each row execute function public.enforce_barter_negotiation_append_only();

drop trigger if exists barter_version_acceptances_append_only on public.barter_version_acceptances;
create trigger barter_version_acceptances_append_only
  before update or delete on public.barter_version_acceptances
  for each row execute function public.enforce_barter_negotiation_append_only();

-- The proposal row is NOT append-only: `current_version_no` advances. Everything else on it is
-- identity and must never move -- a proposal that could be re-pointed at another interest would
-- carry its whole accepted history to a different negotiation.
create or replace function public.enforce_barter_proposal_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return new;
  end if;
  -- Set difference, so a column added by a later slice is immutable by DEFAULT and has to be
  -- named here deliberately to become mutable.
  if (to_jsonb(new) - 'current_version_no') is distinct from (to_jsonb(old) - 'current_version_no') then
    raise exception 'Only the current version pointer may change on a proposal.'
      using errcode = 'check_violation';
  end if;
  -- And it only ever advances. A pointer that could move backwards would resurrect a
  -- superseded version's acceptances as current.
  if new.current_version_no <= old.current_version_no then
    raise exception 'The current version pointer only moves forward.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_barter_proposal_immutable() owner to postgres;
revoke all on function public.enforce_barter_proposal_immutable() from public, anon;

drop trigger if exists barter_proposals_immutable on public.barter_proposals;
create trigger barter_proposals_immutable
  before update on public.barter_proposals
  for each row execute function public.enforce_barter_proposal_immutable();

-- ── 6. RLS and grants: read as a participant, write only through the RPCs ────
alter table public.barter_proposals enable row level security;
alter table public.barter_proposal_versions enable row level security;
alter table public.barter_proposal_terms enable row level security;
alter table public.barter_version_acceptances enable row level security;

-- NO insert/update/delete policy exists on any of these tables, deliberately. Every mutation
-- goes through a SECURITY DEFINER RPC that derives the caller from auth.uid(), so a direct
-- PostgREST write has no policy to satisfy and affects zero rows. The table grants below say
-- the same thing a second way, so neither layer is load-bearing alone.
drop policy if exists barter_proposals_participant_read on public.barter_proposals;
create policy barter_proposals_participant_read on public.barter_proposals
  for select to authenticated
  using (owner_user_id = (select auth.uid()) or responder_user_id = (select auth.uid()));

drop policy if exists barter_proposal_versions_participant_read on public.barter_proposal_versions;
create policy barter_proposal_versions_participant_read on public.barter_proposal_versions
  for select to authenticated
  using (exists (
    select 1 from public.barter_proposals p
     where p.id = barter_proposal_versions.proposal_id
       and ((select auth.uid()) in (p.owner_user_id, p.responder_user_id))
  ));

drop policy if exists barter_proposal_terms_participant_read on public.barter_proposal_terms;
create policy barter_proposal_terms_participant_read on public.barter_proposal_terms
  for select to authenticated
  using (exists (
    select 1 from public.barter_proposal_versions v
      join public.barter_proposals p on p.id = v.proposal_id
     where v.id = barter_proposal_terms.version_id
       and ((select auth.uid()) in (p.owner_user_id, p.responder_user_id))
  ));

drop policy if exists barter_version_acceptances_participant_read on public.barter_version_acceptances;
create policy barter_version_acceptances_participant_read on public.barter_version_acceptances
  for select to authenticated
  using (exists (
    select 1 from public.barter_proposal_versions v
      join public.barter_proposals p on p.id = v.proposal_id
     where v.id = barter_version_acceptances.version_id
       and ((select auth.uid()) in (p.owner_user_id, p.responder_user_id))
  ));

-- Supabase's ALTER DEFAULT PRIVILEGES grants ALL on new tables at CREATE time -- to
-- `authenticated` as well as `anon` -- so an explicit per-object revoke naming BOTH is
-- required. Revoking from `public, anon` alone leaves `authenticated` holding INSERT, UPDATE
-- and DELETE, and RLS is then the only thing standing between a client and these tables. That
-- is not a hole (no write policy exists, so a direct write affects zero rows), but it is one
-- layer where the design intends two.
revoke all on table public.barter_proposals from public, anon, authenticated;
revoke all on table public.barter_proposal_versions from public, anon, authenticated;
revoke all on table public.barter_proposal_terms from public, anon, authenticated;
revoke all on table public.barter_version_acceptances from public, anon, authenticated;

-- SELECT only, granted back deliberately. An authenticated caller now has no write path to
-- these tables at the GRANT layer, independently of RLS.
grant select on table public.barter_proposals to authenticated;
grant select on table public.barter_proposal_versions to authenticated;
grant select on table public.barter_proposal_terms to authenticated;
grant select on table public.barter_version_acceptances to authenticated;

-- ── 7. Shared internals ─────────────────────────────────────────────────────
-- Resolve the caller's role in a negotiation from the interest and offer, and refuse anyone
-- who is not one of the two participants. Returns the offer and interest rows the caller
-- already needs, so no RPC re-reads them and they cannot disagree about who is who.
--
-- Takes the interest row ALREADY LOCKED by the caller: the lock ordering is interest -> offer
-- -> proposal in every RPC, so two RPCs can never take them in opposite orders.
create or replace function public.barter_negotiation_role(
  p_interest public.barter_interests,
  p_offer public.barter_offers,
  p_uid uuid
)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_uid is null then null
    when p_offer.user_id = p_uid then 'owner'
    when p_interest.interested_user_id = p_uid then 'responder'
  end;
$$;

alter function public.barter_negotiation_role(
  public.barter_interests, public.barter_offers, uuid) owner to postgres;
revoke all on function public.barter_negotiation_role(
  public.barter_interests, public.barter_offers, uuid) from public, anon;

-- Validate and write one version's terms. Raises rather than clamping: terms are the
-- authoritative negotiated model, so a malformed submission must fail loudly, not be silently
-- reshaped into something neither party proposed.
create or replace function public.write_barter_proposal_terms(p_version_id uuid, p_terms jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_owner_sides integer;
  v_responder_sides integer;
begin
  if p_terms is null or jsonb_typeof(p_terms) <> 'array' then
    raise exception 'Terms must be a list.' using errcode = 'check_violation';
  end if;
  v_count := jsonb_array_length(p_terms);
  if v_count < 2 or v_count > 6 then
    raise exception 'A proposal needs between 2 and 6 terms.' using errcode = 'check_violation';
  end if;

  insert into public.barter_proposal_terms
    (version_id, provided_by, service_description, estimated_value, sort_order)
  select
    p_version_id,
    t.value ->> 'provided_by',
    btrim(t.value ->> 'service_description'),
    nullif(t.value ->> 'estimated_value', '')::integer,
    (t.ordinality - 1)::integer
  from jsonb_array_elements(p_terms) with ordinality as t(value, ordinality);

  -- A barter has TWO sides. A "trade" where one party provides everything is not a trade, and
  -- the check constraints on the table cannot see across rows.
  select count(*) filter (where provided_by = 'owner'),
         count(*) filter (where provided_by = 'responder')
    into v_owner_sides, v_responder_sides
    from public.barter_proposal_terms where version_id = p_version_id;
  if v_owner_sides = 0 or v_responder_sides = 0 then
    raise exception 'A proposal must say what each provider gives.'
      using errcode = 'check_violation';
  end if;
  return v_count;
end;
$$;

alter function public.write_barter_proposal_terms(uuid, jsonb) owner to postgres;
revoke all on function public.write_barter_proposal_terms(uuid, jsonb) from public, anon;

-- The rolling submission cap: 20 versions per participant, per negotiation, per 24 hours.
--
-- Counted from the version rows THEMSELVES, which is the opposite of what the interest limiter
-- does (that one counts `rate_limit_log`, because interests can be deleted and resent). Safe
-- here for a structural reason, not a stylistic one: versions are append-only by trigger and
-- carry no delete path for any authenticated caller, so the window cannot be reset.
create or replace function public.assert_barter_version_budget(p_proposal_id uuid, p_uid uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_max constant integer := 20;
begin
  select count(*) into v_count
    from public.barter_proposal_versions v
   where v.proposal_id = p_proposal_id
     and v.author_user_id = p_uid
     and v.created_at > clock_timestamp() - interval '24 hours';
  if v_count >= v_max then
    raise exception 'You have sent the maximum number of proposals for this trade today.'
      using errcode = 'check_violation';
  end if;
end;
$$;

alter function public.assert_barter_version_budget(uuid, uuid) owner to postgres;
revoke all on function public.assert_barter_version_budget(uuid, uuid) from public, anon;

-- What the public post said when a version was authored. Captured per version, so editing the
-- post later cannot rewrite any existing version's context (PD-047).
create or replace function public.barter_post_snapshot(p_offer public.barter_offers)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'offer_id', p_offer.id,
    'offering_service', p_offer.offering_service,
    'seeking_service', p_offer.seeking_service,
    'offering_value', p_offer.offering_value,
    'notes', p_offer.notes,
    'is_active', p_offer.is_active,
    'captured_at', clock_timestamp()
  );
$$;

alter function public.barter_post_snapshot(public.barter_offers) owner to postgres;
revoke all on function public.barter_post_snapshot(public.barter_offers) from public, anon;

-- ── 8. create_barter_proposal ───────────────────────────────────────────────
-- Contract: (p_interest_id, p_terms) -> proposal id.
-- Refuses: not authenticated; interest missing; caller not a participant (42501); interest not
-- accepted, i.e. pending/declined/released (55000); a proposal already exists (23505 surfaced
-- as 55000 for the idempotent-read case).
create or replace function public.create_barter_proposal(p_interest_id uuid, p_terms jsonb)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_role text;
  v_proposal_id uuid;
  v_version_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  -- LOCK THE INTEREST FIRST, and hold it for the whole transaction. This is what makes
  -- "proposal creation races with interest release" decidable: release_barter_interest updates
  -- this same row, so one of the two blocks and then observes the other's committed state.
  select i.* into v_interest from public.barter_interests i
   where i.id = p_interest_id for update;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  select o.* into v_offer from public.barter_offers o where o.id = v_interest.offer_id;
  if not found then
    raise exception 'That post no longer exists.' using errcode = 'check_violation';
  end if;

  v_role := public.barter_negotiation_role(v_interest, v_offer, v_uid);
  if v_role is null then
    -- DISTINCT from the state refusals below: "you are not in this negotiation" and "this
    -- negotiation is over" are different facts and the client must not conflate them.
    raise exception 'Only the two providers in a negotiation can propose terms.'
      using errcode = 'insufficient_privilege';
  end if;

  -- No cold proposals. `accepted` is the only live state; `released` means the negotiation
  -- ended before any agreement (PD-049) and nothing may be added to it afterwards.
  if v_interest.status <> 'accepted' then
    raise exception 'This negotiation is not active, so terms cannot be proposed.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- DEFENSE IN DEPTH, mirroring accept_barter_interest: running as postgres with RLS off,
  -- nothing else here re-establishes that these provider rows belong to the users about to be
  -- bound into a proposal.
  if not exists (
    select 1 from public.providers p
     where p.id = v_offer.provider_id and p.user_id = v_offer.user_id
  ) or not exists (
    select 1 from public.providers p
     where p.id = v_interest.interested_provider_id
       and p.user_id = v_interest.interested_user_id
  ) then
    raise exception 'Offer or response identity is inconsistent; cannot open a negotiation.'
      using errcode = 'internal_error';
  end if;

  insert into public.barter_proposals
    (interest_id, offer_id, owner_user_id, responder_user_id, current_version_no)
  values (p_interest_id, v_offer.id, v_offer.user_id, v_interest.interested_user_id, 1)
  returning id into v_proposal_id;

  perform public.assert_barter_version_budget(v_proposal_id, v_uid);

  insert into public.barter_proposal_versions
    (proposal_id, version_no, author_user_id, post_snapshot)
  values (v_proposal_id, 1, v_uid, public.barter_post_snapshot(v_offer))
  returning id into v_version_id;

  perform public.write_barter_proposal_terms(v_version_id, p_terms);

  -- AUTHORING IS NOT ACCEPTANCE (rule 6). The author gets no acceptance row here; they accept
  -- their own version by calling accept_barter_version like anyone else. Making authoring
  -- implicit acceptance would mean a counter silently re-accepted on the counterer's behalf,
  -- and "both accepted" would stop meaning two deliberate acts.
  return v_proposal_id;
exception
  when unique_violation then
    -- The one-per-interest constraint. Concurrent duplicate creation lands here rather than
    -- producing two negotiations for one accepted response.
    raise exception 'A negotiation is already open for this response.'
      using errcode = 'object_not_in_prerequisite_state';
end;
$$;

alter function public.create_barter_proposal(uuid, jsonb) owner to postgres;
revoke all on function public.create_barter_proposal(uuid, jsonb) from public, anon;
grant execute on function public.create_barter_proposal(uuid, jsonb) to authenticated;

-- ── 9. submit_barter_counter ────────────────────────────────────────────────
-- Contract: (p_proposal_id, p_terms) -> the new version's number.
-- The client does NOT supply the version number, the author, or the timestamp. Supplying a
-- version number is how a caller would overwrite history or reorder it; all three are derived.
create or replace function public.submit_barter_counter(p_proposal_id uuid, p_terms jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_proposal public.barter_proposals%rowtype;
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_role text;
  v_next integer;
  v_version_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  -- Same lock ORDER as every other RPC here: interest, then offer, then proposal. Taking them
  -- in a consistent order across all three entry points is what stops two callers deadlocking
  -- by each holding what the other needs.
  select p.* into v_proposal from public.barter_proposals p where p.id = p_proposal_id;
  if not found then
    raise exception 'That negotiation no longer exists.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i
   where i.id = v_proposal.interest_id for update;
  select o.* into v_offer from public.barter_offers o where o.id = v_proposal.offer_id;

  v_role := public.barter_negotiation_role(v_interest, v_offer, v_uid);
  if v_role is null then
    raise exception 'Only the two providers in a negotiation can propose terms.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_interest.status <> 'accepted' then
    raise exception 'This negotiation is not active, so terms cannot be proposed.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- THE serialisation point. Two simultaneous counters both reach here; one waits, then reads
  -- the other's committed current_version_no and takes the next number after it. Without this
  -- both would compute the same next number and the unique index would turn a legitimate
  -- counter into an error the user cannot act on.
  select p.* into v_proposal from public.barter_proposals p
   where p.id = p_proposal_id for update;

  perform public.assert_barter_version_budget(p_proposal_id, v_uid);

  v_next := v_proposal.current_version_no + 1;

  insert into public.barter_proposal_versions
    (proposal_id, version_no, author_user_id, post_snapshot)
  values (p_proposal_id, v_next, v_uid, public.barter_post_snapshot(v_offer))
  returning id into v_version_id;

  perform public.write_barter_proposal_terms(v_version_id, p_terms);

  -- Advancing the pointer is what INVALIDATES prior acceptances (rule 5). The acceptance rows
  -- are not touched -- they remain the true record of who accepted version N -- they simply
  -- stop being acceptances of the CURRENT version.
  update public.barter_proposals set current_version_no = v_next where id = p_proposal_id;

  return v_next;
end;
$$;

alter function public.submit_barter_counter(uuid, jsonb) owner to postgres;
revoke all on function public.submit_barter_counter(uuid, jsonb) from public, anon;
grant execute on function public.submit_barter_counter(uuid, jsonb) to authenticated;

-- ── 10. accept_barter_version ───────────────────────────────────────────────
-- Contract: (p_version_id) -> true when BOTH participants have now accepted this version.
--
-- The version is named by the caller and then CHECKED against the server's current-version
-- truth under lock. Trusting a client-supplied "current version" is exactly how an acceptance
-- lands on terms the other party has already moved past.
create or replace function public.accept_barter_version(p_version_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_version public.barter_proposal_versions%rowtype;
  v_proposal public.barter_proposals%rowtype;
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_role text;
  v_accepted integer;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select v.* into v_version from public.barter_proposal_versions v where v.id = p_version_id;
  if not found then
    raise exception 'Those terms no longer exist.' using errcode = 'check_violation';
  end if;

  select p.* into v_proposal from public.barter_proposals p where p.id = v_version.proposal_id;
  select i.* into v_interest from public.barter_interests i
   where i.id = v_proposal.interest_id for update;
  select o.* into v_offer from public.barter_offers o where o.id = v_proposal.offer_id;

  v_role := public.barter_negotiation_role(v_interest, v_offer, v_uid);
  if v_role is null then
    raise exception 'Only the two providers in a negotiation can accept terms.'
      using errcode = 'insufficient_privilege';
  end if;
  if v_interest.status <> 'accepted' then
    raise exception 'This negotiation is not active, so terms cannot be accepted.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- Re-read the pointer UNDER LOCK, after the version was read. This is the acceptance-races-
  -- a-counter case: if a counter commits between the two, this sees the advanced pointer and
  -- refuses, instead of recording agreement to terms that are no longer on the table.
  select p.* into v_proposal from public.barter_proposals p
   where p.id = v_version.proposal_id for update;

  if v_version.version_no <> v_proposal.current_version_no then
    -- A DISTINCT code, because this is not a permission problem and not a dead negotiation:
    -- the terms moved. The client must be able to say "these terms changed" and re-read.
    raise exception 'These terms have been replaced by a newer version.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- IDEMPOTENT by constraint, not by read-then-write: a repeat accept from the same
  -- participant does nothing and still reports the true both-accepted state.
  insert into public.barter_version_acceptances (version_id, participant_user_id)
  values (p_version_id, v_uid)
  on conflict (version_id, participant_user_id) do nothing;

  select count(*) into v_accepted
    from public.barter_version_acceptances a
   where a.version_id = p_version_id
     and a.participant_user_id in (v_proposal.owner_user_id, v_proposal.responder_user_id);

  -- Returns the FACT that both have accepted. It does not finalise anything: no agreement row
  -- is written and the sourcing post is not closed. That is the next slice, and keeping the
  -- seam a derived boolean is what stops this one quietly becoming it.
  return v_accepted >= 2;
end;
$$;

alter function public.accept_barter_version(uuid) owner to postgres;
revoke all on function public.accept_barter_version(uuid) from public, anon;
grant execute on function public.accept_barter_version(uuid) to authenticated;

-- ── 11. Reading a negotiation ───────────────────────────────────────────────
-- `security_invoker` so the participant read policies above are what scope these rows, rather
-- than the view's own WHERE being the only thing between a caller and someone else's trade.
create or replace view public.my_barter_proposals
with (security_invoker = true) as
select
  p.id                        as proposal_id,
  p.interest_id,
  p.offer_id,
  p.current_version_no,
  p.created_at,
  i.status                    as interest_status,
  o.is_active                 as offer_is_active,
  case when p.owner_user_id = (select auth.uid()) then 'owner' else 'responder' end as my_role,
  case when p.owner_user_id = (select auth.uid()) then p.responder_user_id
       else p.owner_user_id end as counterparty_user_id,
  cv.id                       as current_version_id,
  cv.author_user_id           as current_version_author_id,
  cv.created_at               as current_version_at,
  -- Acceptance of the CURRENT version only. Older acceptances are still in the table as
  -- history; they are not agreement to what is on the table now.
  exists (select 1 from public.barter_version_acceptances a
           where a.version_id = cv.id and a.participant_user_id = (select auth.uid()))
                              as i_accepted_current,
  exists (select 1 from public.barter_version_acceptances a
           where a.version_id = cv.id
             and a.participant_user_id = case when p.owner_user_id = (select auth.uid())
                                              then p.responder_user_id else p.owner_user_id end)
                              as they_accepted_current,
  -- THE SEAM. Both participants have accepted the current version. This slice records the
  -- fact; it does not act on it. Finalising an official agreement -- and closing the sourcing
  -- post permanently per PD-049 -- is the next slice, and must not be inferred from this flag
  -- having been true at some point.
  (select count(*) from public.barter_version_acceptances a
    where a.version_id = cv.id
      and a.participant_user_id in (p.owner_user_id, p.responder_user_id)) >= 2
                              as both_accepted
from public.barter_proposals p
join public.barter_interests i on i.id = p.interest_id
join public.barter_offers o on o.id = p.offer_id
join public.barter_proposal_versions cv
  on cv.proposal_id = p.id and cv.version_no = p.current_version_no
where p.owner_user_id = (select auth.uid()) or p.responder_user_id = (select auth.uid());

alter view public.my_barter_proposals owner to postgres;
revoke all on public.my_barter_proposals from public, anon;
grant select on public.my_barter_proposals to authenticated;
