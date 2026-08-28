-- =============================================================================
-- S1B-impl-3: Lock down base public.clients (closes F2-P0-001)
-- =============================================================================
-- Enables RLS and self-only policies on public.clients, drops the accidental
-- public-read policy, and removes anon access + unneeded authenticated verbs.
-- Cross-user client identity is served by the clients_public / clients_provider
-- views (S1B-impl-1); app reads were migrated in S1B-impl-2.
--
-- Scope: RLS + policies + grants on public.clients ONLY. Does not touch the
-- views, application code, other tables, migration history, storage, booking
-- security, contracts, client_reviews, or Sentry.
-- =============================================================================

-- 1. Remove the existing inert policies (all TO public), especially the
--    USING(true) public read, so the new authenticated self-only set governs.
drop policy if exists clients_public_read on public.clients;
drop policy if exists clients_insert_own  on public.clients;
drop policy if exists clients_update_own  on public.clients;

-- 2. Self-only policies for authenticated (a client's id IS their auth.uid()).
--    No DELETE policy: account deletion is not a product flow today.
create policy clients_select_self on public.clients
  for select to authenticated using (id = auth.uid());
create policy clients_insert_self on public.clients
  for insert to authenticated with check (id = auth.uid());
create policy clients_update_self on public.clients
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- 3. Turn on RLS so the policies above are enforced.
alter table public.clients enable row level security;

-- 4. Grant cleanup. Remove anon entirely; drop unused/dangerous verbs from
--    authenticated; keep exactly SELECT/INSERT/UPDATE (gated by the policies).
--    service_role is left untouched (bypasses RLS; server-only).
revoke all privileges on public.clients from anon;
-- defense in depth: strip any column-level grants to anon (no-op if the live
-- column_privileges rows were merely reflecting the table grants revoked above).
revoke
  select (id, name, notes, avatar_url, neighborhood, created_at),
  insert (id, name, notes, avatar_url, neighborhood, created_at),
  update (id, name, notes, avatar_url, neighborhood, created_at),
  references (id, name, notes, avatar_url, neighborhood, created_at)
on table public.clients
from anon;
revoke delete, truncate, references, trigger on public.clients from authenticated;
