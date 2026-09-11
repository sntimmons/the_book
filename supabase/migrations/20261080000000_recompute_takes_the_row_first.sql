-- FORWARD CORRECTION to 20261077000000 / 20261079000000 (Reviews Phase 2).
--
-- ══ TWO REVIEWS AT ONCE LOSE ONE OF EACH OTHER ════════════════════════════
--
-- `recompute_provider_rating_for` is a single `UPDATE ... FROM (lateral …)`.
-- The lateral subqueries that count and average the reviews are evaluated
-- against the **statement's snapshot**, and the row lock on `providers` is only
-- taken when the UPDATE reaches the row — after the counting is already done.
--
-- So, under READ COMMITTED:
--
--     T1: insert review A ─ recompute (snapshot sees A, not B) ─┐
--     T2: insert review B ─ recompute (snapshot sees B, not A) ─┘ blocks on the row
--     T1 commits → T2 unblocks and writes ITS number
--
-- PostgreSQL re-evaluates the UPDATE's `where` under a fresh snapshot when it
-- unblocks (EvalPlanQual), but it does **not** recompute the FROM-side laterals.
-- T2 therefore writes a `review_count` and an `average_rating` computed as though
-- A did not exist. A is committed, revealed, and readable — it has simply been
-- dropped from the stored aggregate, silently and permanently, until some later
-- unrelated review happens to trigger another recompute.
--
-- This got worse in Phase 2, not better. Before PD-091 the stored value was a
-- plain average that a later recompute would heal. Now `20261079000000` also
-- recomputes on every `under_review` and `completed_at` change on `bookings`, so
-- there are far more concurrent callers — an operator opening a dispute while a
-- review lands is an ordinary Tuesday, not a thought experiment.
--
-- ══ THE FIX ═══════════════════════════════════════════════════════════════
--
-- Take the provider row FIRST. `select … for update` makes T2 block **before**
-- it counts anything; when it unblocks, its next statement takes a fresh snapshot
-- that includes A, and it counts correctly. Same lock the UPDATE was going to
-- take anyway, one step earlier, which is the whole difference between "counted
-- then locked" and "locked then counted".
--
-- Body otherwise carried forward from 20261077000000 verbatim. The PD-091 rule —
-- latest-per-distinct-client for the average, all revealed for the count — is
-- unchanged; only when the counting happens is.
create or replace function public.recompute_provider_rating_for(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked uuid;
begin
  -- LOCK BEFORE COUNTING. Without this the counting below runs on a snapshot
  -- taken before a concurrent reviewer committed, and their review is dropped
  -- from the stored aggregate.
  select p.id into v_locked from public.providers p
   where p.id = p_provider_id for update;
  if not found then
    return;   -- Provider erased mid-flight. Nothing to keep in step.
  end if;

  update public.providers p
     set average_rating = coalesce(latest.avg_rating, 0),
         -- EVERY revealed review, unchanged. This is "how much feedback exists",
         -- and collapsing it would hide real reviews from people reading them.
         review_count = coalesce(total.n, 0),
         -- How many distinct clients that rating rests on.
         rating_client_count = coalesce(latest.client_n, 0)
    from (select 1) _
    left join lateral (
      -- One row per distinct reviewer: their most recent REVEALED review.
      -- `distinct on` with the matching order is the whole rule.
      select round(avg(r.rating)::numeric, 2) as avg_rating, count(*)::integer as client_n
        from (
          select distinct on (pr.reviewer_user_id) pr.reviewer_user_id, pr.rating
            from public.provider_reviews pr
           where pr.provider_id = p_provider_id
             and public.provider_review_revealed(pr.booking_id)
           order by pr.reviewer_user_id, pr.created_at desc, pr.id desc
        ) r
    ) latest on true
    left join lateral (
      select count(*)::integer as n
        from public.provider_reviews pr
       where pr.provider_id = p_provider_id
         and public.provider_review_revealed(pr.booking_id)
    ) total on true
   where p.id = p_provider_id;
end;
$$;

alter function public.recompute_provider_rating_for(uuid) owner to postgres;
revoke all on function public.recompute_provider_rating_for(uuid) from public, anon, authenticated;

comment on function public.recompute_provider_rating_for(uuid) is
  'LIVE DEFINITION: 20261080000000. Recomputes a provider''s public reputation '
  'over REVEALED reviews only. average_rating is the mean of the LATEST review '
  'from each DISTINCT client (PD-091) — one client, one voice, their most recent. '
  'review_count remains every revealed review. rating_client_count is how many '
  'clients the average rests on, and is what display surfaces show beside a '
  'rating. **Takes the providers row FOR UPDATE before counting**: counting first '
  'and locking second let two concurrent reviews each write a total that omitted '
  'the other. Before redefining, keep the lock first.';
