-- FORWARD CORRECTION to 20261097000000 (Community moderation).
--
-- ══ THE COLUMN EXISTS AND NOBODY MAY WRITE IT ═════════════════════════════
--
-- `20261052000000` replaced `reports`'s table-level INSERT with a NAMED COLUMN
-- grant, so a reporter cannot set `report_status`, `admin_notes`, `resolved_by`
-- or `resolved_at` — the operator columns are withheld by privilege rather than
-- by hope.
--
-- `20261097000000` then added `reported_content_kind` and `reported_content_id`
-- and did not add them to that grant. The result is the exact failure mode a
-- column-level grant is designed to produce and the exact one it is easy to
-- forget: **the report write fails with `42501` for every reporter**, not just
-- for the new columns — PostgreSQL refuses the whole INSERT.
--
-- This is the same shape as the `is_mobile` defect `__tests__/guards/
-- providerColumnGrant.test.ts` was written for: a column the app needs and the
-- grant does not name. A new column is not a granted column.
grant insert (reported_content_kind, reported_content_id) on public.reports to authenticated;

comment on column public.reports.reported_content_kind is
  'Which Community table `reported_content_id` points at. INSERT-granted to '
  'authenticated alongside the other reporter-settable columns; the operator '
  'columns (report_status, admin_notes, resolved_by, resolved_at) remain '
  'withheld by privilege, which is what 20261052000000 exists to do.';
