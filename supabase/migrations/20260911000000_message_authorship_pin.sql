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
  -- ALLOW-list, expressed as a set difference -- the shape used for barter_interests, and for
  -- the same reason. Naming the five columns that exist today would hold NOW and silently stop
  -- holding the moment `messages` gains a sixth: it would be born mutable by either participant,
  -- with no test failing and this comment becoming false. A set difference makes a future column
  -- immutable BY DEFAULT.
  if (to_jsonb(new) - 'is_read') is distinct from (to_jsonb(old) - 'is_read') then
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

  -- Lock the OFFER, not the interest: the invariant being protected is "one accepted response
  -- per offer", so the offer is the serialisation point -- the same reasoning by which
  -- accept_barter_interest locks it. This serialises a release against a concurrent accept of a
  -- different response rather than racing for the freed slot.
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

  -- Idempotent where safe, and this is ALSO what stops the signal being written twice: a
  -- repeated call returns before the update and therefore before the message insert.
  -- Deliberately AFTER the participant check, so a non-participant learns nothing about the row.
  if v_interest.status = 'released' then
    return v_interest.release_reason;
  end if;

  if v_interest.status <> 'accepted' then
    raise exception 'Only the response currently in negotiation can be released.'
      using errcode = 'check_violation';
  end if;

  -- A SEED, not the decision. enforce_barter_interest_write CLAMPS all three release columns,
  -- so whatever is written here is overwritten -- an engineer who added `mutual_end` here and
  -- nowhere else would watch it be silently rewritten to `owner_ended_negotiation`: a legal
  -- value, no constraint violation, a green suite. The value RETURNED below is read back from
  -- the row, so the caller is told what the boundary recorded.
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
  -- IDENTITY, checked HERE and not earlier. This assertion exists solely for the lookup above:
  -- running as postgres with RLS off, nothing else re-establishes that these provider rows
  -- belong to the users about to be messaged, and an inconsistent row would resolve a thread
  -- with an unrelated THIRD provider. But it serves the SIGNAL, so it must not veto the
  -- RELEASE -- placing it before the status update re-created the very shape this file's rule
  -- forbids. A participant is never trapped in a consumed slot by a data condition they did not
  -- cause and cannot fix.
  if v_conv.id is not null and not exists (
    select 1 from public.providers p
     where p.id = v_offer.provider_id and p.user_id = v_offer.user_id
  ) then
    v_conv.id := null;
  end if;
  if v_conv.id is not null and not exists (
    select 1 from public.providers p
     where p.id = v_interest.interested_provider_id
       and p.user_id = v_interest.interested_user_id
  ) then
    v_conv.id := null;
  end if;

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

    -- BEST-EFFORT BY CONSTRUCTION. The skip predicate above mirrors
    -- enforce_prebooking_message_rules' open-conversation test, and a mirrored predicate is a
    -- second source of truth: if that trigger ever grows STRICTER, this would insert into a
    -- thread it now refuses and the release would be vetoed again, with no test failing. The
    -- handler makes the guarantee structural -- the signal can fail for ANY reason and the
    -- release still commits.
    begin
      insert into public.messages (conversation_id, sender_id, content, is_read, created_at)
      values (v_conv.id, null, v_copy, false, clock_timestamp());

      update public.conversation set last_message_at = clock_timestamp() where id = v_conv.id;
    exception when others then
      null;
    end;
  end if;

  return v_reason;
end;
$$;

alter function public.release_barter_interest(uuid) owner to postgres;
revoke all on function public.release_barter_interest(uuid) from public, anon;
grant execute on function public.release_barter_interest(uuid) to authenticated;
