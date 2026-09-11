# Current State — what is true on `main` today

**Community Reshape merged 2026-09-11 (`8331941`, PR #82; test-margin fix `7826ca4`).**
Community is a **service community for clients and providers** — it was provider-only by TABLE
SHAPE, not by policy choice, so no client could ever be represented in it. Clients post *Looking
for someone · Need advice · Who does this style? · Recommend a provider*; providers post *Open
today · Update · Announcement* as their business and answer in-thread, including **"I can help"**.
There is deliberately **no generic post type** — the vocabulary is CHECK-constrained in the
database and paired with the actor, not merely typed in TypeScript.

**Discover remains the marketplace.** Community is a capped module near the bottom of it and a
secondary route off it; there is **no sixth tab**. Provider content creation and management, and
the barter trade board, live in **Business → GROW**, where `NAVIGATION.md` always said they
belonged and where they had never been.

- **Open Today is a projection with a note on it (PD-096).** Published availability is the truth;
  the write is refused unless `providers_open_today()` already contains the provider, the expiry is
  the server's and clamped to 24 hours, and the note stops surfacing when the day ends **or** when
  they block the date — neither of which requires deleting history. It means published hours, **not
  a free slot**.
- **A shoutout is a recommendation, not a review (PD-097, PD-098).** It names a real approved
  provider — not yourself, not across a block — and moves **nothing**: no rating, no count, no
  marketplace position. A booking link is **optional**; where the server verified one the shoutout
  shows *"Booked on The Book"*, which states a booking and not a verdict, and whose **absence
  implies nothing**.
- **A report now has an outcome (PD-099).** An authorized operator can **hide** and **restore**
  Community posts and replies. **Hiding is not deletion** — the row, the report, the case and every
  prior decision survive it, and it is reversible. It is also a **read boundary**: hidden content is
  readable by its author and by an operator, and by nobody else. An operator **may not moderate
  their own matter** (PD-068 applied to a new surface). No bulk moderation, no keyword or AI
  filtering, no auto-bans, no scoring, **no SLA**.
- **Community engagement does not influence provider marketplace ranking**, and the feed is ordered
  chronologically. A provider who never posts is not worse off for it.

**What travels with it:** a **client** author is not told when their post is hidden (clients have no
"my posts" screen) — support is told what to say, and the UX pass owes the rest. Community is
**complete for beta scope**, subject to **physical-device QA**, a **final UX/UI pass**, and real
cohort learning.

**Reviews Phase 2 merged 2026-09-11 (`a253c3f`, PR #81).** A provider's public rating is the mean
of the **latest revealed review from each distinct client** (PD-091), where *latest* is the review
tied to the **most recently COMPLETED service** — `bookings.completed_at`, not review submission
time (**PD-092**). Every review is still stored, still displayed and still counted; a second
published number, `rating_client_count`, says how many clients the rating rests on and is labelled
beside the rating on the profile, the search card, Top Rated and the provider's own Me tab.

**Two rules that are easy to get backwards, and both are now enforced:**
- **Filing a dispute changes nothing about a published review** (**PD-093**). Reveal latches at the
  instant a hold opens: a review not yet public stays held, a review already public stays public
  and keeps counting. A hold still blocks a *new* review on that booking. Only an operator
  resolution could change that, and **no resolution rule does so today** — support must not imply a
  review can be taken down.
- **There is no manual rating** (**PD-094**, closing OQ-079). The rating is derived from eligible
  review data and the database refuses to store a value it cannot reproduce, for every role
  including `service_role`. No operator rating-editing surface exists and none is to be built.
  `providers.rating` — which no recompute had ever written, yet ranked and filtered provider
  **search** — is now a derived mirror of `average_rating`.

**What travels with it:** **OQ-080** is open — `service_role` can still move a rating by mutating
the review ROWS the canonical query reads, one layer behind PD-094, unreachable by any client role
and not decided here. The rule counts distinct client *accounts*; many accounts each leaving one
review is still unbounded, and bounding it needs identity the beta does not have.

**Booking & Onboarding Integrity merged 2026-09-11 (`2da313a`).** Contract acceptance is a durable
record bound to an immutable version; reference photos reach the provider and settle when the
request is sent; a provider presented as bookable is bookable. **Two limits travel with it:**
acceptances predating `20261068000000` are the best available historical record and **not proof of
exact original wording**, and erasure/retention for booking photos, contract evidence and booking
records is **deliberately unresolved** (OQ-077) — support must not promise deletion of any of them.

**Status:** Authoritative (current-state). Maintained by the Project State Steward.

**Reconciled against:** `main` @ `7826ca4` (2026-09-11) — squash-merge of **PR #82**, Community
Reshape, plus a test-margin correction. The migration chain is now **138** files,
`20260829000000` … `20261099000000`, applied to non-production `wcoyjeklscuqsumpjpfo` with local
and remote in step and **no drift**.

**Previously reconciled against:** `main` @ `a253c3f` — squash-merge of **PR #81**, Reviews
Phase 2. The chain was **126** files at that point. Production
`kxregomuawwcqvisuhtr` remains **untouched and never reconciled** — see
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) § Production application policy.

**The header block below this line predates that merge** and is retained because its content is
still true; only the anchor moved.

**Previously reconciled against:** `main` @ `e5b9125` (2026-09-10) — squash-merge of **PR #76**, Session 8
(safety, trust and operator handling). The anchor moves because this document's own asserted facts
moved, and by more than one merge: the migration chain went from the **75** files this document
last counted to **97**; **user blocking**, **one client reporting path into `public.reports`**,
**provider-eligibility gating of barter writes** and the **operator Review Queue's BACKEND** all
became real; and before them Pre-Session-8 Correction 3 gave a booking request a lifecycle, gave a
deliverer a way to ask for a barter review, and moved the live definition of
`public.my_barter_obligations`.

**SUPERSEDED 2026-09-10 — the sentence below described `main` before Session 8B.** The Review
Queue's surface was built and merged (`c4afee5`), PD-068 is **SATISFIED**, and Session 8C
(`0b1f563`) then added report intake bounds (PD-088) and blocked-user surface exclusion (PD-089).
What has NOT changed is the part that matters operationally: no SLA, no notification channel, and
nothing dequeues a case except a person.

**Read the one sentence this document exists to keep straight: the Review Queue's BACKEND is
built and its OPERATOR SURFACE is not.** `PD-068` is **PARTIALLY SATISFIED — not complete** — and
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md):1001-1012 states that precisely. Working a case today
requires a `psql` session.

**Four merges sit between `f5fd197` and `e5b9125`, and this document's header had recorded none of
them.** They are named here because a reader would otherwise take the gap for empty. The sequence
was read from `.git/logs/HEAD` on this tree — this run had **no shell** and could not call
`git log`:

1. `224d609` — the post-Session-7 reconciliation, **PR #71**, documentation only. It wrote the
   header this one replaces and then went unrecorded in it, because a document cannot cite the
   commit that lands it.
2. `6a3fb69` — *"remove unsupported payment, identity, notification and SLA claims from live beta
   surfaces"*. **Pre-Beta Correction 1**, so named by [OPEN_QUESTIONS.md](OPEN_QUESTIONS.md) under
   OQ-036 and dated 2026-09-08 there.
3. `a125cd7` — *"bind provider, contract, signature and storage ownership; least-privilege
   defaults"*. **Pre-Beta Correction 2**, whose findings § Security posture below already carries;
   it is the merge that added that section and left this header alone.
4. `0781f49` — **PR #74**, **Pre-Session-8 Correction 3**, PD-071 … PD-081.

**PR numbers for `6a3fb69` and `a125cd7` were not supplied and are deliberately not recorded**;
their merge SHAs are. `git log --oneline --merges f5fd197..e5b9125` supplies them in one command.

**Why the previous header still read `f5fd197`.** The reconciliation that should have moved it —
the branch `chore/post-correction3-state-reconciliation`, whose ref reads `ce09a66` — did not reach
`main`: `.git/logs/HEAD` records `main` moving `0781f49` → `e5b9125` in one fast-forward with
nothing between. It is recorded as superseded by this pass.

What this run confirmed from files rather than taking on trust: `.git/refs/heads/main` and
`.git/refs/remotes/origin/main` both read `e5b912511829ecfa8793c2a5ad8feaba40dfa3a0`; `.git/HEAD`
resolves to `chore/post-session-8-state-reconciliation` rather than to `main`; and
`supabase/migrations/*.sql` holds **97** files, newest
`20261058000000_block_gates_fire_last_and_name_no_stranger.sql`.

**Inspected at:** the branch tip `76c4576`, which is `e5b9125` plus **one commit that is not a
Steward edit** — "docs: the discovery comment named a function that was dropped", salvaged from the
superseded PR #75 and touching a file outside the Steward's five-file allowlist. The tree read by
this reconciliation is therefore that commit's tree, not `e5b9125`'s. No claim below depends on the
difference, and it is stated rather than glossed.

**Last edited by:** this reconciliation. **No PR number was supplied to it, so none is recorded.**
The last numbered edit to this file that can be proven from the repository is **PR #71**
(`224d609`), which set the header this one replaces; the § Security posture section below was added
afterwards by the Correction 2 merge `a125cd7`, whose PR number is not established.

> **`Reconciled against:` is not the tip of `main`.** It is the last commit at which the
> repository facts asserted in this document were verified. A documentation-only merge that
> changes no repository, product, runtime or security fact does **not** advance it — so this
> anchor may legitimately sit behind `main`. `Last edited by:` records the documentation
> mutation separately, as a PR number, because a PR number exists before merge and a merge
> SHA does not: a document can never truthfully cite the commit that lands it.

This answers one question: *what is actually true about The Book today?* It is written for
someone joining cold — a new PM or engineer should be able to read this and orient without
reading old chat logs.

Where another document is authoritative, this one **links rather than restates**. A copied
rules section becomes a second source of truth and drifts.

---

## Product

The Book is a **two-sided marketplace for independent service providers and clients**.
A single account can participate as **both** — the same person may book a barber on Tuesday
and take clients as a photographer on Wednesday. **Houston-first.**

The core marketplace loop:

> Discover → Profile → Trust → Book → Pay → Message → Complete → Review → Rebook

**Payments are not live.** This is deliberate: the beta exists to prove the marketplace and
community loop *before* payments (PD-042). See
[HOUSTON_BETA_STRATEGY.md](HOUSTON_BETA_STRATEGY.md).

Product-surface truth — what is REAL vs PARTIAL vs PLACEHOLDER vs DEFERRED vs UNDECIDED —
is authoritative in **[BETA_SCOPE.md](BETA_SCOPE.md)**. Canonical journeys and their
expected end states are authoritative in **[USER_JOURNEYS.md](USER_JOURNEYS.md)**.

---

## Navigation

Authoritative: **[docs/architecture/NAVIGATION.md](../architecture/NAVIGATION.md)**.

Five shared tabs: **Discover · Reels · Bookings · Messages · Me** (`app/(tabs)/`).

There is **no client/provider mode architecture** — no global `currentMode`. Role follows
the domain relationship and capability, not a UI toggle (PD-010). Provider tools live under
**Business** (`app/(tabs)/business/`), not as a parallel tab set (PD-012).

---

## Messaging — pre-booking message requests

Authoritative: **[BETA_SCOPE.md](BETA_SCOPE.md)** § Messaging — it owns the full rules,
including beta specifics this summary does not repeat (a declined request is soft-closed
with non-punitive copy, and the client may send another request later; no cooldown in beta).

Merged and enforced **server-side**, not just in the UI:

- A client may send **one initial message** to a provider they have no booking with.
- The provider **Accepts** or **Declines**.
- While `pending`, further client messages are **blocked**; the provider cannot message until they accept.
- `accepted` opens a normal unified thread for both sides.
- A **booking supersedes** a pending/declined request and reuses the same conversation.
- **Duplicate simultaneous pending** requests for the same pair are prevented by a unique index.
- **One conversation per client/provider pair.**
- `messages.created_at` is **server-stamped**, because it is the pending-cycle boundary — a client cannot back-date to defeat the one-message rule.

Evidence: `supabase/migrations/20260901000000_prebooking_message_requests.sql`,
`20260901010000_prebooking_message_concurrency.sql` (adds a row lock closing a
read-then-insert race on the one-message rule). Regression coverage:
`supabase/tests/messaging.test.sql`.

---

## Reviews — Phase 0 and Phase 1 complete

Full rules are authoritative in **[REVIEWS_MODEL.md](REVIEWS_MODEL.md)**; the locked
decisions behind them are PD-020 … PD-028 in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md). This section deliberately does **not**
restate them — a third hand-maintained copy would drift, and the qualifiers matter.

Orientation: reviews come only from completed Book bookings, run in **both directions**,
are **1–5 stars with optional text** (a star-only review is valid), have a **7-day
submission window** from the server-authoritative `completed_at`, and stay **blind** until
both sides submit or that window closes. Repeat bookings are independently reviewable;
`under_review` blocks submission and holds reveal; a `no_show` produces no service-quality
review. Structured signals are **Phase 2 — not started**.

> **Read the qualifiers in the source before building on them.** For example, `completed →
> no_show` is rejected *for authenticated writers going forward* — it is a `BEFORE` trigger
> on new writes, `service_role` bypasses it, and pre-existing rows are not remediated.
> `REVIEWS_MODEL.md` states this precisely; a flattened "it can never happen" reading is
> what would justify adding a live-status test to `review_eligible()` and reintroducing the
> suppression vector SEC-DATA-101 closed.

Eligibility is decided by the **server**, not by UI status: `review_opportunity(booking_id,
direction)` and its batch form `review_opportunities(booking_ids[], direction)`. Presentation
grouping (which tab a booking sits in) never decides reviewability.

Migrations: `20260902000000` (Phase 0 foundation), `20260903000000` (opportunity RPC),
`20260904000000` (completed→no_show guard), `20260905000000` (batch RPC).

---

## Foundation & security

**B5B — permanent executable DB/security regression harness.**

- Asserts real Postgres enforcement — RLS, triggers, grants and `SECURITY DEFINER` behaviour, exercised as the `authenticated` role. The **count changes whenever a suite grows**, so read it from the latest CI run rather than from any document; at run 33726878929 (`e7ccd87`) it was 88/88.
- **Non-production only.** A production-ref guard refuses the production project, the Transaction pooler (port 6543), an `sslmode` that would disable TLS, and any target whose ref cannot be positively identified.
- One transaction, **always rolled back** — zero residue follows from that rollback, not from a per-run emptiness check (the harness performs none; see its README).
- **CI is wired to execute it** via the `db-security` job, which expects the `TEST_SUPABASE_DB_URL` secret. On `push` to `main` a missing secret **fails** the job rather than skipping — a green-and-empty required check proves nothing. On pull requests (including forks, which GitHub withholds secrets from) a missing secret **warns and skips**. Whether the secret is configured *right now* is GitHub state, not repository state — read it from the latest `db-security` run, not from this document.
- The **Session pooler / psql path is verified on `main`**: run 33726878929 on `e7ccd87` logged `via TEST_SUPABASE_DB_URL` and `88/88 passed, 0 failed`.

Docs: **[supabase/tests/README.md](../../supabase/tests/README.md)**.

**Migration ledger.** The repository holds **97 migration files** — counted from
`supabase/migrations/*.sql`, newest
`20261058000000_block_gates_fire_last_and_name_no_stranger.sql` — and
that part is repository-provable. The chain now breaks into four blocks, newest first:

- **Thirteen files, `20261046000000` … `20261058000000`, are Session 8** (safety, trust and
  operator handling — blocking, reporting, provider eligibility, the operator Review Queue backend
  and the appeal route), of which **six are forward corrections** and one is comments only. They
  are described in § Safety, trust and operator handling below and itemised per file in
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) § 2026-09-09 (`20261046000000` …
  `20261058000000`).
- **Nine files, `20261037000000` … `20261045000000`, are Pre-Session-8 Correction 3**, of which
  **four are forward corrections to the other five**: the booking-request lifecycle and its
  72-hour server expiry (PD-071), the booking-scoped contract read, the deliverer's barter review
  request (PD-072), provider availability signals, owner-scoped post deletion, and the correction
  that replaced an unreachable `available_today` computed column with `providers_open_today()`
  after it broke discovery, profile and search for every user
  ([MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) § 2026-09-09, `20261037000000` …
  `20261045000000`).
- **Seven files, `20261030000000` … `20261036000000`, are Pre-Beta Correction 2** (security and
  authorization) and are described in § Security posture below.
- The **68** that preceded those are described in the paragraph that follows, which is unchanged.

Ten files, `20260917000000` … `20260926000000`, are Slice 3a
(PR #49); four files, `20260927000000` … `20260930000000`, are Agreement Finalization (PR #50);
two files, `20261001000000` … `20261002000000`, are Proposal Timing Extension (PR #52);
`20261003000000` is the Barter Obligations Foundation (PR #54); `20261004000000` is
Obligation Delivery and Receiver Confirmation (PR #56); **six files,
`20261005000000` … `20261010000000`, are Pre-Delivery Cancellation (PR #58)**;
**`20261011000000` is the Receiver-Response Window and Needs Attention (PR #62)** — one file,
which creates no column, table, trigger, RPC or job; and **seven files,
`20261012000000` … `20261018000000`, are No-Show Reporting and the Under Review Foundation
(PR #64)**, of which `20261012000000` is the slice and the other six are forward corrections
and the two PD-062 / PD-063 halves. **PR #66 added none** — the count was still 57 at `0f2b93c`,
confirmed as an absence rather than assumed. **PR #68 added eight, `20261019000000` …
`20261026000000`** — manual operator adjudication and the three terminal OBLIGATION outcomes
(PD-064 … PD-067), of which `20261019000000` creates the record and the write path,
`20261020000000` makes a terminal outcome dominate the read models and the participant write
paths, `20261021000000` carries the two per-side outcomes onto Trade Activity, and
`20261022000000` … `20261026000000` are forward corrections from three review passes.
**PR #70 added three, `20261027000000` … `20261029000000`** — the suppression predicate computed
once plus the `p_trade_cancelled` rename, the PD-069 deprecation of
`barter_offers.offering_value`, and a comment precision fix on that deprecation. That is 57 + 8 + 3
= **68**, which is what `supabase/migrations/*.sql` returns.
The ledger's § Prevention records why these features landed as forward correction chains:
after a migration is applied to non-production, fixes go into a new migration rather than an
edited historical file. Process and the dated record:
**[docs/operations/MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md)**.

> **Read the ledger before redefining `public.cancel_barter_agreement`.** It was replaced **five
> times** inside PR #58 — `20261005000000`, `20261006000000`, `20261007000000`, `20261008000000`,
> `20261009000000`, then `20261010000000` — and **PR #64 replaced it a sixth time, so its current
> live definition is now
> `20261015000000_under_review_precedes_cancellation.sql`**, which adds the PD-063 `PT423`
> refusal. An author who redefines it from any
> earlier file would silently delete the PD-063 refusal, the in-thread signal, and restore the
> "Both providers agreed to cancel" wording that `20261010000000` was written to remove. This is
> not hypothetical:
> `20261008000000` exists precisely because `20261007000000`'s body was written from a
> **superseded** definition of `release_barter_interest` and dropped four of its properties,
> including the isolation that stops a notice failure from vetoing the cancellation. The ledger's
> § "Functions redefined across migrations" now carries rows for `cancel_barter_agreement`,
> the new one-writer helper `public.pair_conversation_notice`, the two obligation RPCs
> `20261005000000` redefined, and — added by PR #62 —
> **`public.enforce_barter_obligations_immutable`, whose live definition is now
> `20261011000000_barter_receiver_window_needs_attention.sql`, not the `20261004000000` that
> first narrowed it.** Copying the older body forward would silently re-open a `service_role`
> rewrite of the agreed trade.
>
> **PR #64 added four more live-definition hazards of the same shape**, each recorded in the
> ledger's table and each verifiable from the files: `public.report_barter_obligation_no_show`
> lives in `20261014000000_no_show_lock_order.sql`, **not** the `20261012000000` that created it —
> and `20261012000000` § 6 states a lock-order contract that is **false** and must not be copied
> forward; `public.enforce_barter_cancellation_consistent` lives in
> `20261017000000_restore_cancellation_actor_binding.sql`, which exists **because**
> `20261015000000` wrote that trigger from `20261005000000` instead of its live `20261006000000`
> and silently reverted the actor binding and the server-stamped `created_at`;
> `public.enforce_barter_no_show_consistent` lives in
> `20261018000000_no_show_created_at_server_stamped.sql`; and both read models are recreated in
> full.
>
> **PR #68 and PR #70 moved six more live definitions, and three of the entries above with them.**
> Read the ledger's table rather than this summary before touching any of them:
> `public.adjudicate_barter_obligation` lives in `20261023000000_adjudication_hardening.sql`, not
> the `20261019000000` that created it — `20261023000000` added the in-RPC
> adjudicator-may-not-be-a-participant check that five documents already claimed existed, and
> narrowed a privileged predicate that had admitted a no-`sub` `anon` request;
> `public.enforce_barter_adjudication_consistent` lives in the same file, and
> `public.enforce_barter_adjudication_append_only` lives in
> `20261026000000_append_only_honest_privileged_predicate.sql`, **not** the `20261024000000` it
> supersedes; `public.mark_barter_obligation_delivered`, `public.record_barter_obligation_receipt`
> and `public.report_barter_obligation_no_show` all now live in
> `20261022000000_obligation_resolved_sqlstate.sql`, which moved the post-resolution refusal off
> the borrowed `PT412` onto its own **`PT424`**; **both read models were dropped and recreated by
> `20261027000000_suppression_computed_once.sql`**, which is now the live definition of
> `public.my_barter_obligations` **and** `public.my_trade_activity`; and
> `public.enforce_barter_offer_write` lives in
> `20261028000000_deprecate_barter_offering_value.sql`, where copying an older body forward would
> silently restore a field The Book has ruled it will not collect (PD-069).
> `public.cancel_barter_agreement`'s live definition is **unchanged** at `20261015000000`, and
> `public.enforce_barter_obligations_immutable`'s at `20261011000000`
> ([MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) § "Functions redefined across
> migrations").


### Security posture — Pre-Beta Correction 2 (2026-09-08)

**Bounded update by the correction slice itself, not by a Steward reconciliation.** It records
only the security facts that changed; the `Reconciled against:` anchor at the head of this
document is deliberately NOT moved, because moving it would assert that every other claim below
was re-verified at this commit, and it was not.

Five authorization defects were **reproduced at runtime** against the non-production project
before being fixed, and re-verified after. Three of them looked correct in the application code,
which is why they had survived:

- **`providers` was world-readable, every column.** An anonymous caller holding only the public
  anon key — which ships inside the mobile bundle by design — read all 49 columns, including
  `verification_notes` ("Private admin moderation notes"), `stripe_account_id`, `no_show_count`
  and `late_count`. `hooks/useProviders.ts` carried a comment forbidding `select('*')` here and
  naming those very columns; **a comment in the client is not a boundary**, and anyone could issue
  the query it asked our own code not to issue. The surface is now a **column-level SELECT grant**:
  28 public columns to `anon` and `authenticated`, **21 to `service_role` alone**. Row-level
  security decides which rows a caller may read and cannot hide a column — the same reasoning
  `20261019000000` already applied to the adjudication table.
- **A contract could be created for someone else's provider row.** The INSERT policy asserted only
  that the caller was *some* provider, and UPDATE had no `WITH CHECK` at all. Reproduced: provider
  B created a contract owned by provider A and, because `provider_id` is UNIQUE, **denied A their
  own contract slot**. Both write paths are now bound to a `providers` row the caller owns.
- **The client contract-signing gate was unreachable, and silently so.** A first-time client's read
  returned **zero rows and no error**, so the flow treated it as "this provider has no contract"
  and skipped signing — for every client, every provider, always. `contract_signatures` has
  therefore never held a row. Fixed with a `SECURITY DEFINER` read function bounded to
  `authenticated`, one provider, active contracts, approved providers; the table's own RLS is
  untouched. **The audit that first raised this could only call it likely; a runtime reproduction
  settled it.**
- **`posts-media` uploads were bucket-scoped, not owner-bound**, so one provider could write into
  another's folder; and the bucket had no UPDATE or DELETE policy at all, so **a delete returned
  success and removed nothing**. Now owner-bound on all three, matching `provider-media`.
- **Default privileges granted `anon` and `authenticated` every privilege on every future table**
  and EXECUTE on every future function. The backlog: `anon` held INSERT/UPDATE on 32 tables,
  DELETE and TRUNCATE on 33. **TRUNCATE is not filtered by RLS** — it was unreachable only because
  PostgREST offers no way to issue one, which is a property of the gateway, not the database.

Two more defects were then found by the **mandatory reviewer passes over the slice itself**, and
both reviewers reached the first one independently:

- **A stranger could sign another client's booking.** `contract_signatures` carried the same
  unbound-write pair that `contracts` had just been fixed for, and the UNIQUE constraint on
  `booking_id` meant the forgery also **permanently denied the real client the ability to sign**.
  Worse, this slice is what made it reachable: before the contract RPC, a non-participant could
  not obtain a `contracts.id` at all. Becoming a signer would then have unlocked the provider's
  auth id **and their PDF in the private `contract-pdfs` bucket**.
- **The unblocked gate only worked for text contracts.** For a PDF the client could agree to a
  document storage would refuse to show them — a recorded agreement to an unreadable document,
  which is worse than the skipped gate it replaced.

### The pre-existing defect this work surfaced: provider go-live was broken

**Not caused by Correction 2, and the most consequential finding of it.** `.upsert(…, {
onConflict: 'user_id' })` makes PostgREST emit `DO UPDATE SET user_id = excluded.user_id`.
Security Batch 3a granted `user_id` INSERT but deliberately not UPDATE — reassigning it transfers
ownership of the provider row — so PostgreSQL refused the whole statement with `42501`, **whether
or not a conflict occurred**. Provider go-live (J7) has therefore been failing for every real
provider since **2026-08-30**. Batch 3a's own compatibility gate recorded this path as passing
because it exercised a hand-written `DO UPDATE SET display_name`, not the statement the client
sends — **a compatibility test that simulates the client rather than invoking it can bless a path
that never worked.** Fixed on the client (insert, then update everything except `user_id`) rather
than by granting the privilege, and verified end to end against non-production.

**What did NOT change:** signed-out discovery still works (`anon` keeps SELECT where a deliberate
public-read policy exists); no Session 7 barter object was altered; no navigation, copy, or UX
decision was taken. The only product behaviour that moved is the contract gate, which now fires
where it previously skipped, and provider go-live, which now succeeds where it previously failed.
Regression coverage is `supabase/tests/authorization_boundaries.test.sql` plus
`__tests__/guards/providerColumnGrant.test.ts`; **B5B is 1305/1305 and concurrency 181/181**.

**Applied where.** All six PR #58 migrations were applied to the **linked non-production project
only** (`wcoyjeklscuqsumpjpfo`), confirmed with `supabase migration list`: local and remote match
through `20261010000000`, with no orphan in either direction. **PR #62's `20261011000000` was
applied to the same non-production project on 2026-09-06 and confirmed on 2026-09-07** — local and
remote agree on all **50** versions, no gap and no drift, and the applied body was checked against
the live catalog rather than the file
([MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md), § `20261011000000`). The apply was
first recorded in the ledger and has since been **re-verified directly**: `supabase migration
list` against the linked non-production project returns 50 versions with local == remote and no
drift, newest `20261011000000`.
**PR #64's seven migrations, `20261012000000` … `20261018000000`, were applied to the same
non-production project on 2026-09-07** and are dated per-migration in
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) (§ `20261012000000` + `20261013000000` +
`20261014000000`, and § `20261015000000` … `20261018000000`). The state is **57 versions, local == remote, no drift** — **verified** with
`supabase migration list --linked` after the reconciliation that first recorded it, along with
`git diff 1c0fe54 --stat -- supabase/` returning empty, which is what proves PR #66 added no
database change.
**PR #68's eight migrations, `20261019000000` … `20261026000000`, and PR #70's three,
`20261027000000` … `20261029000000`, were applied to the same non-production project** and are
dated per-migration in [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md)
(§ `20261019000000` … `20261025000000` and § `20261026000000`, both 2026-09-07/08, and
§ `20261027000000` … `20261029000000`, 2026-09-08). The state supplied to this reconciliation is
**68 versions, local == remote, no drift**; it was **not re-run here**, and the ledger entries are
the record.
**Production remains out of scope and was never a target of this work.** Every harness that reaches
a database refuses the production ref outright (`scripts/prodRef.mjs`). The invocation additionally
supplied that production (`kxregomuawwcqvisuhtr`) is **untouched and eight migrations behind**
(Batches 6AB / 6D); that figure is **recorded as supplied and was not verified here**, and it is
the only production statement in this document.

**Latest recorded runs.** Rather than restate counts that change with ordinary PRs, this
records *which runs* to look at. Two different things are recorded, and they are not
interchangeable:

- **The latest `main` CI run recorded here** is **34007334683** on `46c0bef` — `check` and
  `db-security` both green, confirmed with `gh run view` after PR #56 merged. The `check` job ran
  typecheck, lint and unit tests; the `db-security` job ran the non-production B5B harness.
  The latest run recorded here is **34019463222** on `5b1a7a9` — `check` and `db-security` both
  green, confirmed with `gh run view` after PR #58 merged. **No CI run number is recorded anywhere
  in this repository for PR #62 / `26fb7fd`**, and the reconciliation that wrote that sentence had
  no shell with which to fetch one; **it is superseded** — the post-merge run for `26fb7fd` is
  34155130832, **success** (see the verification note at the foot of this document). **The latest
  `main` CI run recorded here is now 34165346538 on `23df39c`, conclusion `success`**, the
  post-merge run for PR #64. **Superseded in turn: the latest `main` CI run recorded here is now
  34181613351 on `0f2b93c`, conclusion `success`**, the post-merge run for PR #66. Both run numbers are
  **verified** with `gh run list --branch main`. **Superseded again: `main` CI on `f5fd197` — the
  current anchor — completed `success` on BOTH the `check` and `db-security` jobs.** That
  conclusion was **supplied to this reconciliation**, which had no shell; **no run NUMBER was
  supplied and none is recorded here**, so `gh run list --branch main` is what turns this from an
  attestation into a citation. Read the current status from the latest
  `db-security` run rather than from this document.
- **The last recorded local B5B execution** is still the post-apply run logged against
  `20261004000000` in
  [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) (2026-09-05): **730/730 passed,
  0 failed**, zero residue, with the **non-B5B concurrency proof**,
  `scripts/negotiation-concurrency.mjs`, at **67/67**.   For PR #58 the post-apply figures are recorded against `20261010000000` in the ledger:
  **B5B 872/872**, **concurrency 102/102**, both with zero residue. The coverage itself is
  repository-provable:
  `supabase/tests/cancellation.test.sql` exists and is registered in the B5B runner
  (`scripts/db-security-test.mjs:51`), `scripts/negotiation-concurrency.mjs` carries
  cancellation cases, and `__tests__/lib/tradeCancellation.test.ts` covers the pure client rules.
  **For PR #62 the post-apply figures are recorded against `20261011000000`** in the ledger:
  **B5B 985/985 passed, 0 failed**, of which **113** are `receiver_window` — the three anchor
  cases, the inclusive boundary at one microsecond before / exactly at / one microsecond after, a
  DST-straddling determinism check, and the full `service_role` freeze matrix — and
  **concurrency 102/102**, re-run because § 3b replaced a live trigger body every delivery,
  receipt and cancellation race passes through. Zero residue on both.
  **For PR #64 the post-apply figures are recorded against `20261015000000` … `20261018000000`**
  in the ledger, and they supersede the intermediate snapshot taken at `20261014000000`
  (1074/1074, concurrency 124/124): **B5B 1097/1097 passed, 0 failed** and **concurrency 129/129
  passed, 0 failed**, zero residue on both, against **57** applied versions with local == remote
  and no drift. The concurrency harness's race #20 is where the PD-063 outcome is proven rather
  than argued — and it is the assertion that caught a real `40P01` deadlock before
  `20261014000000` fixed the lock order.
  **For PR #66 the figures are the SAME figures, and that identity is the evidence rather than a
  coincidence**: **B5B 1097/1097 and concurrency 129/129 before and after**, with **Jest 663/663**,
  `tsc --noEmit` clean and `lint:ci` **0 errors**. A refactor that added no migration and changed no
  database object should move no database assertion, and none moved; `git diff 1c0fe54 -- supabase/`
  was empty.
  **For PR #68 the post-apply figures are recorded against `20261019000000` … `20261025000000` and
  `20261026000000`** in the ledger, and **for PR #70 against `20261027000000` … `20261029000000`**:
  the current figures are **B5B 1229/1229 passed, 0 failed** and **concurrency 181/181 passed, 0
  failed**, zero residue on both, against **68** applied versions with local == remote and no
  drift, with **Jest 746/746 across 36 suites**. The Jest suite count is repository-provable —
  `__tests__/**` holds 36 test files — and the new B5B suite is
  `supabase/tests/adjudication.test.sql`, registered in the runner at
  `scripts/db-security-test.mjs:54`. The assertion figures themselves were **supplied to this
  reconciliation**, which ran nothing.
  **That the files exist does not establish that they pass**; this document does not run tests,
  and every figure above is a run recorded elsewhere rather than one observed here.

The suite grew enormously across these slices — 88 → 1229 assertions as the barter work landed,
per the runs recorded in [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) —
which is exactly why the count is read from a run rather than from this document. The
authoritative description of the harness lives in
[supabase/tests/README.md](../../supabase/tests/README.md).

**Anchor history, kept because it is the record of why the anchor sits where each step left it.
The current anchor is `e5b9125` (PR #76) — see the header. Everything from here to the end of this
subsection describes earlier moves and is deliberately not rewritten.**

**Why this document's anchor was `f5fd197`.** The anchor before it was `0f2b93c` (PR #66), and
two merges sit between them. **PR #69** (`c04e5bd`) is documentation only — it added
`FUTURE_PRODUCT_IDEAS.md` and `MARKETING_MESSAGE_BANK.md` and asserted no new repository, runtime
or security fact, so it moves no anchor here. **PR #68** (`5c24e8f`) and **PR #70** (`f5fd197`)
both change facts *this document* asserts, and the anchor moves to the later of the two:

- **PR #68** took the migration chain from 57 files to **65**, added an **eleventh barter table**
  (`barter_obligation_adjudications`), added the product's first **operator-only** RPC
  (`adjudicate_barter_obligation`, `EXECUTE` to `service_role` alone), made **three terminal
  OBLIGATION outcomes** real, and moved the live definitions of six database objects.
- **PR #70** took it from 65 to **68**, made the agreement-level picture a **derived** client
  fact rather than an absence to be explained, and removed the last live barter **dollar-value
  UX** under PD-069 — which changes what a browsing provider sees on the community board.

Both were **supplied** to a shell-less reconciliation rather than read from `git`; what this run
verified from files is the SHA pair in `.git/refs`, the 68-file migration inventory, and every
source claim in § Barter, re-read on this tree.

The reasoning for the earlier moves is kept below, because it is the record of why the anchor sits
where each step left it. The anchor before `f5fd197` was `0f2b93c` (PR #66), and one merge sat
between it and `23df39c` (PR #64): **PR #65** (`1c0fe54`), the documentation-only reconciliation
that followed PR #64. That one moved no anchor, because it asserted no new repository fact. **PR
#66 did**, and the reason was narrower than usual and worth stating plainly: it delivered **no product
behaviour, no migration, no database object and no new lifecycle state**, so nothing in the server
half of this document changed — but it reshaped the **client modules § Barter describes** and moved
almost every line citation in that section. A citation is a repository fact, and a stale one sends
the next reader to the wrong lines. So the anchor moves, and every § Barter citation below was
re-read on `0f2b93c` rather than carried forward. What PR #66 changed is recorded in
[ROADMAP.md](ROADMAP.md) § Completed and § Next; this document records only its effect on what is
true here.

The anchor before `23df39c` was `26fb7fd` (PR #62).
**PR #64 changed facts *this document* asserts**, so the anchor moved again: the migration chain
went from 50 files to **57**, a **tenth barter table** appeared
(`barter_obligation_no_show_reports`), a fourth obligation RPC appeared
(`report_barter_obligation_no_show`), a second derived read state appeared (**Under Review**), and
the **live definitions of four objects moved** — `cancel_barter_agreement`,
`enforce_barter_cancellation_consistent`, `enforce_barter_no_show_consistent` and both read
models. **Like the PR #62 move, `23df39c` was supplied to a shell-less reconciliation and then
VERIFIED**: `gh pr view 64` (MERGED, squash, base `ddcb229`), `git rev-parse` (local `main` ==
`origin/main`, tree clean), `gh run list` (post-merge run 34165346538, success) and
`supabase migration list --linked` (57 versions, local == remote, no drift). B5B 1097/1097 and
concurrency 129/129 were re-run against merged `main`.

The anchor before `26fb7fd` was `5b1a7a9` (PR #58),
which had itself moved from `46c0bef` (PR #56) because PR #58 took the migration chain from 43
files to 49, added a ninth barter table, gave an official agreement an ordinary pre-delivery exit
and renamed the Trade Activity grouping. **PR #62 changed facts *this document* asserts** in the
same way: the chain went from 49 files to 50, two new read surfaces appeared
(`my_barter_obligations`, and four columns on `my_trade_activity`), a derived receiver-response
window and Needs Attention became real, and the live body of
`enforce_barter_obligations_immutable` changed so the obligation's contract fields are frozen
against `service_role` too. So the anchor moves to PR #62's squash-merge commit, `26fb7fd`.
That SHA was supplied to a shell-less reconciliation and then **verified** — `gh pr view 62`
(MERGED, squash, `26fb7fd`), `git rev-parse` (local `main` == `origin/main`) and
`gh run list` (post-merge run 34155130832, success).

[ROADMAP.md](ROADMAP.md) remains authoritative for **which** merge delivered **which**
capability — it carries a Completed row per delivered capability, each citing its merge,
under its own anchor. This document deliberately does not restate that; a second copy would
drift. An anchor is per-document: it moves when that document's own asserted facts move, not
whenever `main` does, which is why this file and `ROADMAP.md` can carry different anchors.

**The Session 4 audit still has no artifact in this repository; Session 5's now does.** The
Slice 1 migration header cites a "Session 4 audit + Session 5 agent review"
(`20260906000000_barter_integrity_slice1.sql:9`) and a plan clause "E-3" (line 36), and the
defect IDs it closes (`SEC-AUTHZ-001`, `SEC-DATA-009`, …) appear nowhere else on `main`. The
**Session 5 output is now committed**: its approved barter clauses are
[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md), and the rulings behind them are PD-043 …
PD-048 (PD-044 records E-3 explicitly). The **Session 4 read-only audit is still not
committed**, so the only in-repo record of it is the migration comment citing it — which means
a cold reader cannot reconstruct why each defect was ranked as it was. That is recorded as a
fact about the repository, not as a criticism of the work.

---

## Barter — the provider-to-provider trade surface

**Barter is not a blank slate.** [BETA_SCOPE.md](BETA_SCOPE.md) § Community / barter classifies the
community / barter surface as **REAL (beta)** — offers, interests and the community screens work.
What was undecided when that classification was written was the barter **product model**: how a
trade binds to bookings, messaging, reviews and completion. For the first Houston closed beta
that model is now locked in **[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md)**, which is
authoritative for it; the decisions behind it are **PD-030 … PD-070**, plus **PD-072** (the
deliverer's review request) and **PD-086**'s eligibility gate, in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md). Neither is restated here.

**The two sentences that govern this whole surface**, quoted verbatim from **PD-069**
([PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md):1043-1045, restated in
[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md):162-163) rather than paraphrased, because
every rule below follows from them:

> **"The Book adjudicates performance, not value."**

> **"The Book does not appraise the trade. It makes the trade clear, mutual, and accountable."**

**What Session 7 built, in one paragraph.** Barter in beta is **provider-only, direct
two-provider** exchange: no cash hybrid, no credits, tokens or stored value, and **no dollar
valuation or equivalency anywhere in the live product** — value is **provider-defined and
subjective**, and the question the system asks is *what did you promise*, never *is it worth the
same* (PD-069). On top of that sits a **structured negotiation with immutable proposal
versioning**, an **immutable agreement**, **exactly two directed obligations**, **delivery
marking**, **receiver confirmation**, **`not_received`**, **derived Needs Attention**, **no-show
reporting**, **derived Under Review**, **one-sided pre-delivery cancellation**, and
**OPERATOR-ONLY adjudication** producing **three terminal OBLIGATION outcomes** — Fulfilled,
Unfulfilled, Closed Without Resolution. The agreement's own resolution is **derived for
presentation and never persisted**, and **no barter reviews or reputation exist in beta**. Each of
those is evidenced in the table below.

This section records **what is built on `main`** and **what is not**.

### What is built

**Read this table's provenance before its rows.** Every row was verified against `main` @ `f5fd197`
by the reconciliation that wrote it, when the chain held 68 migrations. The **2026-09-10** pass at
`e5b9125` (97 migrations) did **not** re-read all of them; it re-read and corrected only the rows
that Correction 3 or Session 8 falsified — the operator-surface row, the Under Review row and the
read-model citations beneath the table — and it says so rather than implying a fresh sweep. **The
line citations in the rows it did not touch date from `f5fd197` and may have moved.** The rows
PR #68 and PR #70 added or changed are marked with their PR.

| Capability | What is actually enforced | Where |
|---|---|---|
| Data model (PR #68) | **ELEVEN barter tables**, not ten. `barter_offers` and `barter_interests` (the post and its responses), Slice 3a's `barter_proposals`, `barter_proposal_versions`, `barter_proposal_terms` and `barter_version_acceptances` (the negotiated terms), PR #50's `barter_agreements` for the finalized trade, PR #54's `barter_obligations` — which PR #56 extended **in place** with a three-column delivery / receipt lifecycle rather than by adding a table — PR #58's `barter_agreement_cancellations`, PR #64's `barter_obligation_no_show_reports`, and **PR #68's `barter_obligation_adjudications`**, which holds the terminal OBLIGATION outcome. **A terminal-obligation-outcome record therefore now EXISTS** — one row per obligation at most, and it is a separate table rather than a fifth `status` value, because a participant lifecycle value and an operator resolution are different kinds of fact. **A terminal AGREEMENT outcome column does NOT exist, and none is coming**: PD-070 makes agreement-level resolution permanently derived, so there is no `completed`, `partially_fulfilled` or `not_completed` column, status or stored verdict on `barter_agreements`. There is still **no Needs Attention and no Under Review column** either — both are derived per read and persist nothing. | Origin: `20260829000000_canonical_live_baseline.sql`; proposal tables in `20260917000000_barter_proposal_versions.sql` §§ 1–4, narrowed by `20260925000000_negotiation_directed_terms.sql` § 1; agreement table in `20260927000000_barter_agreement_finalization.sql`; obligation table in `20261003000000_barter_obligations_foundation.sql`; lifecycle columns in `20261004000000_barter_obligation_delivery.sql`; cancellation table in `20261005000000_barter_pre_delivery_cancellation.sql:35-50`; no-show reports in `20261012000000:64-108`; **adjudications in `20261019000000_barter_obligation_adjudication.sql:62-99`**, and the no-agreement-outcome absence asserted at `:19-21` and § 6 (`:363` onward) |
| Operator-only adjudication (PR #68, PD-064 … PD-067) | An obligation reaches a terminal outcome **exactly one way: a manual decision by an operator**, through `adjudicate_barter_obligation(uuid, text, uuid, text)`. **`EXECUTE` is granted to `service_role` alone** — `public`, `anon` and `authenticated` are revoked, so **there is no participant-facing adjudication RPC in this product**. A participant is refused at **four independent layers**, any one of which would hold on its own: the EXECUTE grant; an in-function privileged-caller check; an in-function *adjudicator-may-not-be-a-participant* check; and the same participant check re-made in the `BEFORE INSERT` trigger, which is the copy that holds against a direct privileged INSERT. Eligibility is **only while Under Review** — a passed deadline, Needs Attention, a delivery, a passed `due_at` and a passed `scheduled_at` are all deliberately insufficient, and a **cancelled** agreement cannot be adjudicated at all. The record is **immutable**: at most one per obligation (`unique (obligation_id)`), no edit, no withdrawal, no flip — re-submitting the **same** outcome is a safe no-op, a **different** one is refused with `PT412`. Adjudication **rewrites no history**: `status`, `delivered_at`, `receipt_responded_at`, the no-show report and its reason all stand as the participants left them, so a receiver's "Didn't receive" and a later `fulfilled` outcome coexist permanently. | `20261019000000` — table and unique constraint `:62-77`, append-only trigger `:105-137`, consistency / participant / eligibility trigger `:139-208`, RLS and grants `:210-241`, the RPC `:260-361`, the `service_role`-only grant `:352-355`; **live RPC and consistency-trigger bodies are `20261023000000_adjudication_hardening.sql`**, live append-only body is `20261026000000_append_only_honest_privileged_predicate.sql`; `supabase/tests/adjudication.test.sql`, registered at `scripts/db-security-test.mjs:54` |
| Three terminal OBLIGATION outcomes (PR #68, PD-065) | Exactly three, and they are **obligation-level**: `fulfilled`, `unfulfilled`, `closed_without_resolution`. The third records that the available information supported **neither** finding — it is **not** a softer *Unfulfilled*, **not** a finding of fault, and carries **no reputation effect**. The two obligations of a trade resolve **independently**: one side may be Fulfilled while the other is still Under Review. **Adjudicating both triggers no roll-up.** A terminal outcome then **dominates the read models and the participant write paths**: a resolved obligation is no longer Action needed, Waiting for confirmation, Needs Attention or Under Review, and `mark_barter_obligation_delivered`, `record_barter_obligation_receipt` and `report_barter_obligation_no_show` all refuse it — with **`PT424`**, its own SQLSTATE, because every neighbouring code would have said something false. **`barter_obligations.status` is unchanged at four values**; a terminal outcome is deliberately not a fifth. | Vocabulary and CHECK at `20261019000000:73-74`; dominance and the participant refusals in `20261020000000_terminal_outcome_precedence.sql`; the `PT424` correction in `20261022000000_obligation_resolved_sqlstate.sql`, which is the live body of all three RPCs; client code constant `lib/barterErrors.ts:169` with the reasoning at `:162-168` |
| What a participant may see of an adjudication (PR #68, PD-067) | **Both participants read the outcome and when it was decided. The operator's rationale is INTERNAL, and which operator decided is likewise not participant-visible.** Enforced by **column-level grants**, not by a policy — an RLS policy decides which *rows* a caller may read and cannot hide a *column*, so a table-wide `select` would have exposed `rationale` through PostgREST. `authenticated` is granted `select (id, obligation_id, agreement_id, outcome, adjudicated_at)` and nothing else, on top of a participant-scoped read policy; non-participants and `anon` read nothing. Neither read model exposes `rationale` or `adjudicator_user_id`. | `20261019000000:210-241` (policy, revoke, column grant, and the reasoning at `:229-238`); read models in `20261020000000` / `20261021000000`, live definition `20261027000000_suppression_computed_once.sql` |
| The operator Review Queue is **LIVE and IN-APP** (PD-068, **SATISFIED**) | Session 8B (`c4afee5`) built the surface: an allow-listed operator can see the queue, filter by type and status, open a case, read the immutable facts behind it, write an internal note, take the supported resolution action, and see a durable history — **without a `psql` session**. `is_operator()` gained a third arm for this, because an operator opening a screen is `authenticated` and neither original arm admitted them; `public.operators` is the allow-list and holds **no client privilege of any kind, including SELECT**, so operators can neither promote anyone nor enumerate each other, and making one is a `service_role` act. Every write still goes through the audited RPCs, and since `20261061000000` the recorded actor must equal `auth.uid()`. **THIS CREATES A STANDING HUMAN OBLIGATION, and it is the thing to carry out of this row:** reports, provider appeals and barter review requests all open REAL cases; **nothing dequeues a case except a person**; there is **no SLA** (PD-068) and **no notification channel** that tells a waiting user anything. A case with no operator stays open indefinitely, by design. The queue is ordered oldest-open-first and that order is **not configurable** — with no SLA, the order is the only fairness guarantee a waiting person has. | `20261049000000` … `20261062000000`; `app/operator/`, `lib/operator.ts`; `supabase/tests/operator_surface.test.sql` |
| Derived agreement presentation (PR #70, PD-070) | The agreement-level picture is **computed for display from the immutable underlying facts and never persisted**. `agreementResolution(obligations)` returns one of four **coarse** states — `none`, `partial`, `allSettled`, `allSettledMixed` — and **no value names an outcome**. It reads obligation **state as well as outcome**, so a trade both sides confirmed received is "settled" even though no operator was ever involved. The two combinations PD-070 rules on directly are honoured by construction: `fulfilled + closed_without_resolution` does **not** become *Partially Fulfilled*, and `closed + closed` does **not** become *Not Completed*, because a single roll-up label would assert a finding that was never made. Where a roll-up would overstate, the product shows the **two obligation truths** instead — Trade Activity carries `my_terminal_outcome` / `their_terminal_outcome`, **two columns, not one**. | `lib/obligationState.ts:714-749` (`agreementResolution`, with the reasoning at `:722-736`) and `:691-712` (the two predicates); the four-value type and the total copy table in `lib/negotiationState.ts:129-137`, `:226-240`; the two per-side columns in `20261021000000_trade_activity_terminal_outcome.sql:1-12`; `lib/tradeActivity.ts:154-169`, `:531-554`; `__tests__/lib/terminalOutcome.test.ts` |
| No dollar valuation in live barter (PR #70, PD-069) | **The estimated-value composer field and the `~$N value` board badge are GONE from the live product.** `barter_offers.offering_value` **survives as DEPRECATED legacy data that no live surface reads**: the column is deliberately **not dropped**, because pre-ruling rows hold a figure a provider actually entered and because `20260917000000` copies it into every immutable proposal-version post snapshot. `enforce_barter_offer_write` **nulls it on INSERT** — silently rather than raising, so an installed mobile build that still sends it keeps posting offers — and makes it **one-directional on UPDATE**: a legacy value may be kept or cleared, never introduced or changed. **`service_role` short-circuits first**, so the rule governs participant paths, not privileged ones. The client cannot render it because the client cannot hold it: `offering_value` is **not selected, not mapped and not typed**. | `20261028000000_deprecate_barter_offering_value.sql:48-92` (the whole rule and why the column stays), comment precision in `20261029000000`; `lib/barter.ts:27-35` (the deliberately absent field) and `:83-87` (the select list); the absent badge at `app/community/index.tsx:944-948`; the absent composer field at `app/community/barter-compose.tsx:61`; pinned by `__tests__/guards/barterValueAbsent.test.ts` |
| Response vocabulary | `pending → accepted \| declined \| released`, with `released_at`, `released_by` and `release_reason` required together and null together. | `20260909000000_barter_interest_release.sql` (status + completeness check constraints) |
| Write identity | `caller_provider_id()` derives the provider from `auth.uid()`; nothing client-supplied enters the comparison. Foreign-field writes are governed by an **allow-list** trigger, `created_at` is server-stamped, delete guards preserve counterparty history (PD-043), and `anon` holds nothing on either table. | `20260906000000_barter_integrity_slice1.sql` §§ 1–7, 10 |
| Interest rate limit | 15 new interests per provider per rolling 24h, counted from `rate_limit_log` so delete-and-resend cannot reset the window (PD-045). | `20260906000000` § 9 (`enforce_barter_interest_rate_limit`) |
| One negotiation per post | At most one `accepted` response per offer, enforced by a partial unique index and by the accept RPC locking the **offer** row (PD-049). | `20260906000000` § 7; `20260907000000_barter_accept_handoff.sql` |
| Accept | **One atomic RPC**, `accept_barter_interest`: it accepts the response, opens or reuses the pair's conversation and posts the handoff message in a single transaction. Body redefined once, to route the composed message through the sanitiser. | `20260907000000`; redefined by `20260915000000_barter_closed_post_terminal.sql` § 3 |
| Conversation identity | One canonical conversation per provider pair, enforced in the database rather than by client convention. | `20260908000000_canonical_provider_pair.sql` |
| Ending a dead negotiation | `release_barter_interest` moves `accepted → released` and **derives the reason from the caller** (`responder_withdrew` / `owner_ended_negotiation`), so neither party can characterise the other's exit. The counterparty is told by a **server-authored** notice, and message authorship is pinned at the write boundary. | `20260909000000`; `20260910000000_barter_release_signal.sql`; `20260911000000_message_authorship_pin.sql` |
| Durable access | The `my_trade_activity` view (`security_invoker`, `select` to `authenticated` only, revoked from `anon`) backs the route `/community/trade-activity`, so an accepted negotiation stays reachable after its post closes or ages out of the newest-50 discovery feed. | `20260912000000_trade_activity.sql`, hardened by `20260913000000` and `20260914000000` |
| Closed post is terminal | `is_active` is **one-way** for authenticated writers (`enforce_barter_offer_active_one_way`, trigger `barter_offers_zy_active_one_way`), and a closed post's pending responses can be **neither accepted nor declined** (`enforce_barter_answer_open_offer`, trigger `barter_interests_zy_answer_open_offer`). Both raise SQLSTATE `55000`; both exempt `service_role` and the null-`auth.uid()` (no-JWT) path. `released` stays permitted, because a negotiation outlives its post. PD-051, PD-052. | `20260915000000` §§ 1–2, bodies refreshed by `20260916000000` |
| Proposal | **One proposal per accepted interest** (`barter_proposals.interest_id` is `unique`), and it may be opened **only** on an interest whose status is `accepted` — pending, declined and released are refused (SQLSTATE `55000`). No cold proposals. The proposal row is the negotiation's durable identity; it has no `status` column of its own — liveness is read from `barter_interests.status`, so `release_barter_interest` remains the one way to end a negotiation (PD-049, PD-053). | `20260917000000` § 1; current `create_barter_proposal` signature is from `20261001000000_proposal_term_timing.sql` |
| Versioned terms | Every proposal or counter is a **new immutable version** (`barter_proposal_versions`, unique `(proposal_id, version_no)`). Versions, terms and acceptances are **append-only by trigger** (`enforce_barter_negotiation_append_only`); the only mutable field on a proposal is `current_version_no`, which may only advance (`enforce_barter_proposal_immutable`). Each version carries a `post_snapshot` of the public post as it stood when authored — historical context, never authority for the terms (PD-047). Terms now include a required `due_at` and optional `scheduled_at` for each directed side. Timing belongs to the immutable proposal version, so changing timing requires a **new version**. Counters are capped at **20 versions per participant, per negotiation, per rolling 24 h** (SQLSTATE `54000`); the cap is not applied to the opening proposal, which is bounded by the one-per-interest constraint instead. | `20260917000000` §§ 2, 5, 7; `20260920000000_negotiation_budget_code.sql`; `20261001000000_proposal_term_timing.sql` |
| Exactly two directed terms | A version holds **exactly two terms, one per fixed side** — `offer_owner` and `responder` — enforced by a unique index on `(version_id, provided_by)` plus a statement-level guard (`enforce_barter_terms_written_once`) that refuses any count other than two, a missing side, or a second write to a version. **Participant identity is server-derived**: the client submits only the two descriptions and timing fields; `write_barter_proposal_terms(uuid, text, timestamptz, timestamptz, text, timestamptz, timestamptz)` derives each side's `provider_id` / `provider_user_id` from the accepted interest, and the guard asserts they match the offer and interest rows. **No value field** — `estimated_value` was dropped. Terms can be written only from inside a negotiation RPC (a transaction-local marker checked by `enforce_barter_terms_write`), and the helper's EXECUTE is revoked from `authenticated`. PD-053, PD-056. | `20260925000000` §§ 1–3; `20260921000000_negotiation_write_boundary.sql`; `20260924000000_negotiation_written_once.sql`; `20261001000000_proposal_term_timing.sql` |
| Timing validity | For both directed terms, `due_at` must be future-valid and `scheduled_at` must be either null or future-valid when the version is authored, when a participant accepts that version, and when the official agreement is finalized. Expired timing raises SQLSTATE `PT410` and does not mutate or extend the historical version; participants must send a new proposal version with updated timing. | Author-time validation in `20261001000000`; acceptance/finalization-time guards in `20261002000000_proposal_timing_expiry_guards.sql`; client stale handling in `lib/barterErrors.ts` and `lib/negotiationState.ts` |
| Version acceptance | `accept_barter_version(uuid)` records **one acceptance per participant per version** (`unique (version_id, participant_user_id)`, so a repeat is idempotent). It refuses a non-participant (`42501`), a dead negotiation (`55000`), a version that is no longer current (`40001`, "these terms have been replaced"), and a current version whose timing has expired (`PT410`). Advancing to a new version does **not** delete earlier acceptances; they stop counting. **Authoring is not acceptance; countering is not acceptance** (PD-053, PD-056). | `20260917000000` §§ 4, 10; `20260919000000_negotiation_stale_terms_code.sql`; current body is `20260921000000`'s per the ledger's redefinition table; expiry trigger in `20261002000000` |
| Both accepted — ready to confirm | `my_barter_proposals.both_accepted` is **derived** in the view from acceptance rows on the *current* version and stored nowhere. It is a readiness fact. `finalize_barter_agreement(uuid)` turns that fact into one immutable `barter_agreements` row, makes the accepted version authoritative, and closes the sourcing post permanently, but only if the accepted version's timing is still future-valid. PD-054, PD-056. | `20260917000000` § 11; `20260927000000_barter_agreement_finalization.sql`; SQLSTATE correction in `20260930000000_confirmed_trade_sqlstate.sql`; expiry trigger in `20261002000000` |
| Obligations foundation | Every official agreement now gets **exactly two directed obligations**, one for each accepted proposal term: `offer_owner` means the offer owner delivers to the responder, and `responder` means the responder delivers to the offer owner. Obligations are derived server-side from the agreement's `accepted_version_id` and the two authoritative proposal terms. The client does **not** supply deliverer, receiver, side, source term, description, `due_at` or `scheduled_at`. `agreed_description`, `due_at` and `scheduled_at` are immutable copies from the accepted version; both agreement participants can read both obligations. The delivery / receipt lifecycle those rows now carry is the next row. **That sentence used to end "cancellation, no-show, adjudication, terminal obligation outcome and terminal agreement outcome remain unbuilt"; the first four have since been built** — cancellation in PR #58, no-show in PR #64, adjudication and the terminal obligation outcome in PR #68, each with its own row in this table. **A terminal AGREEMENT outcome is still absent, and is now permanently so under PD-070.** | `20261003000000_barter_obligations_foundation.sql`; read surface in `lib/negotiation.ts` and `app/community/negotiation/[id].tsx`; B5B assertions in `supabase/tests/agreement.test.sql` |
| Delivery and receiver confirmation | Each obligation carries `status` (`pending` / `delivered` / `received` / `not_received`), `delivered_at` and `receipt_responded_at`, bound to each other by **four CHECK constraints**. The obligation's **deliverer** may mark **that** obligation delivered (`mark_barter_obligation_delivered`); `delivered_at` is **server-stamped, never client-supplied**, immutable once set, and a duplicate mark is a **safe no-op that does not re-stamp it**. Its **receiver** may then answer **exactly once** — `confirm_barter_obligation_received` or `report_barter_obligation_not_received` — both routing through the internal `record_barter_obligation_receipt`, which **no client role may execute**. An answer before delivery is refused (`55000`), the deliverer and non-participants are refused, and neither answer can flip to the other (`PT412`). `received` / `not_received` are **events / receiver statements, explicitly not final adjudicated fulfilment verdicts** (PD-058). | `20261004000000_barter_obligation_delivery.sql` — columns and constraints at lines 31–64, the two receiver wrappers at 365–401, `record_barter_obligation_receipt` and its revoke at 283–363 |
| Obligation immutability, narrowed | `enforce_barter_obligations_immutable` was redefined from a blanket refusal into a **transition-aware, deny-by-default** guard: the whole row **minus** the three lifecycle keys must be identical, a write needs a transaction-local marker carrying that obligation's own id, and only `pending → delivered` and `delivered → received \| not_received` are legal. Both stamps are write-once. `DELETE` stays absolute (PD-043). A new **BEFORE INSERT** trigger, `enforce_barter_obligation_starts_pending`, keeps every obligation entering the lifecycle at `pending` — with **no `service_role` bypass**, so a backfill cannot invent a delivery either. **The guard's live body is no longer this file:** PR #62 replaced it again (next-but-one row, and the ledger's redefinition table). | `20261004000000` lines 87–160 (the guard as first narrowed, and its trigger), 168–192 (starts-pending trigger); **current definition `20261011000000_barter_receiver_window_needs_attention.sql:252-321`** |
| Pre-delivery cancellation | **The ordinary exit from an official agreement now exists.** Either participant may cancel while **no obligation has been delivered**; the counterparty's permission is not required. One RPC, `cancel_barter_agreement(uuid, text)`, is the only writer — `authenticated` holds no `INSERT`/`UPDATE`/`DELETE` on the table and there is no write policy. The **first valid act immediately stops ordinary performance**: `mark_barter_obligation_delivered` and `record_barter_obligation_receipt` both re-check for a cancellation **after** taking the obligation row lock and refuse with SQLSTATE `PT409`. Once **any** obligation has been delivered, cancellation is refused permanently (`object_not_in_prerequisite_state`) — and because the check reads `delivered_at`, a later "didn't receive" does **not** bring the exit back. **Idempotent per participant**: a repeat call returns the existing classification and re-stamps neither the time nor the reason. | `20261005000000_barter_pre_delivery_cancellation.sql:189-289` (RPC, lock order and grants), `:291-356` and `:358-435` (the two post-lock guards); refusal copy in `lib/barterErrors.ts:539-566` |
| Cancellation is two acts, never an inference | One row per participant per agreement (`unique (agreement_id, actor_user_id)`), and the classification is **derived from the row count and stored nowhere**: one act is `cancelled_by_participant`, two is `mutually_cancelled`. **"Mutually Cancelled" therefore requires two explicit participant acts** — it is never produced by silence, a timeout or inactivity, neither of which exists in the schema at all. The actor is bound to `auth.uid()` by trigger, so a privileged insert cannot fabricate the counterparty's assent, and `created_at` is server-stamped on every insert path rather than merely defaulted. | `20261005000000:35-47`, `:263-284`; actor-is-caller and server-stamp corrections in `20261006000000_barter_cancellation_hardening.sql:34-104`; client classification in `lib/tradeCancellation.ts:43-55` |
| Append-only; nothing is deleted | A cancellation cannot be edited or withdrawn (`enforce_barter_cancellation_append_only`, `before update or delete`), and the cancellation **destroys nothing**: the agreement, both obligations, every proposal version, its terms and the acceptances all survive unchanged and stay readable by both participants. PD-043 is untouched. | `20261005000000:78-105`, header `:31-33` |
| The optional reason is shared | Free text, **1–200 characters**, optional, immutable, and safe to repeat (a second call overwrites neither it nor the timestamp). It is **shared with the other provider** and surfaced to both in trade details as two per-viewer columns, `my_cancel_reason` / `their_cancel_reason`. It is **context, not a verdict** — not a reliability judgment, a no-show determination, an adjudication or proof of fault. **Reliability judgment and proof of fault still do not exist; a no-show determination and an adjudication now do** (PR #64, PR #68), and a cancellation reason is neither of them: it is a provider's own words, and nothing reads it as a finding. It is deliberately **absent from the conversation notice**. The composer discloses the sharing **above** the input, before the writer commits. | `20261005000000:45-46` (bound), `20261007000000_barter_cancellation_signal.sql:159-237` (view columns and the column comment); client attribution in `lib/tradeCancellation.ts:295-311`, disclosure copy at `:246-258` |
| Cancellation notices in the pair thread | Cancelling writes a **durable, best-effort system message** (`sender_id is null`) into the pair's **existing canonical provider-pair conversation**, addressed to the participant who did **not** act. **These are not push, device or email notifications** — PD-059 is unchanged. First act: `The trade for "X" for "Y" was cancelled by one provider.` Second act, deliberately neutral: `Both providers cancelled the trade for "X" for "Y".` — because two acts prove each provider cancelled, **not** that either assented to the other's decision. **Exactly one notice per transition** (the idempotent branch returns before the insert), **no conversation is ever created**, and a notice failure **cannot veto the cancellation**: the insert is wrapped in its own `exception when others then null` handler. | `20261009000000_pair_conversation_notice.sql:35-111` (the one writer, revoked from every client role) and `:113-222`; live copy in `20261010000000_cancellation_notice_neutral_copy.sql:121-133`, rationale `:11-23`; the `"X" for "Y"` label is `barter_terms_label` (`20260914000000_trade_activity_corrections.sql:148-157`) |
| Cancelled trades stay visible | A cancelled trade remains in Trade Activity under the broader **"Trades"** grouping — **renamed from "Confirmed trades"**, because the group now holds a mixed set and a heading is read before the rows beneath it. The per-row note carries the state instead (`Trade cancelled…`), and the row offers **no** cancellation control: the act is taken on the negotiation screen, the one place that can check the delivery precondition. | `lib/tradeActivity.ts:192-226` (section copy and the rename rationale), `:286-299` (the per-row note, total over the cancellation vocabulary), `:488-523` (the confirmed row's action, badge and deadline); row facts assembled in `app/community/trade-activity.tsx:242-246` |
| What cancellation does **not** mean | Cancellation is an **agreement-level** event. It decides nothing about whether either obligation was fulfilled, writes **no** obligation outcome, and implies **no** no-show, unfulfilled finding, dispute, adjudication or reliability verdict. **A dispute process and a reliability verdict still do not exist; a no-show report and an adjudication now do, and a cancellation produces neither** — indeed the ordering runs the other way, since a recorded no-show **removes** the cancellation exit (PD-063) and a cancelled agreement **cannot be adjudicated at all**. B5B asserts the surviving **absences** by pattern sweep rather than assuming them, exempting the ruled objects by name so a sixth fails the suite. | `20261005000000:25-29`; absence assertions in `supabase/tests/cancellation.test.sql:697-727` — the column list at `:702-703` (still no `outcome`, `under_review_at` or `adjudicated_at` column on `barter_obligations`) and the function sweep at `:713-725`, which now exempts the three adjudication objects by name; client rule in `lib/tradeCancellation.ts:1-13` |
| No-show reporting (PD-062) | Only an obligation's **receiver** may report that a **scheduled** service did not happen, and only **at or after `scheduled_at`**. **Server time is authoritative**: the RPC has no `p_as_of` parameter and compares `now()` — the transaction clock — to `scheduled_at`, so no client-supplied time reaches the comparison. `scheduled_at is null` means there is no appointment to miss and the report is refused. The report is **immutable participant-reported history**: append-only by trigger, at most one per obligation, `created_at` **stamped by the trigger on every insert path** rather than merely defaulted, and a repeat call **returns the original timestamp** without re-stamping or merging a second reason. `authenticated` holds no `INSERT`/`UPDATE`/`DELETE` and there is no write policy — the one `SECURITY DEFINER` RPC is the only writer. Delivery neither blocks a report nor is erased by one. | `20261012000000_barter_no_show_under_review.sql:64-108` (table, one-per-obligation, reason bound), `:110-139` (append-only), `:141-214` (the consistency trigger, superseded by `20261018000000:34-89` which adds the server stamp), `:237-240` (no write grant); **live RPC body `20261014000000_no_show_lock_order.sql:56-176`**, server-time comparison at `:129`; `supabase/tests/no_show_under_review.test.sql` |
| Under Review — derived, and not a finding of fault | **Under Review is derived per read, not stored**: `barter_obligation_under_review(status, a report exists, cancelled)` is `(report exists) OR (status = 'not_received')`, minus cancelled — and **Correction 3 added a THIRD route, in the view rather than in that function**: a deliverer's review request (PD-072), so the rule as READ is `(report) OR (not_received) OR (review requested)`, minus suppressed (`20261039000000_barter_review_request.sql:337-338`, with the reasoning at `:299-316`). **No status value, no column and nothing on a timer** — the four-value `status` vocabulary is unchanged. Session 8 added an `operator_cases` row that a review request OPENS (PD-085); that is a queue entry, **not** the state — Under Review is still computed per read and stored nowhere. It means **a human must look**, never that anyone is at fault. It is **not itself** Fulfilled, Unfulfilled or Closed Without Resolution — those three now exist (PR #68) and are what Under Review is the **entry condition for**, not a synonym of; *Completed* still does not exist at any level. **Under Review is also the ONLY eligibility route to adjudication**, and a terminal outcome then **ends** it. **A no-show does not produce Needs Attention** either — that is a separate route, and PD-062 states the absence directly. Until an outcome exists the receiver's controls stay live beneath it. Exposed as `under_review` / `no_show_reported_at` / `no_show_reason` / `can_report_no_show` on `my_barter_obligations`, and role-relative plus an `agreement_under_review` **display roll-up** on `my_trade_activity`. | `20261012000000:242-287` (the rule); **the live definition of `public.my_barter_obligations` is now `20261039000000_barter_review_request.sql:317-362`, NOT the `20261027000000_suppression_computed_once.sql` that [MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md)'s redefinition table still names — verified by sweeping every `create … view public.my_barter_obligations` in `supabase/migrations/`; `public.my_trade_activity`'s live definition IS still `20261027000000:270`**; `20261013000000:34-76` (`barter_can_report_no_show`, the one place the offer rule is written); client copy in `lib/obligationState.ts:370` (`obligationView`), `:638` (`UNDER_REVIEW_LABEL`) and `:818` (`UNDER_REVIEW_NOTE`), list copy in `lib/tradeActivity.ts:426-439`, `:477-479`, `:622` |
| Under Review outranks the ordinary exit (PD-063) | Once **any** no-show report exists on the agreement, `cancel_barter_agreement` refuses with the **new SQLSTATE `PT423`**, and `enforce_barter_cancellation_consistent` carries the same rule as defence in depth; the client stops drawing the control. In the other direction, a cancellation that commits first refuses a later report with **`PT409`**. A race resolves to **exactly one** state because **both writers take the `barter_agreements` row lock first** — `20261014000000` moved the no-show RPC onto that order after a real `40P01` deadlock was reproduced. Refusing cancellation removes one exit and **decides nothing**. | `20261015000000_under_review_precedes_cancellation.sql` (the RPC, and the live body of `cancel_barter_agreement`); `20261017000000_restore_cancellation_actor_binding.sql` (the live body of the trigger); `PT409` refusal at `20261014000000:116-120`; `PT423` constant `lib/barterErrors.ts:160`; **client gate `lib/tradeCancellation.ts:143-201` — since PR #66 it reads the REPORT itself (`noShowReported`, `:157-177`, applied at `:193` and `:200`), which is the same predicate `PT423` evaluates, rather than the server's broader `under_review`**; the screen derives it at `app/community/negotiation/[id].tsx:232-247`; race in `scripts/negotiation-concurrency.mjs` |
| The no-show reason is shared context | Optional free text, **1–200 characters**, no taxonomy, immutable, and **not merged on a repeat call**. It is **visible to both participants** — the reports table's participant-read policy admits the deliverer as well as the reporter, and `my_barter_obligations.no_show_reason` is the route to it through `security_invoker`, so no policy was widened. The UI attributes it as the **reporting participant's statement**, never a platform finding, and the sharing is disclosed **above** the input before the writer commits (the PD-060 precedent). It is deliberately **absent from `my_trade_activity`**: a list row is the wrong place for someone's account of what happened. | `20261012000000:75-79`, `:216-240` (policy); `20261016000000:1-25` (the ruling and why no policy changed), `:70-91`; `lib/obligationState.ts:511` (`NO_SHOW_REASON_NOTE`) and `:568` (`noShowStatement`); since PR #66 the disclosure is rendered above the input by the shared `components/ReasonComposer.tsx`, mounted for the no-show reason on `app/community/negotiation/[id].tsx` |

**The RLS policies on `barter_offers` and `barter_interests` were the Slice 1 set until Session 8,
and the two INSERT policies have now moved.** The policy names are unchanged —
`barter_offers_provider_read` and `barter_interests_offer_owner_read` on reads;
`barter_offers_provider_insert`, `barter_offers_owner_update`, `barter_offers_owner_delete`,
`barter_interests_provider_insert`, `barter_interests_owner_update`,
`barter_interests_own_delete` on writes — but **`20261048000000_barter_eligibility_and_blocks.sql`
dropped and recreated both `*_provider_insert` policies** so that creating a new offer or a new
interest requires `caller_eligible_provider_id()`, the approved-only twin of `caller_provider_id()`
(`:45-61`, `:85-91`, `:97-112`). **`20261055000000_block_oracle_and_submit_gate.sql` then recreated
`barter_interests_provider_insert` a second time** (`:101-107`), removing the block term from the
policy because a policy is evaluated as the CALLER and therefore forced a client-executable
`contact_blocked` — which was itself the oracle PD-082 forbids. The block check now lives in the
`SECURITY DEFINER` trigger `barter_interests_zw_not_blocked`
(`20261055000000:109`; ordering corrected by `20261056000000:28-30`). **`barter_offers` deliberately
carries no block term at all** — an offer is addressed to the board, not to a person
(`20261048000000:79-84`). Everything else about this surface is still a trigger or an RPC rather
than a policy, which is why a policy-level reading of it remains incomplete on its own. The **four Slice 3a tables**
carry **participant-read policies only** (`*_participant_read`, `select` to `authenticated`) and
**no write policy at all**; at the grant layer `authenticated` holds `SELECT` and nothing else,
so every write goes through one of the three `SECURITY DEFINER` RPCs
(`20260917000000` § 6, with the `authenticated` revoke completed by
`20260918000000_negotiation_grant_tighten.sql`). `barter_obligations` follows the same
participant-read / no-write-policy posture, with ordinary creation handled by the
agreement insert trigger rather than by a client-executable RPC (`20261003000000`).
**PR #56 did not change that posture:** it added no write policy, `authenticated` still holds
no `INSERT`, `UPDATE` or `DELETE` on the table, and the two participant actions are
`SECURITY DEFINER` RPCs running as `postgres`
(`20261004000000_barter_obligation_delivery.sql:403-405`, grants at lines 269–271 and 380–401).
**PR #58's `barter_agreement_cancellations` was built to the same posture**: a
participant-read policy only, `revoke all … from public, anon, authenticated` followed by
`grant select` alone, and no write policy — so the single `SECURITY DEFINER` RPC is the only
writer (`20261005000000_barter_pre_delivery_cancellation.sql:538-560`).

**Client surfaces.** `lib/barter.ts` is the data layer; `lib/tradeActivity.ts` holds the
per-row capability and copy rules (`tradeRowState`) that **both** barter surfaces consume,
`lib/tradeCancellation.ts` holds the pure cancellation state, copy and reason rules
(`cancellationState`, `cancellationView`, `cancellationReasons`) with no I/O, and
`lib/barterErrors.ts` interprets the server's refusals. Since PR #66 there is also **one shared
presentational component**, `components/ReasonComposer.tsx` — disclosure above the input, input,
submit — used by **both** free-text reason blocks on the negotiation screen. It owns the SHAPE
only: it validates nothing, shapes no payload and decides no visibility, so a cancellation reason
and a no-show reason stay different products with different copy, bounds and readership supplied by
the caller (`components/ReasonComposer.tsx:3-38`). Screens: `app/community/index.tsx`
(feed), `barter-compose.tsx`, `barter-interests.tsx` (an offer's responses) and
`trade-activity.tsx`. Interest counts are shown to the **offer owner only**
(`app/community/index.tsx`, the `isOwner` branch), which is what
[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 10 requires.

For the negotiation itself: `lib/negotiation.ts` is the data layer (reads come from
`my_barter_proposals`, the proposal tables and, after agreement finalization, the **view**
`my_barter_obligations` rather than the `barter_obligations` table — `lib/negotiation.ts:341-346`,
so the PD-057 window, the derived Under Review state, `can_report_no_show`, the reason and — since
PR #68 — `terminal_outcome` and `adjudicated_at` all arrive already decided server-side and none is
recomputed here (`:351`, mapped at `:401-402`); every write
is one of the three negotiation RPCs (`:415`, `:433`, `:452`), the finalization RPC (`:474`),
**one of the four obligation RPCs** — `markObligationDelivered` (`:491`),
`confirmObligationReceived` (`:505`), `reportObligationNotReceived` (`:523`), each sending the
obligation id and nothing else, and `reportObligationNoShow` (`:548`), sending the
obligation id and an optional reason — or the cancellation RPC, `cancelTrade` (`:573`), which
sends the agreement id and an optional reason and cannot name the actor, the time or the outcome.
**There is deliberately no fifth obligation RPC and no adjudication seam here**: the operator path
is `service_role`-only and is not reachable from this module).
`lib/negotiationState.ts` holds the pure state and copy rules (`negotiationView`,
`validateDraft`, `draftPayload`) and, since PR #70, the four-value `AgreementResolution` type and
the total confirmed-trade copy table keyed on it (`:129-137`, `:226-240`). `lib/obligationState.ts`
holds the per-obligation role, state
and copy rules (`obligationRole`, `obligationView` at `:370`, `obligationTimeline` at `:854`, plus
`anyDelivered` at `:892` — the PD-046 precondition, kept out of JSX so it can be tested) with no
I/O, and **since PR #70 also owns the DERIVATION of the agreement-level fact**,
`agreementResolution` (`:741-749`). It owns the client half of the PD-057 receiver window and of
PD-062's Under Review (`ReceiverWindowState` at `:69`; the total role × window copy table at
`:270-309`; `NEEDS_ATTENTION_LABEL` at `:234` and `ACTION_NEEDED_LABEL` at `:245`, the latter
**moved here from `lib/tradeActivity.ts`**, which now re-exports it (`lib/tradeActivity.ts:362`),
so one label reads identically on the list and
on the trade's own screen; `UNDER_REVIEW_LABEL` at `:638` and the per-role `UNDER_REVIEW_NOTE` at
`:818`, both of which **outrank** the window labels while cancellation outranks all of them, and
since PR #68 a **terminal outcome outranks every one of them** — `:446` is where the review label
is chosen, and the outcome-aware copy is `terminalOutcomeNote` (`:779`) and `terminalOutcomeLabel`
(`:789`)) — the SERVER decides the state and this module only words it.
**Since PR #66 it also owns the one label → tone mapping**, `ATTENTION_TONE` / `attentionTone`
(`:674`, `:804`), keyed by an `AttentionLabel` union of the three exported label constants (`:669-672`)
so a fourth attention state is a **compile error** rather than a silent fallthrough; both
`ObligationView.attention` (`:126`) and `TradeRowState.attention` (`lib/tradeActivity.ts:169`) are
typed to that union. **The terminal-outcome chip is deliberately NOT in that union and has its own
tone**, because it is neither live nor elapsed nor under review — nothing is waiting on anyone
(`app/community/negotiation/[id].tsx:632-638`). It names the **meaning**, not the colour: each
screen keeps its own palette and maps a tone to its own `StyleSheet`, so no `lib/` module imports
React Native styles. Also since PR #66,
`obligationView` takes **one `ObligationViewFacts` object** rather than seven positional arguments
(`:326`, consumed at `:370`); no positional call site remains, and its two same-typed
booleans are `obligationUnderReview` (per obligation) and `canReportNoShow`, which cannot be
transposed without writing different keys.
**Both outcome-aware copy paths fall back rather than throw** on an outcome the build does not
recognise, and the reason is recorded in the code rather than assumed: the app ships on its own
cadence while the database migrates on another, so an unguarded lookup would crash a render
(`lib/obligationState.ts:763-778`, `lib/tradeActivity.ts:434-439`).

`lib/negotiationWrite.ts` owns the write-operation sequence every one of those writes shares —
busy on, write, busy off in a `finally`, interpret the refusal via `lib/barterErrors.ts`, say it
once, decide whether the screen is stale, re-read authoritative state — with the per-operation
differences declared as options at the call site rather than hand-spelled six times, and the
screen is `app/community/negotiation/[id].tsx`,
keyed on the **interest** id and reached from an active row in Trade Activity
(`app/community/trade-activity.tsx`, the `/community/negotiation/` push). The viewer's side is
server-derived — `my_role` on `my_barter_proposals`, or on `my_trade_activity` before any terms
exist; the route's `role` param is a last-resort label only.

**The confirmed-trade detail** on that screen shows **both** obligations with **Mark
delivered**, **Confirm received** and **Didn't receive** and their timestamps, each control
gated by the server-derived role and status; since PR #62 an attention chip and a
response deadline above them; since PR #64 a **separate** no-show block — disclosure, optional
reason input, **Report no-show** — offered only when the server's `can_report_no_show` says so, and
the reporter's own words rendered beneath; and **since PR #68 a terminal-outcome chip above the
attention chip, drawn only when the obligation has been resolved**, so a card never shows a
conclusion beside a pending request (`app/community/negotiation/[id].tsx:632-638`, in the whole
`renderObligation`; both obligations are rendered at `:864-865`). The obligation timeline is also
given `adjudicatedAt` since PR #68 (`:653-657`). Since PR #66 the no-show block is
the shared `ReasonComposer` rather than hand-authored JSX. **`noShowReportedAt` is
still not RENDERED, but it is not merely retained**: since PR #66 the screen READS it to decide
whether the ordinary exit is drawn, feeding `cancellationView`'s `noShowReported`. The **Founder
ruling supplied with an earlier reconciliation** still holds and is quoted
as given: *"`noShowReportedAt` is RETAINED for future review/adjudication history and is
deliberately NOT currently rendered … it must not be documented as dead code or as a defect."* It
is recorded here so a later reader does not delete it as unused.

**The AGREEMENT still reads "Trade confirmed" for the whole life of the trade, and still has no
terminal outcome** (`lib/negotiationState.ts:275-291`). **What changed in PR #70 is the SENTENCE
beneath that headline, not the headline.** The detail is now chosen by `CONFIRMED_DETAIL`, a table
total over the four `AgreementResolution` values (`:226-245`), so a trade whose obligations are all
settled no longer tells two providers to *"arrange the details in your conversation"* over
something an operator has already concluded — and, equally, `partial` no longer promises
outstanding work that is not there. **No line in that table names an outcome**: `allSettled` and
`allSettledMixed` differ only in whether anything adverse was found, and what it was belongs to the
obligation card, stated once. On a cancelled trade the page headline becomes "Trade
cancelled", the terms card is retitled "The terms that were agreed" (`:263-274`), both obligation
controls are frozen and their what-happens-next notes are dropped, and the cancellation is said
**once**, above both obligations (`app/community/negotiation/[id].tsx:846-860`).
`lib/barterErrors.ts` interprets the
refusals PR #56, PR #58, PR #64 and PR #68 introduced, including `PT412` for an answer already recorded
(constant at `:154`), `PT409` read as
"this trade was cancelled" for the obligation operations, **`PT423` for a trade
already under review** (`:160`), and **`PT424` for an obligation an operator has already resolved**
(`:169`) — whose comment records that reusing `PT412` was not hypothetical: *"it shipped that way
for one migration and told a receiver who had answered nothing that their answer 'was recorded and
cannot be changed'"* (`:162-168`).

**The receiver-response window and Needs Attention now exist** (PD-057, PD-059), as DERIVED read
state. `public.barter_confirmation_anchor` returns
`max(delivered_at, coalesce(scheduled_at, due_at))` and NULL before delivery;
`public.barter_confirmation_deadline` is that plus 7 days and is the only place the interval is
written; `public.barter_receiver_window` returns `none | awaiting_receiver | needs_attention` and
begins attention at `server_now >= deadline`, **inclusive**. `public.my_barter_obligations`
(security_invoker, scoped by the existing participant policy) exposes the anchor, the deadline,
the state and `server_now`; `my_trade_activity` gained role-relative `my_response_state` /
`their_response_state`. **No column, trigger, background job or scheduler was added** — nothing
flips a row at a deadline, so there is no persisted transition to disagree with the timestamps.
An elapsed window leaves the row `delivered`: the four-value `status` vocabulary is unchanged and
**Needs Attention is not a status value**, not an outcome, and not Fulfilled, Unfulfilled,
Completed, Under Review, Disputed, a no-show or an adjudication. **The receiver may still answer
after the deadline** — no RPC consults it, asserted over `prosrc` — and an explicit answer clears
the condition however long ago the window closed (PD-058). Cancelled trades never enter the flow.
**Agreement-level and obligation-level attention are different SCOPES** (Founder ruling
2026-09-07). Trade Activity's row badge is the agreement-level headline and may read
"Needs attention" because the counterparty's window elapsed (`lib/tradeActivity.ts:472-497`,
`windowAttention`); that never suppresses this viewer's own live obligation. On the list, the viewer's own
deadline is keyed off **their own** window state rather than off the badge (`:499-506`,
`rowDeadline`) and the
mixed case states both facts (`:442-470`, the total mine × theirs note matrix). On the trade detail the viewer's own unanswered
obligation keeps its **Action needed** label, its **deadline**, and both **Confirm received** /
**Didn't receive** controls (`lib/obligationState.ts:270-309`, rendered at
`app/community/negotiation/[id].tsx:689-720`). `obligationView` is
per-obligation and is never passed the counterparty's state, so the isolation is structural
rather than a rule that could be forgotten. **PR #64 extended the same ruling to Under Review**,
which is the stronger headline and therefore needs it more: the mixed case keeps both the
viewer's instruction and their deadline, and the deadline is suppressed only when the viewer's
**own** obligation is the one under review (`lib/tradeActivity.ts:507-570`, `confirmedTradeNote`,
which is also where PR #68's two per-side outcomes are worded — `:531-554`). The **feed card and offer-responses screen are
deliberately deferred**: `responderFeedState` (`lib/tradeActivity.ts:824` onward) calls
`tradeRowState` without either window fact, so they show "Trade confirmed. The agreed terms can no
longer change.", which stays true — nothing there became false. **That deferral was recorded for
Session 7 closeout and is NOT discharged**; it now belongs to the whole-app audit round 2 and
Session 8, per [ROADMAP.md](ROADMAP.md) § Next.

The same migration also **froze the obligation's contract fields against every writer, including
`service_role`** (Founder ruling 2026-09-06): agreement, participants, source term, description,
`due_at` and `scheduled_at` can no longer be rewritten after the agreement exists, because they
are now the read-scoping keys and the deadline anchor. Privileged DELETE is deliberately still
permitted, so account-erasure cascades still work. **The same principle is now ruled to extend to
core `barter_agreements` identity** (Founder, 2026-09-07), but is **not yet enforced there**:
`enforce_barter_agreement_immutable` refuses ordinary callers absolutely while giving
`service_role` and the no-JWT path an unconditional early return. That is a recorded bounded
follow-up with live-catalog evidence in
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md), not work done in PR #62.
(`supabase/migrations/20261011000000_barter_receiver_window_needs_attention.sql`,
`lib/obligationState.ts`, `lib/tradeActivity.ts`.)

**Nothing sends the receiver a push, device or email notification.** PD-059's push half is
unchanged: no such path exists anywhere in the chain. What PR #58 added is narrower and only for
cancellation — a durable in-thread system message, written best-effort into the pair's existing
conversation (`20261009000000_pair_conversation_notice.sql`). **A delivery still PUSHES nothing**:
`20261004000000_barter_obligation_delivery.sql` creates no notification path and this slice added
none, so nothing reaches a provider who does not open the app. What changed is where a delivery is
VISIBLE once they do: it is no longer only the negotiation screen
(`app/community/negotiation/[id].tsx:171-177` loads it, `:179-183` refreshes it on focus) —
`lib/tradeActivity.ts` now
reads the two role-relative response states, so an unanswered delivery surfaces on Trade Activity
as **Action needed** or **Needs attention** (above). The Trade Activity attention UX that PD-059
required before beta **is now built**; the **push** half of PD-059 remains a known, scheduled gap
rather than an oversight.

**PR #64 added no notification either, and its in-thread notice is DEFERRED. Neither did PR #68 or
PR #70, and the deferral now covers adjudication too.** A no-show report and a terminal outcome
both write **nothing** into the pair's conversation: `public.pair_conversation_notice` is called
only from `20261009000000`, `20261010000000` and `20261015000000` — every one of them a
cancellation path — verified by search across all **97** migrations at `e5b9125`, so the deferral
still holds and now covers a review request too. The deliverer learns of a report
by opening the trade, where `UNDER_REVIEW_NOTE` tells them the other provider reported a problem
and that nothing has been decided (`lib/obligationState.ts:818`). That is a **Founder ruling
supplied with the reconciliation that followed PR #64**: a no-show conversation / in-thread notice
is deferred, to be decided with the later adjudication / review workflow. It is an absence by
decision, not an oversight. **A resolved obligation is likewise announced only where the
participants can already see it** — the outcome chip and note on the trade card, and the two
per-side columns on Trade Activity.

**PR #66 changed how this client code is SHAPED and nothing about what it does.** It added no
migration (57 before and after), no database object, no write path, no lifecycle state and no
product behaviour; the whole of its diff is in `lib/`, `components/`, `app/community/` and
`__tests__/`. What it did change is itemised in
[ROADMAP.md](ROADMAP.md) § Completed: shaped inputs for `obligationView` and `cancellationView`, one
label → tone mapping, one shared reason composer, and the split of the two things previously both
called `underReview`. The last of those is the only one with a semantic consequence, and it is a
narrowing rather than a change of outcome: the client's cancellation gate evaluates the **same
predicate as `PT423`** (a no-show report exists) instead of the server's broader `under_review`
(`report OR not_received`). The two agreed before only because `not_received` implies
`delivered_at is not null`, so `anyDelivered` had already closed the exit — a coincidence between
two guards two migrations apart, now replaced by the direct predicate and pinned by a test
(`lib/tradeCancellation.ts`, `__tests__/lib/obligationViewShape.test.ts`). **PD-062 and PD-063 are
unchanged by it**, and so is every server rule above.

**What PR #68 and PR #70 changed on the client, stated as narrowly as PR #66's entry is.** PR #68
added **no** new client write: it added two read fields (`terminalOutcome`, `adjudicatedAt`), the
copy that words them, and the rule that an outcome outranks every attention label. PR #70 added
**no** server write path either — its three migrations are a read-model refactor, the PD-069
deprecation and a comment fix — and its client half is the derived agreement sentence plus the
**removal** of the estimated-value input and the `~$N` badge. **Neither PR added a seventh
negotiation-screen write handler**, so the outstanding `busy`-guard obligation recorded in
[ROADMAP.md](ROADMAP.md) § Standing constraints is neither tripped nor discharged.

Regression coverage: `supabase/tests/barter.test.sql`, `supabase/tests/negotiation.test.sql`,
`supabase/tests/agreement.test.sql`, `supabase/tests/obligation.test.sql`,
`supabase/tests/cancellation.test.sql`, `supabase/tests/receiver_window.test.sql`,
`supabase/tests/no_show_under_review.test.sql` and — since PR #68 —
**`supabase/tests/adjudication.test.sql`**, all
registered in the B5B runner at `scripts/db-security-test.mjs` (lines 45–54), plus
`__tests__/lib/terminalOutcome.test.ts` and `__tests__/guards/barterValueAbsent.test.ts`, the
latter pinning the PD-069 removal as an ABSENCE — that `offering_value` is not referenced, not
selected and not typed — because a removal no test guards is a removal that comes back, plus
`__tests__/lib/tradeActivity.test.ts`, `__tests__/lib/negotiationState.test.ts`,
`__tests__/lib/obligationState.test.ts` and `__tests__/lib/tradeCancellation.test.ts` for the
pure client rules, `__tests__/lib/negotiationWrite.test.ts` for the shared write sequence,
`__tests__/lib/receiverWindow.test.ts` for the PD-057 window's client half (that it consumes the
server's state rather than deriving one, with a word-boundary vocabulary sweep over the whole
role x status x window x cancelled matrix), `__tests__/lib/underReview.test.ts` for PD-062's
client half (that Under Review outranks the window labels while cancellation outranks it, that the
no-show control is offered only to a receiver the SERVER has cleared, and that the reason is
attributed as a statement), **`__tests__/lib/obligationViewShape.test.ts` for PR #66's structural
invariants** — the full 192-combination `obligationView` matrix, the label → tone mapping over every
label BOTH view models can emit, and the two `cancellationView` gates asserted independently — and
**`__tests__/components/ReasonComposer.test.tsx`**, which asserts the PD-060/PD-062 rule that the
disclosure is rendered BEFORE the input by comparing their positions in the serialised tree, rather
than leaving it to two hand-authored copies and a reviewer's eye. That shape file deliberately pins
**no copy**; the evidence that no wording moved is that `obligationState.test.ts`,
`receiverWindow.test.ts` and `underReview.test.ts` — which do pin exact strings — were converted to
the new call shape and still assert the same strings
(`__tests__/lib/obligationViewShape.test.ts:1-12`). And
`__tests__/app/negotiationWriteHandlers.test.tsx` — the first suite here that RENDERS a screen —
which drives the negotiation write controls and pins, per control, the RPC called, the exact
payload, the refusal copy, whether the screen re-reads and whether that re-read blocks. Those
tests distinguish
ready-to-confirm from confirmed, and pin that confirmed trade copy does not promise booking,
completion, fulfilment, delivery or a guarantee. B5B pins the derived obligation pair,
participant read, direct-write refusal, immutable content/timing and no-write grant posture,
and now also who may mark delivered, who may answer, the one-answer rule, the CHECK constraints
where no trigger stands in front of them, and the starts-pending insert guard.
`supabase/tests/cancellation.test.sql` pins the cancellation invariants and the posture of every
object PR #58 created or redefined, and asserts the continuing **absence** of any no-show,
timeout, review or terminal-outcome **column** (`:697-706`). **Its function-absence assertion was
corrected in PR #64 and is worth reading rather than paraphrasing** (`:707-722`): it was a
**name** list naming `report_barter_no_show`, a spelling that never existed, so it passed
vacuously and would not have noticed the real `report_barter_obligation_no_show`. It is now a
**pattern sweep** over `no_show|adjudicat|under_review|complete_barter|expire_barter|escalate_
barter|resolve_barter|fulfil|reputation` with the **five** ruled objects exempted by name — so a
sixth fails the suite. `supabase/tests/receiver_window.test.sql` pins the three anchor
cases (§ 1), the exact 7-day interval (§ 2), the inclusive boundary before / at / after (§ 3),
what is **not** an attention state (§ 4), that an explicit answer settles it at every instant
(§ 5), that "didn't receive" still works after the deadline (§ 7), that cancelled trades never
enter the flow (§ 8), the role-relative Trade Activity columns (§ 9), participant scoping and the
`anon` revoke (§ 11), that the view is not a write path (§ 12), zero residue — nothing this slice
must not have created (§ 14), the `service_role` freeze matrix including that privileged DELETE
still works (§ 14b), the invariant that the obligation and cancellation read scopes cannot
diverge (§ 14c), and that the receiver RPCs were not touched (§ 15).
`supabase/tests/no_show_under_review.test.sql` pins authority, timing and eligibility, that a
report cannot be filed before the scheduled time, that a de-approved participant keeps authority on
an existing agreement, that `not_received` qualifies for Under Review on its own, that an
explicitly `received` obligation cannot be reported, that delivery neither blocks a report nor is
erased by one, that a cancelled agreement never enters Under Review, that **both** participants
read the review state and nobody else does, the object posture, the eligibility column asserted
positive and asserted to flip, **both directions of the PD-063 precedence**, that the reason is
participant-visible context, that a no-show creates **no** Needs Attention and **no** terminal
outcome, that the reports table is in no realtime publication, that the report time is
**trigger**-stamped rather than merely defaulted, and that the lock order is pinned
**structurally** rather than only behaviourally. Races a single-transaction
harness cannot stage are covered by `scripts/negotiation-concurrency.mjs`, a non-B5B script, which
now carries cancellation cases and the no-show / cancellation race. Executions **are** recorded for
each slice, in
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) rather than here — see
§ Foundation & security above for what is and is not established about test runs. **This document
runs nothing**; it cites those records.

### What is not built

**[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 12 is the authoritative gap list** and is
not copied here.

> **UNRESOLVED CONTRADICTION — flagged, not fixed.** That gap list has **not been updated since
> Session 8**, and three of its entries are contradicted by `main` at `e5b9125`: § 12 says the
> **eligibility conjunct** "is not implemented" (`:424`), that **blocking and reporting** "do not
> exist" (`:434`), and that the **internal Review Queue / operator surface** "does not exist"
> (`:435`). The repository says otherwise for the first two — `20261048000000` implements
> eligibility as `caller_eligible_provider_id()` (PD-086), and PD-082/PD-083 are implemented — and
> **half-otherwise for the third**, since the queue's backend exists and its surface does not.
> [BETA_SCOPE.md](BETA_SCOPE.md):164-165 carries the same third claim ("the operator Review Queue
> itself" among what is NOT built). **Neither document is the Steward's to edit**, and neither has
> been edited: the contradiction is recorded here so a cold reader does not follow a stale gap list,
> and **a human owns resolving it**. What is true on `main` is § Safety, trust and operator handling
> above.

Two gaps matter most to anyone reading this document cold:

- **There is a fulfilment verdict now — but only an operator can write one, and nothing in the
  running product can reach it.** PR #54
  added the immutable, server-derived `barter_obligations` pair; PR #56 added the two participant
  actions and the four-value `status` that records **what happened**; PR #58 added the ordinary
  pre-delivery exit; PR #62 added the PD-057 response window and **Needs Attention**; PR #64 added
  no-show reporting and **Under Review**; **PR #68 added manual operator adjudication and the
  three terminal OBLIGATION outcomes**; **Correction 3 (`0781f49`, PR #74) added the deliverer's
  review request as a third route into Under Review** (PD-072); and **Session 8 (`e5b9125`,
  PR #76) added the queue that request lands in — and no surface over it** (PD-085; PD-068
  PARTIALLY SATISFIED). Needs Attention and Under Review remain **unresolved
  operational states, derived per read**, and are precisely NOT outcomes. What is still absent is
  asserted rather than assumed: **no 7-day
  timeout TRANSITION (the window creates no status change — an elapsed window leaves the row
  `delivered` and the receiver may still answer), no automatic fulfilment, no automatic
  completion, no reviews-on-barter, no reputation and no push notifications.**

  **Two absences matter more than the rest and are stated flatly.**

  **(1) The Review Queue's BACKEND now exists; its OPERATOR SURFACE does not, so no obligation can
  still be resolved in the running product.** `adjudicate_barter_obligation` is complete, tested and
  `service_role`-only, and **nothing calls it** — verified by search over `app/` and `lib/`; the
  only in-repo caller is the concurrency test harness. Session 8 (PD-085) added `operator_cases`,
  `operator_case_events`, `is_operator()`, intake from all three sources and two operator RPCs, and
  **nothing calls those either**. **PD-068 is therefore PARTIALLY SATISFIED, not complete**
  ([PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md):1001-1012): a backend queue with no surface does not
  satisfy a requirement that an authorized operator can actually work a case, which today takes a
  `psql` session. **No resolution SLA is promised to anyone.** Until the surface exists, Under
  Review is a terminus in practice even though it is not one in the schema — and the queue means a
  request now lands somewhere a person could find it, not that anyone has found it.

  **(2) No terminal AGREEMENT outcome exists, and none is coming.** This is not a pending gap: it
  is **permanent by decision**. PD-070 rules that agreement-level resolution is **derived** from the
  immutable obligation facts and never stored, so there is no `Completed`, `Partially Fulfilled` or
  `Not Completed` column, status or verdict on `barter_agreements`, and adjudicating both
  obligations triggers no roll-up (`20261019000000:19-21`, § 6).

  **NO-SHOW AND UNDER REVIEW ARE THE EXCEPTIONS, AND THEY ARE NOT OUTCOMES EITHER.** A receiver
  may now report that a SCHEDULED service did not happen, and that report — or a plain
  `not_received` answer, or **since Correction 3 a deliverer's explicit review request (PD-072)** —
  puts the obligation into **Under Review**, meaning a human must look.
  Under Review is derived per read like Needs Attention: no status value, no column, and nothing
  moves on a timer. It decides no fault and produces no outcome, and the
  receiver's controls stay live beneath it.
  **Under Review OUTRANKS the ordinary exit** (PD-063): once a report exists,
  `cancel_barter_agreement` refuses with `PT423` and the control is no longer offered — a trade
  cannot be cancelled out of review, and a cancellation can never erase or hide a recorded
  report. Cancel-first refuses a later report (`PT409`); a race resolves to exactly one state,
  because both writers take the agreement row lock first. **The reason is participant-visible
  context** (PD-062): both participants read it, non-participants and anon cannot, and the UI
  attributes it as the reporting participant's STATEMENT with the sharing disclosed above the
  input. Reporting is **receiver-only**, only for an obligation with a non-null `scheduled_at`,
  only **at or after** it, and only against **server time** — the RPC has no `p_as_of` and no
  client value reaches the comparison. The report itself is **immutable participant-reported
  history**: append-only, one per obligation, server-stamped on every insert path, and a repeat
  returns the original timestamp. **A no-show does NOT automatically mean Needs Attention,
  Unfulfilled, a reliability impact, a reputation impact or any terminal outcome** — asserted
  directly rather than assumed.
  **Needs Attention now has a route into Under Review, and it is the narrow one that was left
  open.** This paragraph used to end "how it might later remains UNRESOLVED and deliberately so",
  and that is no longer true: **PD-072** (Correction 3) answers it with a **deliverer-initiated,
  EXPLICIT act** — a provider who delivered and was never answered may ask The Book to review that
  obligation once the window has passed, and the request is the third route into Under Review.
  **None of the four resolutions that were forbidden was used**: there is still no second timer, no
  automatic escalation, no operator auto-escalation, and the participant act that exists is a
  REQUEST rather than an escalation — it produces no outcome and assigns no fault. Asking is not
  being answered: **nothing processes these beyond queueing them**, which Session 8's
  `operator_cases` intake now at least does (PD-085). **OQ-071 is CLOSED by PD-072**
  ([OPEN_QUESTIONS.md](OPEN_QUESTIONS.md):166-202); the migration header that recorded the absence
  is `20261012000000:38-52` and the implementation is
  `20261039000000_barter_review_request.sql`, completed by
  `20261042000000_adjudication_consistency_review_request.sql` after the eligibility rule was found
  updated in only one of its two enforcing copies.
  (`supabase/migrations/20261012000000_barter_no_show_under_review.sql` through
  `20261018000000_no_show_created_at_server_stamped.sql` — **seven** files;
  `supabase/tests/no_show_under_review.test.sql`; PD-062, PD-063.) PD-046 § 7.3–7.5 and § 7 of the
  contract are implemented **further** by PR #68 — the routes existed before it and the
  **obligation-level** outcomes exist now, while the **agreement-level** ones deliberately never
  will (PD-070); PD-057
  is now **implemented** and
  its expiry still never means Fulfilled or Completed — asserted directly, not assumed
  (`supabase/migrations/20261011000000_barter_receiver_window_needs_attention.sql`;
  `supabase/tests/receiver_window.test.sql` §§ 4, 14;
  `supabase/tests/cancellation.test.sql:697-722`). **Cancelling implies none of them**: it is an
  agreement-level act that decides nothing about fulfilment and carries no reliability verdict
  (`supabase/migrations/20261005000000_barter_pre_delivery_cancellation.sql:25-29`).
- **Offer creation is not server-limited.** The interest cap is server-authoritative; the
  offers-per-day cap is client-side only and its check fails open
  ([BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 10, `lib/rateLimit.ts`).

**That list used to end "blocking and reporting, operator handling of a reported provider, and the
minimal internal Review Queue"; Session 8 moved four of the six items and the sentence is rewritten
rather than annotated.** What is **now built** and was not: the `is_approved` **eligibility
conjunct** — no longer a seam, but a separate `caller_eligible_provider_id()` gating the two barter
INSERT policies and nothing else (PD-086, `20261048000000:45-61`); **blocking** (PD-082) and
**reporting** (PD-083), contract § 9; and the **BACKEND** of operator handling and of the minimal
internal Review Queue (PD-085). See § Safety, trust and operator handling below.

What is **still unbuilt**: the **operator SURFACE** over that queue, without which PD-068 stays
PARTIALLY SATISFIED and no case can be worked outside `psql`; the **Open to Trades** opt-in; the
post-decline reverse-contact episode (PD-048); the bounded report-intake abuse control (PD-088 —
locked, **not implemented**); and hiding a blocked person from ordinary discovery and community
surfaces (PD-089 — locked, **not implemented**). The first is a pre-beta requirement and the fourth
is required before broad beta; both are sequenced in [ROADMAP.md](ROADMAP.md) § Next.

**Recorded as exploratory only, and none of it is committed work** — the Needs Attention → Under
Review question that used to head this list is **closed** by PD-072 and has been moved out of it:
barter **trust / reliability consequences**; **reciprocal
matching**; a **Wants list**; **three-way matching**; barter negotiation **UX simplification**;
**trade history / tax / legal**; **payment protection architecture**; **identity-verification
vendor and integration**; and **Available Right Now**. Several of these are written up in
`FUTURE_PRODUCT_IDEAS.md`; being written up there is **not** a decision to build any of them.

**Which merge delivered which capability is [ROADMAP.md](ROADMAP.md)'s record**, not this
document's — it carries a Completed row per delivered capability, each citing its evidence.

Open barter questions: **OQ-006** (collusion / reciprocal-rating gaming) and **OQ-007** (what in
the pre-existing implementation is salvageable) remain **Open**. OQ-001 … OQ-005 and OQ-008 are
closed, each citing the decision that closed it, in
[OPEN_QUESTIONS.md](OPEN_QUESTIONS.md), whose ledger now runs to **OQ-075**. **How a plain Needs
Attention might enter Under Review was numbered as OQ-071 by the post-Session-7 reconciliation and
CLOSED by PD-072** on 2026-09-09; the sentence here previously said it would stay unnumbered, and
that is superseded. Of the newer entries, **OQ-072** (a booking carries a service DATE but not
always an authoritative appointment TIME) is **Open**, and **OQ-073**, **OQ-074** and **OQ-075** are
**Closed** by PD-087, PD-088 and PD-089 — with PD-088 and PD-089 **locked but NOT IMPLEMENTED**.
A migration is an implementation, not an approval, and
none of the work above closes a question by itself.

---

## Safety, trust and operator handling — Session 8 (PR #76, `e5b9125`)

**The locked decisions are PD-082 … PD-089 in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) and are not restated here.** This section records only
what is true on `main`, and one thing above all: **the operator Review Queue's BACKEND is built and
its SURFACE is not.**

Thirteen migrations, `20261046000000_user_blocks.sql` …
`20261058000000_block_gates_fire_last_and_name_no_stranger.sql`, **six of them forward corrections
to the other seven** and one comments-only
([MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) § 2026-09-09).

| Capability | What is actually enforced | Where |
|---|---|---|
| **User blocking** (PD-082) | `public.user_blocks` — one directional row per pair (`unique (blocker_user_id, blocked_user_id)`), actor bound to `auth.uid()` by trigger, `created_at` trigger-stamped, **not editable** (unblock is a DELETE by the owner). The ROW is directional and only the blocker can see or lift it; the **EFFECT is symmetric**, because a one-way effect would stop only the person who asked for it. A block **deletes and hides nothing**. | `20261046000000:52-101` (table, actor trigger), `:106-119` (immutability) |
| **The live-transaction exception** (PD-082) | A blocked pair **keeps a conversation that already exists** while they hold a **submitted, non-terminal booking** or a **confirmed, uncancelled agreement with an unresolved obligation** — because severing it would trap two people inside an obligation while removing the only means of completing, cancelling or resolving it. Bounded three ways: only an EXISTING conversation, only while the transaction is live, and it grants nothing else. **A DRAFT booking is not a live transaction**, or a blocked party could manufacture their own exception by opening a booking flow. | The rule stated at `20261046000000:26-43`; `public.has_live_transaction`; messaging gate `20261051000000` |
| **`PT427`, and why it is not `PT426`** | The block refusal has its **own SQLSTATE**, deliberately distinct from the de-approved-provider refusal `PT426` — similar copy, different facts, and conflating them would tell a blocked user that a provider had been removed from the marketplace. | `20261047000000`; `20261058000000`; client mapping in `lib/safety.ts`, `lib/bookingDraft.ts` |
| **The block gates are triggers, not policies** | The three predicates `contact_blocked`, `contact_blocked_provider` and `has_live_transaction` were `SECURITY DEFINER` **and** granted to `authenticated`, so all three were callable at `/rest/v1/rpc/` — giving a blocked person a one-request answer to *"did they block me"*. **EXECUTE is now revoked from `authenticated` on all three**, and the checks moved into definer triggers that need no client grant. Two more holes closed with it: `PT427` was INSERT-only while a booking becomes a REQUEST on the UPDATE that stamps `submitted_at`, and `declined → pending` was ungated. | `20261055000000:74-94` (the revokes and the rewritten comments), `:96-120`; ordering fixed by `20261056000000:28-30` and `20261058000000:162-171` |
| **One reporting path** (PD-083) | Reporting writes to `public.reports`, and a trigger opens an operator case from it. **The community feed's `community_reports` is retired**: `20261057000000` labelled it ORPHANED, and `20261058000000` did the part a label cannot — **revoked INSERT/UPDATE/DELETE/TRUNCATE from `anon` and `authenticated` and dropped the `reports_insert_own` INSERT policy**. **The ROWS AND EVERY FK ARE UNTOUCHED**, deliberately: they are real reports real people filed that nothing ever read, and erasing them is a worse answer than never having read them. | `20261050000000:178-206` (`open_case_for_report` + trigger); `20261057000000:34-59`; `20261058000000:185-200` |
| **Operator notes are private** (PD-083, PD-084) | `admin_notes` and `resolved_by` are withheld by **column grant**, and `public.my_reports` is the supported read (`select` to `authenticated`, revoked from `public` and `anon`). The first attempt used a column-level `REVOKE` against a table-level `GRANT`, which is a **no-op** — the second time this repo shipped that mistake, which is why PD-084 exists. | `20261050000000:218-230`; the correction `20261052000000` |
| **Provider eligibility gates WRITES only** (PD-086) | `public.caller_eligible_provider_id()` returns the caller's provider id **only while `is_approved`**, and is used by the two barter INSERT policies **and nothing else**. `caller_provider_id()` stays ungated on purpose, so a de-approved provider can still close their own offers, release their own interests and answer their own obligations — the lockout `20260906000000` warned about. **Eligibility never gates what a provider may finish, cancel, read or clean up.** | `20261048000000:44-77`, `:79-119` |
| **The operator Review Queue — BACKEND ONLY** (PD-085) | `public.operator_cases` and `public.operator_case_events` (append-only), `public.is_operator()`, intake triggers for **all three sources** (provider appeals, barter review requests, user reports), and two operator RPCs — `operator_update_case` and `operator_set_provider_eligibility` — **granted to `service_role` alone**. `authenticated` holds **no grant at all** on either table and RLS is on with no policy for that role, which is two independent refusals. **No role table and no `is_admin` column**, deliberately: a row granting operator power is a client-reachable path to operator power. **One live case per subject**, so a duplicate appeal cannot fill the queue. No SLA field, no priority, no assignment. | `20261049000000:51-64` (`is_operator`), `:74-172` (both tables), `20261050000000:134-206` (intake), `:243-323` and `:341-396` (the RPCs and their `service_role`-only grants) |
| **Resolving a case does not adjudicate a trade** (PD-085) | A terminal obligation outcome is still reachable **only** through `adjudicate_barter_obligation` (PD-064, PD-068). There is no second adjudication path, and **no case field asks what a trade was worth**. | PD-085's *Consequences*; `supabase/tests/safety_operator.test.sql` |
| **The de-approved provider's appeal route** (PD-086) | **Request Review** opens a real `provider_appeal` case through `request_provider_review(text)`, and `my_provider_review_status()` tells the provider **that** a review is under way and nothing more — never operator notes, never the event log, never a timeframe. `resolved` and `dismissed` read identically to them. **Appealing grants nothing: no participant path can restore eligibility.** | `20261050000000:27-127`; `20261054000000` (the correction that stopped a closed appeal hiding the control permanently); `lib/safety.ts:281-331`, `app/(tabs)/business/index.tsx` |
| **No operator surface** (PD-068, PARTIALLY SATISFIED) | **Nothing under `app/`, `lib/`, `components/`, `hooks/`, `store/` or `context/` calls `operator_update_case`, `operator_set_provider_eligibility` or `adjudicate_barter_obligation`** — the only matches for the first two anywhere in client code are three prose comments. **Working a case today requires a `psql` session.** PD-068 was amended to **PARTIALLY SATISFIED — do not mark complete**: authority implemented, backend implemented, **surface NOT BUILT**, SLA deliberately absent. | Absence verified by search on this tree; [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md):1001-1012 |

**Client surfaces.** `lib/safety.ts` is the data layer and the copy — block / unblock / `iBlocked`,
the nine report reasons (**there is no billing or payment category, because The Book processes no
payment**, PD-042/PD-083), `submitReport`, the appeal calls, and the refusal copy. `lib/safetyMenu.ts`
owns the one action-sheet shape and its two confirmations. `components/ReportSheet.tsx` is the
report composer; `app/settings/blocked.tsx` is the block list. The symmetric block/report entry
points are on the message thread (`app/messages/[id].tsx`), the provider profile
(`components/ProviderProfile.tsx` and `app/providers/[id].tsx`, which carry a `blockedByMe` state),
the community feed (`app/community/index.tsx`, repointed off `community_reports`) and the
post-booking issue screen (`app/post-booking/issue.tsx`).

**Regression coverage.** `supabase/tests/safety_operator.test.sql`, registered in the B5B runner at
`scripts/db-security-test.mjs:58`, plus `__tests__/lib/safety.test.ts` and
`__tests__/components/ReportSheet.test.tsx`. **That these files exist does not establish that they
pass**; this document runs nothing, and no post-apply figure for this block is recorded in
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md) or was supplied to this reconciliation.

### What Session 8 decided and did NOT build

Three Founder rulings on the finished branch, and two of them are requirements rather than records:

- **PD-087 — a block is never announced; it need not be undiscoverable.** Satisfied by current
  behaviour, **no code change**. Inference from a distinct SQLSTATE by someone deliberately probing
  the API is out of scope and will not be engineered against; the alternative was shadow-banning,
  which `20261046000000:45-49` refused in writing. Closes OQ-073.
- **PD-088 — report intake gets a bounded abuse control before broad beta. NOT IMPLEMENTED.**
  Every `reports` INSERT now opens a case, so filing a report creates real operator work, and
  reporting is neither rate-limited nor idempotent per subject. The limits are decided and written
  down (one open case per reporter/target pair, 5/hour and 20/day, **no standing requirement**);
  none of it is built. Closes OQ-074.
- **PD-089 — a blocked person disappears from ordinary discovery and community surfaces.
  NOT IMPLEMENTED**, and explicitly **not** Session 8B. Session 8 stopped at CONTACT: neither the
  feed nor the barter board filters a blocked person's content, so a blocker still sees them, can
  still tap Respond, and gets a refusal that points them at their own eligibility. Closes OQ-075.

---

## Agents

Four agents, defined in `.agents/` with thin Claude Code adapters in `.claude/agents/`:

| # | Agent | Access |
|---|---|---|
| 1 | QA / Journey Reviewer | read-only |
| 2 | Security Reviewer | read-only |
| 3 | Codebase Auditor | read-only |
| 4 | **Project State Steward** | read + writes limited to 5 PM docs |

---

## What is deliberately NOT built

Recorded so absence is not mistaken for oversight:

- **Payments** — PLACEHOLDER/FUTURE; after the beta (PD-042).
- **Reviews Phase 2** — structured signals, reliability/conduct reputation, no-show scoring.
- **Delayed-deliverable reviews** — `delivered_at`, category-specific windows.
- **Safety operations** — masked comms, check-in/out, escalation, evidence preservation. **Blocking
  and reporting are no longer on this list** (PD-082, PD-083; see § Safety, trust and operator
  handling), but the operational model behind an escalation is still undecided and there is still
  no operator surface.
- **Identity verification enforcement** — messaging is educational during beta (PD-004).

---

## What this document cannot tell you

Written from repository state at rest. It does **not** establish: runtime behaviour on a
device, whether the app currently builds for release, live production state (explicitly out
of scope), or anything about real user behaviour. Where a claim needed a run to confirm, it
cites the recorded run rather than asserting it fresh.

**How this revision was verified, to the same standard as the last one.** The
PR #56 revision was written without a shell but its provenance was then **confirmed with `git`
and `gh` in the same session** — `main` at `46c0befe09cef016e881254a94d530442a975fbb`, squashed
from `09fc8b1` on base `88670d1`, CI run 34007334683 green on both jobs, and
`supabase migration list --linked` reporting 43 entries through `20261004000000`.

**The PR #58 revision was confirmed the same way.** The merge SHA `5b1a7a9`, the PR number, the
squash merge and `local main == origin/main` were checked with `git` and `gh`; the applied
migration list was checked with `supabase migration list` against the linked non-production
project; and the post-merge `main` CI run **34019463222** was read with `gh run view` (`check`
and `db-security` both green). The source claims themselves were read from files, as always.

**The PR #62 revision was verified to a WEAKER standard, and says so rather than borrowing the
two above.** Every source claim in § Barter was read from files on this tree — the migration, the
five client modules, the two screens, `supabase/tests/receiver_window.test.sql` and its
registration line in `scripts/db-security-test.mjs`. The reconciliation that wrote it had **no
shell** and recorded the merge provenance as attested; **each of those gaps has since been closed
with the command it named**, on 2026-09-07:

- `gh pr view 62` — **MERGED into `main` 2026-09-07T19:19:18Z**, squash, merge commit `26fb7fd`;
  `main` locally equals `origin/main` and the working tree is clean.
- `gh run list --branch main` — post-merge CI for `26fb7fd` is
  [run 34155130832](https://github.com/sntimmons/the_book/actions/runs/34155130832), **success**.
- `supabase migration list` — **50** versions, local == remote, no drift.
- B5B **985/985** and concurrency **102/102** were **re-run against merged `main`**, alongside
  `tsc --noEmit` clean, `lint:ci` 0 errors and Jest **605/605**.

**The PR #64 revision is verified to the WEAKER standard, and says so rather than borrowing the
three above.** Every source claim in § Barter was read from files on this tree — the seven
migrations `20261012000000` … `20261018000000`, `lib/obligationState.ts`, `lib/tradeActivity.ts`,
`lib/tradeCancellation.ts`, `lib/negotiation.ts`, `lib/barter.ts`, `lib/barterErrors.ts`,
`app/community/negotiation/[id].tsx`, `supabase/tests/no_show_under_review.test.sql`,
`__tests__/lib/underReview.test.ts` and the registration line at `scripts/db-security-test.mjs:53`.
This reconciliation had **no shell**, so the following are **attested as supplied in the
invocation and not independently confirmed**: that `main` is `23df39c`, that it equals
`origin/main` with a clean tree, that PR #64 was squash-merged onto base `ddcb229` (PR #63), that
post-merge CI on `main` is [run 34165346538](https://github.com/sntimmons/the_book/actions/runs/34165346538)
with conclusion **success**, and that `supabase migration list` reports 57 versions with local ==
remote and no drift. The B5B and concurrency figures are read from
[MIGRATION_LEDGER.md](../operations/MIGRATION_LEDGER.md), not re-run here. Closing those gaps takes
`gh pr view 64`, `git rev-parse`, `gh run view 34165346538` and `supabase migration list`.

**The PR #66 revision is verified to the WEAKEST standard of the four, and says so.** Every source
claim in § Barter was **re-read from files on this tree at `0f2b93c`** — `lib/obligationState.ts`,
`lib/tradeCancellation.ts`, `lib/tradeActivity.ts`, `lib/negotiation.ts`, `lib/negotiationState.ts`,
`lib/barterErrors.ts`, the new `components/ReasonComposer.tsx`, both community screens,
`__tests__/lib/obligationViewShape.test.ts`, `__tests__/components/ReasonComposer.test.tsx` and the
migration inventory — and every line citation in that section was re-derived rather than carried
forward. This reconciliation had **no shell**, so it verified provenance only from files: `.git/HEAD`,
`.git/refs/heads/main` and `.git/refs/remotes/origin/main` (all `0f2b93c…`, local `main` ==
`origin/main`) and `.git/logs/HEAD`, which shows `main` moving `23df39c` → `1c0fe54` →
`0f2b93c` and the branch `refactor/barter-pre-adjudication-cleanup` cut from `1c0fe54`. The
following are **attested as supplied in the invocation and not independently confirmed**: that
PR #66 was squash-merged, that PR #65 is `1c0fe54`, that the working tree is clean, that post-merge
CI on `main` is [run 34181613351](https://github.com/sntimmons/the_book/actions/runs/34181613351)
(**success**), that `supabase migration list` reports 57 versions with local == remote and no
drift, that `git diff 1c0fe54 -- supabase/` was empty, and the figures **B5B 1097/1097**,
**concurrency 129/129**, **Jest 663/663**, typecheck clean and lint 0 errors. `gh pr view 66`,
`git rev-parse`, `gh run view 34181613351`, `git diff 1c0fe54 -- supabase/` and
`supabase migration list` close that gap in five commands.

**The PR #68 / PR #70 revision — this one — is verified to the same WEAK standard, and says so
rather than borrowing the stronger ones above.** What was **read from files on this tree at
`f5fd197`**, and is therefore repository-proven: the eleven new migrations `20261019000000` …
`20261029000000`; the adjudication table, its triggers, its RLS policy and its column grants; the
`service_role`-only `EXECUTE` grant on `adjudicate_barter_obligation`; the four independent
participant refusals; `lib/obligationState.ts`, `lib/negotiationState.ts`, `lib/tradeActivity.ts`,
`lib/negotiation.ts`, `lib/barter.ts`, `lib/barterErrors.ts`, `app/community/negotiation/[id].tsx`,
`app/community/index.tsx` and `app/community/barter-compose.tsx`; the **absence** of any
`adjudicate_barter_obligation` caller under `app/` or `lib/`; the **absence** of any
`offering_value` read on a live surface; `supabase/tests/adjudication.test.sql` and its
registration at `scripts/db-security-test.mjs:54`; the 68-file migration inventory; the 36-file
Jest inventory; and the SHA in `.git/refs/heads/main` and `.git/refs/remotes/origin/main`
(`f5fd1973b70b6163e0a1a56874d61673bdc00ee7`, local `main` == `origin/main`).

This reconciliation had **no shell**, so the following are **attested as supplied in the invocation
and not independently confirmed**: that the working tree is clean; that PR #69 merged as `c04e5bd`,
PR #68 as `5c24e8f` and PR #70 as `f5fd197`; that `main` CI on `f5fd197` concluded **success** on
both `check` and `db-security` (**no run number was supplied**, so none is recorded); that
`supabase migration list` reports **68** versions with local == remote and no drift on
`wcoyjeklscuqsumpjpfo`; that production `kxregomuawwcqvisuhtr` is untouched and eight migrations
behind; and the figures **B5B 1229/1229**, **concurrency 181/181** and **Jest 746/746**.
`gh pr view 68`, `gh pr view 70`, `git rev-parse`, `gh run list --branch main` and
`supabase migration list --linked` close that gap in five commands.

**The PR #74 / PR #76 revision — this one — is the WEAKEST-evidenced of them all on provenance, and
the strongest on absence, and it says which is which rather than averaging them.**

*Repository-proven*, read from files on this tree: the **97**-file migration inventory and its four
blocks; `.git/refs/heads/main` == `.git/refs/remotes/origin/main` ==
`e5b912511829ecfa8793c2a5ad8feaba40dfa3a0`; `.git/HEAD` resolving to
`chore/post-session-8-state-reconciliation`, whose ref is `76c4576` — **one commit ahead of
`e5b9125`**; the merge sequence `224d609` → `6a3fb69` → `a125cd7` → `0781f49` → `e5b9125` and the
fact that nothing sits between the last two, both read from `.git/logs/HEAD`; every migration cited
in § Safety, trust and operator handling at the lines cited; the **absence** of any caller of
`operator_update_case`, `operator_set_provider_eligibility` or `adjudicate_barter_obligation` under
`app/`, `lib/`, `components/`, `hooks/`, `store/` or `context/`; the existence of `lib/safety.ts`,
`lib/safetyMenu.ts`, `components/ReportSheet.tsx` and `app/settings/blocked.tsx`; the registration
of `supabase/tests/safety_operator.test.sql` at `scripts/db-security-test.mjs:58`; and that
`public.my_barter_obligations`'s live definition is `20261039000000:317`, established by sweeping
every `create … view` of it in the chain rather than by trusting the ledger's table.

*Attested as supplied in the invocation and NOT independently confirmed*: that `e5b9125` is the
squash merge of **PR #76**, that `0781f49` is **PR #74**, that the working tree is clean, and the
Session 8 scope summary. *Not supplied and therefore recorded nowhere here*: a CI run number or
conclusion for `e5b9125`, an applied-migration count for the non-production project after
Correction 3 or Session 8, and any B5B, concurrency or Jest figure for either block — **the
ledger records the applies but records no post-apply figures for `20261037000000` onward**, and the
last figures it does hold are Correction 2's (B5B 1305/1305, concurrency 181/181, at **75** applied
versions). `gh pr view 76`, `gh run list --branch main` and `supabase migration list --linked`
close that gap in three commands.

What that still does **not** establish: runtime behaviour on a device, live database contents
beyond the migration list, whether any test currently passes, or anything about production — which
remains out of scope and was not queried by this run.
