-- Pre-Beta Correction 2 — a prospective client can read the contract they are
-- being asked to sign.
--
-- ── THE DEFECT, REPRODUCED AGAINST NON-PRODUCTION ─────────────────────────
--
-- Provider A published an active contract. A freshly created, authenticated
-- client — who has never signed anything — ran the query the booking flow runs:
--
--   select id, title, body from contracts
--    where provider_id = <A> and is_active = true
--
-- Result: ZERO ROWS AND NO ERROR. Controls in the same run: provider A (the
-- owner) read it; unrelated provider B did not.
--
-- The live policy is `USING (auth.uid() = user_id OR is_contract_signer(id))`,
-- and it closes a loop: a client may read the contract only after signing it, and
-- may only sign it after reading it.
--
-- WHY "ZERO ROWS AND NO ERROR" IS THE WHOLE PROBLEM. `lib/contracts.ts`
-- deliberately distinguishes a technical failure from a genuine absence —
-- Batch 4A hardened exactly that — and on an empty result it correctly returns
-- null. `app/book/contract.tsx` then takes the "this provider has no contract"
-- branch and `router.replace('/book/payment')`. So the contract step SILENTLY
-- SKIPS for every client, every provider, always; no `contract_signatures` row
-- is ever written; and `contracts-list` is permanently empty. Batch 4A closed the
-- error path, which was real, but the live failure was a SUCCESSFUL empty read.
-- Corroboration in the tree: `20260829050000`'s own header says of these two
-- tables, "feature latent: 0 rows today."
--
-- ── THE FIX, AND ITS HONEST BOUNDARY ───────────────────────────────────────
--
-- A `SECURITY DEFINER` read function, NOT a widening of the table policy. The
-- table's RLS is untouched: owner or existing signer, exactly as before. This
-- function is the single controlled surface, so the gate can be narrowed later in
-- one place rather than unpicked from a policy.
--
-- It is bounded four ways: `authenticated` only (anon holds no EXECUTE); one
-- named provider per call, never a list; `is_active` contracts only; and the
-- provider must be `is_approved` — a provider hidden from the marketplace has no
-- prospective clients, so their document is not offered up.
--
-- IT RETURNS NO `user_id`. A prospective client has no reason to learn the
-- provider's auth id from a contract, and this function will not be the place
-- they do.
--
-- ── WHAT THIS DOES NOT ACHIEVE, STATED PLAINLY ─────────────────────────────
--
-- Correction 2 asked for access that is "transaction/booking-specific". THAT IS
-- NOT REACHABLE WITHOUT A PRODUCT CHANGE, and the reason is structural rather
-- than an oversight here: the booking row is created at `/book/payment`, which
-- comes AFTER `/book/contract`. At the moment the contract must be displayed
-- there is no booking, no attempt record, and nothing else server-side tying this
-- caller to this provider. A booking-scoped predicate would therefore keep
-- failing for precisely the first-time client this migration exists to serve.
--
-- So the boundary actually achieved is: ANY AUTHENTICATED USER MAY READ THE
-- ACTIVE CONTRACT OF A LIVE PROVIDER, one at a time. That is a real widening and
-- it is recorded rather than glossed. Two things make it defensible as the
-- minimum: this document is, by product design, shown to every prospective client
-- before they book; and `provider_policies` — the provider's cancellation, fee
-- and reschedule terms — is ALREADY `USING (true)`, readable by anon, so the
-- neighbouring document of the same kind is more exposed than this one now is.
--
-- Narrowing it to a real transaction requires reordering the booking flow so a
-- booking (or an explicit attempt record) exists before the contract is shown.
-- That is a product decision and is deliberately NOT taken here; it is recorded
-- for Founder review.

create or replace function public.provider_contract_for_booking(p_provider_id uuid)
returns table (
  id uuid,
  provider_id uuid,
  title text,
  body text,
  contract_type text,
  pdf_url text,
  pdf_filename text,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.provider_id, c.title, c.body, c.contract_type,
         c.pdf_url, c.pdf_filename, c.is_active, c.created_at, c.updated_at
    from public.contracts c
    join public.providers p on p.id = c.provider_id
   where c.provider_id = p_provider_id
     and c.is_active
     and p.is_approved
     -- A definer function must re-establish that a caller exists: `auth.uid()` is
     -- null for anon and for a no-JWT request, and this body would otherwise run
     -- with the owner's rights for a caller who never authenticated. The EXECUTE
     -- grant below is the first refusal; this is the second.
     and (select auth.uid()) is not null;
$$;

alter function public.provider_contract_for_booking(uuid) owner to postgres;
revoke all on function public.provider_contract_for_booking(uuid) from public, anon;
grant execute on function public.provider_contract_for_booking(uuid) to authenticated;

comment on function public.provider_contract_for_booking(uuid) is
  'The ACTIVE contract of one APPROVED provider, for an authenticated caller who '
  'is about to be asked to sign it. Exists because contracts RLS is owner-or-'
  'signer, which made the booking flow''s contract gate unreachable for a '
  'first-time client — the read returned zero rows and no error, so the flow '
  'treated it as "no contract" and skipped signing entirely. Deliberately NOT '
  'booking-scoped: the booking row does not exist yet at that point in the flow. '
  'Returns no user_id. Narrowing this to a real transaction needs a flow change, '
  'which is a product decision.';
