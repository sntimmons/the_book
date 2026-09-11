-- FORWARD CORRECTION to 20261079000000 / 20261080000000 (Reviews Phase 2).
--
-- ══ I FIXED A RACE BY TAKING A LOCK STRONGER THAN THE JOB NEEDS ═══════════
--
-- `20261080000000` closed a real lost update by locking the `providers` row
-- before counting. It used `for update` — and `for update` is the **only** row
-- lock mode that conflicts with `FOR KEY SHARE`.
--
-- Every review INSERT already takes `FOR KEY SHARE` on that same `providers`
-- row, because `provider_reviews_provider_id_fkey` makes PostgreSQL run an
-- internal `select 1 from providers where id = $1 for key share` as part of the
-- referential-integrity check. `client_reviews` does the same. So:
--
--     T1: insert review for P ─ FK takes KEY SHARE on P ─┐
--     T2: insert review for P ─ FK takes KEY SHARE on P ─┘ (compatible, both hold)
--     T1: recompute wants FOR UPDATE on P → waits on T2's key share
--     T2: recompute wants FOR UPDATE on P → waits on T1's key share
--     deadlock; one side aborts with 40P01
--
-- Two honest clients reviewing the same provider at the same moment. No attacker,
-- no crafted client — and `app/post-booking/review.tsx` special-cases only 23505,
-- so the loser sees a generic failure after writing a real review.
--
-- Whether the cycle actually forms depends on whether the internal RI trigger
-- sorts before the recompute trigger, which depends on the database's collation.
-- That is a coin-flip I have no business leaving in the schema.
--
-- ── THE REPO ALREADY WROTE THIS RULE DOWN, AND I DID NOT FOLLOW IT ────────
--
-- `20261014000000:51-54`, verbatim:
--
--     LOCK RULE FOR FUTURE WRITERS, restated because the old one was wrong in a
--     way that was easy to believe: **enumerate the IMPLICIT locks too.** An
--     INSERT or an UPDATE that writes a foreign-key column takes `for key share`
--     on the parent row. [...] "I wrote no `for update` on that table" is not the
--     same as "I take no lock on it".
--
-- That migration exists because this exact class of deadlock already happened
-- once here. I enumerated the explicit locks and stopped.
--
-- ── THE FIX: THE WEAKEST LOCK THAT STILL SERIALIZES THE RECOMPUTERS ───────
--
-- `for no key update` conflicts with ITSELF — so two recomputes still serialize,
-- the second one still blocks before counting, and its next statement still takes
-- a fresh READ COMMITTED snapshot containing the first one's row. That is the
-- entire mechanism `20261080000000` relies on, unchanged.
--
-- It does NOT conflict with `FOR KEY SHARE`, so the FK checks no longer take part
-- in the cycle. It is also exactly the lock the bare `UPDATE` was taking before
-- `20261080000000` — none of `average_rating`, `review_count` or
-- `rating_client_count` is a key column — so this restores the original lock mode
-- and keeps only the change that mattered: taking it BEFORE counting rather than
-- during.
create or replace function public.recompute_provider_rating_for(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_locked uuid;
begin
  -- LOCK BEFORE COUNTING, AND NO HARDER THAN THAT. `for no key update` conflicts
  -- with itself (recomputers serialize) but not with the `for key share` every
  -- review INSERT's foreign key already holds on this row. `for update` would
  -- conflict with both, and deadlock two honest concurrent reviewers.
  select p.id into v_locked from public.providers p
   where p.id = p_provider_id for no key update;
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
  'LIVE DEFINITION: 20261081000000. Recomputes a provider''s public reputation '
  'over REVEALED reviews only. average_rating is the mean of the LATEST review '
  'from each DISTINCT client (PD-091). review_count is every revealed review. '
  'rating_client_count is how many clients the average rests on. **Locks the '
  'providers row FOR NO KEY UPDATE before counting.** Both halves are load-bearing: '
  'counting before locking loses concurrent updates, and locking FOR UPDATE '
  'deadlocks against the for-key-share the review foreign keys already hold. '
  'Before redefining, keep the lock, keep it first, and keep it no stronger.';

-- ══ AND THE HOLD TRIGGER STOPS PAYING ON EVERY BOOKING WRITE ══════════════
--
-- `zz_bookings_recompute_rating_on_hold` was declared with no `WHEN` clause, so
-- every booking UPDATE — every draft edit, submit, accept, decline, cancel and
-- every service_role batch — paid a PL/pgSQL call that immediately returned.
-- `bookings` is the hottest, most heavily triggered table in the schema.
--
-- The guard moves into the trigger declaration, where the planner can skip the
-- call entirely. The body keeps its own copy: a `WHEN` clause is an optimisation,
-- and a rule that exists only in an optimisation is a rule waiting to be dropped.
drop trigger if exists zz_bookings_recompute_rating_on_hold on public.bookings;
create trigger zz_bookings_recompute_rating_on_hold
  after update on public.bookings
  for each row
  when (new.under_review is distinct from old.under_review
        or new.completed_at is distinct from old.completed_at)
  execute function public.recompute_rating_on_review_hold();

-- ══ ONE CONSTRAINT ON FUTURE SERVER CODE, RECORDED WHILE IT IS FREE ═══════
--
-- `enforce_review_created_at_is_the_server` lets `service_role` supply a
-- `created_at`, which is correct and matches every neighbouring stamp — backfills
-- and erasure need it. But PD-091 changed what that field MEANS: it now decides
-- which of a repeat client's reviews is the authoritative one, permanently, since
-- reviews can never be edited or deleted.
--
-- Nothing writes reviews server-side today (both review paths are anon-key client
-- code), so this is reachable by nobody. It is written down now because the next
-- person to add a server-side review path inherits it silently otherwise.
comment on function public.enforce_review_created_at_is_the_server() is
  'A review''s created_at is the server''s. It decides WHICH of a repeat client''s '
  'reviews forms the public rating (PD-091), so a client-chosen value would let '
  'one review be pinned as "latest" forever — uncorrectable, because reviews '
  'cannot be edited or deleted. service_role and no-claims sessions keep the '
  'supplied value for backfills and erasure. **CONSTRAINT ON FUTURE SERVER CODE: '
  'anything writing reviews as service_role inherits the power to pin a public '
  'rating permanently. Let it default unless it is deliberately restoring '
  'history.** No server-side review writer exists as of 20261081000000.';
