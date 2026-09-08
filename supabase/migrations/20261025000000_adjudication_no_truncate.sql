-- TRUNCATE is removed from the adjudications table, for every role including `service_role`.
--
-- Raised by the security review. `enforce_barter_adjudication_append_only` is a ROW-level
-- trigger, and TRUNCATE does not fire row triggers — so the one operation the append-only
-- guarantee cannot see is also the one that removes every row at once. Supabase's default
-- privileges grant `service_role` everything on a new table, and `20261019000000`'s revoke named
-- only `public`, `anon` and `authenticated`, so the privilege was there by default rather than
-- by decision.
--
-- Nothing needs it. Account and agreement erasure work through DELETE, which the trigger does
-- see and does permit for a privileged caller (`20261019000000` § 2, extended by
-- `20261024000000`). Removing TRUNCATE therefore costs no supported operation and closes the
-- only path by which every terminal outcome in the product could be discarded without a single
-- trigger firing.
--
-- Deliberately scoped to THIS table rather than applied across the barter schema: this is the
-- one table whose entire contract is "these rows are permanent decisions", and a broad
-- privilege sweep is a larger change than a review finding should make on its own.
revoke truncate on table public.barter_obligation_adjudications
  from public, anon, authenticated, service_role;
