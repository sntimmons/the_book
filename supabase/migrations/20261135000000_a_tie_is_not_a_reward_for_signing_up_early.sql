-- DISCOVERY / FAIRNESS — the PM rulings on unrated ordering and `is_featured`.
--
-- ══ WHY A MIGRATION WAS NEEDED AT ALL ═════════════════════════════════════
--
-- The ruling: *"unrated providers use the existing deterministic tie-break."*
-- `lib/discovery.ts` already has that tie-break — FNV-1a plus an xorshift
-- finalizer over the provider id — and the lanes use it, so within a lane nobody
-- gains a durable edge from having signed up early.
--
-- **The complete grid could not use it, because the grid is PAGINATED SERVER-SIDE.**
-- `useProviders` fetches 20 rows at a time with `range(offset, offset + 19)`, so
-- the ordering has to be decided by the database or pagination tears: rows
-- duplicate and skip between pages when the client re-sorts what it was handed.
-- And PostgREST's `order=` takes a COLUMN, not an expression — there is nowhere to
-- put a hash at query time.
--
-- So the grid ordered `average_rating DESC, id ASC`, and that `id ASC` is exactly
-- the durable advantage the tie-break exists to remove. Every unrated provider —
-- which today is EVERY provider in non-production, and every new provider forever
-- — was ordered by when they signed up, permanently, on the most-visited surface
-- in the product.
--
-- This adds the one thing that was missing: a stable, deterministic, id-derived
-- ordering key the database can sort on.
--
-- ══ WHY md5, AND WHY GENERATED ════════════════════════════════════════════
--
--   * **`md5(id::text)`** is IMMUTABLE, which a generated column requires.
--     `hashtextextended()` is not marked immutable and cannot be used here.
--   * **It is not monotonic in the tail.** That is the load-bearing property, and
--     the same one `lib/discovery.ts` explains at length: a plain polynomial hash
--     puts ids differing only in their last character ("…a1", "…a2", "…a3") in the
--     order they would have sorted anyway, hiding the advantage behind arithmetic.
--     md5 does not.
--   * **GENERATED ALWAYS … STORED**, so it cannot drift from the id, cannot be set
--     by anyone, and needs no trigger and no backfill job. There is no way to hand
--     a provider a better tie-break, which is the point — it is the opposite of
--     `is_featured`.
--   * It is **not a ranking score**. It carries no meaning, orders nobody above
--     anybody for any reason, and exists solely so that a tie is broken by nothing
--     rather than by seniority.
--
-- ══ WHAT THIS DOES NOT DO ═════════════════════════════════════════════════
--
-- It does not change WHO is discoverable: the view's block and availability
-- predicates are reproduced from `pg_get_viewdef` unchanged, and this migration
-- adds one column to the select list and nothing else. It does not rank, boost,
-- or demote. `is_featured` is removed from the grid's ORDER BY in application code
-- (the PM ruling), and **the column is deliberately left in place** — the ruling
-- permits it to remain for another legitimate purpose, and it still drives the
-- "Featured" badge. What it may no longer do is reorder the marketplace.

-- ── 1. The ordering key ───────────────────────────────────────────────────
alter table public.providers
  add column if not exists discovery_tiebreak text
  generated always as (md5(id::text)) stored;

comment on column public.providers.discovery_tiebreak is
  'A stable, deterministic, meaningless ordering key derived from the row id, so '
  'that providers who tie on every real signal are ordered by NOTHING rather than '
  'by how early they signed up. GENERATED ALWAYS STORED: nobody can set it, so it '
  'cannot become a placement dial the way is_featured was. It is NOT a score and '
  'carries no reputation, quality or priority meaning. The client-side twin is '
  '`tiebreak()` in lib/discovery.ts, which the lanes use; this column exists '
  'because the complete grid is paginated server-side and PostgREST can only order '
  'by a column, not an expression.';

-- Ordering a paginated list on it is the whole purpose, so it needs an index that
-- matches the grid's ORDER BY.
create index if not exists providers_grid_order_idx
  on public.providers (average_rating desc, discovery_tiebreak asc);

-- ── 2. Republished so the grid can order on it ───────────────────────────
--
-- THE BODY BELOW IS THE LIVE DEFINITION from `pg_get_viewdef`, with
-- `discovery_tiebreak` added to the select list and NOTHING else changed. Taken
-- from the database rather than retyped, for the reason `20261134000000` records:
-- a `create or replace view` is a full rewrite, and a hand-written copy of a long
-- definition silently drops things. The two predicates — the bidirectional block
-- check and `account_unavailable` — are the security properties of this view and
-- are reproduced exactly.
create or replace view public.providers_visible as
 SELECT id,
    user_id,
    display_name,
    business_name,
    username,
    category_id,
    custom_category,
    bio,
    location,
    neighborhood,
    profile_photo_url,
    cover_image_url,
    rating,
    average_rating,
    review_count,
    total_bookings,
    repeat_client_rate,
    follower_count,
    next_available,
    is_trending,
    is_featured,
    is_approved,
    is_demo,
    years_experience,
    specialties,
    created_at,
    is_mobile,
    completed_count,
    rating_client_count,
    discovery_tiebreak
   FROM providers p
  WHERE NOT (EXISTS ( SELECT 1
           FROM user_blocks b
          WHERE b.blocker_user_id = (( SELECT auth.uid() AS uid)) AND b.blocked_user_id = p.user_id OR b.blocked_user_id = (( SELECT auth.uid() AS uid)) AND b.blocker_user_id = p.user_id)) AND NOT account_unavailable(user_id);

-- The view is SECURITY DEFINER by omission of `security_invoker` and must stay
-- postgres-owned: that is what lets it apply the block predicate as the view's
-- owner while the caller reads only what the predicate allows.
alter view public.providers_visible owner to postgres;

grant select on public.providers_visible to anon, authenticated;

comment on view public.providers_visible is
  'The public provider list, minus anyone the caller is blocked with in either '
  'direction and minus anyone whose account is unavailable (pending deletion or '
  'erased). THE BLOCK FILTER EXISTS ONLY HERE — providers_public_read on the base '
  'table carries no block predicate — so every surface that builds a LIST OF '
  'PROVIDERS FOR A VIEWER TO CHOOSE FROM must read this view and not the table. A '
  'directly-opened profile deliberately still reads the table (OQ-076 / PD-090).';

-- ── 3. The new column is readable, and nothing else about it is ──────────
-- SELECT only, to the same roles as the rest of the public column set. There is no
-- UPDATE to grant: a generated column cannot be written by anyone at all.
grant select (discovery_tiebreak) on public.providers to anon, authenticated;
