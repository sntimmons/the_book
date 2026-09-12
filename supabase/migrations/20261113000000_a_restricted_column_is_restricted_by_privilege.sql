-- FORWARD CORRECTION to 20261108000000 (PD-102).
-- Security review of 5977169: SEC-RLS-005.
--
-- ══ THE THIRD TIME, IN THE SAME REPOSITORY, IN THE SAME WORKSTREAM ════════
--
-- `20261052000000:9-23` wrote it down. `20261107000000:322-333` had to apply it
-- again five files ago, in this very workstream, with the sentence
-- **"A COLUMN-LEVEL REVOKE CANNOT NARROW A TABLE-LEVEL GRANT"** in capitals. And
-- then `20261108000000` added `barter_version_acceptances.participant_subject_id`
-- to a table holding `grant select on table … to authenticated`
-- (`20260918000000:23`) and restricted nothing. A table-level privilege covers
-- columns added later; the column comment says RESTRICTED and the privilege said
-- otherwise.
--
-- What it exposed is the worst possible value to expose: the erased party's
-- ORIGINAL auth uid, readable by the counterparty of the trade — the one person
-- with both the motive and the other half of the join. Every other identity
-- column in the barter chain was nulled by `adel_barter` specifically so this
-- would not be recoverable.
--
-- ── AND A TEST THAT CANNOT MISS THE FOURTH ────────────────────────────────
--
-- Four `*_subject_id` columns were asserted individually with
-- `has_column_privilege`, and the fifth was added without an assertion. Column
-- five is fixed below; the SUITE is what stops column six, with one generic
-- assertion over every column in the schema whose name ends `_subject_id`
-- (see `supabase/tests/account_erasure.test.sql`).
revoke select on table public.barter_version_acceptances from anon, authenticated;

grant select (id, version_id, participant_user_id, accepted_at)
  on public.barter_version_acceptances to authenticated;

comment on column public.barter_version_acceptances.participant_subject_id is
  'RESTRICTED. The erased participant''s durable identity, kept so an adjudicated '
  'trade still records WHO accepted which version. Enforced by PRIVILEGE — the '
  'table-level SELECT is revoked and the ordinary columns re-granted by name — '
  'because RLS cannot hide a column and a column-level revoke cannot narrow a '
  'table-level grant. Adding a column to this table re-opens it unless the grant '
  'above is extended by name.';
