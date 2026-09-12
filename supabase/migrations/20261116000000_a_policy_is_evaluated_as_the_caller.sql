-- FORWARD CORRECTION to 20261111000000 (PD-102).
--
-- ══ THE 20261094000000 LESSON, ONE LAYER DOWN ═════════════════════════════
--
-- `20261094000000` established that a DEFINER VIEW does not lend its owner's
-- FUNCTION privileges. An **RLS POLICY** does not either, and for a stronger
-- reason: a policy has no owner to borrow from. It is evaluated as the caller,
-- always.
--
-- `20261111000000` put `public.is_operator()` into `providers_public_read` so an
-- operator could still see a departing provider's row. `is_operator` is revoked
-- from `anon` — so the first `anon` read of `public.providers` returned
-- `42501: permission denied for function is_operator` instead of rows. Not a
-- filtered read: a hard failure on a table the app reads for portfolios and
-- directly-opened profiles. The new suite caught it on the first run, which is
-- the only reason this is a two-line fix and not an outage.
--
-- `is_operator()` takes no argument and answers only about the caller. For `anon`
-- the answer is always false, so the grant discloses nothing — it is the same
-- reasoning `20261101000000` used for `caller_pending_deletion()`, and the same
-- reason `account_pending_deletion(uuid)` needed an argument about it.
grant execute on function public.is_operator() to anon;

comment on function public.is_operator() is
  'True when the CALLER is an operator. Takes no argument, which is what makes it '
  'safe to grant: for anon and for an ordinary user the answer is always false and '
  'discloses nothing about anybody else. GRANTED TO anon since 20261116000000 '
  'because it appears in providers_public_read, and an RLS policy is evaluated as '
  'the caller — a policy cannot borrow the privileges of an owner it does not '
  'have. Revoking this from anon breaks every anon read of public.providers.';
