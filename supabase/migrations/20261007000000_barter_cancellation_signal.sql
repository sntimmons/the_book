-- Founder rulings on PR #58: the counterparty is TOLD, and the reason is shared.
--
-- FORWARD-ONLY. 20261005000000 and 20261006000000 are already applied to the linked
-- non-production project and are append-only history; neither is edited. Production untouched.
--
-- RULING 1 — an official trade's cancellation writes a durable system message into the
-- existing canonical provider-pair conversation. This is NOT notification work: no push, no
-- device notice, no email, and the copy claims none of those. It is the same signal the
-- PRE-agreement act already writes (20260910000000), extended to the post-agreement act that
-- matters more, and it REUSES that mechanism rather than introducing a competing one:
--
--   * `sender_id IS NULL` means the platform authored it. The Founder ruling on 20260910000000
--     forbids impersonating either participant, and the "participants can send messages"
--     policy requires sender_id = auth.uid(), which a client cannot satisfy with null — so a
--     client CANNOT forge one. This function is SECURITY DEFINER, which is what makes the
--     server the only possible author.
--   * The conversation is resolved by canonical provider_pair_key with the same fallback to
--     the two literal orientations, for threads predating the key.
--   * NO new conversation is created and no new conversation identity exists. A trade whose
--     thread was never created is still cancellable; it simply has nowhere to post.
--   * Written in the SAME transaction as the act, so the cancellation and the notice cannot
--     diverge — a client that crashes after the RPC cannot leave the counterparty uninformed.
--
-- EXACTLY ONCE PER TRANSITION. Both messages sit AFTER the insert, on the only path that
-- reaches it. The idempotent branch for a participant who has already acted returns before the
-- insert, and so does the unique_violation handler, so a repeat call — a double tap, a second
-- device, a retry — writes no second message. There are at most two acts per agreement, so
-- there are at most two messages: one for the first act, one for the second.
--
-- THE REASON IS NOT IN THE MESSAGE. Ruling 2 makes the reason participant-visible in trade
-- details, but a conversation message is a different surface with different longevity, and the
-- ruling is explicit that the free text does not go here.

create or replace function public.cancel_barter_agreement(
  p_agreement_id uuid,
  p_reason text default null
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ag public.barter_agreements%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_provider uuid;
  v_obligations integer;
  v_delivered integer;
  v_acts integer;
  v_conv_id uuid;
  v_copy text;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  if v_reason is not null and char_length(v_reason) > 200 then
    raise exception 'Keep the reason under 200 characters.' using errcode = 'invalid_parameter_value';
  end if;

  select ag.* into v_ag from public.barter_agreements ag where ag.id = p_agreement_id;
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;
  if v_uid not in (v_ag.owner_user_id, v_ag.responder_user_id) then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  v_provider := case when v_uid = v_ag.owner_user_id
                     then v_ag.owner_provider_id else v_ag.responder_provider_id end;

  select ag.* into v_ag from public.barter_agreements ag
   where ag.id = p_agreement_id for update;
  if not found then
    raise exception 'That trade no longer exists.' using errcode = 'check_violation';
  end if;

  select count(*) into v_obligations
    from (select o.id from public.barter_obligations o
           where o.agreement_id = p_agreement_id
           order by o.id for update) locked;
  if v_obligations <> 2 then
    raise exception 'That trade is not in a state that can be cancelled.'
      using errcode = 'internal_error';
  end if;

  select count(*) into v_delivered
    from public.barter_obligations o
   where o.agreement_id = p_agreement_id and o.delivered_at is not null;
  if v_delivered > 0 then
    raise exception 'This trade can no longer be cancelled: something has already been delivered.'
      using errcode = 'object_not_in_prerequisite_state';
  end if;

  -- ALREADY ACTED — return the existing state. This is the branch that makes a repeat call
  -- idempotent, and it is ALSO what stops a second system message: it returns before the
  -- insert, so nothing below it runs.
  if exists (select 1 from public.barter_agreement_cancellations c
              where c.agreement_id = p_agreement_id and c.actor_user_id = v_uid) then
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
  end if;

  insert into public.barter_agreement_cancellations
    (agreement_id, actor_user_id, actor_provider_id, reason)
  values (p_agreement_id, v_uid, v_provider, v_reason);

  select count(*) into v_acts from public.barter_agreement_cancellations c
   where c.agreement_id = p_agreement_id;

  -- ── The signal, in the SAME transaction ───────────────────────────────────
  select c.id into v_conv_id from public.conversation c
   where c.provider_pair_key =
           public.provider_pair_key(v_ag.owner_provider_id, v_ag.responder_provider_id)
   order by c.id limit 1;

  if v_conv_id is null then
    -- A thread created before the canonical pair key existed can still carry a stale null key.
    select c.id into v_conv_id from public.conversation c
     where (c.client_id = v_ag.responder_user_id and c.provider_id = v_ag.owner_provider_id)
        or (c.client_id = v_ag.owner_user_id and c.provider_id = v_ag.responder_provider_id)
     order by c.id limit 1;
  end if;

  if v_conv_id is not null then
    -- NEITHER PARTICIPANT IS NAMED. A display name would have to come from somewhere, and
    -- role-based copy is derived rather than supplied. It states what happened and nothing
    -- more: no fault, no verdict, no no-show, no adjudication, and no claim that anyone was
    -- notified by any other channel. The free-text reason is deliberately absent.
    v_copy := case when v_acts >= 2
                   then 'Both providers agreed to cancel this trade.'
                   else 'This trade was cancelled by one provider.'
              end;

    insert into public.messages (conversation_id, sender_id, content, is_read, created_at)
    values (v_conv_id, null, v_copy, false, clock_timestamp());

    update public.conversation set last_message_at = clock_timestamp() where id = v_conv_id;
  end if;

  return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
exception
  when unique_violation then
    -- Unreachable under the locks, and it writes NO message: the act it collided with already
    -- produced one.
    select count(*) into v_acts from public.barter_agreement_cancellations c
     where c.agreement_id = p_agreement_id;
    return case when v_acts >= 2 then 'mutually_cancelled' else 'cancelled_by_participant' end;
end;
$$;

alter function public.cancel_barter_agreement(uuid, text) owner to postgres;
revoke all on function public.cancel_barter_agreement(uuid, text) from public, anon;
grant execute on function public.cancel_barter_agreement(uuid, text) to authenticated;

-- ── RULING 2 — the reason is participant-visible context ───────────────────
-- The reason is shared with the other provider. That was ALREADY true of the data boundary —
-- the read policy is agreement-scoped, so both participants could always read both acts — and
-- the ruling settles it as the intended posture rather than an accident. What changes is that
-- the app now surfaces it, and the composer says so before submission.
--
-- Exposed per viewer as two columns rather than as rows: a screen needs "my reason" and
-- "their reason", and no actor id is exposed to derive them. Appended, because
-- `create or replace view` may only append.
--
-- It is context, NOT a verdict: not a reliability judgment, not a no-show determination, not
-- adjudication, and not proof of fault. None of those exist. Non-participants see nothing —
-- the view is already scoped to the viewer's own negotiations.
--
-- Bound, immutability and idempotency are unchanged: 1–200 characters, first reason stands,
-- and a repeat by the same participant overwrites neither it nor the timestamp.
create or replace view public.my_barter_proposals
with (security_invoker = true) as
select
  p.id                        as proposal_id,
  p.interest_id,
  p.offer_id,
  p.current_version_no,
  p.created_at,
  i.status                    as interest_status,
  o.is_active                 as offer_is_active,
  case when p.owner_user_id = (select auth.uid()) then 'owner' else 'responder' end as my_role,
  case when p.owner_user_id = (select auth.uid()) then p.responder_user_id
       else p.owner_user_id end as counterparty_user_id,
  cv.id                       as current_version_id,
  cv.author_user_id           as current_version_author_id,
  cv.created_at               as current_version_at,
  exists (select 1 from public.barter_version_acceptances a
           where a.version_id = cv.id and a.participant_user_id = (select auth.uid()))
                              as i_accepted_current,
  exists (select 1 from public.barter_version_acceptances a
           where a.version_id = cv.id
             and a.participant_user_id = case when p.owner_user_id = (select auth.uid())
                                              then p.responder_user_id else p.owner_user_id end)
                              as they_accepted_current,
  (select count(*) from public.barter_version_acceptances a
    where a.version_id = cv.id
      and a.participant_user_id in (p.owner_user_id, p.responder_user_id)) >= 2
                              as both_accepted,
  ag.id                       as agreement_id,
  ag.officialized_at,
  exists (select 1 from public.barter_agreement_cancellations c
           where c.agreement_id = ag.id and c.actor_user_id = (select auth.uid()))
                              as i_cancelled,
  exists (select 1 from public.barter_agreement_cancellations c
           where c.agreement_id = ag.id and c.actor_user_id <> (select auth.uid()))
                              as they_cancelled,
  (select min(c.created_at) from public.barter_agreement_cancellations c
    where c.agreement_id = ag.id)
                              as cancelled_at,
  (select c.reason from public.barter_agreement_cancellations c
    where c.agreement_id = ag.id and c.actor_user_id = (select auth.uid()))
                              as my_cancel_reason,
  (select c.reason from public.barter_agreement_cancellations c
    where c.agreement_id = ag.id and c.actor_user_id <> (select auth.uid()))
                              as their_cancel_reason
from public.barter_proposals p
join public.barter_interests i on i.id = p.interest_id
join public.barter_offers o on o.id = p.offer_id
join public.barter_proposal_versions cv
  on cv.proposal_id = p.id and cv.version_no = p.current_version_no
left join public.barter_agreements ag on ag.proposal_id = p.id
where p.owner_user_id = (select auth.uid()) or p.responder_user_id = (select auth.uid());

alter view public.my_barter_proposals owner to postgres;
revoke all on public.my_barter_proposals from public, anon;
grant select on public.my_barter_proposals to authenticated;

comment on column public.barter_agreement_cancellations.reason is
  'Optional free text, at most 200 characters, SHARED WITH THE OTHER PARTICIPANT and surfaced '
  'to both in trade details. Founder ruling on PR #58: it is participant-visible context, not '
  'a private note, a reliability verdict, a no-show determination, adjudication, or proof of '
  'fault. No taxonomy — inventing reason codes would create vocabulary the product has not '
  'decided. Deliberately NOT included in the conversation system message.';
