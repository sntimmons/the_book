-- Pre-Beta Correction 2 — the three corrections the security review of this
-- slice produced, plus the sequence the previous file's own rule missed.
--
-- Every item below came from the mandatory read-only Security Reviewer pass over
-- `20261030000000` … `20261035000000`. None was known when those files were
-- written; each is recorded with the reasoning that produced it.

-- ── 1. A SIGNED CONTRACT MAY NOT BE RE-POINTED (SEC-AUTHZ-001, residue) ────
--
-- `20261035000000` bound `contract_signatures` writes to the caller's own booking
-- and to the contract that governs it, which closed the cross-user forgery. B5B
-- then caught what it did NOT close: a signer could still `update` their own row
-- to a DIFFERENT booking of their own with the same provider. Both rows satisfy
-- the ownership predicate, so the policy correctly allowed it — the binding was
-- right and the immutability was missing.
--
-- Why that matters on this table specifically: `contract_signatures` is the record
-- of WHO AGREED TO WHAT, and `booking_id` is UNIQUE. A signer who moves their
-- signature from booking A to booking B leaves A unsigned while B carries an
-- agreement made at a different time about a different appointment, and the
-- `signed_at` timestamp still reads as the original moment. That is a legal
-- artifact quietly describing something that did not happen.
--
-- A trigger rather than a policy, because this is an OLD-vs-NEW comparison and
-- RLS cannot express one — the same division of labour
-- `enforce_booking_write_integrity` uses. `service_role` keeps its escape so
-- account-erasure and support paths are unaffected.
--
-- ZERO RISK TO THE APP: nothing updates this table. `app/book/payment.tsx` is the
-- only writer and it only inserts; `lib/contracts.ts` only reads.
create or replace function public.enforce_signature_target_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;
  if new.contract_id is distinct from old.contract_id
     or new.booking_id is distinct from old.booking_id
     or new.client_user_id is distinct from old.client_user_id then
    raise exception 'A signature cannot be moved to another contract, booking or signer.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_signature_target_immutable() owner to postgres;
revoke all on function public.enforce_signature_target_immutable() from public, anon;

drop trigger if exists enforce_signature_target_immutable on public.contract_signatures;
create trigger enforce_signature_target_immutable
  before update on public.contract_signatures
  for each row execute function public.enforce_signature_target_immutable();

-- ── 2. THE PDF A CLIENT IS ASKED TO SIGN MUST BE READABLE (SEC-STORAGE-001) ─
--
-- `20261032000000` unblocked the contract gate — but only for `contract_type =
-- 'text'`, and nobody noticed until the review traced it. For a PDF contract the
-- RPC returns `pdf_url`, while `can_read_contract_pdf` admits only the owner or
-- an EXISTING signer. So a first-time client reached `/book/contract`, could not
-- open the document, and was still shown a working checkbox reading "I have read
-- and agree to the terms in this PDF contract".
--
-- **A recorded agreement to a document the agreeing party could not open is worse
-- than the gate being skipped**, which is what it replaced. The two contract types
-- must behave identically: the RPC already returns the full `body` of a text
-- contract to the same caller, so withholding the PDF equivalent was an accident
-- of which storage bucket the bytes happen to live in, not a decision.
--
-- The new disjunct carries the SAME bound as the RPC — active contract, approved
-- provider, authenticated caller — so the PDF surface is exactly as wide as the
-- text surface and no wider. It cannot be used to enumerate: the caller must
-- already possess the object's storage path, which they only get from the RPC.
create or replace function public.can_read_contract_pdf(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.contracts c
    where c.pdf_url is not null
      and split_part(split_part(c.pdf_url, '/contract-pdfs/', 2), '?', 1) = object_name
      and (
        c.user_id = auth.uid()                 -- contract owner (provider)
        or public.is_contract_signer(c.id)     -- a client who signed THIS contract
        -- A PROSPECTIVE signer. Same bound as provider_contract_for_booking: the
        -- contract is active, the provider is approved, and the caller is
        -- authenticated. Without this the gate could be agreed to but not read.
        or (
          c.is_active
          and (select auth.uid()) is not null
          and exists (
            select 1 from public.providers p
            where p.id = c.provider_id and p.is_approved
          )
        )
      )
  );
$$;

alter function public.can_read_contract_pdf(text) owner to postgres;
revoke all on function public.can_read_contract_pdf(text) from public, anon;
grant execute on function public.can_read_contract_pdf(text) to authenticated, service_role;

-- ── 3. THE SEQUENCE `20261034000000`'s OWN RULE MISSED (SEC-MIGRATION-001) ──
--
-- That file argues, correctly, that "the privilege is unreachable only because
-- PostgREST offers no way to issue one — a property of the API gateway, not of the
-- database, and the wrong thing to be relying on." It then applied that argument
-- to TRUNCATE on tables and not to sequences: § 1 changed only FUTURE sequence
-- defaults and § 2's loop is `relkind = 'r'`. So `anon` still held `USAGE, SELECT,
-- UPDATE` on `public.categories_id_seq` — i.e. `nextval` and `setval` — for
-- exactly the reason the file rejects. One sequence exists; it is swept here.
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'S'
     order by c.relname
  loop
    execute format('revoke all on sequence public.%I from anon', r.relname);
  end loop;
end $$;

-- ── 4. A COMMENT THAT PROMISED MORE THAN THE FUNCTION DELIVERS (SEC-TRUTH-001) ─
--
-- `20261032000000` states "IT RETURNS NO `user_id`", and the function's own
-- comment repeats it. True of the COLUMN and false of the payload: for a PDF
-- contract the returned `pdf_url` is built as `${userId}/contract_<ts>.pdf` from
-- the PROVIDER's auth uid (`lib/contracts.ts`, `uploadContractPdf`), so the
-- identifier the function claims to withhold travels inside the URL.
--
-- Small in itself — that same uid is already the first path segment of the
-- provider's objects in the PUBLIC `posts-media` and `provider-media` buckets, so
-- it is not secret — but a stated boundary that is not enforced is worse than no
-- statement, because the next reader will trust it. Corrected here rather than by
-- editing an applied migration.
comment on function public.provider_contract_for_booking(uuid) is
  'The ACTIVE contract of one APPROVED provider, for an authenticated caller who '
  'is about to be asked to sign it. Exists because contracts RLS is owner-or-'
  'signer, which made the booking flow''s contract gate unreachable for a '
  'first-time client — the read returned zero rows and no error, so the flow '
  'treated it as "no contract" and skipped signing entirely. Deliberately NOT '
  'booking-scoped: the booking row does not exist yet at that point in the flow. '
  'CORRECTION (20261036000000): an earlier version of this comment claimed the '
  'function returns no user_id. It returns no user_id COLUMN, but for a PDF '
  'contract the provider''s auth uid is the first path segment of the returned '
  'pdf_url. That uid is already public (it prefixes their objects in the public '
  'media buckets), so this is a documentation correction, not a leak — but do not '
  'rely on this function to withhold it. Narrowing the whole surface to a real '
  'transaction needs a booking-flow change, which is a product decision.';

comment on column public.contract_signatures.contract_id is
  'The contract that was signed. Immutable after insert for ordinary callers '
  '(enforce_signature_target_immutable, 20261036000000), alongside booking_id and '
  'client_user_id: a signature that can be re-pointed is a record of an agreement '
  'that may never have happened at the time it claims.';
