-- FORWARD CORRECTION to 20261077000000 (Reviews Phase 2, PD-091).
--
-- ══ I PROMOTED A CLIENT-CONTROLLED FIELD TO ARBITER OF THE PUBLIC RATING ══
--
-- PD-091 says the rating is the mean of each client's **LATEST** review, and the
-- justification for allowing repeat reviews at all is that *"a loyal client who
-- is disappointed today moves the rating today"*.
--
-- That property depends entirely on what "latest" means. `20261077000000` made
-- it `created_at desc` — and `provider_reviews.created_at` is `DEFAULT now()`
-- with **INSERT granted on every column, no policy constraint and no stamping
-- trigger.** The reviewer picks it.
--
-- So a client could post one genuine, eligible, fully-authorized review with
-- `created_at: '2999-01-01'` and permanently pin their own voice at whatever
-- rating they chose. Every later honest review from the same client would sort
-- BELOW it forever — and could never be corrected, because there is no UPDATE
-- and no DELETE path, which the branch correctly treats as a feature.
--
-- Both directions are bad: a one-time 1-star that survives ten later 5-stars,
-- or a colluding 5-star that the client's own later honesty can never walk back.
--
-- ── THIS IS THE SAME MISTAKE AS LAST BRANCH, ONE FIELD OVER ───────────────
--
-- `20261073000000` stamped `contract_signatures.signed_at` for being the one
-- client-chosen field in a record whose purpose is to say what was true at a
-- moment — and listed, by name, the five comparable fields this codebase already
-- server-stamps. I read that list while writing it, then built a new rule on an
-- unstamped sixth.
--
-- ── WHAT IS NOT AFFECTED, AND WHY THAT MATTERS ────────────────────────────
--
-- The blind window is untouched. `review_window_closed`, `review_eligible` and
-- `provider_review_revealed` all anchor on `bookings.completed_at`, which IS
-- server-stamped and immutable. A forged review timestamp could never move
-- reveal, eligibility or the 7-day clock — the damage was confined to the
-- aggregate, which is exactly the surface PD-091 governs.
create or replace function public.enforce_review_created_at_is_the_server()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Backfills, support corrections and erasure paths legitimately write
  -- historical values. Same carve-out shape as every other stamp here.
  if (select auth.role()) = 'service_role'
     or ((select auth.role()) is null and (select auth.uid()) is null) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_at := clock_timestamp();
  elsif new.created_at is distinct from old.created_at then
    raise exception 'When a review was written cannot be changed.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_review_created_at_is_the_server() owner to postgres;
revoke all on function public.enforce_review_created_at_is_the_server()
  from public, anon, authenticated;

-- `a_` so it sorts FIRST — before `trg_no_self_review` and before anything that
-- might one day read the value. Trigger order is name order, and this repo has
-- the scar to prove assuming it is not the same as arranging it.
drop trigger if exists a_provider_review_created_at_server on public.provider_reviews;
create trigger a_provider_review_created_at_server
  before insert or update on public.provider_reviews
  for each row execute function public.enforce_review_created_at_is_the_server();

-- `client_reviews` too. No aggregate reads its `created_at` today, and that is
-- the reason to stamp it now rather than later: the next person to build a
-- conduct-reputation rule will reach for the same field, and should find it
-- already trustworthy instead of repeating this.
drop trigger if exists a_client_review_created_at_server on public.client_reviews;
create trigger a_client_review_created_at_server
  before insert or update on public.client_reviews
  for each row execute function public.enforce_review_created_at_is_the_server();

comment on function public.enforce_review_created_at_is_the_server() is
  'A review''s created_at is the server''s. It decides WHICH of a repeat '
  'client''s reviews forms the public rating (PD-091), so a client-chosen value '
  'would let one review be pinned as "latest" forever — uncorrectable, because '
  'reviews cannot be edited or deleted. service_role and no-claims sessions keep '
  'the supplied value for backfills and erasure.';

-- ══ AND A DISPUTED REVIEW MUST STOP COUNTING ══════════════════════════════
--
-- `under_review` HOLDS reveal — the row disappears from reads immediately,
-- because the policy re-evaluates live. But the STORED aggregate is only
-- recomputed by triggers on the review tables, so nothing recomputes when a
-- booking is placed under review: a disputed review kept contributing to the
-- publicly displayed rating for an unbounded time.
--
-- `provider_reputation()` computes it correctly and **nothing calls it** — the
-- function exists and every display surface still reads the stored column, which
-- is precisely the "correct but unreached" shape this project has been bitten by
-- before. Rather than rewire every surface in this branch, the stored value is
-- made to keep up: the hold now recomputes, so the number on the profile drops
-- when the dispute starts instead of whenever the next unrelated review lands.
create or replace function public.recompute_rating_on_review_hold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.under_review is distinct from old.under_review
     or new.completed_at is distinct from old.completed_at then
    perform public.recompute_provider_rating_for(new.provider_id);
  end if;
  return new;
end;
$$;

alter function public.recompute_rating_on_review_hold() owner to postgres;
revoke all on function public.recompute_rating_on_review_hold()
  from public, anon, authenticated;

drop trigger if exists zz_bookings_recompute_rating_on_hold on public.bookings;
create trigger zz_bookings_recompute_rating_on_hold
  after update on public.bookings
  for each row execute function public.recompute_rating_on_review_hold();

comment on function public.recompute_rating_on_review_hold() is
  'Keeps the STORED provider reputation in step when a booking is placed under '
  'review or its completion changes. Without it a disputed review kept counting '
  'in the public rating until some unrelated review happened to trigger a '
  'recompute — the row vanished from reads immediately, because the policy is '
  'live, while the number people actually see did not.';
