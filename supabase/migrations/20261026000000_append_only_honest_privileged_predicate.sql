-- The append-only guard gets the SAME honest privileged predicate the RPC already has.
--
-- `20261023000000` § 2 diagnosed `auth.role() = 'service_role' or auth.uid() is null` as
-- unsound and narrowed it INSIDE `adjudicate_barter_obligation`, with a comment naming the exact
-- failure: "an `anon` PostgREST request carries no `sub`, so `auth.uid()` is null and the second
-- disjunct ADMITTED it — the exact case the comment named."
--
-- `20261024000000`, one migration later in the same slice, then wrote that superseded predicate
-- into `enforce_barter_adjudication_append_only` — preserving it in the DELETE branch it
-- inherited AND putting it into the brand-new erasure-UPDATE branch. Its header asserts
-- "PRIVILEGED CALLERS ONLY, the same branch DELETE already uses", which is true of the intent
-- and false of the predicate. A correction made in one object and not carried to its sibling is
-- exactly the drift the ledger's functions table exists to catch, and it was caught by review
-- rather than by a test — see the regression note at the bottom of this file.
--
-- ── WHY THIS IS DEFENSE IN DEPTH AND NOT A LIVE HOLE ──────────────────────
--
-- NOTHING IS EXPLOITABLE TODAY, and this migration must not be read as closing a breach. An
-- `anon` or `authenticated` caller reaches this trigger only by issuing UPDATE or DELETE on
-- `public.barter_obligation_adjudications`, and both are refused two layers earlier:
--
--   * `20261019000000` § 4 revokes ALL on the table from `public, anon, authenticated`, and
--   * there is no INSERT, UPDATE or DELETE policy of any kind on it — asserted, not assumed, by
--     `supabase/tests/adjudication.test.sql`.
--
-- So the trigger is currently unreachable by the roles the loose predicate would have admitted.
-- What this migration fixes is the FAILURE DIRECTION of the innermost guard: as written, a
-- future migration that granted a write privilege or added a permissive policy would inherit an
-- append-only guard that fails OPEN for a no-`sub` request. A guard whose whole job is to be the
-- last line must fail closed on its own, without depending on the two layers outside it.
--
-- ── WHAT CHANGES, AND WHAT DELIBERATELY DOES NOT ──────────────────────────
--
-- CHANGED: both privileged branches now require `auth.role() = 'service_role'` OR the genuine
-- no-JWT case `auth.role() is null AND auth.uid() is null`. The no-JWT disjunct is still
-- NECESSARY and is narrowed rather than removed, for the reason `20261023000000` gives: a direct
-- privileged session (the erasure cascade, and the B5B harness) sets no claims at all.
--
-- UNCHANGED, and each was diffed against `20261024000000` before commit rather than rewritten:
-- the whole-row comparison with only `adjudicator_user_id` blanked on BOTH sides; the
-- one-directional non-null-to-null rule; the refusal of everything else for EVERYONE including
-- privileged callers; both error messages and their `check_violation` SQLSTATE; the owner and
-- the revokes. PD-066 is untouched — the outcome, rationale, obligation, agreement and timestamp
-- remain unchangeable by every caller, and this migration only narrows WHO counts as privileged.
--
-- The trigger is NOT recreated: `create or replace function` preserves the OID, so
-- `barter_obligation_adjudications_append_only` still points at this body.
create or replace function public.enforce_barter_adjudication_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.barter_obligation_adjudications%rowtype;
  v_new public.barter_obligation_adjudications%rowtype;
begin
  if tg_op = 'DELETE' then
    -- NARROWED from `auth.role() = 'service_role' or auth.uid() is null`. See the header: the
    -- old second disjunct admitted a no-`sub` `anon` request. `service_role`, or no claims AND
    -- no subject.
    if (select auth.role()) = 'service_role'
       or ((select auth.role()) is null and (select auth.uid()) is null) then
      return old;
    end if;
    raise exception 'An adjudication cannot be deleted.' using errcode = 'check_violation';
  end if;

  -- THE ERASURE UPDATE, and only it. Same narrowed predicate.
  if ((select auth.role()) = 'service_role'
      or ((select auth.role()) is null and (select auth.uid()) is null))
     and old.adjudicator_user_id is not null
     and new.adjudicator_user_id is null then
    v_old := old;
    v_new := new;
    v_old.adjudicator_user_id := null;
    if v_old = v_new then
      return new;
    end if;
  end if;

  -- Everything else is refused for EVERYONE, privileged callers included. A terminal outcome
  -- that could be edited by the trusted path is not terminal; a correction needs its own
  -- audited mechanism.
  raise exception 'An adjudication cannot be changed once recorded.'
    using errcode = 'check_violation';
end;
$$;

alter function public.enforce_barter_adjudication_append_only() owner to postgres;
revoke all on function public.enforce_barter_adjudication_append_only()
  from public, anon, authenticated;

-- ── THE TABLE COMMENT CATCHES UP ──────────────────────────────────────────
--
-- `20261019000000` set it to "never edited, never withdrawn, never flipped." Two of those three
-- stopped being literally true inside this slice: `20261024000000` permits exactly one erasure
-- UPDATE, and PD-066 permits a privileged DELETE so that account and agreement erasure can
-- cascade. The COLUMN comment was refreshed by `20261023000000`; the table comment was not, and
-- a live comment that overstates a guarantee is how the next editor gets misled about which
-- guard is safe to change. The corresponding column comments are already correct and are left
-- alone.
comment on table public.barter_obligation_adjudications is
  'Immutable operator resolution of ONE obligation. At most one per obligation. The outcome, '
  'rationale, obligation, agreement and timestamp are unchangeable by EVERY caller, privileged '
  'ones included, and are never flipped. TWO privileged operations exist and no others: an '
  'erasure UPDATE that nulls adjudicator_user_id (non-null to null only), so deleting an '
  'operator account forgets WHO decided without withdrawing WHAT was decided; and DELETE, which '
  'stays privileged-only because account and agreement erasure cascade through it (PD-066). '
  'TRUNCATE is revoked from every role including service_role, because it would skip this row '
  'trigger. Obligation-granular: the other side of the same agreement is unaffected. Creates no '
  'agreement-level outcome — none exists.';

-- REGRESSION NOTE, recorded because this defect survived a full review pass of the migration
-- that introduced it. A `create or replace` can silently revert a predicate, and nothing in the
-- suite pins this one. `supabase/tests/adjudication.test.sql` now asserts the narrowed shape
-- against `prosrc` with comments stripped — the same mechanism `messaging.test.sql` already uses
-- — so a future copy-forward that reintroduces the loose disjunct fails B5B instead of being
-- found by eye.

-- ── TWO LIVE FUNCTION COMMENTS CATCH UP TOO ───────────────────────────────
--
-- `20261020000000` reused the existing dominance rule rather than minting a second predicate —
-- the right call, and its header explains why: "the suppression happens ONCE, in the view, by
-- feeding the existing derived-state functions a cancelled-equivalent input … rather than by
-- adding a second set of predicates that could disagree with the first."
--
-- What it could not do from the call site is update what those functions SAY about themselves.
-- Both still assert, in the live catalog, that terminal outcomes do not exist — three migrations
-- after they started existing. These are `\df+` output and PostgREST-visible schema description,
-- not migration prose, and this repository deliberately uses comments to carry invariants a type
-- cannot express: `20261023000000` exists precisely because five documents described a guard
-- nobody had written.
--
-- The parameter is still NAMED `p_trade_cancelled` while now carrying "cancelled OR resolved".
-- RENAMING IT IS DELIBERATELY NOT DONE HERE: `create or replace function` cannot change a
-- parameter name, so it needs a drop-and-recreate of three functions that `my_barter_obligations`
-- depends on — a materially riskier change than a comment, in the exact view whose history
-- includes a silent copy-forward revert (MIGRATION_LEDGER `20261015000000`). It belongs with the
-- agreement-roll-up slice, which must restate that view anyway. Until then the comments carry the
-- warning, which is the whole reason to fix them rather than the reason to defer.
comment on function public.barter_receiver_window(
  text, timestamptz, timestamptz, timestamptz, boolean, timestamptz) is
  'Receiver-window state: none | awaiting_receiver | needs_attention. Needs Attention begins at '
  'p_as_of >= deadline, inclusive. An answered obligation is always none, and so is a SUPPRESSED '
  'one. NOT a verdict: needs_attention is an unresolved operational state — never Fulfilled, '
  'Unfulfilled, Under Review, Disputed or a no-show, and never an agreement-level Completed or '
  'Partially Fulfilled, which do not exist at any level (PD-065). READ p_trade_cancelled AS '
  '"SUPPRESSED": since 20261020000000 the view passes cancelled OR has-a-terminal-outcome, so '
  'this returns none for a RESOLVED obligation as well as a cancelled one. The parameter name '
  'predates terminal outcomes. Do NOT add cancellation-specific behaviour behind it — this '
  'function cannot tell a cancelled trade from a resolved one, and a branch that assumes it can '
  'will apply cancellation copy to every adjudicated obligation.';

comment on function public.barter_obligation_under_review(text, boolean, boolean) is
  'Whether one obligation needs manual resolution. TRUE means a human must look, never that '
  'anyone is at fault. Terminal OBLIGATION outcomes DO exist (PD-064 … PD-067) and are the '
  'reason this can now be false: a resolved obligation is no longer under review, because the '
  'review ENDED. There is still no agreement-level Completed, Partially Fulfilled or Not '
  'Completed (PD-065). READ p_trade_cancelled AS "SUPPRESSED", exactly as for '
  'barter_receiver_window: the view passes cancelled OR has-a-terminal-outcome, and the same '
  'warning applies — do not branch on it as though it meant cancellation alone.';

comment on function public.barter_can_report_no_show(
  timestamptz, text, boolean, boolean, timestamptz) is
  'Whether the receiver may report a no-show right now. Advisory only: it decides whether to '
  'OFFER the control, while report_barter_obligation_no_show re-checks every condition under '
  'the obligation row lock and remains the authority — and since 20261022000000 that RPC also '
  'refuses a RESOLVED obligation with PT424. READ p_trade_cancelled AS "SUPPRESSED": the view '
  'passes cancelled OR has-a-terminal-outcome, so the control is withheld on a resolved '
  'obligation, which is what keeps the client from drawing a button the server would refuse.';
