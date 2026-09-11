-- Reviews Phase 2 — PM ruling closing **OQ-079**: there is no manual rating pin.
--
--   "Public rating must be derived from canonical eligible review data. There is
--    NO manual/service-role rating override or permanent rating pin."
--
-- ══ TWO PINS EXISTED. THE ONE THAT WAS FILED WAS THE SMALLER ONE ══════════
--
-- **(a) The one OQ-079 named.** `service_role` may supply a review's
-- `created_at`, which under PD-091 chose which of a repeat client's reviews was
-- authoritative — permanently, because reviews cannot be edited or deleted.
-- PD-092 (`20261083000000`) mostly dissolves this on its own: the ordering key is
-- now `bookings.completed_at`, and `created_at` only breaks ties between services
-- completed in the same transaction. It was never reachable — no server-side
-- review writer exists.
--
-- **(b) The one nobody filed, and the one that was actually live.**
-- `public.providers.rating` — a second, separate numeric column that **no
-- recompute has ever written**. It is not a leftover: it is SELECT-granted to
-- `anon` and `authenticated`, published by both public provider views, and
-- `hooks/useProviders.ts` uses it as the marketplace's ranking and filtering key
--    `dbQuery.gte('rating', minRating)` … `dbQuery.order('rating', …)`
-- while every display surface reads `average_rating`. So the number that DECIDES
-- WHO APPEARS FIRST IN SEARCH was a free-text field that only `service_role`
-- could write and no review could move.
--
-- Today every row holds 0, which is why nothing looks wrong. The moment real
-- reviews land, `average_rating` moves and `rating` does not — search would rank
-- on a stale zero for everybody, and any value written into it would be a
-- permanent, invisible, manually-set marketplace position. That is precisely the
-- thing the ruling forbids, and it was one UPDATE away from existing.
--
-- ══ THE FIX: DERIVED, AND ENFORCED RATHER THAN DOCUMENTED ═════════════════
--
-- 1. `rating` becomes a mirror of `average_rating`, written only by the recompute.
-- 2. An INVARIANT refuses any write that would store a reputation number the
--    canonical function does not produce — **including one made by
--    `service_role`**, which is the role the ruling is about.
--
-- The invariant is an equality check against
-- `provider_reputation_canonical()`, not a permission check, and that choice is
-- the point: a permission check asks WHO is writing, and the ruling is about WHAT
-- may be stored. There is no role, no flag and no session setting that makes a
-- fabricated rating acceptable, so there is no carve-out to find.

-- ── 1. The recompute owns `rating` too ────────────────────────────────────
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
  -- Lock first, and no harder than `for no key update` (20261080000000 +
  -- 20261081000000). Counting before locking loses concurrent reviews; a stronger
  -- lock deadlocks against the `for key share` the review foreign keys hold.
  select p.id into v_locked from public.providers p
   where p.id = p_provider_id for no key update;
  if not found then
    return;   -- Provider erased mid-flight. Nothing to keep in step.
  end if;

  select * into v_canon from public.provider_reputation_canonical(p_provider_id);

  update public.providers p
     set average_rating      = v_canon.average_rating,
         -- The legacy ranking column, now derived rather than settable.
         rating              = v_canon.average_rating,
         review_count        = v_canon.review_count,
         rating_client_count = v_canon.rating_client_count
   where p.id = p_provider_id;
end;
$$;

alter function public.recompute_provider_rating_for(uuid) owner to postgres;
revoke all on function public.recompute_provider_rating_for(uuid) from public, anon, authenticated;

comment on function public.recompute_provider_rating_for(uuid) is
  'LIVE DEFINITION: 20261084000000. Stores what provider_reputation_canonical() '
  'computes — the ONLY place the rule is written — into average_rating, rating, '
  'review_count and rating_client_count. `rating` is a DERIVED MIRROR of '
  'average_rating (it is the marketplace ranking/filter key and was previously '
  'written by nothing). Locks the providers row FOR NO KEY UPDATE before reading. '
  'Before redefining: keep the lock, keep it first, keep it no stronger, keep one '
  'copy of the rule, and do not let `rating` drift from average_rating.';

comment on column public.providers.rating is
  'DERIVED MIRROR of average_rating, not an independent field. It is the ranking '
  'and min-rating filter key for provider search, so a hand-set value here would '
  'be a permanent manual marketplace position — which OQ-079''s ruling forbids. '
  'Written only by recompute_provider_rating_for(); any other write is refused by '
  'providers_reputation_is_derived. Retained rather than dropped because two '
  'public views and the client field list publish it.';

-- ── 2. Restate every stored value, so the invariant has something true to hold ──
do $$
declare r record;
begin
  for r in select id from public.providers loop
    perform public.recompute_provider_rating_for(r.id);
  end loop;
end $$;

-- ── 3. The invariant ──────────────────────────────────────────────────────
create or replace function public.reputation_is_derived()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_canon record;
begin
  select * into v_canon
    from public.provider_reputation_canonical(new.id);

  -- A provider with no revealed reviews canonically has (0, 0, 0), which is also
  -- the column defaults — so an ordinary signup INSERT satisfies this without
  -- knowing it exists, and a SEEDED provider carrying a fabricated rating does
  -- not. Numeric equality ignores scale, so 0 and 0.00 agree.
  if new.average_rating      is distinct from v_canon.average_rating
     or new.rating           is distinct from v_canon.average_rating
     or new.review_count     is distinct from v_canon.review_count
     or new.rating_client_count is distinct from v_canon.rating_client_count
  then
    raise exception
      'A provider''s public reputation is derived from revealed reviews and '
      'cannot be set. Expected (rating %, reviews %, clients %), got (% / %, %, %).',
      v_canon.average_rating, v_canon.review_count, v_canon.rating_client_count,
      new.average_rating, new.rating, new.review_count, new.rating_client_count
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.reputation_is_derived() owner to postgres;
revoke all on function public.reputation_is_derived() from public, anon, authenticated;

comment on function public.reputation_is_derived() is
  'Refuses to store a provider reputation that provider_reputation_canonical() '
  'does not produce. NO ROLE CARVE-OUT, deliberately — OQ-079''s ruling is about '
  'what may be STORED, not about who is writing, and the role it is chiefly about '
  'is service_role. A restore that loads raw rows will be corrected by the next '
  'recompute rather than preserved, which is the correct behaviour for derived '
  'data: it is reproducible by definition, so nothing is lost.';

-- Two triggers, one function. The UPDATE side carries a WHEN clause so the
-- ordinary provider profile edit — the overwhelmingly common write to this table
-- — never pays for the canonical query at all.
drop trigger if exists providers_reputation_is_derived_ins on public.providers;
create trigger providers_reputation_is_derived_ins
  before insert on public.providers
  for each row execute function public.reputation_is_derived();

drop trigger if exists providers_reputation_is_derived_upd on public.providers;
create trigger providers_reputation_is_derived_upd
  before update on public.providers
  for each row
  when (new.average_rating is distinct from old.average_rating
        or new.rating is distinct from old.rating
        or new.review_count is distinct from old.review_count
        or new.rating_client_count is distinct from old.rating_client_count)
  execute function public.reputation_is_derived();

-- ── 4. What was considered and NOT done, so it is not redone ──────────────
--
-- **`providers_update_safe_columns_only` was left alone.** It pins `rating`,
-- `review_count` and `average_rating` for the owner and — an oversight of
-- `20261077000000` — not `rating_client_count`. It is not restated here because
-- the gap is already closed twice over from underneath: `authenticated` holds no
-- UPDATE grant on any of the four columns (`20261030000000` § 2, asserted by B5B
-- and by `__tests__/guards/providerColumnGrant.test.ts`), and the invariant above
-- now refuses the value regardless of role. Restating a 15-predicate policy to
-- add a fourth redundant pin is the kind of edit that drops a predicate.
--
-- **No operator rating editing was built, and none should be.** The ruling says
-- the public rating is derived from canonical review data; an override surface
-- would be the pin it forbids, wearing a UI. If a rating is wrong, the eligible
-- review data is what is wrong, and that is an adjudication question (PD-068),
-- not a number to type over.
