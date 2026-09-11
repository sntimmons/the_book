-- Comments only. NO schema, data, grant, policy or view change.
--
-- ══ A CLAIM THE ARCHITECTURE WAS CHOSEN ON, WHICH IS NOT TRUE ═════════════
--
-- `20261064000000` says an absent row is *"indistinguishable from a row that was
-- deleted, deactivated, never created, or filtered by any other predicate"*, and
-- that *"there is no question to ask"*. The Founder ruling selected the view
-- architecture over an RLS policy on exactly that premise.
--
-- **It does not hold as shipped.** It would hold only if the caller could not
-- see the unfiltered set. The caller can: `providers_public_read` is
-- `USING (true)`, and `providers_visible` differs from `providers` by the block
-- predicate and by NOTHING ELSE. Two requests —
--
--     GET /rest/v1/providers?id=eq.X            -> 1 row
--     GET /rest/v1/providers_visible?id=eq.X    -> 0 rows
--
-- — answer "is there a block between me and X" deterministically, per target.
-- Combined with `iBlocked()`, which shows only the caller's OWN blocks, an
-- absent row there means **they blocked me**: the one fact PD-082 says a person
-- may never be told.
--
-- ══ WHY IT IS RECORDED RATHER THAN FIXED HERE ═════════════════════════════
--
-- Closing it is not a wording change. It requires the base tables to stop being
-- readable for the same rows — narrowing `providers_public_read` and routing
-- every remaining read through a view — which touches bookings, threads, reviews
-- and contracts, and is materially larger than PD-089's scope.
--
-- PD-087 excuses "inference from an error code by someone deliberately probing
-- the API". A clean two-request set difference is a stronger thing than an error
-- code, so whether it falls inside that ruling is a PRODUCT call and not one to
-- settle in a migration comment. Filed as **OQ-076**.
--
-- What this migration does is make the live comment stop asserting the false
-- half, because in this repo a comment is an instruction and four times it has
-- been the thing the next engineer trusted.
comment on view public.providers_visible is
  'PD-089. The public provider columns, MINUS anyone the caller is blocked with '
  'in either direction. Ordinary discovery, the provider list and search read '
  'this; bookings, message threads, reviews, contracts, own-business reads and a '
  'directly-opened profile deliberately still read public.providers. '
  'security_invoker = false is LOAD-BEARING and is also the hazard: it drops the '
  'base table''s RLS and column grants, so a _visible view must restate any '
  'predicate its base table carried — see 20261066000000, where three views had '
  'dropped theirs and two were granted to anon. **An absent row here IS '
  'distinguishable**, contrary to 20261064000000: public.providers is readable by '
  'the same caller and differs only by the block. Recorded as OQ-076; do not '
  'repeat the "no question to ask" claim.';
