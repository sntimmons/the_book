-- Comments only. NO schema, data, grant, policy or trigger change.
--
-- `20261061000000` refreshed the four live comments that Session 8B's grants
-- invalidated, and missed three more with the same root cause — objects that
-- describe adjudication's caller set without BEING adjudication, so a
-- name-scoped sweep did not see them. The regression assertion in
-- `operator_surface.test.sql` is widened in the same change to every function
-- and table description in the schema, so this class cannot recur by scoping.
--
-- Why a migration for comments, again: this repo treats a catalog comment as an
-- instruction. Four times it has been the thing the next engineer trusted
-- (`20261057000000`), and all three below mislead in the PERMISSIVE direction —
-- they say a function cannot be reached by a client that can now reach it.

comment on function public.request_barter_obligation_review(uuid) is
  'The deliverer asks The Book to look at an obligation whose receiver never '
  'answered. Only the deliverer, only while barter_receiver_window is '
  'needs_attention, never on a cancelled or already-resolved obligation. '
  'Idempotent: a repeat returns the original timestamp. Records a REQUEST, not an '
  'outcome. Since 20261050000000 a trigger opens a barter_review case, and since '
  'Session 8B (20261059000000) an allow-listed operator can work that case from '
  'the app — adjudication is gated on is_operator(), NOT on service_role alone, '
  'and an operator surface now exists. There is still no SLA (PD-068), and no '
  'copy built on this may promise a response or a time.';

comment on table public.barter_obligation_review_requests is
  'PD-072. A deliverer''s explicit request that The Book look at an obligation '
  'whose receiver never answered — append-only, one per obligation, '
  'deliverer-bound. It is the THIRD route into Under Review, alongside a '
  'receiver''s no-show report and the receiver window elapsing, and '
  'adjudicate_barter_obligation reads it as an eligibility disjunct. That '
  'function is gated on is_operator(), which since 20261059000000 admits an '
  'allow-listed signed-in operator as well as service_role. A REQUEST is not an '
  'outcome and never becomes one on its own.';

comment on function public.enforce_operator_case_event_append_only() is
  'Case history is append-only: UPDATE is refused for everyone, always. DELETE is '
  'permitted ONLY to service_role and to a no-claims/no-subject privileged '
  'session, so that erasing a provider or an auth user still cascades — the first '
  'version refused it unconditionally and made provider deletion impossible. '
  'NOTE the grant state changed in Session 8B: authenticated now holds SELECT on '
  'this table (gated by an operator-only RLS policy) but still holds NO write '
  'privilege, so this trigger remains the second refusal on writes rather than '
  'the only one.';
