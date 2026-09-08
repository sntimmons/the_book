-- The deprecation comment names the role it does NOT bind.
--
-- `20261028000000` set the `offering_value` column comment to say, without qualification, that
-- "enforce_barter_offer_write nulls this on INSERT and refuses to introduce or change it on
-- UPDATE." That is true of `authenticated` and of a no-JWT direct session, and FALSE of
-- `service_role`, which returns at the top of that trigger before either rule is reached. The
-- migration HEADER was honest about the exemption; the live catalog comment was not.
--
-- This repository has already paid for an overstated comment once: `20261026000000` exists in
-- part because the `barter_obligation_adjudications` table comment claimed "never edited, never
-- withdrawn" after the same slice had made both literally false. The lesson recorded there
-- applies here, so it is applied rather than re-learned.
--
-- NOTHING BEHAVIOURAL CHANGES. This migration alters one comment. The `service_role` exemption
-- is the established posture of every guard on this trigger, not a hole opened here: the B5B
-- cases in `supabase/tests/barter.test.sql` depend on it to plant a legacy value, and they also
-- prove the rule IS enforced against an ordinary authenticated owner (`23514`).
comment on column public.barter_offers.offering_value is
  'DEPRECATED and LEGACY-ONLY (PD-069, 2026-09-08). The Book does not appraise, equalize or '
  'compare the value of a barter trade, so no new offer records one. For every NON-PRIVILEGED '
  'writer — participants included — enforce_barter_offer_write nulls this on INSERT and refuses '
  'to introduce or change it on UPDATE; it may be kept (so a legacy offer stays editable) or '
  'cleared, never introduced. service_role is EXEMPT from that rule, as it is from every other '
  'guard on that trigger, so a privileged path can still write this column. Existing values are '
  'retained as historical record and are rendered by NO live surface. Proposal-version post '
  'snapshots (20260917000000) still carry whatever was captured at the time, because those '
  'snapshots are immutable evidence of what was proposed. Do not add a replacement valuation, '
  'equivalency, fairness-warning, credit or token field — that reverses a locked decision.';
