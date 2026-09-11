-- Reviews Phase 2 — **PD-092**, closing **OQ-078**.
--
-- ══ "LATEST" MEANS THE LATEST SERVICE, NOT THE LATEST RECEIPT ═════════════
--
-- PD-091 makes a provider's rating the mean of each client's LATEST revealed
-- review, and justifies allowing repeat reviews with *"a loyal client who is
-- disappointed today moves the rating today."* `20261077000000` implemented
-- "latest" as `provider_reviews.created_at desc` — the latest review **written**.
-- OQ-078 filed the ambiguity rather than settling it while implementing
-- something else.
--
-- Product has ruled: the contributing review is the one tied to the **MOST
-- RECENTLY COMPLETED eligible service**, ordered by `bookings.completed_at`.
--
-- ── WHY THE OTHER READING IS WRONG ────────────────────────────────────────
--
-- A client visits on the 1st and again on the 5th. They write the 5th visit's
-- review on the 6th, then finally get round to the 1st visit's review on the 7th.
-- Under written-order, the review of the OLDER service is "latest" and decides
-- the rating — a late review of an old haircut silently replaces the reputation
-- contribution of a more recent one. The rule's entire promise is that a rating
-- reflects the most recent relationship; ordering on when someone got round to
-- typing breaks that promise for no gain.
--
-- `completed_at` is also the better KIND of key. It is server-stamped, immutable
-- (Phase 0, SEC-DATA-101), and already the anchor for eligibility, the 7-day
-- window and reveal. Ordering on it means one authoritative chronology governs
-- the whole review system instead of two that can disagree.
--
-- ── THE TIE-BREAKER, DOCUMENTED BECAUSE IT IS REACHABLE ───────────────────
--
-- `completed_at` is stamped `now()` — the TRANSACTION timestamp, not
-- `clock_timestamp()`. A provider who completes two of the same client's
-- bookings in ONE transaction gives both the identical instant. That is not
-- exotic; it is one screen with two "mark complete" actions batched.
--
-- When the services tie, the tie-break is `provider_reviews.created_at desc`,
-- then `provider_reviews.id desc`:
--
--   * `created_at` is server-stamped and immutable (`20261079000000`), so it is
--     not a channel a reviewer can steer. Among services that finished at the
--     same instant, "the client's later statement stands" is the answer that
--     matches the rule's spirit.
--   * `id desc` is the final, total order. It is arbitrary — and it must be
--     PRESENT, because `distinct on` without a total order returns an
--     implementation-defined row, which is how a rating starts changing on its
--     own between two recomputes with identical inputs.
--
-- ── WHAT DOES NOT CHANGE ──────────────────────────────────────────────────
--
-- One client still contributes exactly ONE value; `review_count` is still every
-- revealed review; every legitimate revealed review still DISPLAYS in history.
-- This rule decides only which single review from a given client feeds the
-- aggregate.

-- ── 1. ONE definition of the canonical reputation ─────────────────────────
--
-- The rule previously existed in TWO places — `recompute_provider_rating_for`
-- and `provider_reputation` — with the ordering clause copied between them.
-- `20261081000000` had to be careful to keep them identical, and the next ruling
-- would have had to be careful again. PD-092 adds a join to that clause, which
-- is exactly the kind of edit that lands in one copy.
--
-- It is now written ONCE. Both callers below delegate here, and the invariant in
-- `20261084000000` checks stored values against this same function — so there is
-- no second definition that could drift into being the one a surface reads.
create or replace function public.provider_reputation_canonical(p_provider_id uuid)
returns table (
  average_rating numeric,
  review_count integer,
  rating_client_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(round(avg(r.rating)::numeric, 2), 0),
    (select count(*)::integer
       from public.provider_reviews pr
      where pr.provider_id = p_provider_id
        and public.provider_review_revealed(pr.booking_id)),
    count(*)::integer
  from (
    -- One row per distinct client: their review of the MOST RECENTLY COMPLETED
    -- eligible service (PD-092). The join is to the authoritative chronology;
    -- `completed_at` is never null here because the reveal predicate requires it.
    select distinct on (pr.reviewer_user_id) pr.reviewer_user_id, pr.rating
      from public.provider_reviews pr
      join public.bookings b on b.id = pr.booking_id
     where pr.provider_id = p_provider_id
       and public.provider_review_revealed(pr.booking_id)
     order by pr.reviewer_user_id,
              b.completed_at desc,   -- PD-092: the service chronology decides
              pr.created_at desc,    -- tie: two services completed in one txn
              pr.id desc             -- total order, so the answer is stable
  ) r;
$$;

alter function public.provider_reputation_canonical(uuid) owner to postgres;
revoke all on function public.provider_reputation_canonical(uuid)
  from public, anon, authenticated;

comment on function public.provider_reputation_canonical(uuid) is
  'THE single definition of a provider''s public reputation. average_rating is '
  'the mean, over distinct clients, of each client''s review of their MOST '
  'RECENTLY COMPLETED eligible service (PD-091 + PD-092), ordered by '
  'bookings.completed_at with review created_at and id as documented '
  'tie-breakers. review_count is every revealed review. rating_client_count is '
  'how many clients the average rests on. Revealed-only throughout, via the same '
  'predicate the read policies use, so it can disclose nothing about a blind '
  'review. recompute_provider_rating_for, provider_reputation and the '
  'no-pin invariant all delegate here — DO NOT restate this query anywhere.';

-- ── 2. The stored aggregate: same lock discipline, one source of truth ────
create or replace function public.recompute_provider_rating_for(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked uuid;
  v_canon  record;
begin
  -- LOCK BEFORE COUNTING, AND NO HARDER THAN THAT (20261080000000 +
  -- 20261081000000, both load-bearing). Counting before locking lets two
  -- concurrent reviews each store a total that omitted the other; `for update`
  -- would deadlock against the `for key share` the review foreign keys already
  -- hold on this row. `for no key update` conflicts with itself and not with
  -- them, which is exactly the serialization required and nothing more.
  select p.id into v_locked from public.providers p
   where p.id = p_provider_id for no key update;
  if not found then
    return;   -- Provider erased mid-flight. Nothing to keep in step.
  end if;

  select * into v_canon from public.provider_reputation_canonical(p_provider_id);

  update public.providers p
     set average_rating      = v_canon.average_rating,
         review_count        = v_canon.review_count,
         rating_client_count = v_canon.rating_client_count
   where p.id = p_provider_id;
end;
$$;

alter function public.recompute_provider_rating_for(uuid) owner to postgres;
revoke all on function public.recompute_provider_rating_for(uuid) from public, anon, authenticated;

comment on function public.recompute_provider_rating_for(uuid) is
  'LIVE DEFINITION: 20261083000000. Stores what provider_reputation_canonical() '
  'computes, which is the ONLY place the rule is written. Locks the providers row '
  'FOR NO KEY UPDATE before reading — both halves load-bearing: counting before '
  'locking loses concurrent reviews, and a stronger lock deadlocks against the '
  'review foreign keys. Before redefining, keep the lock, keep it first, keep it '
  'no stronger, and do not reintroduce a second copy of the rule.';

-- ── 3. The live read path ─────────────────────────────────────────────────
--
-- Still separate from the stored columns, and still for the Phase 0 reason: a
-- purely time-based reveal (the window closing with no counterpart review)
-- changes what is revealed with NO write to recompute against, so a stored value
-- can lag by up to the time until the next write.
create or replace function public.provider_reputation(p_provider_id uuid)
returns table (
  average_rating numeric,
  review_count integer,
  rating_client_count integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.average_rating, c.review_count, c.rating_client_count
    from public.provider_reputation_canonical(p_provider_id) c;
$$;

alter function public.provider_reputation(uuid) owner to postgres;
revoke all on function public.provider_reputation(uuid) from public, anon;
grant execute on function public.provider_reputation(uuid) to anon, authenticated, service_role;

comment on function public.provider_reputation(uuid) is
  'Live reputation for a provider — the public read path, delegating to '
  'provider_reputation_canonical(). Exists because the stored columns can lag: a '
  'time-based reveal moves the truth with no write to recompute against. '
  'Discloses nothing about a blind review; it uses the same reveal predicate as '
  'the read policy.';

-- ── 4. Restate every stored value under the new ordering ──────────────────
--
-- The ordering key changed, so a provider whose repeat client reviewed out of
-- service order is carrying a rating computed under the old rule. A reputation
-- that is wrong in a way nobody can see is worse than one that is merely old.
-- (`20261082000000` changed reveal as well; this same pass settles both.)
do $$
declare r record;
begin
  for r in select id from public.providers loop
    perform public.recompute_provider_rating_for(r.id);
  end loop;
end $$;
