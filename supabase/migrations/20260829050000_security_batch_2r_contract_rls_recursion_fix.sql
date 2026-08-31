-- =============================================================================
-- Security Batch 2R: fix the contracts <-> contract_signatures RLS recursion
-- =============================================================================
-- The SELECT policies contracts_provider_read and signatures_read_own each
-- subquery the OTHER RLS-protected table, so evaluating one re-invokes the
-- other's policy, looping forever (SQLSTATE 42P17). Any authenticated read of
-- either table currently errors (feature latent: 0 rows today).
--
-- Fix: move each cross-table membership check into a SECURITY DEFINER helper
-- owned by postgres (a BYPASSRLS role and the tables' owner). Inside the helper
-- the opposing table is read WITHOUT RLS, so the opposing SELECT policy is never
-- invoked and the cycle is broken. auth.uid() still reflects the caller's JWT
-- inside a definer function. Only the two recursive SELECT policies are
-- rewritten; INSERT/UPDATE/DELETE policies, grants, storage policies, other
-- tables, and app code are untouched. This batch deliberately excludes any
-- anon/grant hardening.
-- =============================================================================

-- 1. Helper: is the caller the OWNER (provider) of this contract?
--    Queries ONLY public.contracts. Never queries contract_signatures.
create or replace function public.is_contract_owner(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contracts c
    where c.id = p_contract_id
      and c.user_id = auth.uid()
  );
$$;
alter function public.is_contract_owner(uuid) owner to postgres;
revoke all on function public.is_contract_owner(uuid) from public;
grant execute on function public.is_contract_owner(uuid) to anon, authenticated, service_role;

-- 2. Helper: is the caller a SIGNER (client) of this contract?
--    Queries ONLY public.contract_signatures. Never queries contracts.
create or replace function public.is_contract_signer(p_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contract_signatures cs
    where cs.contract_id = p_contract_id
      and cs.client_user_id = auth.uid()
  );
$$;
alter function public.is_contract_signer(uuid) owner to postgres;
revoke all on function public.is_contract_signer(uuid) from public;
grant execute on function public.is_contract_signer(uuid) to anon, authenticated, service_role;

-- 3. Rewrite the two recursive SELECT policies to call the definer helpers.
--    Role scope (public) and command (SELECT) are preserved; only the recursive
--    subquery is replaced by a non-recursive helper call.

-- contracts: owner (provider) or a client who signed it.
drop policy if exists contracts_provider_read on public.contracts;
create policy contracts_provider_read on public.contracts
  for select to public
  using (
    auth.uid() = user_id
    or public.is_contract_signer(id)
  );

-- contract_signatures: the signer, or the owning provider of the contract.
drop policy if exists signatures_read_own on public.contract_signatures;
create policy signatures_read_own on public.contract_signatures
  for select to public
  using (
    auth.uid() = client_user_id
    or public.is_contract_owner(contract_id)
  );
