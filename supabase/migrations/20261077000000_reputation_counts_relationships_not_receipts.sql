-- Reviews Phase 2 — the repeat-pair anti-gaming rule.
--
-- ══ THE PROBLEM, AND WHY IT IS NOT SOLVED BY BLOCKING REPEATS ═════════════
--
-- Phase 0 established that each completed booking creates its own review
-- opportunity, and repeat bookings review independently. That is RIGHT — service
-- quality changes, and a client's fifth visit is a real data point about how the
-- provider is doing now.
--
-- But the aggregate averaged EVERY revealed review, so twenty reviews from one
-- client counted exactly as twenty independent customer relationships. Two people
-- who book each other repeatedly could manufacture a reputation, and a client who
-- genuinely loves their barber could manufacture one accidentally.
--
-- Blocking repeat reviews would fix the arithmetic by destroying the signal: a
-- provider whose quality dropped last month would keep a rating built entirely
-- on a review from a year ago.
--
-- ══ THE RULE: ONE CLIENT, ONE VOICE, THEIR MOST RECENT ════════════════════
--
--     The public rating is the mean of the LATEST revealed review from each
--     distinct client. Every review is still stored, still shown, and still
--     counted in the review count.
--
-- One sentence, which is most of why it was chosen. It is also:
--
--   * **DETERMINISTIC** — no weighting curve, no decay constant, no arbitrary
--     cap to tune. Two rows in, one answer out, testable exactly.
--   * **KIND TO REPEAT CLIENTS** — their voice counts fully and their LATEST
--     opinion is the one that counts, so a loyal client who is disappointed this
--     time moves the rating today rather than being outvoted by their own past
--     enthusiasm.
--   * **USELESS FOR FARMING** — twenty reviews from one pair contribute exactly
--     one value, the same as one review would.
--   * **NOT OVERFITTED** — it says nothing about beta cohort sizes and needs no
--     retuning when the marketplace grows.
--
-- Rejected, and why, so the next person does not redo the analysis:
--   * A CAP ("at most N from one client") needs an arbitrary N and still permits
--     N-fold inflation.
--   * DIMINISHING WEIGHT is hard to explain to a provider who asks why their
--     rating moved, and hard to pin in a test without encoding the curve twice.
--   * DELETING repeat reviews destroys legitimate feedback the ruling explicitly
--     says to preserve.
--
-- ══ THE TRADE-OFF, STATED BECAUSE IT IS REAL ══════════════════════════════
--
-- A provider with three loyal clients and twenty reviews now has a rating built
-- on THREE values while displaying twenty reviews. That is the intended
-- behaviour — three relationships is what they have — but it makes the display
-- obligation load-bearing: the two numbers mean different things and the surface
-- must say so. Hence `rating_client_count`, which exists to be LABELLED.

-- ── 1. The provider aggregate ─────────────────────────────────────────────
alter table public.providers
  add column if not exists rating_client_count integer not null default 0;

comment on column public.providers.rating_client_count is
  'How many DISTINCT clients contributed to average_rating. Not the same as '
  'review_count, and the difference is the point: the rating counts each client '
  'once (their most recent revealed review) while the count shows every review. '
  'A surface that displays one without the other is misleading in whichever '
  'direction it chose — label both.';

create or replace function public.recompute_provider_rating_for(p_provider_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
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
  'Recomputes a provider''s public reputation over REVEALED reviews only. '
  'average_rating is the mean of the LATEST review from each DISTINCT client — '
  'one client, one voice, their most recent — so repeat bookings keep producing '
  'real feedback without letting one relationship stand in for many. '
  'review_count remains every revealed review, because hiding real feedback from '
  'people reading it would be a different lie. rating_client_count says how many '
  'clients the rating rests on, and exists to be LABELLED next to the other two.';

-- ── 2. Backfill, so the stored values match the new rule immediately ──────
--
-- Without this, every provider carries a rating computed under the old rule
-- until their next review write — and a reputation that is stale in a way nobody
-- can see is worse than one that is merely old.
do $$
declare r record;
begin
  for r in select id from public.providers loop
    perform public.recompute_provider_rating_for(r.id);
  end loop;
end $$;

-- ── 3. The read path a surface can trust ──────────────────────────────────
--
-- The stored columns are CONSERVATIVE by design (Phase 0): a purely time-based
-- reveal — the window closing with no counterpart review — changes what is
-- revealed without any write to recompute against. So a surface that needs the
-- live truth asks for it rather than reading a column that may be a day behind.
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
  select
    coalesce(round(avg(r.rating)::numeric, 2), 0),
    (select count(*)::integer from public.provider_reviews pr
      where pr.provider_id = p_provider_id
        and public.provider_review_revealed(pr.booking_id)),
    count(*)::integer
  from (
    select distinct on (pr.reviewer_user_id) pr.reviewer_user_id, pr.rating
      from public.provider_reviews pr
     where pr.provider_id = p_provider_id
       and public.provider_review_revealed(pr.booking_id)
     order by pr.reviewer_user_id, pr.created_at desc, pr.id desc
  ) r;
$$;

alter function public.provider_reputation(uuid) owner to postgres;
revoke all on function public.provider_reputation(uuid) from public, anon;
-- Public reputation of a public business, computed over revealed reviews only.
-- It cannot disclose an unrevealed review: `provider_review_revealed` is the same
-- predicate the read policy uses, so a blind review contributes to nothing here.
grant execute on function public.provider_reputation(uuid) to anon, authenticated, service_role;

comment on function public.provider_reputation(uuid) is
  'Live reputation for a provider, over REVEALED reviews only and under the '
  'one-client-one-voice rule. Exists because the stored columns are deliberately '
  'conservative: a time-based reveal (the 7-day window closing with no '
  'counterpart review) changes what is revealed with no write to recompute '
  'against, so a stored value can lag. Discloses nothing about a blind review — '
  'it uses the same reveal predicate as the read policy.';
