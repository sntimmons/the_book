-- ACCOUNT ERASURE — the retained classes stop being destroyed by the delete,
-- and OQ-077's two defects are fixed.
--
-- ══ THE SHAPE OF THE PROBLEM ══════════════════════════════════════════════
--
-- Today an `auth.users` delete is a **CASCADE through everything**: it destroys
-- the accepted contracts the user signed, the reports they filed, their bookings
-- (via `providers`), their reviews, their barter history. The approved policy says
-- the opposite for almost all of it — anonymize or retain.
--
-- Most of that is fixed WITHOUT touching a foreign key, because the erasure
-- engine (`20261104000000`) rewrites identity columns to a pseudonym BEFORE the
-- auth row goes. A cascade with nothing left pointing at the deleted user has
-- nothing to cascade.
--
-- Two classes cannot be handled that way, because the policy requires them to
-- keep the **real** identity under restriction rather than a pseudonym: accepted
-- contract evidence ("the minimum party identity necessary to establish who
-- accepted it") and report evidence ("the minimum reporter/subject identity
-- necessary for a safety record"). Those need the key relaxed and a restricted
-- column to hold what survives.
--
-- ══ HOW "RESTRICTED" IS ACTUALLY ENFORCED ═════════════════════════════════
--
-- A `*_subject_id` column is a plain uuid with **no foreign key**, and it is
-- **not in any client role's column grant**. So:
--
--   * the ordinary FK column is NULL after erasure — every ordinary join breaks,
--     which is what "anonymization must permanently break ordinary lookup" means;
--   * the surviving identity is unreadable by `anon` and `authenticated` at the
--     PRIVILEGE level, not merely filtered by a policy — row-level security
--     cannot hide a column, so the grant is the boundary;
--   * an operator or `service_role` can still answer "who accepted this" and
--     "who reported whom", which is the entire point of retaining it.

-- ── 1. Accepted contract evidence (policy C) ─────────────────────────────
alter table public.contract_signatures
  add column if not exists signer_subject_id uuid;

comment on column public.contract_signatures.signer_subject_id is
  'RESTRICTED. The erased signer''s original account id, written at erasure and '
  'readable by operators and service_role only — it is in no client column grant, '
  'and RLS cannot hide a column. This is the "minimum party identity necessary to '
  'establish who accepted it" that policy C retains. `client_user_id` goes NULL at '
  'the same moment, so every ordinary join to a profile breaks. **INTERIM '
  'CLOSED-BETA POLICY PENDING ATTORNEY REVIEW** — and NOT a claim that this is a '
  'verified legal e-signature.';

-- The acceptance record must outlive the account. It is `NOT NULL` today and
-- cascades; both have to go, and nothing else about the row changes.
alter table public.contract_signatures alter column client_user_id drop not null;
alter table public.contract_signatures
  drop constraint if exists contract_signatures_client_user_id_fkey;
alter table public.contract_signatures
  add constraint contract_signatures_client_user_id_fkey
  foreign key (client_user_id) references auth.users(id) on delete set null;

-- A signature row must always identify its signer SOMEHOW: live, or retained.
alter table public.contract_signatures
  drop constraint if exists contract_signatures_signer_identified_check;
alter table public.contract_signatures
  add constraint contract_signatures_signer_identified_check
    check (client_user_id is not null or signer_subject_id is not null);

comment on constraint contract_signatures_signer_identified_check
  on public.contract_signatures is
  'An acceptance with no identifiable party is not evidence of anything. Either '
  'the live account or the retained restricted subject must be present — which is '
  'also what makes the erasure SET NULL safe rather than a way to quietly '
  'anonymise a contract.';

-- ── 2. Report and safety evidence (policy F) ─────────────────────────────
alter table public.reports
  add column if not exists reporter_subject_id uuid,
  add column if not exists reported_subject_id uuid;

comment on column public.reports.reporter_subject_id is
  'RESTRICTED. The erased reporter''s original account id, in no client grant. '
  'Policy F retains the minimum reporter identity needed for a safety record — a '
  'report from "somebody" is not one an operator can weigh. INTERIM CLOSED-BETA '
  'POLICY PENDING ATTORNEY REVIEW.';
comment on column public.reports.reported_subject_id is
  'RESTRICTED. The erased subject''s original account id, in no client grant. '
  'Also what satisfies reports_target_check after erasure nulls '
  'reported_user_id — see the constraint below. INTERIM CLOSED-BETA POLICY '
  'PENDING ATTORNEY REVIEW.';

-- **OQ-077 DEFECT (1).** `reports.reporter_user_id` was NOT NULL and CASCADE, so
-- deleting a reporter destroyed their reports — policy F forbids that. And
-- `reports_target_check` requires a provider, a user or a booking, so deleting a
-- user who was the SOLE target failed outright: SET NULL emptied the only column
-- satisfying the check.
--
-- Both fixed by the same move. The retained restricted subject satisfies the
-- check, so erasure succeeds AND the safety record survives — rather than one at
-- the expense of the other.
alter table public.reports alter column reporter_user_id drop not null;
alter table public.reports drop constraint if exists reports_reporter_user_id_fkey;
alter table public.reports
  add constraint reports_reporter_user_id_fkey
  foreign key (reporter_user_id) references auth.users(id) on delete set null;

alter table public.reports drop constraint if exists reports_target_check;
alter table public.reports
  add constraint reports_target_check
    check (reported_provider_id is not null
        or reported_user_id is not null
        or reported_subject_id is not null
        or booking_id is not null);

comment on constraint reports_target_check on public.reports is
  'A report must name SOMETHING: a provider, a live user, a RETAINED ERASED '
  'subject, or a booking. The third arm is OQ-077 defect (1): erasure nulls '
  'reported_user_id, and before this the check had nothing left to be satisfied '
  'by, so deleting a reported user failed outright. Widening it was the fix that '
  'did not require deleting the safety record to let the account go.';

alter table public.reports
  drop constraint if exists reports_reporter_identified_check;
alter table public.reports
  add constraint reports_reporter_identified_check
    check (reporter_user_id is not null or reporter_subject_id is not null);

-- THE RESTRICTED COLUMNS ARE RESTRICTED BY PRIVILEGE. `20261052000000` already
-- replaced this table's blanket grants with named columns; the two new ones are
-- deliberately absent from the SELECT grant, and from INSERT so a reporter cannot
-- pre-populate an identity the server is supposed to derive.
revoke select (reporter_subject_id, reported_subject_id) on public.reports
  from anon, authenticated;
revoke select (signer_subject_id) on public.contract_signatures from anon, authenticated;

-- ── 3. OQ-077 DEFECT (2): the append-only guard and the set-null ─────────
--
-- `operator_case_events.actor_user_id` is `ON DELETE SET NULL`, and a set-null is
-- an **UPDATE**. `enforce_operator_case_event_append_only` carves out `DELETE`
-- for service_role and a no-claims session, and does not carve out UPDATE — so
-- deleting an operator who had ever acted on a case failed with
-- `check_violation`. The carve-out had the right shape and the wrong verb.
--
-- The fix is narrow on purpose. It is NOT "privileged callers may edit history":
-- it is "an identity may be severed, and nothing else may change". A note stays a
-- note, an action stays an action, and the audit remains an audit — which is the
-- whole reason policy G retains it.
create or replace function public.enforce_operator_case_event_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if (select auth.role()) = 'service_role'
       or ((select auth.role()) is null and (select auth.uid()) is null) then
      return old;
    end if;
    raise exception 'A case event cannot be deleted.' using errcode = 'check_violation';
  end if;

  -- THE ERASURE UPDATE, AND ONLY IT (OQ-077 defect 2). `actor_user_id` may be
  -- severed to NULL — the shape a referential SET NULL makes — and every other
  -- column must be untouched. Note the cascade runs as whoever issued the DELETE,
  -- which for an account erasure is service_role, so the role test is real; the
  -- column test is what stops it being a licence to rewrite.
  if new.id          is not distinct from old.id
     and new.case_id     is not distinct from old.case_id
     and new.action      is not distinct from old.action
     and new.from_status is not distinct from old.from_status
     and new.to_status   is not distinct from old.to_status
     and new.note        is not distinct from old.note
     and new.created_at  is not distinct from old.created_at
     and new.actor_user_id is distinct from old.actor_user_id
     and new.actor_user_id is null
  then
    if (select auth.role()) = 'service_role'
       or ((select auth.role()) is null and (select auth.uid()) is null) then
      return new;
    end if;
  end if;

  raise exception 'A case event is a record of what happened and cannot be changed.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_operator_case_event_append_only() owner to postgres;
revoke all on function public.enforce_operator_case_event_append_only()
  from public, anon, authenticated;

comment on function public.enforce_operator_case_event_append_only() is
  'A case event cannot be edited or deleted. ONE exception, and it is OQ-077 '
  'defect (2): `actor_user_id` may be SEVERED TO NULL by service_role, because '
  'that column is ON DELETE SET NULL and a set-null is an UPDATE — without this, '
  'deleting an operator who had ever acted on a case failed outright. Every other '
  'column must be identical, so this is a licence to forget WHO, never to change '
  'WHAT. Policy G retains four years of these; they stay an audit.';

-- ── 4. The operator audit keeps a name after the account is gone ─────────
--
-- Severing `actor_user_id` satisfies the delete and loses the one thing policy G
-- asks the audit to store: *operator identity*. A four-year audit trail of
-- "somebody did this" is not an audit trail.
--
-- Same pattern as the evidence columns: a restricted subject id that no client
-- role can read, written at erasure, with the live FK nulled. The audit can still
-- answer "who", to the people whose job is to ask.
alter table public.operator_case_events
  add column if not exists actor_subject_id uuid;

comment on column public.operator_case_events.actor_subject_id is
  'RESTRICTED. The erased operator''s original account id. Policy G requires the '
  'audit to record operator identity for four years; severing actor_user_id to '
  'let the account go would have thrown that away, and "somebody did this" is not '
  'an audit trail. In no client column grant.';

revoke select (actor_subject_id) on public.operator_case_events from anon, authenticated;

alter table public.community_moderation_actions
  add column if not exists actor_subject_id uuid;

comment on column public.community_moderation_actions.actor_subject_id is
  'RESTRICTED. The erased operator''s original account id, for the same reason as '
  'operator_case_events.actor_subject_id. This table is unreadable by every '
  'client role already, so the column adds no surface.';
