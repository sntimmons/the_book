-- Message authorship and read-state, corrected.
--
-- Scope: the `messages` UPDATE boundary and the release signal's failure mode. No new table,
-- no proposal/agreement/obligation schema, no notification subsystem.
--
-- TWO DEFECTS, ONE ROOT CAUSE
--
-- 1. `participants_mark_messages_read` (20260829000000:2605-2613) carries
--        `... AND (sender_id = sender_id) AND (content = content) AND (created_at = created_at)`
--    and 20260910000000's header cited that as pinning authorship. **It does not.** An RLS
--    policy expression can only reference the NEW row -- there is no OLD binding -- so each
--    conjunct is a TAUTOLOGY, true for any non-null value. Combined with `GRANT ALL ON
--    messages TO authenticated` and a conversation-scoped USING clause, either participant
--    could PATCH any message in their thread and rewrite its `content` or re-attribute its
--    `sender_id` to the other party. That defeats the one property the whole `sender_id IS
--    NULL` representation exists to provide: that a platform notice is attributable to nobody.
--    A client could never CREATE one; either participant could DESTROY one.
--
-- 2. The same conjunct is NULL for a null sender, and a WITH CHECK that is not TRUE rejects the
--    row -- so the release notice could never be marked read. The client filter
--    `.neq('sender_id', uid)` compiles to `sender_id <> uid`, which is also NULL for a null
--    sender, so the row was excluded from the update set too. Meanwhile the unread COUNT is
--    computed in JS where `null !== uid` is TRUE, so it WAS counted. Every release left both
--    providers -- including the one who ended the negotiation -- with a permanent unread badge
--    that no action in the app could clear.
--
-- A policy cannot express "unchanged from OLD". A trigger can. So the pin moves to where it can
-- actually be enforced, and the policy is reduced to what it can honestly assert.

create or replace function public.enforce_message_immutability()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- `is_read` is the ONLY column a participant may change. Authorship, text, thread and time
  -- are immutable once written -- including for a platform notice, whose whole value is that
  -- nobody can claim or alter it. Deliberately NO service_role escape below this point would
  -- be wrong: an operator correction path is a separate, explicit decision, and the escape
  -- above keeps it available without pretending a participant has it.
  if new.sender_id is distinct from old.sender_id
     or new.content is distinct from old.content
     or new.conversation_id is distinct from old.conversation_id
     or new.created_at is distinct from old.created_at
     or new.id is distinct from old.id then
    raise exception 'Only the read state of a message may change.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

alter function public.enforce_message_immutability() owner to postgres;
revoke all on function public.enforce_message_immutability() from public, anon;

drop trigger if exists messages_immutability on public.messages;
create trigger messages_immutability
  before update on public.messages
  for each row execute function public.enforce_message_immutability();

-- The policy now asserts only what a policy CAN assert: you are a participant of this thread.
-- The self-referential conjuncts are removed because they were never pins, and because their
-- NULL result made a platform notice unmarkable.
drop policy if exists "participants_mark_messages_read" on public.messages;
create policy "participants_mark_messages_read" on public.messages
  for update to authenticated
  using (
    conversation_id in (
      select c.id from public.conversation c
       where c.client_id = (select auth.uid())
          or c.provider_id in (
            select p.id from public.providers p where p.user_id = (select auth.uid())
          )
    )
  )
  with check (
    conversation_id in (
      select c.id from public.conversation c
       where c.client_id = (select auth.uid())
          or c.provider_id in (
            select p.id from public.providers p where p.user_id = (select auth.uid())
          )
    )
  );

-- ── The signal must never veto the release ───────────────────────────────────
-- 20260910000000 stated the rule -- "a stranded interest without a conversation is not a reason
-- to refuse the release" -- and then enforced it for one branch only. If the resolved thread is
-- request-gated (`pending` or `declined`), enforce_prebooking_message_rules raises and rolls the
-- WHOLE release back. That is unreachable for anything accepted through accept_barter_interest,
-- but it IS reachable for a pre-Slice-2 accepted interest whose pair already held a pre-booking
-- request -- exactly the stranded population release exists to free. They could never release,
-- and the client mapped the failure to "That negotiation is no longer active", which is false.
create or replace function public.release_barter_interest(p_interest_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_interest public.barter_interests%rowtype;
  v_offer public.barter_offers%rowtype;
  v_is_owner boolean;
  v_is_responder boolean;
  v_reason text;
  v_key text;
  v_conv public.conversation%rowtype;
  v_copy text;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  select o.* into v_offer from public.barter_offers o
   where o.id = v_interest.offer_id for update;
  if not found then
    raise exception 'That offer no longer exists.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;

  v_is_owner := (v_offer.user_id = v_uid);
  v_is_responder := (v_interest.interested_user_id = v_uid);

  if not (v_is_owner or v_is_responder) then
    raise exception 'Only a participant can end this negotiation.'
      using errcode = 'insufficient_privilege';
  end if;

  if v_interest.status = 'released' then
    return v_interest.release_reason;
  end if;

  if v_interest.status <> 'accepted' then
    raise exception 'Only the response currently in negotiation can be released.'
      using errcode = 'check_violation';
  end if;

  -- DEFENSE IN DEPTH, carried over from accept_barter_interest. Running as postgres, RLS is off,
  -- so nothing else re-establishes that these provider rows belong to the users about to be
  -- messaged. Without it, an inconsistent row would resolve a thread with an unrelated THIRD
  -- provider and write a notice into it.
  if not exists (
    select 1 from public.providers p
     where p.id = v_offer.provider_id and p.user_id = v_offer.user_id
  ) or not exists (
    select 1 from public.providers p
     where p.id = v_interest.interested_provider_id
       and p.user_id = v_interest.interested_user_id
  ) then
    raise exception 'Offer or response identity is inconsistent; cannot release.'
      using errcode = 'internal_error';
  end if;

  v_reason := case when v_is_responder then 'responder_withdrew'
                   else 'owner_ended_negotiation' end;

  -- PRE-AGREEMENT ONLY. When the agreement schema lands, the "no official agreement exists for
  -- this interest" guard goes HERE -- in THIS definition, the live one. The same instruction in
  -- 20260909000000 and 20260910000000 now sits on superseded bodies; see MIGRATION_LEDGER.md.
  -- It must also be enforced at the write boundary, not only in this function.
  perform set_config('app.barter_release', v_interest.id::text, true);
  update public.barter_interests
     set status = 'released',
         released_at = clock_timestamp(),
         released_by = v_uid,
         release_reason = v_reason
   where id = v_interest.id
  returning release_reason into v_reason;
  perform set_config('app.barter_release', '', true);

  v_key := least(v_offer.provider_id, v_interest.interested_provider_id)::text || ':' ||
           greatest(v_offer.provider_id, v_interest.interested_provider_id)::text;

  select c.* into v_conv from public.conversation c
   where c.provider_pair_key = v_key order by c.id limit 1;
  if not found then
    select c.* into v_conv from public.conversation c
     where (c.client_id = v_interest.interested_user_id and c.provider_id = v_offer.provider_id)
        or (c.client_id = v_offer.user_id
            and c.provider_id = v_interest.interested_provider_id)
     order by c.id limit 1;
  end if;

  -- BOTH skip conditions, not one. A thread that is request-gated cannot accept a message, and
  -- the notice must not take the release down with it.
  if v_conv.id is not null
     and (v_conv.booking_id is not null
          or v_conv.request_status is null
          or v_conv.request_status = 'accepted') then
    v_copy := case v_reason
                when 'responder_withdrew' then
                  'This trade negotiation was ended by the responding provider.'
                when 'owner_ended_negotiation' then
                  'This trade negotiation was ended by the post owner.'
                else 'This trade negotiation was ended.'
              end;

    insert into public.messages (conversation_id, sender_id, content, is_read, created_at)
    values (v_conv.id, null, v_copy, false, clock_timestamp());

    update public.conversation set last_message_at = clock_timestamp() where id = v_conv.id;
  end if;

  return v_reason;
end;
$$;

alter function public.release_barter_interest(uuid) owner to postgres;
revoke all on function public.release_barter_interest(uuid) from public, anon;
grant execute on function public.release_barter_interest(uuid) to authenticated;
