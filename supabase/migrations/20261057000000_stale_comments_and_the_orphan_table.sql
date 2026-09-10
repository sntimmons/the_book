-- Session 8 housekeeping. NO SCHEMA CHANGE, NO DATA CHANGE, NO GRANT CHANGE.
-- Every statement below is a `comment on`.
--
-- ══ WHY A MIGRATION FOR COMMENTS ══════════════════════════════════════════
--
-- Because in this repo a comment on a function has, four times, been the thing
-- the next engineer trusted instead of the ledger — and twice that cost a
-- security rule. A comment that has gone stale is not cosmetic here; it is an
-- instruction pointing at the wrong body. `create or replace function`
-- PRESERVES the existing comment, so a stale one survives every rebuild that
-- does not deliberately replace it.

-- ── 1. "Nothing processes these" is no longer true ────────────────────────
--
-- `20261039000000` said barter review requests would sit unread "until Session 8
-- builds the Review Queue". Session 8 built it: a trigger opens a `barter_review`
-- case in `operator_cases` (`20261050000000`), so the request now lands in a
-- place a person can find.
--
-- The important half of this correction is what did NOT change. There is still
-- no operator UI, `operator_update_case` is granted to `service_role` alone, and
-- PD-068 still promises no SLA. A queue existing is not permission for any
-- surface to start promising a response.
comment on function public.request_barter_obligation_review(uuid) is
  'The deliverer asks The Book to look at an obligation whose receiver never '
  'answered. Only the deliverer, only while barter_receiver_window is '
  'needs_attention, never on a cancelled or already-resolved obligation. '
  'Idempotent: a repeat returns the original timestamp. Records a REQUEST, not an '
  'outcome — adjudication stays service_role-only (PD-068). Since 20261050000000 '
  'a trigger opens a barter_review case in operator_cases, so these are queued '
  'rather than unread; there is still NO operator UI and still no SLA, and no '
  'copy built on this may promise a response or a time.';

-- ── 2. The orphaned reporting table ───────────────────────────────────────
--
-- `community_reports` was the community feed's private reporting table: a
-- reporter, a post, a reason, a timestamp — and no status, no operator path, and
-- nothing that ever read it. Session 8 pointed that screen at `reports`, which
-- opens an operator case, so this table now has NO WRITER and NO READER.
--
-- **IT IS NOT DROPPED, and that is the decision rather than an oversight.** It
-- holds reports that real people filed about content they were troubled by.
-- Dropping it would destroy safety reports that were never read — which is a
-- worse outcome than the one that put them there — and Session 8 requirement O
-- forbids altering deletion and retention semantics in this scope anyway.
--
-- So it is labelled instead. The label is the whole mechanism: the next person
-- to look for "where do post reports go" must not find a plausible-looking table
-- and write to it.
comment on table public.community_reports is
  'ORPHANED, RETAINED DELIBERATELY. Do not write here. This was the community '
  'feed''s own reporting table and it had no status column, no operator path and '
  'no reader — a second place to forget to look. Session 8 moved that screen onto '
  'public.reports, which opens an operator case. The rows already here are real '
  'reports from real people that nothing ever read, so the table is kept rather '
  'than dropped; erasing them would be a worse answer than never having read '
  'them. Migrating them into public.reports is a deliberate product decision '
  'about surfacing old, unactioned safety reports, not a cleanup task — leave '
  'them until someone decides.';
