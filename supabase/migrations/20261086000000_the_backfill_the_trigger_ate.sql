-- FORWARD CORRECTION to 20261082000000 (Reviews Phase 2, PD-093).
--
-- ══ I CREATED THE TRIGGER, THEN RAN THE BACKFILL IT SILENTLY UNDOES ═══════
--
-- `20261082000000` creates `stamp_under_review_at`'s trigger at line 89 and then,
-- ten lines later, runs:
--
--     update public.bookings
--        set under_review_at = coalesce(completed_at, created_at)
--      where under_review = true and under_review_at is null;
--
-- That statement does not change `under_review`, so the trigger takes its
-- unchanged-hold branch — `new.under_review_at := old.under_review_at`, which is
-- `NULL` — and writes the row back exactly as it found it. **The backfill wrote
-- nothing.** No error, no warning, and a migration comment plus a ledger row both
-- asserting a post-condition that never held.
--
-- ── WHY NOTHING BROKE, AND WHY THAT IS NOT A REASON TO LEAVE IT ───────────
--
-- The latch tests `b.under_review_at is not null` before using it, so a legacy
-- hold falls through to FALSE and stays exactly as hidden as it was under Phase 0.
-- The OUTCOME is right. But the mechanism producing it is the fail-closed guard,
-- not the anchor — and `20261082000000` describes the guard as belt-and-braces
-- for a value the backfill supposedly always wrote. A safety net doing the load-
-- bearing work while the documentation credits something else is how the next
-- person removes the net.
--
-- ── THE FIX: THE FUNCTION HEALS THE LEGACY ROW, RATHER THAN A ONE-OFF UPDATE ──
--
-- Backfilling around the trigger (disable/enable, or a carve-out for "an UPDATE
-- that supplies a value") would reopen precisely what `20261082000000` closed:
-- the ability to CHOOSE a hold instant, and with it which already-public reviews
-- a dispute suppresses. So the value is still never taken from the writer. The
-- function instead computes the documented anchor itself when it finds a held
-- booking with no instant:
--
--     coalesce(completed_at, created_at) — a lower bound, and deliberately so.
--     A counterpart review cannot pre-date completion and the 7-day window cannot
--     have closed before it, so the latch evaluates FALSE for every legacy hold
--     and NOTHING is published retroactively. That is the only safe direction
--     when the real instant is unknown, and it is unchanged from the intent of
--     20261082000000 — only the mechanism that delivers it is.
create or replace function public.stamp_under_review_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- NO service_role carve-out, deliberately, and against the local convention
  -- (PD-093). Every neighbouring stamp lets service_role supply a value because
  -- backfills and erasure need it. This one decides which already-public reviews
  -- a dispute suppresses, and `under_review` is a service_role-only field to
  -- begin with — so the carve-out would hand the ONLY role that can open a hold
  -- the ability to choose its retroactive effect. The supplied value is never
  -- read, on any path, by any role. That is what the branches below are for.
  if tg_op = 'INSERT' then
    new.under_review_at := case when new.under_review then pg_catalog.clock_timestamp() end;
    return new;
  end if;

  if new.under_review is distinct from old.under_review then
    -- The hold opens or closes: the server stamps, or clears.
    new.under_review_at := case when new.under_review then pg_catalog.clock_timestamp() end;
  else
    -- Unchanged hold. The original instant survives any other booking write —
    -- otherwise every later edit would re-date the dispute and re-decide what it
    -- suppresses. `coalesce` heals a LEGACY hold (one that predates
    -- 20261082000000, whose backfill this function silently swallowed) to the
    -- documented anchor, which is a lower bound: the latch is FALSE for it, so it
    -- stays held exactly as it is today and nothing becomes public.
    new.under_review_at := coalesce(
      old.under_review_at,
      case when new.under_review then coalesce(old.completed_at, old.created_at) end
    );
  end if;
  return new;
end;
$$;

alter function public.stamp_under_review_at() owner to postgres;
revoke all on function public.stamp_under_review_at() from public, anon, authenticated;

comment on function public.stamp_under_review_at() is
  'Stamps bookings.under_review_at when a dispute hold opens, clears it when the '
  'hold lifts, preserves it across every other booking write, and heals a legacy '
  'hold to coalesce(completed_at, created_at) — a lower bound, so the latch stays '
  'FALSE and nothing is published retroactively. The supplied value is NEVER read '
  'on any path, by any role: choosing it would mean choosing which already-public '
  'reviews a dispute suppresses (PD-093). Fired by '
  '`f_bookings_under_review_at_server`, whose `f_` prefix is load-bearing — it '
  'must sort AFTER enforce_booking_write_integrity (which forces under_review := '
  'false for non-service callers) and must NOT sort after '
  'zz_bookings_submit_not_blocked, pinned as last on the table by '
  'safety_operator.test.sql § 14a.';

-- Now the backfill actually lands: the statement only has to TOUCH the rows, and
-- the function supplies the anchor. The `set under_review = under_review` is not
-- a no-op dressed up — it is what makes the row visit the trigger at all.
update public.bookings
   set under_review = under_review
 where under_review = true and under_review_at is null;

-- ── A NOTE ON RESTORES, since two triggers now fire during a data load ────
--
-- A FULL `pg_restore` is safe: pre-data / data / post-data ordering creates both
-- triggers AFTER the rows land, so neither fires. A DATA-ONLY reload into an
-- existing schema is NOT, and the difference is worth stating where someone will
-- meet it:
--
--   * `stamp_under_review_at` takes its INSERT branch and re-stamps every held
--     booking with `clock_timestamp()` = restore time, which would make the latch
--     TRUE for anything completed more than 7 days earlier — publishing held
--     reviews.
--   * `reputation_is_derived` raises `23514` on `providers` rows whose reviews and
--     bookings have not been loaded yet, aborting the restore.
--
-- **Use `--disable-triggers` for a data-only reload, then run a recompute pass.**
-- Recorded here rather than only in a runbook because the failure mode of the
-- first is silent and the failure mode of the second is a restore that stops
-- half-way.
comment on function public.reputation_is_derived() is
  'Refuses to store a provider reputation that provider_reputation_canonical() '
  'does not produce. NO ROLE CARVE-OUT, deliberately — PD-094 is about what may '
  'be STORED, not about who is writing, and the role it is chiefly about is '
  'service_role. SCOPE, stated exactly: it constrains the four DERIVED columns. '
  'It does NOT constrain the review ROWS the canonical query reads, which '
  'service_role can still mutate — see OQ-080. A full pg_restore is unaffected '
  '(triggers are created after the data loads); a DATA-ONLY reload must use '
  '--disable-triggers and then recompute, or this will abort it.';
