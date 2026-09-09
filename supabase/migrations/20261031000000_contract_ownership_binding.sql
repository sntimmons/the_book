-- Pre-Beta Correction 2 — a contract may only be written for the caller's OWN
-- provider row.
--
-- ── THE DEFECT, REPRODUCED AGAINST NON-PRODUCTION ─────────────────────────
--
-- Two providers were created, A and B, each with a real authenticated session.
-- Provider B then ran an ordinary PostgREST insert:
--
--   insert into contracts (provider_id, user_id, title, body, contract_type)
--   values (<PROVIDER A's providers.id>, <B's auth uid>, 'Forged by provider B', ...)
--
-- IT SUCCEEDED. The row was created and belonged to provider A's `provider_id`.
--
-- The live policy explains why:
--
--   contracts_provider_insert  WITH CHECK (
--     auth.uid() = user_id
--     AND auth.uid() IN (SELECT providers.user_id FROM providers)   -- <—
--   )
--
-- The second conjunct only asserts the caller IS SOME PROVIDER. It never relates
-- `contracts.provider_id` to the caller. `contracts_provider_update` is worse: it
-- has `USING (auth.uid() = user_id)` and NO `WITH CHECK` at all, so `provider_id`
-- is unconstrained on update — an owner may hand their contract to anyone.
--
-- ── WHY IT IS WORSE THAN A FORGED ROW ──────────────────────────────────────
--
-- `contracts_provider_id_key` is UNIQUE. In the reproduction, provider A could
-- then NOT create their own contract — B's forged row had taken A's one slot.
-- So this is not only an integrity defect, it is a denial of service against
-- another provider's ability to publish a service agreement at all. And a
-- contract is described in-product as a safety/protection tool: whatever the
-- forger wrote is the document a client would be shown and asked to sign.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
--
-- Bind `provider_id` to a providers row the CALLER owns, on both write paths,
-- and give UPDATE an explicit WITH CHECK so the post-image is constrained too.
-- Expressed in the policies rather than in a trigger because this is pure row
-- ownership with no OLD/NEW comparison — the same shape as
-- `providers_update_owner` — and RLS is where the codebase already keeps it.
--
-- `service_role` bypasses RLS and is unaffected; there is no privileged path to
-- preserve here because none exists today.
--
-- DELETE is left exactly as it is (`auth.uid() = user_id`): a caller can only
-- delete a row whose `user_id` is theirs, which the forger's row would also
-- satisfy — but after this migration no forged row can be created, and rewriting
-- the DELETE predicate would not repair rows written before it.

-- ── 1. INSERT: the provider_id must be a providers row this caller owns ─────
drop policy if exists contracts_provider_insert on public.contracts;
create policy contracts_provider_insert on public.contracts
  for insert to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.providers p
      where p.id = contracts.provider_id
        and p.user_id = auth.uid()
    )
  );

-- ── 2. UPDATE: constrain the row BEFORE and AFTER ──────────────────────────
-- `USING` alone governs which rows may be targeted. Without `WITH CHECK`,
-- PostgreSQL applies `USING` to the new row as well — which pinned `user_id` but
-- said nothing about `provider_id`, the column that actually decides whose
-- contract this is. Both halves are now spelled out, and both require the
-- provider row to be the caller's.
--
-- Role narrowed from `public` to `authenticated`: the old policy was created
-- without a role clause, so it nominally applied to `anon` too. Latent (every
-- predicate pivots on `auth.uid()`, null for anon) but it is the documented trap,
-- and this table is a legal artifact.
drop policy if exists contracts_provider_update on public.contracts;
create policy contracts_provider_update on public.contracts
  for update to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.providers p
      where p.id = contracts.provider_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.providers p
      where p.id = contracts.provider_id
        and p.user_id = auth.uid()
    )
  );

-- ── 3. DELETE: role narrowed, predicate unchanged ──────────────────────────
drop policy if exists contracts_provider_delete on public.contracts;
create policy contracts_provider_delete on public.contracts
  for delete to authenticated
  using (auth.uid() = user_id);

-- ── 4. anon holds nothing on this table ────────────────────────────────────
-- Latent today because every policy pivots on `auth.uid()`, but the baseline
-- granted `ALL` here and a grant nobody revoked is a grant a future permissive
-- policy converts into access. Same reasoning as `20260906000000` § 10.
revoke all on table public.contracts from anon;
revoke all on table public.contract_signatures from anon;

comment on column public.contracts.provider_id is
  'The providers row this contract belongs to. Bound by RLS to a provider owned '
  'by the writing user on INSERT and on UPDATE (20261031000000) — before that a '
  'caller who was merely SOME provider could point a contract at anyone, and the '
  'UNIQUE constraint then denied the real owner their own slot.';
