-- Barter Slice 2B — canonical provider<->provider conversation identity.
--
-- Scope: conversation IDENTITY only. No agreement schema, no obligations, no multi-party
-- messaging, no conversation-members architecture, no booking-messaging semantic change.
--
-- THE DEFECT THIS CLOSES
-- `conversation` is asymmetric: `client_id` is an auth user id, `provider_id` is a
-- `providers` row id. For two providers A and B the same human pair therefore has TWO legal
-- representations:
--     (client_id = A.user_id, provider_id = B.provider_id)
--     (client_id = B.user_id, provider_id = A.provider_id)
-- These differ in BOTH columns, so `conversation_unique_pair (client_id, provider_id)` cannot
-- see that they are the same pair. Whichever orientation a code path happens to use decides
-- which thread it writes to:
--   * `getOrCreateConversation` resolves ONE orientation, so it creates a second row for a
--     pair that already has one;
--   * `accept_barter_interest` canonicalises by uuid order (Slice 2), so a barter match and a
--     later booking between the same two providers land in different threads;
--   * the parties then read half their history in one thread and half in the other, and
--     nothing in the schema records that the two are related.
-- Slice 3's agreement must point at ONE conversation. Settling this after that schema exists
-- means a data migration; settling it now is a column, a trigger and an index.
--
-- THE FIX
-- A server-owned canonical pair key, enforced by a partial unique index. The key is derived,
-- never supplied: a BEFORE trigger recomputes it on every insert and update and discards any
-- client-supplied value, so no direct API call can bypass canonicalisation. The key is NULL
-- for an ordinary client<->provider conversation, so the index does not constrain them and
-- their behaviour is unchanged.
--
-- The key is a CACHED DERIVATION of `providers`, and that is the subtle part. A conversation
-- written while its client was still an ordinary client carries a NULL key correctly -- and
-- must be RE-DERIVED when that user later becomes a provider, or the pair is left with nothing
-- reserving it. Section 2b does that on the providers write, and section 5 falls back to the
-- literal orientation so a resolver can never return NULL for a row it can see. Both were
-- found by review after the first version of this migration shipped neither: the invariant was
-- defeatable by ordinary use, with no race and no privileged access.
--
-- WHY A TRIGGER AND NOT A GENERATED COLUMN
-- A generated column may only reference the row's own columns. Deriving the key requires
-- resolving `client_id` (a user) to its `providers` row, which is a lookup. So the value is
-- maintained by a trigger instead -- and the trigger, unlike a column default, also governs
-- UPDATE, which is what makes the column non-forgeable.

-- ── 0. Pre-apply integrity checks ────────────────────────────────────────────
-- If a pair already holds both orientations, the unique index below cannot be created. Fail
-- LOUDLY and refuse to apply rather than half-applying, and do NOT merge or delete anybody's
-- conversation to make the index fit: which thread survives, and what happens to the messages
-- in the other, is a product decision and not this migration's to take.
do $$
declare
  v_collisions integer;
  v_rows integer;
begin
  with keyed as (
    select least(cp.id, c.provider_id)::text || ':' ||
           greatest(cp.id, c.provider_id)::text as k
      from public.conversation c
      join public.providers cp on cp.user_id = c.client_id
     where c.provider_id is not null
  ), dupes as (
    select k, count(*) n from keyed group by k having count(*) > 1
  )
  select count(*), coalesce(sum(n) - count(*), 0) into v_collisions, v_rows from dupes;

  if v_collisions > 0 then
    raise exception using
      errcode = 'check_violation',
      message = format(
        'REFUSING TO APPLY: %s provider pair(s) already hold more than one conversation ' ||
        '(%s row(s) beyond one per pair).', v_collisions, v_rows),
      hint = 'Reconcile those conversations under an explicit product decision about which '
          || 'thread survives and what happens to the messages in the other, then re-apply. '
          || 'This migration will not choose for you.';
  end if;
end $$;

-- ── 1. The canonical key column ──────────────────────────────────────────────
alter table public.conversation
  add column if not exists provider_pair_key text;

comment on column public.conversation.provider_pair_key is
  'Server-owned canonical identity for a provider<->provider pair: the two providers.id '
  'values ordered least:greatest. NULL for an ordinary client<->provider conversation. '
  'Derived by conversation_pair_key() on every write -- never client-supplied. Do not write '
  'this column directly; any value supplied is discarded.';

-- ── 2. The key is DERIVED, on every write ────────────────────────────────────
-- SECURITY DEFINER because the key must be identical no matter who writes the row. If this
-- read of `providers` were subject to the caller's RLS, a caller who could not see the
-- counterparty's provider row would compute a NULL key and slip past the unique index --
-- which would make the invariant depend on visibility rather than on identity.
--
-- Deliberately NO service_role escape. Every other guard on this table lets service_role
-- through, because those guards encode user-facing authorization. This one encodes a
-- structural invariant, and an invariant with an escape hatch is not an invariant: a
-- service_role write that set client_id or provider_id without recomputing the key would
-- leave a row whose key no longer describes it, and the index would stop protecting the pair.
create or replace function public.conversation_pair_key()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client_provider uuid;
begin
  -- Discard whatever was supplied FIRST, so every path below produces a server-derived value.
  new.provider_pair_key := null;

  if new.provider_id is not null then
    select p.id into v_client_provider
      from public.providers p
     where p.user_id = new.client_id;

    if v_client_provider is not null then
      new.provider_pair_key :=
        least(v_client_provider, new.provider_id)::text || ':' ||
        greatest(v_client_provider, new.provider_id)::text;
    end if;
  end if;

  return new;
end;
$$;

alter function public.conversation_pair_key() owner to postgres;
revoke all on function public.conversation_pair_key() from public, anon;

-- Name matters: triggers fire in NAME order, and `conversation_pair_key` sorts before
-- `enforce_conversation_insert` / `enforce_conversation_update` / `trg_no_self_conversation`.
-- The key is therefore already correct when the authorization guards run.
drop trigger if exists conversation_pair_key on public.conversation;
create trigger conversation_pair_key
  before insert or update on public.conversation
  for each row execute function public.conversation_pair_key();

-- ── 2b. The key is a CACHED derivation of `providers` — keep it live ────────
-- Without this, the invariant is defeatable by ordinary use, deterministically and with no
-- race. `conversation_pair_key` resolves client_id -> providers at the moment the CONVERSATION
-- is written. A conversation written while that user was still an ordinary client therefore
-- carries a NULL key forever, is absent from the partial index, and does NOT reserve the pair.
-- When that user later goes live as a provider -- a mainstream, approved product path -- two
-- things break: the reverse orientation can be inserted (giving the pair the two threads this
-- whole slice exists to prevent), and `resolve_conversation` misses the stale row by key,
-- fails to insert, and returns NULL, killing every "Message" button for that pair.
--
-- Recomputing on the providers write closes the window ATOMICALLY: in the same transaction
-- that creates the provider, every conversation in which that user sits in the client slot is
-- re-keyed. No reverse row can exist beforehand, because the counterparty could not have
-- referenced a providers row that did not yet exist -- so this update cannot collide.
create or replace function public.conversation_rekey_for_provider()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Setting the key to NULL is enough: the BEFORE trigger on `conversation` derives the real
  -- value. Writing the expression twice would be a second source of truth for the format.
  update public.conversation
     set provider_pair_key = null
   where client_id = new.user_id
     and provider_id is not null;
  return new;
end;
$$;

alter function public.conversation_rekey_for_provider() owner to postgres;
revoke all on function public.conversation_rekey_for_provider() from public, anon;

drop trigger if exists conversation_rekey_for_provider on public.providers;
create trigger conversation_rekey_for_provider
  after insert or update of user_id on public.providers
  for each row execute function public.conversation_rekey_for_provider();

-- ── 3. Backfill ──────────────────────────────────────────────────────────────
update public.conversation c
   set provider_pair_key =
         least(cp.id, c.provider_id)::text || ':' || greatest(cp.id, c.provider_id)::text
  from public.providers cp
 where cp.user_id = c.client_id
   and c.provider_id is not null
   and c.provider_pair_key is distinct from
         least(cp.id, c.provider_id)::text || ':' || greatest(cp.id, c.provider_id)::text;

-- ── 4. The invariant ─────────────────────────────────────────────────────────
-- PARTIAL, so it constrains provider<->provider pairs ONLY. An ordinary client<->provider
-- conversation has a NULL key, is not in the index, and keeps behaving exactly as before --
-- including `conversation_unique_pair`, which is untouched and still governs it. "Ordinary"
-- means the client is not a provider RIGHT NOW: the moment they become one, section 2b
-- re-derives the key and the pair joins the index.
create unique index if not exists conversation_one_per_provider_pair
  on public.conversation (provider_pair_key)
  where provider_pair_key is not null;

-- ── 5. The authoritative resolve-or-create path ──────────────────────────────
-- SECURITY INVOKER, deliberately. This function must not be able to read or create a
-- conversation the caller could not read or create themselves -- it exists to pick the RIGHT
-- row, not to grant access to one. Both parties of a provider pair are participants in BOTH
-- orientations, so the existing SELECT policy already shows them either row.
--
-- Booking attach is NOT done here. That logic stays exactly where it was, so this slice
-- changes which row a caller resolves to and nothing about what happens afterwards.
create or replace function public.resolve_conversation(
  p_client_id uuid,
  p_provider_id uuid,
  p_booking_id uuid default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_client_provider uuid;
  v_key text;
  v_id uuid;
begin
  if p_client_id is null or p_provider_id is null then
    raise exception 'A conversation needs both a client and a provider.'
      using errcode = 'check_violation';
  end if;

  select p.id into v_client_provider
    from public.providers p
   where p.user_id = p_client_id;

  if v_client_provider is not null then
    v_key := least(v_client_provider, p_provider_id)::text || ':' ||
             greatest(v_client_provider, p_provider_id)::text;
  end if;

  -- Resolve by the canonical key when there is one, so BOTH orientations find the same row.
  -- `order by c.id` for the same reason accept_barter_interest orders: an unordered limit 1
  -- could return a different row on a retry.
  if v_key is not null then
    select c.id into v_id from public.conversation c
     where c.provider_pair_key = v_key order by c.id limit 1;
  end if;

  -- ALWAYS fall back to the literal orientation. The key is a cached derivation, and a row
  -- written before its client became a provider can still be carrying a stale NULL. Section 2b
  -- keeps that from happening going forward; this makes the resolver correct even if it does,
  -- because returning NULL here blanks every "Message" button for the pair.
  if v_id is null then
    select c.id into v_id from public.conversation c
     where c.client_id = p_client_id and c.provider_id = p_provider_id
     order by c.id limit 1;
  end if;

  if v_id is not null then
    return v_id;
  end if;

  begin
    insert into public.conversation (client_id, provider_id, booking_id, created_at)
    values (p_client_id, p_provider_id, p_booking_id, clock_timestamp())
    returning id into v_id;
  exception when unique_violation then
    -- Someone created it between the select and the insert -- in EITHER orientation, which is
    -- precisely the race the old client-side recovery could not handle: it re-queried the one
    -- orientation it had just failed to insert, found nothing, and returned null.
    --
    -- TWO different constraints can raise here: conversation_one_per_provider_pair (the pair
    -- key) and conversation_unique_pair (the literal orientation). Recovering by key alone
    -- would still return NULL for the second, so both are re-queried.
    if v_key is not null then
      select c.id into v_id from public.conversation c
       where c.provider_pair_key = v_key order by c.id limit 1;
    end if;
    if v_id is null then
      select c.id into v_id from public.conversation c
       where c.client_id = p_client_id and c.provider_id = p_provider_id
       order by c.id limit 1;
    end if;
  end;

  return v_id;
end;
$$;

alter function public.resolve_conversation(uuid, uuid, uuid) owner to postgres;
revoke all on function public.resolve_conversation(uuid, uuid, uuid) from public, anon;
grant execute on function public.resolve_conversation(uuid, uuid, uuid) to authenticated;

-- ── 6. Booking attach must follow the pair, not the orientation ─────────────
-- Redefines enforce_conversation_update. Everything is carried through unchanged from
-- 20260907000000 EXCEPT the booking-ownership predicate; see the comment inside.
--
-- This slice created the problem it fixes here: by resolving to the canonical row rather than
-- the caller's orientation, it started handing the attach a row whose (client_id, provider_id)
-- legitimately do not match the booking's. The old predicate then refused, getOrCreateConversation
-- returned null, and every call site treats null as "do nothing".

create or replace function public.enforce_conversation_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_client boolean;
  v_is_provider boolean;
  v_barter_match boolean;
  v_handoff boolean;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.client_id is distinct from old.client_id
     or new.provider_id is distinct from old.provider_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Immutable conversation fields may not change.'
      using errcode = 'check_violation';
  end if;

  v_is_client := (auth.uid() = old.client_id);
  v_is_provider := exists (
    select 1 from public.providers p
    where p.id = old.provider_id and p.user_id = auth.uid()
  );

  if new.booking_id is distinct from old.booking_id then
    if old.booking_id is not null then
      raise exception 'A conversation''s booking may not be reassigned.'
        using errcode = 'check_violation';
    end if;
    if not (v_is_client or v_is_provider) then
      raise exception 'Only a participant may attach a booking.'
        using errcode = 'check_violation';
    end if;
    -- The booking must belong to THIS PAIR. Both orientations are accepted, and only those
    -- two: a conversation is now canonical for a provider pair, so the row's orientation is
    -- fixed by uuid order and need not match the direction the booking was made in. Checking
    -- only the literal orientation (as this did) meant a provider who booked their
    -- counterparty could never attach it -- resolve_conversation handed them the canonical row
    -- and this refused it, so the Message button died silently for half of all pairs.
    --
    -- The second arm is NOT a widening to "any booking involving either person". It requires
    -- the booking's client to be the provider ON this row, AND the booking's provider to be
    -- the provider owned by this row's client -- the same two humans, in the other direction.
    if not exists (
      select 1 from public.bookings b
      where b.id = new.booking_id
        and (
          (b.user_id = old.client_id and b.provider_id = old.provider_id)
          or (
            exists (select 1 from public.providers pb
                     where pb.id = old.provider_id and pb.user_id = b.user_id)
            and exists (select 1 from public.providers pc
                         where pc.id = b.provider_id and pc.user_id = old.client_id)
          )
        )
    ) then
      raise exception 'That booking does not belong to this conversation.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.request_status is distinct from old.request_status then
    -- Is there an accepted barter match between the two humans on this row? Both
    -- orientations are checked, because a barter thread is canonicalised by uuid order and
    -- need not put either party in a particular slot.
    v_barter_match := exists (
      select 1
      from public.barter_interests i
      join public.barter_offers o on o.id = i.offer_id
      join public.providers po on po.id = o.provider_id
      join public.providers pr on pr.id = i.interested_provider_id
      where i.status = 'accepted'
        and (
          (po.user_id = old.client_id and pr.id = old.provider_id)
          or (pr.user_id = old.client_id and po.id = old.provider_id)
        )
    );

    -- Is THIS statement the handoff RPC opening the thread it is itself creating or
    -- reusing? The RPC publishes the conversation id as a transaction-local GUC immediately
    -- before its update and clears it immediately after, so the marker is true only for that
    -- one statement. PostgREST runs each request in its own transaction and exposes only
    -- functions in the API schema over /rpc/, so a client cannot set this GUC in the same
    -- transaction as an UPDATE of its own -- which is what makes the carve-out below
    -- unreachable outside the RPC. This is a CONJUNCT, not a replacement: the barter-match
    -- evidence still has to hold. The marker answers "is this the handoff?", the evidence
    -- answers "is there really a match?", and both must be true.
    v_handoff := coalesce(current_setting('app.barter_handoff', true), '') = old.id::text;

    if old.booking_id is null and new.booking_id is not null
       and new.request_status = 'accepted' then
      null; -- booking supersedes (unchanged)
    elsif old.request_status = 'pending' and new.request_status in ('accepted', 'declined') then
      -- PRE-EXISTING RULE, kept FIRST so the barter carve-out can only ADD a transition and
      -- never intercept one. An earlier draft placed the carve-out above this branch, which
      -- -- because plpgsql if/elsif is first-match -- silently replaced this provider-only
      -- check with a participant check whenever a match existed. That was an undisclosed
      -- authorization widening on the messaging surface. The relaxation is now explicit,
      -- scoped to exactly the case the handoff needs, and applies ONLY to 'accepted':
      -- pending -> declined stays provider-only, unchanged.
      if not v_is_provider then
        if new.request_status = 'accepted' and v_is_client and v_barter_match and v_handoff then
          -- The accepting party can legitimately occupy the CLIENT slot: the barter thread
          -- key is canonical by uuid order, so which slot the offer owner lands in is not
          -- theirs to choose. Requires a real accepted match, same evidence gate as below.
          null;
        else
          raise exception 'Only the provider may accept or decline a request.'
            using errcode = 'check_violation';
        end if;
      end if;
    elsif v_handoff and v_barter_match and new.request_status = 'accepted'
          and old.request_status = 'declined' then
      -- BARTER MATCH SUPERSEDES A DECLINED REQUEST. Genuinely new: declined -> accepted was
      -- not a legal participant transition at all. Same shape as the booking rule above and
      -- gated on evidence in the database, not on who is asking.
      if not (v_is_client or v_is_provider) then
        raise exception 'Only a participant may open a matched barter conversation.'
          using errcode = 'check_violation';
      end if;
    elsif old.request_status = 'declined' and new.request_status = 'pending' then
      if not v_is_client then
        raise exception 'Only the client may re-open a declined request.'
          using errcode = 'check_violation';
      end if;
      new.request_opened_at := clock_timestamp();
    else
      raise exception 'Invalid request status transition.'
        using errcode = 'check_violation';
    end if;
  end if;

  if new.request_opened_at is distinct from old.request_opened_at
     and not (old.request_status = 'declined' and new.request_status = 'pending') then
    raise exception 'request_opened_at may not be changed directly.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

alter function public.enforce_conversation_update() owner to postgres;
revoke all on function public.enforce_conversation_update() from anon;

-- ── 7. Canonical LOOKUP (no create) ─────────────────────────────────────────
-- `findConversation` decides whether "Message" opens a thread or composes a new request. It
-- resolved a single orientation, so for a provider pair whose thread is stored the other way
-- round it reported "no thread", routed the user to a compose screen, and the insert that
-- followed hit conversation_one_per_provider_pair -- surfacing the raw Postgres constraint
-- text to the user, with no route to the thread that actually exists.
--
-- Read-only and SECURITY INVOKER: it must never reveal a conversation the caller could not
-- already read. Separate from resolve_conversation because this one must NOT create.
create or replace function public.find_conversation(
  p_client_id uuid,
  p_provider_id uuid
)
returns table (id uuid, request_status text, booking_id uuid)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_client_provider uuid;
  v_key text;
begin
  if p_client_id is null or p_provider_id is null then
    return;
  end if;

  select p.id into v_client_provider
    from public.providers p
   where p.user_id = p_client_id;

  if v_client_provider is not null then
    v_key := least(v_client_provider, p_provider_id)::text || ':' ||
             greatest(v_client_provider, p_provider_id)::text;

    return query
      select c.id, c.request_status, c.booking_id
        from public.conversation c
       where c.provider_pair_key = v_key
       order by c.id limit 1;
    if found then return; end if;
  end if;

  -- Literal orientation: the ordinary client<->provider case, and the fallback for a row
  -- whose key has not been derived yet.
  return query
    select c.id, c.request_status, c.booking_id
      from public.conversation c
     where c.client_id = p_client_id and c.provider_id = p_provider_id
     order by c.id limit 1;
end;
$$;

alter function public.find_conversation(uuid, uuid) owner to postgres;
revoke all on function public.find_conversation(uuid, uuid) from public, anon;
grant execute on function public.find_conversation(uuid, uuid) to authenticated;
