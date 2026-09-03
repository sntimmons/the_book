-- Barter Slice 1 — integrity hardening of the EXISTING barter surface.
--
-- Scope is deliberately narrow: this migration hardens `barter_offers` and
-- `barter_interests` as they exist today. It creates NO agreement schema, NO
-- obligation schema, and touches neither `bookings` nor the reviews surface.
-- Barter completion, trade history, notifications, blocking and reputation are
-- explicitly out of scope (Session 6 authorization).
--
-- Defects closed here (Session 4 audit + Session 5 agent review):
--   SEC-AUTHZ-001 (HIGH)  barter_interests_owner_update had USING and no WITH CHECK, so an
--                         offer owner could rewrite a counterparty's row wholesale --
--                         identity, message and acceptance status. One party could forge
--                         the other's consent.
--   SEC-AUTHZ-002 (HIGH)  Both INSERT policies tested "caller is SOME provider" with an
--                         unfiltered subquery that never bound provider_id /
--                         interested_provider_id to the caller. A caller could publish an
--                         offer, or express interest, under another provider's identity --
--                         the feed renders name/photo/category from those columns.
--   SEC-DATA-009 (HIGH)   An offer owner deleting their own post cascaded away every
--                         counterparty's interest row, destroying the other side's record
--                         with no tombstone.
--   SEC-DATA-006 (HIGH)   created_at was client-supplied (GRANT ALL), so every time-based
--                         control over these tables was advisory.
--   SEC-AUTHZ-008 (MED)   Nothing constrained an offer to one accepted interest; two
--                         concurrent accepts both committed.
--   SEC-TRUTH-005 (MED)   PARTIALLY closed. Interest inserts had no rate limit of any kind and
--                         now have one at the write boundary. OFFER creation is unchanged: its
--                         limiter is still the client-invoked, fail-open edge function, so a
--                         caller that omits the call is still unlimited on offers. Moving that
--                         one is not in Slice 1's authorization.
--   SEC-RLS-007  (LOW)    anon held GRANT ALL. Latent only (every policy pivots on
--                         auth.uid(), which is null for anon) but it is the documented
--                         ALTER DEFAULT PRIVILEGES trap this repo has hit before.
--
-- NOT changed here, on purpose:
--   * Provider ELIGIBILITY (is_approved). E-3 rules that `providers.is_approved` is the beta
--     eligibility gate, but gating barter on it changes who may participate, which is beyond
--     Slice 1's authorization. A seam is prepared -- `caller_provider_id()` below -- but be
--     precise about what it does and does not cover, because the next slice will act on this:
--       * It IS the single edit site for the three WRITE-identity policies (offers insert,
--         offers update, interests insert).
--       * It is NOT used by the two READ policies, which still carry the old
--         "caller is SOME provider" idiom from the canonical baseline. Gating reads is a
--         separate, deliberate decision.
--       * It is NOT used by the delete/owner-update policies, which pivot on auth.uid() alone.
--       * Adding `and p.is_approved` here would make caller_provider_id() NULL for a
--         de-approved provider, which would ALSO block them from closing their own live
--         offers (barter_offers_owner_update WITH CHECK). That lockout must be designed for
--         -- likely by a separate caller_eligible_provider_id() -- rather than discovered.
--   * updated_at / status-transition timestamps. Both presuppose a lifecycle vocabulary a
--     later slice may change.

-- ── 0. Pre-apply integrity checks ────────────────────────────────────────────
-- Sections 7 and 8 add unique indexes over data that was, by this migration's own account,
-- previously unconstrained; and sections 2-3 tighten identity binding without rewriting rows
-- written under the old policies. A bare index failure here would be a cryptic
-- "duplicate key value violates unique constraint" that aborts the migration and leaves the
-- database on the OLD, vulnerable policy set while the branch looks merged. Fail early
-- instead, naming what has to be remediated.
--
-- All three are expected to return zero on a database that has only ever been written
-- through the app. If any raises, remediate the rows and re-run — do NOT weaken the index.
do $$
declare v_n integer;
begin
  select count(*) into v_n from (
    select offer_id from public.barter_interests
     where status = 'accepted' group by offer_id having count(*) > 1
  ) d;
  if v_n > 0 then
    raise exception
      'Cannot add barter_interests_one_accepted_per_offer: % offer(s) already have more than one accepted response. Resolve them before applying.', v_n;
  end if;

  select count(*) into v_n from (
    select offer_id, interested_user_id from public.barter_interests
     group by offer_id, interested_user_id having count(*) > 1
  ) d;
  if v_n > 0 then
    raise exception
      'Cannot add barter_interests_one_per_offer_per_user: % (offer, user) pair(s) have duplicate responses. Resolve them before applying.', v_n;
  end if;

  -- Rows whose displayed provider identity is not owned by their author. These were writable
  -- under the old unfiltered policies. After sections 2-3 they become UNEDITABLE by their own
  -- author (the new WITH CHECK cannot be satisfied) while still rendering under the victim's
  -- name, so they must be dealt with before the tightening, not after.
  select count(*) into v_n from public.barter_offers o
    join public.providers p on p.id = o.provider_id
   where p.user_id <> o.user_id;
  if v_n > 0 then
    raise exception
      'Cannot tighten barter identity binding: % barter_offers row(s) carry a provider_id not owned by their author. Remediate (reassign or remove) before applying.', v_n;
  end if;

  select count(*) into v_n from public.barter_interests i
    join public.providers p on p.id = i.interested_provider_id
   where p.user_id <> i.interested_user_id;
  if v_n > 0 then
    raise exception
      'Cannot tighten barter identity binding: % barter_interests row(s) carry an interested_provider_id not owned by their author. Remediate before applying.', v_n;
  end if;
end $$;

-- ── 1. The one named identity predicate ──────────────────────────────────────
-- Every barter policy binds through this. It takes NO argument: it answers only
-- "which provider is the caller?", derived from auth.uid(), so nothing client-supplied
-- can enter the comparison. A function that accepted a provider id and "validated" it
-- would leave the forgery surface open in a new costume.
--
-- providers.user_id is UNIQUE, so the scalar is well defined. Returns NULL when the
-- caller has no provider row or is unauthenticated -- and NULL never equals anything,
-- so every policy using it fails closed.
--
-- SECURITY DEFINER because a policy on barter_* must resolve the caller's provider row
-- regardless of the reader's own visibility of `providers`. `providers` is already
-- publicly readable, so this widens nothing.
create or replace function public.caller_provider_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  -- Fail closed before any read when there is no authenticated caller.
  select case
    when (select auth.uid()) is null then null
    else (select p.id from public.providers p where p.user_id = (select auth.uid()))
  end;
  -- The eligibility conjunct (E-3: `and p.is_approved`) belongs HERE, in this one
  -- expression, when that slice is authorized.
$$;

alter function public.caller_provider_id() owner to postgres;
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE to anon at CREATE time, and
-- `revoke ... from public` does NOT remove that direct grant. Both are required.
revoke all on function public.caller_provider_id() from public;
revoke all on function public.caller_provider_id() from anon;
grant execute on function public.caller_provider_id() to authenticated;

-- ── 2. Identity binding on barter_offers ─────────────────────────────────────
drop policy if exists "barter_offers_provider_insert" on public.barter_offers;
create policy "barter_offers_provider_insert" on public.barter_offers
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and provider_id = (select public.caller_provider_id())
  );

-- UPDATE previously had USING and no WITH CHECK, so provider_id could be repointed at
-- another provider AFTER insert -- the same impersonation by a second route.
drop policy if exists "barter_offers_owner_update" on public.barter_offers;
create policy "barter_offers_owner_update" on public.barter_offers
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and provider_id = (select public.caller_provider_id())
  );

drop policy if exists "barter_offers_owner_delete" on public.barter_offers;
create policy "barter_offers_owner_delete" on public.barter_offers
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ── 3. Identity binding on barter_interests ──────────────────────────────────
drop policy if exists "barter_interests_provider_insert" on public.barter_interests;
create policy "barter_interests_provider_insert" on public.barter_interests
  for insert to authenticated
  with check (
    interested_user_id = (select auth.uid())
    and interested_provider_id = (select public.caller_provider_id())
  );

-- The offer owner may act on interests against their own offers. Which COLUMNS they may
-- change is enforced by the trigger in section 5 -- RLS is row-level and cannot restrict
-- columns, and a column-level GRANT cannot help either because the owner and the author
-- are both `authenticated`. The WITH CHECK here stops the row being moved to another
-- offer; the trigger stops everything else.
drop policy if exists "barter_interests_owner_update" on public.barter_interests;
create policy "barter_interests_owner_update" on public.barter_interests
  for update to authenticated
  using (
    (select auth.uid()) in (
      select o.user_id from public.barter_offers o where o.id = barter_interests.offer_id
    )
  )
  with check (
    (select auth.uid()) in (
      select o.user_id from public.barter_offers o where o.id = barter_interests.offer_id
    )
  );

-- A proposer may withdraw a PENDING interest of their own. Once it has been accepted it is
-- counterparty history and section 4's trigger refuses the delete.
drop policy if exists "barter_interests_own_delete" on public.barter_interests;
create policy "barter_interests_own_delete" on public.barter_interests
  for delete to authenticated
  using (interested_user_id = (select auth.uid()));

-- ── 4. Counterparty history is not destructible by one participant ───────────
-- Previously: barter_interests.offer_id REFERENCES barter_offers ON DELETE CASCADE, plus an
-- owner DELETE policy. One participant deleting their own post silently erased every other
-- provider's interest row -- their authored message and any accepted status included.
-- The offer owner keeps a non-destructive withdrawal path: is_active = false.
create or replace function public.enforce_barter_offer_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Two escapes, both required.
  --   * service_role: the established admin/server path.
  --   * NO authenticated caller at all: this trigger also fires on FK CASCADE deletes, and an
  --     account deletion initiated by GoTrue runs on a connection with no request.jwt.claims,
  --     so auth.role() is NULL there. Without this, deleting an auth.users row would abort on
  --     a barter guard and account erasure would be permanently blocked for anyone who used
  --     the board. A null caller cannot reach these tables directly -- anon holds no
  --     privilege (section 10) and both delete policies are TO authenticated -- so this
  --     widens nothing a participant can reach.
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return old;
  end if;
  if exists (select 1 from public.barter_interests i where i.offer_id = old.id) then
    raise exception
      'This offer has responses from other providers and cannot be deleted. Close it instead.'
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

alter function public.enforce_barter_offer_delete() owner to postgres;
revoke all on function public.enforce_barter_offer_delete() from public;
revoke all on function public.enforce_barter_offer_delete() from anon;

drop trigger if exists barter_offers_delete_guard on public.barter_offers;
create trigger barter_offers_delete_guard
  before delete on public.barter_offers
  for each row execute function public.enforce_barter_offer_delete();

-- A response becomes a shared record the moment it is answered. Its author may withdraw it
-- while PENDING; once it is accepted OR declined, neither side may erase it. (The Founder
-- ruling is "once another provider has interacted", so a decline counts as interaction and
-- the record is kept.) Note there is no withdraw affordance in the app today, so the
-- pending path is currently unreachable from the product.
create or replace function public.enforce_barter_interest_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Two escapes, both required.
  --   * service_role: the established admin/server path.
  --   * NO authenticated caller at all: this trigger also fires on FK CASCADE deletes, and an
  --     account deletion initiated by GoTrue runs on a connection with no request.jwt.claims,
  --     so auth.role() is NULL there. Without this, deleting an auth.users row would abort on
  --     a barter guard and account erasure would be permanently blocked for anyone who used
  --     the board. A null caller cannot reach these tables directly -- anon holds no
  --     privilege (section 10) and both delete policies are TO authenticated -- so this
  --     widens nothing a participant can reach.
  if (select auth.role()) = 'service_role' or (select auth.uid()) is null then
    return old;
  end if;
  if old.status <> 'pending' then
    raise exception 'Only a pending response can be withdrawn.'
      using errcode = 'check_violation';
  end if;
  return old;
end $$;

alter function public.enforce_barter_interest_delete() owner to postgres;
revoke all on function public.enforce_barter_interest_delete() from public;
revoke all on function public.enforce_barter_interest_delete() from anon;

drop trigger if exists barter_interests_delete_guard on public.barter_interests;
create trigger barter_interests_delete_guard
  before delete on public.barter_interests
  for each row execute function public.enforce_barter_interest_delete();

-- ── 5. Foreign-authored fields + legal state transitions ─────────────────────
-- The offer owner may change EXACTLY ONE column on a row they did not author: status.
-- Everything else on that row belongs to its author. Expressed as one named column set so
-- a later slice amends one line rather than hunting conditions inside a trigger body.
create or replace function public.enforce_barter_interest_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_offer_owner boolean;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- created_at is an enforcement boundary (rate windows, ordering), so it is
    -- SERVER-authoritative. A client-supplied value is discarded, not rejected --
    -- the app currently sends none, and silently correcting is the established
    -- house pattern for this column class.
    new.created_at := clock_timestamp();
    -- A response always begins pending. A client cannot craft a pre-accepted response.
    new.status := 'pending';
    -- A provider may not respond to their own offer. Server-authoritative: the UI must
    -- not be the thing preventing this.
    if exists (
      select 1 from public.barter_offers o
      where o.id = new.offer_id and o.user_id = v_uid
    ) then
      raise exception 'You cannot respond to your own offer.'
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  -- UPDATE.
  --
  -- Note on layering: barter_interests_owner_update restricts UPDATE to the offer owner at
  -- the RLS layer, and a row failing a USING clause is FILTERED rather than rejected -- the
  -- statement affects zero rows and raises nothing. So by the time this trigger runs, the
  -- caller is already known to be the offer owner. A "not a participant" branch here would
  -- be unreachable, and a test expecting it to raise would fail.
  --
  -- v_is_offer_owner is therefore re-derived as defence in depth, not as the primary
  -- control: if a later slice adds an author-side UPDATE policy (a responder withdrawing),
  -- this check starts doing real work and must be covered by a test at that time.
  v_is_offer_owner := exists (
    select 1 from public.barter_offers o
    where o.id = old.offer_id and o.user_id = v_uid
  );

  -- ALLOW-LIST, deliberately. `status` is the only mutable column; everything else on the
  -- row is immutable to everyone, including its author -- a response is a record of what
  -- was offered at a point in time, not an editable draft.
  --
  -- Expressed as a set difference rather than an enumeration of forbidden columns, so a
  -- column added by a later slice is immutable BY DEFAULT. An enumeration would let the
  -- next column (agreement_id, accepted_at, ...) be born writable by the offer owner on a
  -- counterparty's row -- reopening by omission exactly the class this migration closes.
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'Only the status of a response may change.'
      using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status then
    -- Only the offer owner decides the outcome of a response.
    if not v_is_offer_owner then
      raise exception 'Only the offer owner can accept or decline a response.'
        using errcode = 'check_violation';
    end if;
    -- Legal transitions, allow-listed. No permissive else branch: an unlisted transition
    -- is rejected rather than silently permitted.
    if not (old.status = 'pending' and new.status in ('accepted', 'declined')) then
      raise exception 'A response can only go from pending to accepted or declined.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end $$;

alter function public.enforce_barter_interest_write() owner to postgres;
revoke all on function public.enforce_barter_interest_write() from public;
revoke all on function public.enforce_barter_interest_write() from anon;

drop trigger if exists barter_interests_write_integrity on public.barter_interests;
create trigger barter_interests_write_integrity
  before insert or update on public.barter_interests
  for each row execute function public.enforce_barter_interest_write();

-- ── 6. Offer created_at is server-authoritative too ──────────────────────────
create or replace function public.enforce_barter_offer_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
    return new;
  end if;
  if new.id is distinct from old.id or new.created_at is distinct from old.created_at then
    raise exception 'Offer identity and creation time are not editable.'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

alter function public.enforce_barter_offer_write() owner to postgres;
revoke all on function public.enforce_barter_offer_write() from public;
revoke all on function public.enforce_barter_offer_write() from anon;

drop trigger if exists barter_offers_write_integrity on public.barter_offers;
create trigger barter_offers_write_integrity
  before insert or update on public.barter_offers
  for each row execute function public.enforce_barter_offer_write();

-- ── 7. At most one accepted response per offer ───────────────────────────────
-- A partial unique index rather than an application check: two concurrent accepts would
-- both pass a read-then-write test under READ COMMITTED. This is the same technique the
-- messaging surface used for conversation_one_pending_prebooking.
create unique index if not exists barter_interests_one_accepted_per_offer
  on public.barter_interests (offer_id)
  where status = 'accepted';

-- ── 8. Duplicate protection keyed on non-forgeable identity ──────────────────
-- The existing UNIQUE (offer_id, interested_provider_id) keys on a column that was forgeable
-- until section 3. interested_user_id is the column RLS pins to auth.uid(), so it is the
-- correct key: it cannot be varied to defeat the constraint.
--
-- The legacy constraint is retained DELIBERATELY, not by oversight. Given providers.user_id
-- is UNIQUE the two keys are equivalent for every row written through the API, so this is
-- belt-and-braces at the cost of one index entry. Note the shapes differ -- the old one is a
-- table CONSTRAINT, this is a bare INDEX -- so a future cleanup must drop each by its own
-- mechanism.
create unique index if not exists barter_interests_one_per_offer_per_user
  on public.barter_interests (offer_id, interested_user_id);

-- ── 9. Interest write limit at the authoritative boundary ────────────────────
-- The existing offer limiter is invoked by the client and fails open, so a caller that
-- simply omits the call is unlimited. This one is in the write path and cannot be skipped.
--
-- It counts rows in `rate_limit_log`, NOT the barter_interests rows themselves. Counting the
-- content rows looked simpler and was wrong: a responder may delete their own PENDING
-- responses, so send-15-then-delete-15 would reset the window. `rate_limit_log` has RLS
-- enabled with an INSERT-only policy, so an authenticated caller can add to it and can
-- neither read nor delete from it -- append-only from the limited user's side.
--
-- SECURITY DEFINER is therefore load-bearing rather than stylistic: precisely because that
-- table has no SELECT policy, a SECURITY INVOKER function would count ZERO rows and pass
-- every caller unconditionally, with no error to notice. It also reuses the existing
-- limiter's storage, so both barter limits live in one table.
create or replace function public.enforce_barter_interest_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_count integer;
  -- Beta working limit (E: "approximately 10-15 new interests/day").
  v_max constant integer := 15;
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;
  select count(*) into v_count
  from public.rate_limit_log l
  where l.user_id = v_uid
    and l.action = 'barter_interest'
    and l.created_at > clock_timestamp() - interval '24 hours';
  if v_count >= v_max then
    raise exception 'You have reached your daily limit for new barter responses.'
      using errcode = 'check_violation';
  end if;
  -- Recorded only once the limit check has passed, so a rejected attempt does not consume
  -- budget. created_at is the table's own server default.
  insert into public.rate_limit_log (user_id, action) values (v_uid, 'barter_interest');
  return new;
end $$;

alter function public.enforce_barter_interest_rate_limit() owner to postgres;
revoke all on function public.enforce_barter_interest_rate_limit() from public;
revoke all on function public.enforce_barter_interest_rate_limit() from anon;

-- Name carries no ordering requirement: the limiter reads rate_limit_log, never the row
-- being inserted, so it is independent of the write-integrity trigger. The zz_ prefix keeps
-- it last purely so a rejected write is not counted after another trigger has already
-- raised for a different reason.
drop trigger if exists barter_interests_zz_rate_limit on public.barter_interests;
create trigger barter_interests_zz_rate_limit
  before insert on public.barter_interests
  for each row execute function public.enforce_barter_interest_rate_limit();

-- ── 10. anon holds nothing on the barter surface ─────────────────────────────
-- Latent today (every policy pivots on auth.uid(), null for anon) but it is the documented
-- trap: invisible in pg_dump, re-granted on a fresh apply, and converted from latent to
-- total by any future permissive policy.
revoke all on table public.barter_offers from anon;
revoke all on table public.barter_interests from anon;
