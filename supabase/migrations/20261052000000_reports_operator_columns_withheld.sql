-- FORWARD CORRECTION to 20261050000000 § 5 (Session 8, requirement B).
--
-- ══ THE DEFECT, AND WHY IT IS THE SECOND TIME ═════════════════════════════
--
-- `20261050000000` tried to close the `reports.admin_notes` leak with:
--
--     revoke select (admin_notes, resolved_by) on public.reports from authenticated;
--
-- **That is a no-op.** `authenticated` holds a TABLE-LEVEL grant on `reports`
-- (`INSERT, SELECT, UPDATE, DELETE, …` from the canonical baseline), and
-- PostgreSQL will not subtract a column-level privilege from a table-level one —
-- it emits a warning and changes nothing. B5B caught it: the assertion said the
-- reporter could no longer read operator notes, and they still could.
--
-- **This repo has now made this exact mistake twice**, in both directions, and the
-- ledger records the first: Correction 3's `20261037000000` § 7 shipped
-- `revoke update (expires_at) … from authenticated` believing it did something,
-- and the security review found it inert. The rule, stated once so it stops
-- costing migrations:
--
--   > A COLUMN-LEVEL REVOKE CANNOT NARROW A TABLE-LEVEL GRANT. To withhold a
--   > column you must revoke the table-level privilege and re-grant the columns
--   > you intend to expose.
--
-- That is precisely what Correction 2's `20261030000000` did for `providers` — 28
-- named columns, no table-level SELECT — and it is what this does for `reports`.
--
-- ══ WHY THE LEAK MATTERS ══════════════════════════════════════════════════
--
-- `reports.admin_notes` is where an operator writes what they actually think
-- about a report: what they found, who they believe, what they intend to do. The
-- table's only SELECT policy is `auth.uid() = reporter_user_id`, so **the person
-- who filed the report could read all of it**. Session 8's requirement is
-- explicit that private operator notes must not be exposed to normal users, and
-- an operator who cannot write candidly is an operator who cannot work.
--
-- `resolved_by` goes with it: which named human closed a report is internal.

-- ── The 12 columns a reporter may read ─────────────────────────────────────
--
-- Everything on the table EXCEPT `admin_notes` and `resolved_by`. `reporter_user_id`
-- stays readable — it is the caller's own id, and the SELECT policy already
-- restricts every visible row to theirs.
revoke select on public.reports from authenticated;
revoke select on public.reports from anon;

grant select (
  id,
  created_at,
  updated_at,
  report_type,
  report_reason,
  report_status,
  notes,
  reporter_user_id,
  reported_provider_id,
  reported_user_id,
  booking_id,
  resolved_at
) on public.reports to authenticated;

-- WRITE is narrowed to what filing a report needs, for the same reason. The
-- baseline handed `authenticated` table-level UPDATE and DELETE on `reports` with
-- **no UPDATE or DELETE policy to constrain them** — the grant was unreachable
-- only because RLS denies by default when no policy matches. That is one added
-- policy away from being a live hole, and a reporter must never be able to edit a
-- report after filing it, mark it resolved, or delete it once an operator is
-- working the case.
revoke insert, update, delete on public.reports from authenticated;
grant insert (
  report_type,
  report_reason,
  notes,
  reporter_user_id,
  reported_provider_id,
  reported_user_id,
  booking_id
) on public.reports to authenticated;

-- `service_role` keeps everything: it is the operator path.
grant all on public.reports to service_role;

comment on column public.reports.admin_notes is
  'OPERATOR-ONLY. Withheld from anon and authenticated by column grant, because '
  'the table''s SELECT policy (auth.uid() = reporter_user_id) would otherwise let '
  'the person who filed the report read the operator''s private assessment of it. '
  'Do not add a column-level REVOKE against a table-level grant to protect this — '
  'that is a no-op and has been shipped twice; the boundary is the absence of a '
  'table-level SELECT plus the explicit column grants in 20261052000000.';
