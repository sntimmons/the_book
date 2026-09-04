-- Barter Slice 3a-0c — durable negotiation access (Trade Activity).
--
-- Scope: a durable READ surface over state that already exists, plus two corrections to the
-- release signal. No proposal, agreement, obligation, acceptance, cancellation or adjudication
-- schema. No notification subsystem, no push, no expiry, no re-response, no reputation.
--
-- THE DEFECT
-- Both release controls hung off the barter discovery feed, which filters `is_active = true`
-- and takes the newest 50. So closing the post, or the post simply ageing out, removed the only
-- route to an ACCEPTED negotiation for BOTH parties: the interest stayed accepted, the offer's
-- single negotiation slot stayed consumed, and the counterparty was never told -- the stranded
-- state this whole line of work exists to remove, reachable through the ordinary "Close offer"
-- action. The feed is DISCOVERY. An accepted negotiation is durable workflow state, and the two
-- must not share a lifetime.

-- ── 1. One definition of the pair-key format ─────────────────────────────────
-- The `least:greatest` string is now written in several places across three migrations, and
-- 20260908000000 states the rule it broke: "writing the expression twice would be a second
-- source of truth for the format." A drift would be silent -- the release lookup would miss and
-- fall through, and the counterparty would simply never be told, with no error anywhere.
create or replace function public.provider_pair_key(p_a uuid, p_b uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select least(p_a, p_b)::text || ':' || greatest(p_a, p_b)::text;
$$;

alter function public.provider_pair_key(uuid, uuid) owner to postgres;
revoke all on function public.provider_pair_key(uuid, uuid) from public, anon;
grant execute on function public.provider_pair_key(uuid, uuid) to authenticated;

-- ── 2. Who a platform notice is FOR ──────────────────────────────────────────
-- The actor already knows: they confirmed the action, the write succeeded, and their UI moved
-- to "ended". Badging them for their own act is self-notification noise. But `messages.is_read`
-- is ONE boolean serving two readers, so "read for the actor, unread for the counterparty"
-- cannot be expressed by it.
--
-- Smallest shape that says the true thing: name the intended recipient. NULL means "both", which
-- is what every pre-existing message means and keeps them behaving exactly as before. The column
-- is immutable by default -- the message allow-list is `to_jsonb(new) - 'is_read'`, so a column
-- added later is unwritable by a participant without any change here. That is the allow-list
-- doing the job it was converted to do.
alter table public.messages
  add column if not exists system_recipient_id uuid;

comment on column public.messages.system_recipient_id is
  'For a platform-authored message (sender_id IS NULL): which participant it is FOR, so the '
  'actor who caused it is not badged for their own action. NULL = addressed to both, which is '
  'every ordinary message. Server-set only; immutable by the message allow-list.';

-- ── 3. The durable read model ────────────────────────────────────────────────
-- security_invoker = true, pinned by the B5B suite: BOTH existing views in this repo set it
-- FALSE, so the pattern a future engineer copies is the wrong one here, and omitting it would
-- return every provider's negotiations to any authenticated caller.
--
-- It aggregates only state that already exists. No lifecycle truth is duplicated: `status` is
-- read straight from barter_interests, and the derived `activity_state` is a rendering label,
-- not a second source of truth.
create or replace view public.my_trade_activity
with (security_invoker = true) as
select
  i.id                       as interest_id,
  i.offer_id,
  i.status,
  i.created_at,
  i.released_at,
  i.release_reason,
  i.message                  as interest_message,
  o.offering_service,
  o.seeking_service,
  o.is_active                as offer_is_active,
  -- Which side of this negotiation the caller is on. Derived from the rows, never supplied.
  case when o.user_id = (select auth.uid()) then 'owner' else 'responder' end as my_role,
  case when o.user_id = (select auth.uid()) then i.interested_provider_id else o.provider_id end
                             as counterparty_provider_id,
  c.id                       as conversation_id
from public.barter_interests i
join public.barter_offers o on o.id = i.offer_id
left join public.conversation c
  on c.provider_pair_key = public.provider_pair_key(o.provider_id, i.interested_provider_id)
where o.user_id = (select auth.uid())
   or i.interested_user_id = (select auth.uid());

alter view public.my_trade_activity owner to postgres;
revoke all on public.my_trade_activity from public, anon;
grant select on public.my_trade_activity to authenticated;

-- ── 4. The release notice names WHICH negotiation ended ──────────────────────
-- A provider pair shares ONE canonical conversation and may negotiate on more than one post,
-- so "This trade negotiation was ended." leaves the reader unable to tell which trade died --
-- and the role label ("the post owner") denotes a different person depending on which.
--
-- The label is server-derived from the offer at release time. It is COMMUNICATION CONTEXT, not
-- transaction truth: when proposal/agreement records exist, THOSE are the authoritative
-- identity, and no agreement history may depend on this mutable post text.
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
  v_conv public.conversation%rowtype;
  v_copy text;
  v_label text;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated.' using errcode = 'check_violation';
  end if;

  select i.* into v_interest from public.barter_interests i where i.id = p_interest_id;
  if not found then
    raise exception 'That response no longer exists.' using errcode = 'check_violation';
  end if;

  -- Lock the OFFER, not the interest: the invariant is "one accepted response per offer", so
  -- the offer is the serialisation point -- the same reasoning by which accept_barter_interest
  -- locks it. This serialises a release against a concurrent accept of another response.
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
  -- so whatever is written here is overwritten. The value RETURNED below is read back from the
  -- row, so the caller is told what the boundary recorded.
  v_reason := case when v_is_responder then 'responder_withdrew'
                   else 'owner_ended_negotiation' end;

  -- PRE-AGREEMENT ONLY. When the agreement schema lands, the "no official agreement exists for
  -- this interest" guard goes HERE -- in THIS definition, the live one -- and must also be
  -- enforced at the write boundary, not only in this function.
  perform set_config('app.barter_release', v_interest.id::text, true);
  update public.barter_interests
     set status = 'released',
         released_at = clock_timestamp(),
         released_by = v_uid,
         release_reason = v_reason
   where id = v_interest.id
  returning release_reason into v_reason;
  perform set_config('app.barter_release', '', true);

  select c.* into v_conv from public.conversation c
   where c.provider_pair_key =
         public.provider_pair_key(v_offer.provider_id, v_interest.interested_provider_id)
   order by c.id limit 1;
  if not found then
    select c.* into v_conv from public.conversation c
     where (c.client_id = v_interest.interested_user_id and c.provider_id = v_offer.provider_id)
        or (c.client_id = v_offer.user_id
            and c.provider_id = v_interest.interested_provider_id)
     order by c.id limit 1;
  end if;

  -- IDENTITY, checked HERE and not earlier. It exists solely for the lookup above, so it must
  -- suppress the SIGNAL, never veto the RELEASE -- a participant is not trapped in a consumed
  -- slot by a data condition they did not cause and cannot fix.
  if v_conv.id is not null and (
       not exists (select 1 from public.providers p
                    where p.id = v_offer.provider_id and p.user_id = v_offer.user_id)
    or not exists (select 1 from public.providers p
                    where p.id = v_interest.interested_provider_id
                      and p.user_id = v_interest.interested_user_id)
  ) then
    v_conv.id := null;
  end if;

  if v_conv.id is not null
     and (v_conv.booking_id is not null
          or v_conv.request_status is null
          or v_conv.request_status = 'accepted') then

    -- Server-derived post context, so the reader can tell WHICH negotiation ended when the
    -- pair has traded on more than one post. Never client-supplied.
    v_label := coalesce(nullif(trim(v_offer.offering_service), ''), 'a service')
               || ' for ' || coalesce(nullif(trim(v_offer.seeking_service), ''), 'a service');

    v_copy := case v_reason
                when 'responder_withdrew' then
                  'Trade negotiation ended by the responding provider: ' || v_label
                when 'owner_ended_negotiation' then
                  'Trade negotiation ended by the post owner: ' || v_label
                else 'Trade negotiation ended: ' || v_label
              end;

    -- Addressed to the COUNTERPARTY. The actor confirmed the action and watched their own UI
    -- move to "ended"; badging them for it is self-notification noise.
    v_recipient := case when v_is_responder then v_offer.user_id
                        else v_interest.interested_user_id end;

    -- BEST-EFFORT BY CONSTRUCTION. The skip predicate mirrors enforce_prebooking_message_rules,
    -- and a mirrored predicate is a second source of truth; the handler makes the guarantee
    -- structural -- the signal can fail for ANY reason and the release still commits.
    begin
      insert into public.messages
        (conversation_id, sender_id, content, is_read, created_at, system_recipient_id)
      values (v_conv.id, null, v_copy, false, clock_timestamp(), v_recipient);

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
