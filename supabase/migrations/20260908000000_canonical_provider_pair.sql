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
-- including `conversation_unique_pair`, which is untouched and still governs it.
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
  else
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
    if v_key is not null then
      select c.id into v_id from public.conversation c
       where c.provider_pair_key = v_key order by c.id limit 1;
    else
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
