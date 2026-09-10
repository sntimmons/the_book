-- FORWARD CORRECTION to 20261055000000 (Session 8).
--
-- ══ THE DEFECT: TRIGGER ORDER ═════════════════════════════════════════════
--
-- `20261055000000` named the barter block trigger `barter_interests_not_blocked`,
-- which sorts FIRST on that table. PostgreSQL fires `BEFORE` triggers in name
-- order, and `supabase/tests/barter.test.sql` pins that order BY NAME — so B5B
-- failed immediately, which is the guard doing exactly its job.
--
-- Order is not cosmetic here. The correct position is:
--
--   * AFTER `barter_interests_write_integrity`, which CLAMPS the insert — running
--     before it means reading values the authoritative trigger has not settled.
--   * BEFORE `zz_rate_limit`, so a refused attempt does NOT consume the
--     responder's daily budget. From the product's point of view an attempt the
--     platform refuses never happened, and charging it against a limit would
--     punish someone for an act they were not permitted to perform.
--
-- `zw_` sits between the two.
--
-- ── WHY THIS IS A NEW FILE ────────────────────────────────────────────────
--
-- `20261055000000` was already APPLIED when the failure surfaced. Editing it
-- would have been editing an applied migration — the one rule
-- `supabase/README.md` states without exception — so the rename lands forward
-- instead. The applied file is restored to exactly the body that ran.

drop trigger if exists barter_interests_not_blocked on public.barter_interests;
drop trigger if exists barter_interests_zw_not_blocked on public.barter_interests;
create trigger barter_interests_zw_not_blocked
  before insert on public.barter_interests
  for each row execute function public.enforce_barter_interest_not_blocked();
