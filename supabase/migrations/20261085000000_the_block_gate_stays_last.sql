-- FORWARD CORRECTION to 20261082000000 (Reviews Phase 2).
--
-- ══ I PUT A TRIGGER AFTER THE ONE THAT IS SUPPOSED TO BE LAST ═════════════
--
-- `20261082000000` named its stamping trigger `zzz_bookings_under_review_at_server`
-- so it would sort after `enforce_booking_write_integrity` — which forces
-- `under_review := false` for every non-service caller, and which the stamp must
-- therefore observe AFTER, not before.
--
-- `zzz_` overshot. It also sorted past `zz_bookings_submit_not_blocked`, the
-- Session 8 block gate, and `safety_operator.test.sql` § 14a pins that gate as
-- **literally the last trigger on `bookings`** — read off the live catalog, not
-- off a comment, because `20261055000000` had already shipped two block gates
-- that a comment claimed fired last and that actually sorted on 'b' and 'c'.
-- That pin went red, which is the pin working.
--
-- Nothing was unsafe: the stamp cannot influence whether a submit is blocked, and
-- the gate raises either way. But the correct fix is to stop sorting past a
-- tripwire I have no need to sort past, not to widen the tripwire. The stamp's
-- ONLY ordering requirement is `> enforce_booking_write_integrity`, and `f_`
-- expresses exactly that and nothing more.
--
-- ── WHY THIS IS A NEW FILE AND NOT AN EDIT TO 20261082000000 ──────────────
--
-- 20261082000000 is already applied to non-production, which CI runs against.
-- Editing an applied migration is forbidden here regardless of how recently it
-- was written; the ledger has to describe what actually ran.
drop trigger if exists zzz_bookings_under_review_at_server on public.bookings;

-- `f_` sorts after `enforce_booking_write_integrity` and before `trg_no_self_booking`
-- and `zz_bookings_submit_not_blocked`. The position is the whole reason for the
-- prefix: rename it and the stamp starts recording a hold that the write-integrity
-- guard then erases for client callers.
drop trigger if exists f_bookings_under_review_at_server on public.bookings;
create trigger f_bookings_under_review_at_server
  before insert or update on public.bookings
  for each row execute function public.stamp_under_review_at();

comment on function public.stamp_under_review_at() is
  'Stamps bookings.under_review_at when a dispute hold opens, and clears it when '
  'the hold lifts. Fired by `f_bookings_under_review_at_server`, whose `f_` prefix '
  'is load-bearing: it must sort AFTER enforce_booking_write_integrity (which '
  'forces under_review := false for non-service callers) and must NOT sort after '
  'zz_bookings_submit_not_blocked, which safety_operator.test.sql § 14a pins as '
  'the last trigger on the table.';
