-- ACCOUNT ERASURE — OQ-087 CLOSED for the interim closed-beta policy. Only the
-- canonical ACCEPTED artifact is retained under the contract policy; the drafts,
-- the superseded PDFs and the unused signature images are not.
--
-- ══ WHAT THE ENGINE DID, AND WHY IT WAS A QUESTION ════════════════════════
--
-- `20261112000000` kept the contract chain alive through an erasure — the right
-- call, because deleting it destroys every CLIENT's record of terms they
-- accepted. But it kept ALL of it: every draft the departing provider ever
-- wrote, every superseded version nobody accepted, and every object under
-- `contract-pdfs/<their auth uid>/…` and `contract-signatures/<their auth uid>/…`.
-- Those two buckets were the only storage prefixes no erasure step touched, so a
-- real account id survived in an object path indefinitely, in an erasure the
-- product describes as permanent.
--
-- ══ THE RULING ════════════════════════════════════════════════════════════
--
-- Accepted-contract retention includes ONLY the artifacts that form part of the
-- canonical accepted evidence:
--
--   * the exact frozen accepted contract version and its content
--   * the canonical accepted PDF, where that is the stored accepted artifact
--   * the acceptance timestamp
--   * the minimum party identity
--   * a signature artifact ONLY IF the current implementation actually relies on
--     it as part of the accepted evidence
--
-- and NOT: abandoned drafts, superseded unaccepted PDFs, decorative or unused
-- signature images, or redundant copies that add no evidentiary value.
--
-- ══ THE SIGNATURE ARTIFACT: THE CONDITION IS NOT MET, AND THAT IS A FACT ══
--
-- `contract_signatures.signature_url` is **always NULL in this implementation**.
-- The signature canvas was removed; `app/book/payment.tsx:189` writes the column
-- as an explicit `null` and `app/book/contract.tsx:332` and
-- `app/contracts/[id].tsx:109` both record that no image was ever on file.
-- `lib/storage.ts:7` says the bucket is "not written yet" and it is right.
--
-- So the ruling's condition — *only if the implementation actually relies on it*
-- — is not met, and nothing in `contract-signatures` is accepted evidence. Any
-- object found under an erased account's prefix there is an unused signature
-- image by definition, and goes. **If a signature image is ever reintroduced as
-- part of what makes an acceptance evidence, this decision has to be revisited
-- before that ships** — not after.
--
-- ══ WHAT THIS DOES NOT CLAIM ══════════════════════════════════════════════
--
-- Nothing here asserts that the retained record is legally sufficient, legally
-- required, a verified e-signature, or enforceable. The retention DURATION for
-- this class is still unset and still flagged for attorney review (OQ-084);
-- this file decides SCOPE, which is the other half of that question and the
-- half that is an engineering fact rather than a legal one.

-- ── 1. The step ──────────────────────────────────────────────────────────
--
-- Runs BEFORE `accepted_contracts`, which is the step that severs
-- `contracts.user_id`. Once that has run, the subject's own drafts can no longer
-- be identified as theirs at all, so this has to happen while the link is still
-- there. Order is the architecture in this engine and this is one more instance
-- of it.
create or replace function public.adel_contract_artifacts(p_subject uuid)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare v_contracts integer := 0; v_versions integer := 0; v_queued integer := 0;
begin
  -- (a) ABANDONED DRAFTS. A contract nobody ever signed — in any state, so a
  -- pending or declined signature still protects it, because that row is the
  -- COUNTERPARTY's record and is not this person's to delete. The cascade into
  -- contract_versions takes the drafts' versions with it, which is correct: they
  -- were never accepted either.
  with d as (
    delete from public.contracts c
     where c.user_id = p_subject
       and not exists (select 1 from public.contract_signatures s where s.contract_id = c.id)
    returning 1
  ) select count(*) into v_contracts from d;

  -- (b) SUPERSEDED UNACCEPTED VERSIONS of the contracts that DO survive. A
  -- version no signature points at was never the thing anybody agreed to, so it
  -- is not evidence — it is a copy of a draft sitting beside the evidence. The
  -- immutability guard permits this delete on the erasure path
  -- (20261068000000:119-125); the FK from contract_signatures means a version
  -- anybody bound to cannot be removed even by accident.
  with d as (
    delete from public.contract_versions v
     where exists (select 1 from public.contracts c
                    where c.id = v.contract_id and c.user_id = p_subject)
       and not exists (select 1 from public.contract_signatures s
                        where s.contract_version_id = v.id)
    returning 1
  ) select count(*) into v_versions from d;

  -- (c) THE BYTES. Everything under this account's prefix in either contract
  -- bucket that NO surviving row still names. What survives (b) is exactly the
  -- canonical accepted artifact: the `pdf_url` of a version somebody bound to,
  -- and the `pdf_url` still on a retained contract row. Everything else is an
  -- abandoned draft's PDF, a superseded unaccepted PDF, or — in
  -- `contract-signatures`, where no row ever names anything — an unused image.
  --
  -- The path is extracted the way the storage policies already do it
  -- (20260829060000:34), so a URL and an object name are compared the same way
  -- here as where access is decided. SQL cannot delete a storage object at all
  -- (20261107000000), so these are QUEUED and `media_purge` refuses to pass
  -- while any of them is unconfirmed.
  with q as (
    insert into public.pending_media_deletions (bucket_id, object_path, subject_id)
    select o.bucket_id, o.name, p_subject
      from storage.objects o
     where o.bucket_id in ('contract-pdfs', 'contract-signatures')
       and o.name like p_subject::text || '/%'
       and not exists (
         select 1 from public.contract_versions v
          where v.pdf_url is not null
            and split_part(split_part(v.pdf_url, '/contract-pdfs/', 2), '?', 1) = o.name)
       and not exists (
         select 1 from public.contracts c
          where c.pdf_url is not null
            and split_part(split_part(c.pdf_url, '/contract-pdfs/', 2), '?', 1) = o.name)
       and not exists (
         select 1 from public.contract_signatures s
          where s.signature_url is not null
            and split_part(split_part(s.signature_url, '/contract-signatures/', 2), '?', 1) = o.name)
    on conflict (bucket_id, object_path) do nothing
    returning 1
  ) select count(*) into v_queued from q;

  return jsonb_build_object('drafts_deleted', v_contracts,
                            'unaccepted_versions_deleted', v_versions,
                            'objects_queued', v_queued);
end $$;
alter function public.adel_contract_artifacts(uuid) owner to postgres;
revoke all on function public.adel_contract_artifacts(uuid) from public, anon, authenticated;

comment on function public.adel_contract_artifacts(uuid) is
  'PD-105 / OQ-087. Narrows what the contract policy retains to the CANONICAL '
  'ACCEPTED evidence: the frozen version somebody bound to, its PDF where that '
  'is the stored artifact, the acceptance timestamp and the minimum party '
  'identity. Abandoned drafts, superseded unaccepted versions and the objects '
  'behind them go. Nothing in contract-signatures is retained because nothing in '
  'this implementation writes it — signature_url is always NULL, so the ruling''s '
  '"only if the implementation relies on it" condition is not met. Revisit if a '
  'signature image is ever reintroduced as part of the accepted evidence.';

-- ── 2. In the step list, before the sever it depends on ──────────────────
create or replace function public.account_deletion_step_keys()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'provider_content', 'community_content', 'booking_photos_sever', 'messages_sever',
    'bookings', 'reviews', 'barter',
    'contract_artifacts',  -- narrows the class BEFORE the owner link is severed
    'accepted_contracts', 'reports_evidence',
    'operator_audit',
    'profile_account',   -- the auth row goes here
    'media_purge'        -- and the bytes are only confirmed AFTER it
  ]::text[];
$$;
alter function public.account_deletion_step_keys() owner to postgres;

comment on function public.account_deletion_step_keys() is
  'The data classes, IN EXECUTION ORDER. `contract_artifacts` precedes '
  '`accepted_contracts` because the latter severs contracts.user_id, after which '
  'the departing account''s own drafts can no longer be identified as theirs. '
  '`profile_account` deletes the auth row and everything before it exists so the '
  'cascades that fires take nothing with them. `media_purge` is LAST and '
  'deliberately after it: it deletes nothing, it only refuses to pass while '
  'storage objects remain unconfirmed — so the request cannot report success with '
  'the bytes still in the bucket.';

-- ── 3. Dispatch, and the hold class it answers to ────────────────────────
--
-- Body taken from the LAST definition (`20261107000000:241`) with two changes
-- and no others: the dispatch branch, and the hold-class mapping.
create or replace function public.run_account_deletion_step(
  p_request_id uuid, p_step_key text
)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_req    public.account_deletion_requests%rowtype;
  v_step   public.account_deletion_steps%rowtype;
  v_result jsonb;
  v_class  text;
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Deletion steps are not client-callable.' using errcode = '42501';
  end if;

  select * into v_req from public.account_deletion_requests where id = p_request_id for update;
  if not found then
    raise exception 'No such deletion request.' using errcode = 'check_violation';
  end if;
  select * into v_step from public.account_deletion_steps
   where request_id = p_request_id and step_key = p_step_key for update;
  if not found then
    raise exception 'No such deletion step: %', p_step_key using errcode = 'check_violation';
  end if;
  if v_step.status = 'completed' then return 'completed'; end if;

  -- `contract_artifacts` maps to the ACCEPTED_CONTRACTS class deliberately: a
  -- legal hold on that class has to stop the narrowing too, or a hold placed to
  -- preserve a contract record would watch its drafts and PDFs be deleted.
  v_class := case p_step_key
               when 'booking_photos_sever' then 'booking_photos'
               when 'messages_sever' then 'messages'
               when 'contract_artifacts' then 'accepted_contracts'
               else p_step_key end;
  if exists (
    select 1 from public.account_deletion_holds h
     where h.request_id = p_request_id and h.record_class = v_class and h.released_at is null
  ) then
    update public.account_deletion_steps set status = 'held', last_error = null
     where id = v_step.id;
    return 'held';
  end if;

  update public.account_deletion_steps
     set status = 'running', attempts = attempts + 1, started_at = coalesce(started_at, now()),
         last_error = null
   where id = v_step.id;

  begin
    v_result := case p_step_key
      when 'provider_content'     then public.adel_provider_content(v_req.subject_id)
      when 'community_content'    then public.adel_community_content(v_req.subject_id)
      when 'booking_photos_sever' then public.adel_booking_photos_sever(v_req.subject_id)
      when 'messages_sever'       then public.adel_messages_sever(v_req.subject_id)
      when 'bookings'             then public.adel_bookings(v_req.subject_id)
      when 'reviews'              then public.adel_reviews(v_req.subject_id)
      when 'barter'               then public.adel_barter(v_req.subject_id)
      when 'contract_artifacts'   then public.adel_contract_artifacts(v_req.subject_id)
      when 'accepted_contracts'   then public.adel_accepted_contracts(v_req.subject_id)
      when 'reports_evidence'     then public.adel_reports_evidence(v_req.subject_id)
      when 'operator_audit'       then public.adel_operator_audit(v_req.subject_id)
      when 'profile_account'      then public.adel_profile_account(v_req.subject_id)
      when 'media_purge'          then public.adel_media_purge(v_req.subject_id)
      else null end;

    if v_result is null then
      raise exception 'Unknown deletion step: %', p_step_key using errcode = 'internal_error';
    end if;
    update public.account_deletion_steps
       set status = 'completed', completed_at = now(), result = v_result
     where id = v_step.id;
    return 'completed';
  exception when others then
    update public.account_deletion_steps
       set status = 'failed', last_error = left(sqlstate || ': ' || sqlerrm, 4000)
     where id = v_step.id;
    return 'failed';
  end;
end;
$$;
alter function public.run_account_deletion_step(uuid, text) owner to postgres;
revoke all on function public.run_account_deletion_step(uuid, text)
  from public, anon, authenticated;

-- ── 4. An in-flight request predates the new step ────────────────────────
--
-- Body taken from the LAST definition (`20261124000000`) with one change: the
-- missing step rows are seeded before the loop.
create or replace function public.finalize_account_deletion(p_request_id uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_req         public.account_deletion_requests%rowtype;
  v_key         text;
  v_pending     integer;
  v_failed      integer;
  v_photo_due   timestamptz;
  v_msg_due     timestamptz;
  v_photo_days  integer := public.retention_days('booking_photos');
  v_msg_days    integer := public.retention_days('messages');
begin
  if (select auth.role()) <> 'service_role'
     and not ((select auth.role()) is null and (select auth.uid()) is null) then
    raise exception 'Finalisation is not client-callable.' using errcode = '42501';
  end if;

  select * into v_req from public.account_deletion_requests where id = p_request_id for update;
  if not found then
    raise exception 'No such deletion request.' using errcode = 'check_violation';
  end if;
  if v_req.status = 'completed' then return 'completed'; end if;
  if v_req.status = 'cancelled' then return 'cancelled'; end if;
  -- THE DATE, in every non-terminal state.
  if v_req.grace_ends_at > now() then
    return 'grace_period';
  end if;

  update public.account_deletion_requests
     set status = 'finalizing',
         finalizing_started_at = coalesce(finalizing_started_at, now()),
         attempts = attempts + 1
   where id = p_request_id;

  -- A REQUEST MADE BEFORE A STEP EXISTED STILL HAS TO RUN IT. Step rows are
  -- seeded at REQUEST time (`20261115000000:100`), so adding a class leaves every
  -- in-flight request without that row — and `run_account_deletion_step` raises
  -- "No such deletion step" OUTSIDE its own exception block, which aborts the
  -- whole finalisation rather than failing one step. Seeding the missing keys
  -- here makes adding a class safe for requests already in the grace period, and
  -- it is why this correction ships with the class that first needed it.
  insert into public.account_deletion_steps (request_id, step_key)
  select p_request_id, k from unnest(public.account_deletion_step_keys()) k
  on conflict (request_id, step_key) do nothing;

  foreach v_key in array public.account_deletion_step_keys() loop
    perform public.run_account_deletion_step(p_request_id, v_key);
  end loop;

  if v_photo_days is not null then
    select max(greatest(
             coalesce(b.completed_at, b.cancelled_at, b.created_at)
               + make_interval(days => v_photo_days),
             v_req.grace_ends_at))
      into v_photo_due
      from public.booking_reference_photos p
      join public.bookings b on b.id = p.booking_id
     where p.uploader_subject_id = v_req.subject_id;
  end if;

  if v_msg_days is not null then
    select max(greatest(
             coalesce(c.last_message_at, c.created_at)
               + make_interval(days => v_msg_days),
             v_req.grace_ends_at))
      into v_msg_due
      from public.messages m
      join public.conversation c on c.id = m.conversation_id
     where m.sender_id in (select pid from public.erasure_pseudonyms_for(v_req.subject_id) pid);
  end if;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at, last_error)
  values (p_request_id, 'booking_photos_purge',
          case when v_photo_days is null then 'held'
               when v_photo_due  is null then 'completed'
               else 'scheduled' end,
          v_photo_due,
          case when v_photo_days is null
               then 'retention_policy.booking_photos has no window set; nothing scheduled and nothing skipped'
               else null end)
  on conflict (request_id, step_key) do update
    set due_at = excluded.due_at,
        last_error = excluded.last_error,
        status = case when public.account_deletion_steps.status = 'completed'
                      then 'completed' else excluded.status end;

  insert into public.account_deletion_steps (request_id, step_key, status, due_at, last_error)
  values (p_request_id, 'messages_purge',
          case when v_msg_days is null then 'held'
               when v_msg_due  is null then 'completed'
               else 'scheduled' end,
          v_msg_due,
          case when v_msg_days is null
               then 'retention_policy.messages has no window set; nothing scheduled and nothing skipped'
               else null end)
  on conflict (request_id, step_key) do update
    set due_at = excluded.due_at,
        last_error = excluded.last_error,
        status = case when public.account_deletion_steps.status = 'completed'
                      then 'completed' else excluded.status end;

  select count(*) filter (where status in ('pending', 'running')),
         count(*) filter (where status = 'failed')
    into v_pending, v_failed
    from public.account_deletion_steps where request_id = p_request_id;

  if v_failed > 0 or v_pending > 0 then
    update public.account_deletion_requests
       set status = 'failed',
           last_error = format('%s step(s) failed, %s still pending', v_failed, v_pending)
     where id = p_request_id;
    return 'failed';
  end if;

  update public.account_deletion_requests
     set status = 'completed', completed_at = now(), last_error = null
   where id = p_request_id;
  return 'completed';
end;
$$;

alter function public.finalize_account_deletion(uuid) owner to postgres;
revoke all on function public.finalize_account_deletion(uuid) from public, anon, authenticated;
