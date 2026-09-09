-- Pre-Beta Correction 2 — a signature is bound to the caller's OWN booking, and
-- to the contract that actually governs it.
--
-- ── FOUND BY THE CODEBASE AUDIT OF THIS SLICE, THEN REPRODUCED ────────────
--
-- `20261031000000` bound `contracts.provider_id` to the writing provider, and in
-- the same file reached into `contract_signatures` to revoke `anon`. It did not
-- look at that table's own write policies. They carried the IDENTICAL pair of
-- defects the migration was written to fix:
--
--   signatures_client_insert  INSERT to authenticated
--     WITH CHECK (auth.uid() = client_user_id)          -- and nothing else
--   signatures_client_update  UPDATE to PUBLIC          -- no role clause
--     USING (auth.uid() = client_user_id)               -- and NO with check
--
-- `contract_id` and `booking_id` are unconstrained on both paths. Reproduced
-- against non-production with three real sessions:
--
--   1. A stranger inserted a signature row for ANOTHER CLIENT'S booking. It
--      succeeded — they need only claim themselves as `client_user_id`.
--   2. `contract_signatures_booking_id_key` is UNIQUE on `booking_id`, so the
--      real client was then refused with `23505` and CAN NEVER SIGN THEIR OWN
--      BOOKING.
--
-- That is the same "a forged row is also a denial of service" shape found on
-- `contracts`, on the table that holds the record of who agreed to what. And this
-- slice made it MORE reachable, not less: `20261032000000` lets any authenticated
-- caller learn an approved provider's `contracts.id`, which is precisely the
-- unvalidated input this policy accepts.
--
-- ── WHY A DEFINER HELPER IS NEEDED ────────────────────────────────────────
--
-- The natural predicate — "this contract belongs to the provider on this
-- booking" — cannot be written inline. A policy expression that reads
-- `public.contracts` is subject to that table's own RLS, and the signer is by
-- definition NOT yet a signer, so the row is invisible to them at exactly the
-- moment the check runs. It would fail closed for every legitimate first
-- signature: the same loop `20261032000000` documents on the read side.
--
-- So the relation is asked through a `SECURITY DEFINER` helper, the shape
-- `20260829050000` already established for `is_contract_owner` /
-- `is_contract_signer` when it broke the identical recursion. The helper answers
-- one boolean about two ids the caller already holds; it reveals nothing, returns
-- no contract content, and cannot be used to enumerate — a caller who guesses a
-- contract id learns only whether it pairs with a booking id they must also
-- already know.
--
-- ── THE BINDING ───────────────────────────────────────────────────────────
--
-- A signature may be written only when all three hold:
--   * the signer is the caller                (`auth.uid() = client_user_id`)
--   * the booking is the caller's own         (`bookings.user_id = auth.uid()`)
--   * the contract governs that booking       (same provider — the helper)
--
-- This is the transaction-specific binding Correction 2 asked for and which the
-- READ side could not have, because on the write path the booking exists: it is
-- created at `/book/payment` immediately before the signature is inserted
-- (`app/book/payment.tsx`). Nothing in the legitimate flow changes.

-- ── 1. Does this contract govern this booking? ────────────────────────────
-- Queries ONLY `contracts` and `bookings`, never `contract_signatures`, so it
-- cannot re-enter the policy that calls it.
create or replace function public.contract_governs_booking(
  p_contract_id uuid,
  p_booking_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.contracts c
      join public.bookings b on b.id = p_booking_id
     where c.id = p_contract_id
       and c.provider_id = b.provider_id
  );
$$;

alter function public.contract_governs_booking(uuid, uuid) owner to postgres;
revoke all on function public.contract_governs_booking(uuid, uuid) from public, anon;
grant execute on function public.contract_governs_booking(uuid, uuid) to authenticated;

comment on function public.contract_governs_booking(uuid, uuid) is
  'True when the contract and the booking name the same provider. Exists so the '
  'contract_signatures write policies can relate the two without reading '
  'public.contracts under the caller''s RLS — a first-time signer cannot see that '
  'row yet, so an inline predicate would fail closed for every legitimate '
  'signature. Returns one boolean and no content.';

-- ── 2. INSERT: the signer, their booking, and the governing contract ──────
drop policy if exists "signatures_client_insert" on public.contract_signatures;
create policy "signatures_client_insert" on public.contract_signatures
  for insert to authenticated
  with check (
    auth.uid() = client_user_id
    and exists (
      select 1 from public.bookings b
      where b.id = contract_signatures.booking_id
        and b.user_id = auth.uid()
    )
    and public.contract_governs_booking(
      contract_signatures.contract_id,
      contract_signatures.booking_id
    )
  );

-- ── 3. UPDATE: constrained BEFORE and AFTER, and no longer `public` ───────
-- The old policy had `USING` only, so PostgreSQL applied it to the new row as
-- well — which pinned `client_user_id` and left `contract_id`, `booking_id`,
-- `status` and `signature_url` free to be rewritten afterwards. Both halves are
-- spelled out now, and the role clause the baseline omitted is added.
drop policy if exists "signatures_client_update" on public.contract_signatures;
create policy "signatures_client_update" on public.contract_signatures
  for update to authenticated
  using (
    auth.uid() = client_user_id
    and exists (
      select 1 from public.bookings b
      where b.id = contract_signatures.booking_id
        and b.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = client_user_id
    and exists (
      select 1 from public.bookings b
      where b.id = contract_signatures.booking_id
        and b.user_id = auth.uid()
    )
    and public.contract_governs_booking(
      contract_signatures.contract_id,
      contract_signatures.booking_id
    )
  );

-- ── 4. The read policy keeps its predicate and gains its role clause ──────
-- `signatures_read_own` was created without a role clause, so it nominally
-- applied to `anon`. Latent — both disjuncts pivot on `auth.uid()` — and `anon`
-- now holds no privilege on this table at all (`20261031000000` § 4). Narrowed
-- anyway: this is the table that records who agreed to a legal document, and a
-- role clause is cheaper than the argument about whether the latency is safe.
drop policy if exists "signatures_read_own" on public.contract_signatures;
create policy "signatures_read_own" on public.contract_signatures
  for select to authenticated
  using (
    auth.uid() = client_user_id
    or public.is_contract_owner(contract_id)
  );

comment on column public.contract_signatures.booking_id is
  'The booking this signature belongs to. UNIQUE. Bound by RLS to a booking the '
  'signing user owns, and to a contract that governs it (20261035000000) — '
  'before that any authenticated caller could insert a signature against a '
  'stranger''s booking, and the UNIQUE constraint then permanently denied the '
  'real client the ability to sign their own.';
