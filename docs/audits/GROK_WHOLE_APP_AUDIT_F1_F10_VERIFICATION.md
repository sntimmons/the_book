# Grok whole-app audit — verification of F1–F10

**Status:** Historical (dated snapshot). Not current-state documentation.
**Date:** 2026-09-13. **Verified against:** `main` @ `24851ca`, branch
`audit/grok-findings-verification`.
**Environments:** all live checks against **non-production** `wcoyjeklscuqsumpjpfo`.
**Production `kxregomuawwcqvisuhtr` was never connected to, linked, migrated or queried.**

Grok's read-only audit reported **no demonstrated blocker** and raised ten findings. This
document records what each one turned out to be, with the evidence. Severity was **re-scored
after evidence**, not taken from the report.

> **What this pass was not.** No ranking was redesigned, no Discovery/Fairness work began, no
> UI was touched, and no speculative fix was made. Two findings were confirmed and fixed; the
> rest were classified and left alone.

## Baseline established first

| Harness | Result |
|---|---|
| B5B (`scripts/db-security-test.mjs`, non-prod) | **2253/2253**, 0 failed, transaction rolled back |
| Jest | 1040/1040 across 53 suites |
| typecheck / `lint:ci` | clean / 0 errors, 209 warnings (baseline 210) |

B5B carries 2253 assertions, and **only 4 of them mention storage** — it runs inside one
transaction that is always rolled back, so it structurally cannot exercise the Storage API or
race itself. That is why F1 and F5 needed evidence of their own rather than a citation.

## Classification

| # | Finding | Classification | Re-scored severity | Fix? |
|---|---|---|---|---|
| F1 | Erasure + Storage | **Already closed**, except one **accepted platform limitation** (F1-C) | LOW (was HIGH) | No |
| F2 | Erasure completeness | **Already closed** | — (was HIGH) | No |
| F3 | Discovery / ratings | **Already closed** | — (was HIGH) | No |
| F4 | Product-truth UI copy | **CONFIRMED DEFECT** (narrow) | MEDIUM (was HIGH) | **Yes — copy only** |
| F5 | Block + booking race | **Already closed**; the gate was **untested** and now is | LOW (was MEDIUM) | Test only |
| F6 | Contracts | **Already closed**; one concurrency case **unproven** | LOW (was MEDIUM) | No |
| F7 | Reviews | **Already closed** | — (was MEDIUM) | No |
| F8 | Community / Reels | **Already closed** | — (was MEDIUM) | No |
| F9 | Operator self-action | **CONFIRMED DEFECT** | **MEDIUM** (as scored) | **Yes — forward migration** |
| F10 | Barter | **Already closed** | — (was MEDIUM) | No |

---

## F1 — Erasure and Storage

**A. Can media remain after finalisation says completed? — Already closed.** Objects are
enqueued in `pending_media_deletions` **unconditionally and first**, keyed on the subject's own
storage prefix, and `adel_media_purge` raises while any row is unconfirmed; `completed` is
recomputed from the step rows. `20261114000000` records that this was once gated behind "has a
`providers` row", so a client-only erasure reported `completed` with the person's avatar still
served (SEC-STORAGE-004) — found and fixed there, not here.

**B. Can an old signed URL retrieve a deleted object? — Already closed (private buckets).**
Measured, not reasoned about: a signed URL taken before deletion returned **HTTP 400** the
instant the object was removed, `cf-cache-status: BYPASS`.

**C. Can stale cache expose bytes after deletion? — ACCEPTED PLATFORM LIMITATION. Proven, and
bounded.** `provider-media` and `posts-media` are **public** buckets. A public URL obtained
before deletion **continued to serve the bytes after the object was gone**, `cf-cache-status:
HIT`, at +0s, +5s and +15s.

The deletion itself is genuinely complete at the origin — the authenticated listing returned
`[]`, and the same URL with a cache-busting query string returned **400**. What persists is a
CDN edge copy, bounded by `cache-control: public, max-age=3600` — **one hour**, from
supabase-js's default `cacheControl: '3600'`, because `lib/storage.ts` does not set one.

So: bytes are deleted; a URL somebody already held can replay them for up to an hour. This is
**not a DB defect and no migration can change it.** It is recorded rather than fixed because
the options are product calls, not corrections — shorten the upload `cacheControl`, or make the
buckets private and serve signed URLs. **Those two options are listed under "Product decisions
needed" below.** Nothing in the app or the docs currently claims otherwise: the operations note
says the object is removed from the bucket, which is true of the origin.

**D. Path-as-identity leak after erasure? — Already closed.** `booking_reference_photos`
`storage_path` is `<auth uid>/<booking id>/<n>`, and `20261128000000` severed it: the real path
moves to a restricted column and the granted column becomes `erased/<row id>`. No surviving row
carries a path containing an erased auth id — `posts` are deleted with the provider,
`providers` imagery is nulled, the `clients` row (and its `avatar_url`) is deleted, and
`community_posts` **has no media column at all**. Pinned by
`account_erasure.test.sql` ("after erasure the subject's auth id survives in no other
client-readable column").

**E. Partial worker failure claiming completion? — Already closed.** See A, plus
`20261133000000`'s three corrections (dispatch recorded before the call, a 15-minute
`for update skip locked` lease, and confirmation only on positive evidence of absence).

**F. Cross-user path manipulation? — Already closed, twice over.** `20261128000000` binds
`storage_path` to the caller's own prefix on INSERT **and** makes the purge enqueue only paths
under the subject's own prefix, so a row forged before the trigger is inert. Pinned by "a
reference photo cannot name another account's object" and "a forged path is never queued for
deletion".

## F2 — Erasure completeness — Already closed

Every sub-question has a matching live assertion:

| Sub-question | Assertion |
|---|---|
| Overlapping runs safe / leases | "a claim returns outstanding rows" + "and a second claim in the same lease window returns none of them" |
| Duplicate media processing | "a confirmed row cannot be annotated with a failure" |
| Overdue work caught | "a request past its grace date that nothing finalised is reported as overdue" |
| Scheduler failure not silently healthy | "a dispatch no run answered is reported as a positive problem" |
| Idempotency | "finalising twice is still completed", "rerunning a completed step is a no-op", "an allocation is idempotent" |
| Already-absent object | "an object that is already absent must not wedge the erasure" (+ `objectIsAbsent` unit tests) |
| Restore authority | "the owner can restore during the grace period", "a stranger calling restore restores nothing of yours" |
| Restricted evidence does not block erasure | "a provider can still be DELETED — case history must not block erasure" |

**Restore-vs-finalise is server-authoritative by a row lock, which is the part worth stating.**
Both `cancel_account_deletion()` and `finalize_account_deletion()` take `select … for update` on
the same `account_deletion_requests` row, so they serialise. If restore wins, finalise sees
`cancelled` and returns. If finalise wins, restore re-reads under the lock and hits the explicit
`PT445` refusal — *"This deletion is already being carried out and cannot be stopped."* Once
`completed`, the status is outside restore's `where` clause **and** the credentials are gone, so
`auth.uid()` is null: two independent refusals.

## F3 — Discovery and ratings — Already closed

**The mirror is structurally constrained, which is the whole question.** `providers.rating` was
a second numeric column no recompute wrote, used as the search ranking key while every display
surface read `average_rating` (`20261084000000`). It is now a mirror, and the constraint is a
**trigger that refuses any write storing a reputation number `provider_reputation_canonical()`
does not produce — including one made by `service_role`.** Verified present **live**:
`providers_reputation_is_derived_ins` and `providers_reputation_is_derived_upd`. Pinned by "and
the search-ranking column mirrors it rather than lagging at zero". Mirror usage is therefore not
a defect, which is what the brief asked to be careful about.

| Read path | Relation | Verdict |
|---|---|---|
| `fetchDiscoveryPool` (Discover lanes) | `providers_visible` + `is_approved = true` | Block- and deletion-filtered |
| `useProviders` search/list | `providers_visible` + `is_approved = true` | Same |
| `fetchProvider` (directly-opened profile) | base `providers` | **Deliberate**, documented; the OQ-076 / PD-090 accepted limitation |
| `getLiveCount` | base `providers`, `count` only | A city-wide marketplace stat; returns a number, discloses no identity |
| Community feed | `providers_visible` / `community_posts_visible` | Filtered |

**Deapproved:** every discovery path filters `is_approved = true`. **Deleted / pending
deletion:** excluded at the **base table** since PD-104 narrowed `providers_public_read` —
"a stranger cannot read a pending-deletion provider from `public.providers`". **Blocked:**
"before a block, A sees B in discovery" / "the BLOCKER no longer sees them in discovery".
**Social engagement:** `lib/discovery.ts` excludes it by design — "not by followers, not by
likes, not by views, not by 'engagement'", and `DiscoveryProvider` carries no engagement field.
**Unrated providers:** `lib/reputationLabel.ts` is the single helper, because `average_rating`
is `NOT NULL DEFAULT 0` and 0 must not render as a rating.

## F4 — Product truth — CONFIRMED DEFECT (narrow), fixed

Most of F4 was already done: the repo carries `PRODUCT TRUTH:` comments recording the removal
of the verified check-mark, the "ID Verified" badge, "Secure booking", "All reports are reviewed
by a real person", and the payment-encryption assurances — and `betaClaimsAbsent.test.ts` pins
their absence. The live badges that remain are honest: "Booked on The Book" renders only on
`post.bookingBacked` (server-verified completed booking, PD-098), and "Phone Verified" requires
`phone_confirmed_at`.

**What was actually wrong is an incomplete application of the repo's own locked rule**, stated
in `app/preview/protection-center.tsx`:

> "A 'Coming soon' pill above a present-tense assertion does not neutralise it. Preview screens
> may NAME a future capability; they may not assert one."

That pass corrected protection-center, and corrected the **cards** of
`provider-verification.tsx` — one of which reads "A badge **would** show when a provider's
identity has been confirmed". It left the **ledes** of the two trust previews in the present
tense, so one screen told a client to go and see a verified ID while its own card said a badge
would show one day:

| Where | Said | Why false |
|---|---|---|
| `app/preview/provider-verification.tsx` lede | "Know your provider is real. **See verified IDs**, real reviews, and completed bookings before you book." | No identity-verification process exists (PD-004) |
| `app/preview/safety.tsx` lede | "Know who you are booking. **Verify clients** and feel safe…" | No client verification exists (PD-004) |
| `components/ClientMe.tsx` row | "Verified Providers — **IDs**, real reviews, and booking counts" | Same; and this row is a **live surface in `betaClaimsAbsent`'s scope** |
| `components/ClientMe.tsx` row | "Protection Center — **Coverage, claims, and real support**" | The Book operates no payment protection (PD-042) |
| `components/ProviderMe.tsx` row | "Safety & Verification — **Know who you are booking**" | No client verification exists (PD-004) |

The two `ComingSoonCluster` rows matter most: they sit **outside** the preview screens, so the
corrections made there never reached them, and a row is the first claim a reader sees. They were
in the guard's scope and the guard missed them — the bare word "IDs" is not "ID Verified", and a
subtitle is not a badge.

**Fixed, copy only.** All five reworded to name the future without asserting it, each carrying
the reason. No screen was redesigned and no other preview lede was touched: the rest describe
features whose absence costs nobody their safety, and rewriting them would be a copy pass rather
than a fix. **`app/preview/**` remains excluded from the pattern guard** — that exclusion is
correct and was not reversed.

**Pinned** in `betaClaimsAbsent.test.ts` by two new blocks: the trust-preview ledes, and the
removed row wording pinned directly (a pattern banning the bare words "IDs" or "support" would
fire on truthful copy and get itself deleted rather than obeyed). **Red-green verified:**
restoring each original string fails 4 assertions.

## F5 — Block + booking race — Already closed; the gate was untested

Enforcement is server-side and authoritative: `enforce_booking_submit_not_blocked`, a
`BEFORE UPDATE` trigger firing on exactly one transition —
`old.submitted_at is null and new.submitted_at is not null` — raising **`PT427`**. Every other
transition stays open to a blocked pair, deliberately, "because a block never strands a
transaction that already exists".

**The race has no forbidden end state, and that is the finding.** Because a live transaction
deliberately survives a block, a submit that commits microseconds before the block is in exactly
the position of one submitted a week earlier. The only forbidden outcome would be a **submitted**
request where the block committed **first** — which the trigger prevents, since it reads
committed rows at statement start.

**What was genuinely missing was a test of the gate.** The existing `raceBlockVsBooking`
scenario races a block against the **INSERT** of a booking — but `PT427` does not live on the
insert, so that scenario's `PT427` assertion is reachable only by the eligibility path and the
submit gate was never raced by anything. Added `raceBlockVsSubmit` to
`scripts/negotiation-concurrency.mjs`: two genuinely parallel sessions, block vs the
`draft → submitted` update, asserting both orderings are legal, that the outcome is internally
consistent (refused ⇒ not submitted; ok ⇒ submitted), that a refusal is `PT427` rather than a
generic failure, and that a later submit with the block committed is refused deterministically.

## F6 — Contracts — Already closed; one case unproven

| Sub-question | Evidence |
|---|---|
| Stale-version acceptance | "a NEW acceptance naming a stale version is refused" + "and the current version is accepted" |
| Accepted version immutable | `contract_versions` immutable; "the PROVIDER revisits the same accepted version" |
| No silent rebind | "the agreement references the accepted CURRENT version"; "source term, description and timing derive from accepted version" |
| Direct table / RPC bypass | "a forger cannot pair their OWN booking with a stranger's contract"; "a signer cannot re-point their signature at another contract"; "an unrelated non-provider user cannot create a contract" |
| Evidence survives erasure | PD-107; "a third party's `pdf_url` cannot keep an erased account's object alive" |

**UNPROVEN AFTER INSPECTION, and deliberately not fixed:** *concurrent provider edit racing
client acceptance*. The version is validated inside the accepting transaction, so either the
edit commits first (acceptance refused as stale) or after (the acceptance was valid when made) —
but no harness proves it. `negotiation-concurrency.mjs` has no contract fixtures, and adding
them is more than this pass should do unasked. **Recorded as owed, not as a defect.**

## F7 — Reviews — Already closed

Every Step 8 sub-question maps to a live assertion: blind reviews invisible to the counterpart
and absent from the public list "even for its author"; no count leak ("a blind review counts for
nothing to begin with", "and the stored rating does not move for a blind review", "nor a client
count"); "a one-sided review reveals when the window closes"; "filing a dispute does not hide an
ALREADY REVEALED review"; "PD-092: the review of the most recently COMPLETED service is the one
that counts"; "no UPDATE or DELETE policy exists on `provider_reviews`"; and no operator rating
pin, enforced by the F3 invariant rather than documented. The `service_role` trust model was not
reopened — no reachable path was found.

## F8 — Community / Reels — Already closed

Hidden content is absent from the feed, from a bookmarked read and from a direct read ("a third
party cannot read hidden content directly", "absent when asking for the post directly", "hidden
AND blocked is absent"), and `posts_public_read` was narrowed at the **base table** by
`20261111000000` so no view is the only thing standing between a caller and a hidden row —
"the base-table read still admits any signed-in caller for VISIBLE content (PD-090)". Restore
works ("an operator can restore it"). Business voice is blocked on deapproval while the personal
voice remains ("a deapproved provider cannot post as a provider"). All seven `_visible` views
confirmed **live** as `postgres`-owned definer views.

## F9 — Operator self-action — CONFIRMED DEFECT, fixed

**This was found only because the live schema was checked against the repo.** Reading
`20261049000000` alone gives the wrong answer: `is_operator()` there is `service_role` or a
no-claims session, which would mean operator authority is not a user identity and self-dealing
has no in-product representation. **The live definition has a third arm**, added by
`20261059000000`:

```sql
or ((select auth.uid()) is not null
    and exists (select 1 from public.operators o where o.user_id = (select auth.uid())))
```

So an operator **is** a signed-in user of this product, and can be the subject of the case they
are working. `20261059000000` saw exactly that and guarded **one** surface —
`adjudicate_barter_obligation` gained "A participant cannot adjudicate their own trade", with
its own comment explaining that an adjudicator "may be a participant in the very trade they are
looking at". The Review Queue got no such guard.

**Proven against non-production, inside a rolled-back transaction.** One account: a row in
`public.operators`, a de-approved `providers` row it owns, and a `provider_appeal` case naming
that provider. Acting as that signed-in user with `role = authenticated`, **not** `service_role`:

```
is_operator()                                          -> true
operator_update_case(own case, 'resolved', self)       -> SUCCEEDED
operator_set_provider_eligibility(own provider, true)  -> SUCCEEDED
final: case status = resolved, provider is_approved = true
```

An operator restored their own suspended business and closed the appeal about it, alone.

**Why the existing coverage missed it.** `safety_operator.test.sql` asserts "a provider cannot
restore their own eligibility" — and that is a **plain provider** issuing a direct
`update public.providers set is_approved = true`, which RLS refuses. It says nothing about a
provider who is *also* an operator calling the RPC, because when it was written no operator could
be a provider. The assertion did not rot; the world underneath it changed and nobody re-asked its
question.

**Fixed** by `20261134000000`: one predicate, `operator_case_involves_user`, covering every
`case_type` (requester, the appealing provider's owner, both sides of a report, all four barter
participants), and a neutrality check in both RPCs. It is deliberately a third, separate check —
`is_operator()` asks *who may work the queue*, the actor check asks *that the record name whoever
acted*, and this asks *whether this operator is neutral on this case*. It engages only when there
**is** a caller identity, so `service_role` and ops sessions are untouched.

**The RPC bodies were taken from `pg_get_functiondef`, not retyped.** A hand-written copy dropped
the `noted` action, the `PT412` closed-case refusal, the note-length bound and the real `reports`
column names (`report_status`, `resolved_by`) on the first attempt. A `create or replace` is a
full rewrite, so the only safe source for the parts not being changed is the database.

**Verified after the fix, with controls:** the party operator is refused on both paths while
still being `is_operator()`; a **neutral** operator can still decide the same case (no regression
to the Review Queue); the `service_role` path still works. Pinned by 13 new B5B assertions,
including that the refused call moved nothing and logged no event.

**Not changed, deliberately:** who may be an operator, no new column, no second operator
required for an ordinary case, no SLA. PD-068 stands; what is refused is an operator working
their *own* case.

## F10 — Barter — Already closed

212 live assertions. Deapproval permits existing activity and blocks new
("a de-approved participant can still cancel", "de-approved existing participant can still read
obligations", "a de-approved provider is not bookable either", "a deapproved provider cannot
post as a provider"). Reputation exclusion is structural: "**no barter reputation, rating, score,
review, penalty or refund object exists**" and "the exempted reputation functions read no barter
object". Concurrency is covered by 30 scenarios. Self-adjudication is refused at four layers.

---

## Duplicated-authority inventory (Step 12 — inventory only, no refactor)

Only a duplicate **server** authority that can materially diverge is a defect. One was found —
F9 — and it is fixed. Everything else is one server authority plus a UX mirror, which is the
intended shape.

| Rule | Authoritative enforcement | UX mirror | Risk |
|---|---|---|---|
| Provider eligibility | `is_approved` on `providers`; `operator_set_provider_eligibility` (now neutrality-guarded); RLS refuses a self-UPDATE | `.eq('is_approved', true)` in `hooks/useProviders.ts`; `acceptingBookings` props | **Copy can drift, server stays safe.** Mirror is a filter, not a decision |
| Account active / deactivated | Derived from the open `account_deletion_requests` row — **no flag** — plus `b_providers_refuse_when_inactive` and sibling triggers | `lib/accountDeletion.ts` | Low. Derivation means there is no second copy to fall out of step |
| Block visibility | `contact_blocked_provider()`; the `_visible` definer views; `enforce_booking_submit_not_blocked` (PT427) | `lib/safety.ts`, feed reads | Low. Views do the filtering so no client can ask "is X hidden from me" |
| Review reveal | One reveal predicate, shared by the policy and the aggregate — "it uses the same reveal predicate as the policy" | `lib/reviews.ts` display | Low, and explicitly pinned |
| Rating | `provider_reputation_canonical()`, enforced by `reputation_is_derived` **against `service_role` too** | `lib/reputationLabel.ts` (one helper) | Low. The mirror column is trigger-constrained, not merely conventional |
| Moderation visibility | `is_hidden` on the row + narrowed base-table policies + definer views | Feed/detail reads | Low. Base table narrowed, so a view is not the only barrier |
| Contract current version | Acceptance validates the version in-transaction | `lib/contracts.ts` | Low; the concurrency case is **unproven** (F6) |
| Availability / Open Today | `providers_open_today()` RPC | `fetchOpenTodayProviderIds` returns **null vs empty** deliberately | Low, and the null/empty distinction is the honest one |
| Deletion state | `account_deletion_requests` + the eleven `adel_*` steps; `completed` recomputed from step rows | `app/settings/delete-account.tsx` | Low. `completed` is a conclusion, not an assertion |
| **Operator authority** | `is_operator()` — **one definition**, three arms | — | **Was the F9 defect: the NEUTRALITY half existed in `adjudicate_barter_obligation` and nowhere else. Now one predicate, used by both RPCs.** |

## Live schema / grant verification (Step 13 — non-prod)

| Check | Result |
|---|---|
| Client-role EXECUTE on sensitive functions | 4 hits, **all explained, none drift** — see below |
| SECURITY DEFINER without pinned `search_path` | **none** |
| `_visible` views + `clients_public` | 7, all `postgres`-owned definer views |
| RLS off on any high-risk table | **none** |
| Bucket public flags | `booking-photos`, `contract-pdfs`, `contract-signatures` private; `posts-media`, `provider-media` **public** (matches repo; drives F1-C) |
| `cron.job` | exactly **one** job, `17 4 * * *`, command `select public.invoke_account_deletion_worker();`, active, naming no barter object and carrying no secret |
| `providers` reputation invariant triggers | `providers_reputation_is_derived_ins` / `_upd` present |
| Local vs non-prod migrations | **173 local == 173 applied**, zero mismatched, after this branch's migration |

**The four EXECUTE hits are repo truth, not drift.** `adjudicate_barter_obligation`,
`is_operator`, `operator_update_case` and `operator_set_provider_eligibility` all carry a direct
`authenticated=X` grant, deliberately added by `20261059000000` when operators became real
identities. What *is* stale is the prose at `20261049000000`/`20261050000000` saying EXECUTE is
"granted to `service_role` alone" — superseded and worth correcting when those comments are next
touched. All four refuse a non-operator internally, so defence in depth holds.

## Outcomes

**Confirmed defects (2, both fixed):** F9 (operator neutrality, `20261134000000`) and F4 (five
copy claims).

**Already closed / false positive (7):** F1 A/B/D/E/F, F2, F3, F5 (behaviour), F6 (except one
case), F7, F8, F10.

**Accepted limitations (2):** F1-C, the ≤1h CDN edge cache on public buckets after deletion.
OQ-076's base-table diffability, reaffirmed — `fetchProvider` reading base `providers` for a
directly-opened profile is PD-090's accepted closed-beta limitation, not an F3 leak.

**Product decisions needed (3), none taken here:**

1. **F1-C.** Shorten the upload `cacheControl` on `provider-media` / `posts-media`, make those
   buckets private and serve signed URLs, or accept the ≤1h window and say so in the erasure
   operations note. Engineering has no basis to pick; all three are defensible.
2. **The remaining preview ledes.** Seven other `app/preview/*` screens use present-tense
   assertions ("See your earnings", "Send and sign simple service agreements"). They are not
   trust claims, so they were left alone. Whether the protection-center rule applies to all of
   them is a copy standard, not a bug.
3. **Whether "Verified Providers" may remain a feature NAME** while no verification exists. The
   row title was kept; only the asserting subtitle changed.

**Unproven after inspection (1):** F6's concurrent contract edit vs client acceptance. No
speculative fix made; a harness with contract fixtures is owed.
