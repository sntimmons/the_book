-- COMMUNITY MODERATION — the operator needs to know WHAT was reported.
--
-- ══ THE POST ID WAS TRAVELLING IN FREE TEXT ═══════════════════════════════
--
-- `reports` has no content column, so the Community report path put the post id
-- in the notes:
--
--     notes := 'community post ' || post.id || E'\n\n' || (the reporter's words)
--
-- That was the right call when there was nothing an operator could DO with it —
-- the reference only had to be findable by a human reading the case. Now that
-- hiding is a real action, the operator screen has to resolve the reference,
-- show the content, show whether it is currently hidden, and offer the action.
-- Parsing a sentence to decide what to moderate is the kind of thing that works
-- until someone edits the copy.
--
-- Two nullable columns, validated on intake. Nothing else about reports changes,
-- and every existing report keeps working exactly as it did.

alter table public.reports
  add column if not exists reported_content_kind text,
  add column if not exists reported_content_id   uuid;

alter table public.reports
  drop constraint if exists reports_content_kind_check,
  drop constraint if exists reports_content_pair_check;

alter table public.reports
  add constraint reports_content_kind_check
    check (reported_content_kind is null
           or reported_content_kind in ('community_post', 'community_reply')),
  -- Both or neither. A kind with no id points at nothing; an id with no kind
  -- does not say which table to look in.
  add constraint reports_content_pair_check
    check ((reported_content_kind is null) = (reported_content_id is null));

comment on column public.reports.reported_content_id is
  'The specific Community post or reply a content report is about, so an '
  'operator can act on it rather than read a reference out of the notes. '
  'Validated on intake: the row must exist AND its author must be the person '
  'the report names, so a reporter cannot point a report about one person at '
  'somebody else''s content.';

-- ── The intake check ──────────────────────────────────────────────────────
--
-- A reporter chooses these values, so they are checked. The important half is
-- not "does the content exist" but "is it the content of the person this report
-- is ABOUT" — without that, a reporter could name one user and attach another
-- user's post, and an operator acting on the case would hide the wrong thing
-- with a straight face.
create or replace function public.enforce_report_content_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_author uuid;
begin
  if new.reported_content_id is null then
    return new;
  end if;

  if new.reported_content_kind = 'community_post' then
    select cp.user_id into v_author
      from public.community_posts cp where cp.id = new.reported_content_id;
  else
    select cr.user_id into v_author
      from public.community_replies cr where cr.id = new.reported_content_id;
  end if;

  if v_author is null then
    raise exception 'That content no longer exists.' using errcode = 'check_violation';
  end if;
  if new.reported_user_id is distinct from v_author then
    raise exception 'A report must name the person whose content it is about.'
      using errcode = 'check_violation';
  end if;
  -- Reporting your own content is not a moderation request, it is a delete —
  -- and the author already has one.
  if v_author = new.reporter_user_id then
    raise exception 'You can remove your own post from the post itself.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

alter function public.enforce_report_content_reference() owner to postgres;
revoke all on function public.enforce_report_content_reference()
  from public, anon, authenticated;

-- `f_` so it sorts after nothing in particular and before `zz_reports_rate_limit`:
-- a report that names content it may not name should be refused on its merits
-- rather than counted against the reporter's hourly allowance.
drop trigger if exists f_reports_content_reference on public.reports;
create trigger f_reports_content_reference
  before insert on public.reports
  for each row execute function public.enforce_report_content_reference();

-- Best effort on reports that already carry the reference in their notes. Only
-- where the post still exists AND its author matches the report's target, so the
-- backfill cannot assert something the intake check would have refused.
update public.reports r
   set reported_content_kind = 'community_post',
       reported_content_id   = cp.id
  from public.community_posts cp
 where r.reported_content_id is null
   and r.notes ~ '^community post [0-9a-f-]{36}'
   and cp.id = (substring(r.notes from 'community post ([0-9a-f-]{36})'))::uuid
   and cp.user_id = r.reported_user_id;

-- ══ THE CASE TRAIL LEARNS TWO WORDS ══════════════════════════════════════
--
-- `operator_case_events.action` was `('opened','claimed','resolved','dismissed',
-- 'noted')`. A hide filed as `noted` would be a moderation decision disguised as
-- a comment — and the whole reason the event log exists is that no state change
-- should be untraceable. Widened deliberately, forward-only.
alter table public.operator_case_events
  drop constraint if exists operator_case_events_action_check;
alter table public.operator_case_events
  add constraint operator_case_events_action_check
    check (action in ('opened', 'claimed', 'resolved', 'dismissed', 'noted',
                      'content_hidden', 'content_restored'));

-- ══ WHAT THE OPERATOR SCREEN READS ═══════════════════════════════════════
--
-- One RPC, so the screen does not assemble a moderation view out of three reads
-- it could get wrong. Returns null when the case has no content reference, which
-- is the ordinary answer for every non-Community report and for reports that
-- predate the columns above.
create or replace function public.operator_community_content(p_case_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c        public.operator_cases%rowtype;
  v_kind   text;
  v_id     uuid;
  v_result jsonb;
begin
  if not public.is_operator() then
    raise exception 'Case handling is not available.' using errcode = 'insufficient_privilege';
  end if;

  select * into c from public.operator_cases where id = p_case_id;
  if not found then
    raise exception 'That case no longer exists.' using errcode = 'check_violation';
  end if;
  if c.report_id is null then
    return null;
  end if;

  select r.reported_content_kind, r.reported_content_id into v_kind, v_id
    from public.reports r where r.id = c.report_id;
  if v_id is null then
    return null;
  end if;

  if v_kind = 'community_post' then
    select jsonb_build_object(
      'kind', 'post',
      'id', cp.id,
      'content', cp.content,
      'intent', cp.intent,
      'author_kind', cp.author_kind,
      'author_user_id', cp.user_id,
      'provider_id', cp.provider_id,
      'created_at', cp.created_at,
      -- THE THREE STATES THE SCREEN MUST DISTINGUISH. `is_hidden` is the current
      -- fact; `history` is what makes "hidden" different from "hidden, then
      -- restored, and here we are again".
      'is_hidden', not cp.is_active,
      'reply_count', cp.reply_count
    ) into v_result
    from public.community_posts cp where cp.id = v_id;
  else
    select jsonb_build_object(
      'kind', 'reply',
      'id', cr.id,
      'content', cr.content,
      'intent', null,
      'author_kind', cr.author_kind,
      'author_user_id', cr.user_id,
      'provider_id', cr.provider_id,
      'created_at', cr.created_at,
      'is_hidden', not cr.is_active,
      'post_id', cr.post_id
    ) into v_result
    from public.community_replies cr where cr.id = v_id;
  end if;

  if v_result is null then
    -- The content is gone — its author removed it, or it cascaded. Said plainly
    -- rather than returned as an empty object the screen would render as content.
    return jsonb_build_object('kind', v_kind, 'id', v_id, 'missing', true);
  end if;

  return v_result || jsonb_build_object(
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'action', m.action, 'actor_user_id', m.actor_user_id,
               'case_id', m.case_id, 'note', m.note, 'created_at', m.created_at)
             order by m.created_at desc)
        from public.community_moderation_actions m
       where (v_kind = 'community_post'  and m.post_id  = v_id)
          or (v_kind = 'community_reply' and m.reply_id = v_id)
    ), '[]'::jsonb)
  );
end;
$$;

alter function public.operator_community_content(uuid) owner to postgres;
revoke all on function public.operator_community_content(uuid) from public, anon;
grant execute on function public.operator_community_content(uuid) to service_role, authenticated;

comment on function public.operator_community_content(uuid) is
  'The reported Community content for a case, with its CURRENT visibility and '
  'its full moderation history — the three states an operator screen has to '
  'tell apart: visible, hidden by an operator, and restored after being hidden. '
  'A boolean alone cannot distinguish the first from the third. Returns null '
  'when the case names no content, and an explicit {missing:true} when the '
  'content is gone, rather than an empty object a screen would render as a post.';
