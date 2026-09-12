-- FORWARD CORRECTION to 20261116000000, which was wrong.
--
-- ══ I WIDENED A PRIVILEGE THE SUITE EXPLICITLY FORBIDS ════════════════════
--
-- `20261116000000` granted `is_operator()` to `anon` so that an anon read of
-- `public.providers` would not fail on the operator clause in
-- `providers_public_read`. Two committed assertions say that must never happen:
--
--   operator_surface.test.sql — 'but never by anon'
--   safety_operator.test.sql — 'nor may anon run any operator function'
--
-- The reasoning in that file was not wrong about the disclosure — `is_operator()`
-- is argument-free and always false for `anon`. It was wrong about what it cost:
-- the operator boundary in this repo is "no operator function is reachable by an
-- unauthenticated caller, full stop", and a rule like that is worth more than the
-- convenience of one policy clause. A boundary with a defensible exception is a
-- boundary somebody has to reason about every time.
--
-- ── AN OR IN A POLICY IS ALSO AN OR BETWEEN POLICIES ──────────────────────
--
-- Permissive RLS policies on the same command combine with OR, and a policy
-- declared `TO authenticated` is **not evaluated at all** for `anon`. So the
-- operator clause becomes its own policy, for the role that can actually hold the
-- privilege, and the anon path never reaches the function.
revoke execute on function public.is_operator() from anon;

comment on function public.is_operator() is
  'True when the CALLER is an operator. Takes no argument, which is what keeps it '
  'from being an oracle. NEVER GRANT THIS TO anon: two suites assert that no '
  'operator function is reachable unauthenticated, and 20261116000000 tried and '
  'was reverted by 20261117000000. If a policy needs an operator clause for '
  'authenticated readers, give the clause its own `TO authenticated` policy — '
  'permissive policies combine with OR and a role-scoped one is skipped entirely '
  'for other roles.';

drop policy if exists providers_public_read on public.providers;

-- The public rule. Reachable by anon, and calls nothing anon cannot execute.
create policy providers_public_read on public.providers
  for select to anon, authenticated
  using (
    not public.account_unavailable(user_id)
    or user_id = (select auth.uid())
    or public.caller_deals_with_provider(id)
  );

-- The operator rule, as its own policy so the function is never reached by a role
-- that cannot execute it.
create policy providers_operator_read on public.providers
  for select to authenticated
  using (public.is_operator());

comment on policy providers_public_read on public.providers is
  'Provider rows are public EXCEPT while their owner is unavailable — an open '
  'deletion request, an erased account, or the ownerless shell an erasure leaves. '
  'Then the row is readable by its owner and by someone who already has a booking '
  'or a conversation with them, because PD-102 requires a live transaction to stay '
  'resolvable and sixteen screens read this table directly to resolve it. '
  'Operators are handled by providers_operator_read, which is a separate policy '
  'for a reason — see 20261117000000. Before widening this back to USING (true): '
  'the view alone was not enough, and the product copy says "hidden".';

comment on policy providers_operator_read on public.providers is
  'An operator sees every provider row, including one whose owner is leaving, '
  'because a case may be about exactly that person. Separate from '
  'providers_public_read solely so that is_operator() is never evaluated for anon, '
  'which cannot execute it and must never be granted it.';
