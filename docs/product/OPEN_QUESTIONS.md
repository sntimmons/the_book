# Open Questions

**Status:** Authoritative for what is **undecided**. Maintained by the Project State Steward.
**Reconciled against:** `main` @ `e5b912511829ecfa8793c2a5ad8feaba40dfa3a0` (2026-09-10) — for the
**closure record only**; see the scope note below.
**Last edited by:** the post-Session-8 state reconciliation. Before it, **PR #76** (`e5b9125`)
carried OQ-073, OQ-074 and OQ-075 in with its own code and closed all three; **PR #74** (`0781f49`)
opened OQ-072 and closed OQ-071. **The header still read `f5fd197` and named the post-Session-7
reconciliation four merges later, because PR #75 — which would have corrected it — never merged.**

> **WHAT THIS ANCHOR COVERS, AND WHAT IT DOES NOT.** An anchor asserts that *this document's*
> facts were verified at that commit, and this one is **narrow on purpose**. The 2026-09-10
> reconciliation verified, at `e5b9125`, only the **closure record**: that OQ-071 is closed by
> PD-072, that OQ-073, OQ-074 and OQ-075 are closed by PD-087, PD-088 and PD-089, that PD-088 and
> PD-089 are **locked and NOT IMPLEMENTED**, and that OQ-072 is Open. It **re-verified no other
> entry**, and in particular re-verified nothing carried by **OQ-006**, **OQ-007**, **OQ-011**,
> **OQ-036** or **OQ-070**.
>
> **OQ-070 in particular should now be re-read rather than trusted.** Its text asserts that
> `components/ComingSoonInterest.tsx:54` calls a `feature_interest_count` RPC no active migration
> defines. That claim was last checked at `0e11cde` (2026-09-04) and **32 migrations have landed
> since**, several of which changed grants on `providers` and dropped a function a comment still
> named. Nothing here says it is wrong; it says nobody has looked.
>
> The 2026-09-08 reconciliation before this one re-verified the **Barter**
> entries (OQ-001 … OQ-008, and the new OQ-071) against `f5fd197`, because Session 7 completed
> there and those were the entries at risk of having gone stale. It did **NOT** re-verify the
> repository claims carried by **OQ-011**, **OQ-036** or **OQ-070**. Nothing
> outside Barter was changed.
>
> **It did not move for PR #56 (`46c0bef`) either, and for the same reason.** That
> reconciliation (merged as PR #57) edited only the closed index below — to record that PD-057,
> PD-058 and PD-059 close no question here — and re-verified nothing carried by OQ-011, OQ-036
> or OQ-070.
>
> **It did not move for PR #58 (`5b1a7a9`) either.** That reconciliation edited only OQ-010's
> "related, not closing" note and the closed index below, to record that pre-delivery
> cancellation shipped; it re-verified nothing carried by OQ-011, OQ-036 or OQ-070, and it had no
> shell with which to confirm that SHA in any case.
>
> **It did not move for PR #62 (`26fb7fd`) either, and for the same reason.** The reconciliation
> after that merge edited only the closed index below — to record that the receiver-response
> window and Needs Attention shipped, that they close no question here, and that the two rulings
> the index still called undocumented now carry PD-060 and PD-061. It re-verified nothing carried
> by OQ-011, OQ-036 or OQ-070, and it had no shell with which to confirm that SHA.
> **It did not move for PR #64 (`23df39c`) either, and for the same reason.** The reconciliation
> after that merge edited only the closed index below — to record that no-show reporting and the
> Under Review foundation shipped and close no question here. It re-verified nothing carried by
> OQ-011, OQ-036 or OQ-070, and it had no shell with which to confirm that SHA.
> **It did not move for PR #65 (`1c0fe54`) or PR #66 (`0f2b93c`) either.** PR #65 was a
> documentation-only reconciliation. PR #66 was the behaviour-preserving pre-adjudication cleanup:
> it added no migration, no database object and no product behaviour, so it **opened no question,
> closed none, and changed no answer** — and the reconciliation after it re-verified nothing
> carried by OQ-011, OQ-036 or OQ-070.
> `Last edited by:` records the edit; the anchor records the verification.

> **`Reconciled against:` is not the tip of `main`.** It is the last commit at which the
> repository facts asserted in this document were verified. A documentation-only merge that
> changes no repository, product, runtime or security fact does **not** advance it — so this
> anchor may legitimately sit behind `main`. `Last edited by:` records the documentation
> mutation separately, as a PR number, because a PR number exists before merge and a merge
> SHA does not: a document can never truthfully cite the commit that lands it.

Every entry marked `Open` is genuinely unresolved. A question is **closed by a decision**,
cited either to [PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) or to an authoritative contract
document such as [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) — never by someone
implementing one answer, and never by deletion. Repository code that happens to behave one way
does not close a question. **Closed entries stay in place**, with what closed them cited in
`Status`, so the record of how the product got here survives.

**Entry schema.** Every entry carries the same four fields — **Area**, **Why it matters**,
**Blocks**, **Status**. The schema and the permitted **Area** values are defined in
`.agents/project-state-steward/OUTPUT_FORMAT.md` and are deliberately **not copied here**: a
duplicated enum is a second source of truth that drifts, and would have to be edited in two
places every time an area is added.

**One documented exception: OQ-030 carries a fifth field**, `Unresolved tension to settle
here`, which records a live conflict between two authoritative documents that the four
standard fields cannot hold. It is intentional. **Do not normalise it away** — a future pass
that greps for non-conforming bullets would delete the only record of that conflict.

Where **Why it matters** reads *"Not recorded when the question was opened"*, that is the
truthful state of the record — a rationale was never captured, and one has deliberately not
been invented here. Section headings group by area; the `Area` field is stated per entry so
an entry is self-describing when quoted alone.

---

## Barter

### OQ-001 — Is "open to trades" provider-level, service-level, or both?
- **Area:** Barter
- **Why it matters:** Determines the data model and how discovery filters work. Provider-level is simpler; service-level is more honest (a stylist may trade a haircut but not a full colour).
- **Blocks:** Session 5 barter decisions.
- **Status:** Closed by [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 2 on 2026-09-04 — **provider-level**. Open to Trades is a provider-level opt-in, held separately from eligibility. Service-level trade flags are not part of the first beta.

### OQ-002 — What is the correct transaction model: reciprocal bookings, or a parent trade agreement?
- **Area:** Barter
- **Why it matters:** Two bookings that reference each other vs one agreement that spawns two obligations. Affects cancellation, completion, reviews, and what "half-done" means.
- **Blocks:** Session 5.
- **Status:** Closed by [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 4 and § 6 on 2026-09-04 — **a parent trade agreement**. An official agreement is required before a trade is real, and it creates directed obligations, each with a deliverer and a receiver. Not reciprocal bookings.

### OQ-003 — What minimum terms must a trade capture for beta?
- **Area:** Barter
- **Why it matters:** Too little invites disputes; too much becomes a contract engine nobody fills in.
- **Blocks:** Session 5 — [ROADMAP.md](ROADMAP.md) sequences OQ-001 … OQ-006 there.
- **Status:** Closed by [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 5 and § 6 on 2026-09-04 — service-for-service only; an existing service or a custom barter package; no required dollar equivalence; no cash hybrid; no "exposure" as consideration; and per obligation a deliverer, a receiver, a server-stamped `delivered_at` and a 7-day receiver confirmation window.

### OQ-004 — How should cancellation and no-show work for trades?
- **Area:** Barter
- **Why it matters:** One side may deliver before the other. A no-show on the second leg is materially different from one on a paid booking. Interacts with PD-026 and PD-027.
- **Blocks:** Slice 3 (agreement / obligation schema) must not encode a cancellation model
  before this is settled.
- **Reconciliation note (2026-09-04) — historical, and superseded later the same day by the
  ruling recorded as PD-046. Kept because it records why the question could not be closed on
  repository evidence:** deliberately **left open**. The beta contract settles the
  *frame* — no timeout completion, receiver-confirmed delivery, truthful Partially Fulfilled
  outcomes, and history retention (PD-043) — but not this question's own wording. Specifically
  undecided: whether a two-party trade may be **mutually cancelled before delivery**, and how
  cancellation differs from a no-show on each leg. Session 5 recorded this as answered only
  *partially*, and the Founder ruling of 2026-09-04 listed "cancellation rules" without
  supplying them. Closing it would mean inventing the rules.
- **Status:** Closed by **PD-046** on 2026-09-04 — see [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 7. Pre-agreement exit is not a cancellation; after agreement and before any delivery either participant may cancel **unilaterally**; after any delivery ordinary cancellation is unavailable and disagreement is adjudicated. ~~No-show is distinct from cancellation and yields an **Unfulfilled** obligation.~~ No review, reputation or ranking effect in the first beta; actor and timing retained for a future reliability model.
- **Reconciliation note (2026-09-08) — one clause of the closure above became FALSE and is struck
  through rather than quietly rewritten.** A no-show does **not** yield an Unfulfilled obligation
  and never did once it was built. Under **PD-062** / **PD-063** a valid report routes the
  obligation to **Under Review**, which means only that a human must look; it is not a finding of
  fault and produces no outcome by itself. Under **PD-064** an obligation reaches a terminal
  outcome in exactly one way — a decision by an authorized **operator**, never a participant and
  never a clock — and that operator may find it **Fulfilled**, **Unfulfilled** *or* **Closed
  without resolution** (**PD-065**). The rest of PD-046's closure stands unchanged, and
  **OQ-004's own question is not reopened.**
- **Follow-on rulings (2026-09-06), recorded because they were previously undocumented:** PD-046
  asked for "an optional reason" and named the classification, but said nothing about **who reads
  the reason**, **what it means**, or **what the durable copy for two cancellations may claim**.
  All three were answered in code during PR #58 with no decision to point at, which is a
  documentation gap rather than a reopened question. Now closed by
  **[PD-060](PRODUCT_DECISIONS.md)** — the reason is visible to both participants, is contextual
  only, and the counterparty may get a durable best-effort in-thread notice — and
  **[PD-061](PRODUCT_DECISIONS.md)** — two independent cancellations may be classified Mutually
  Cancelled, but the durable notice states only that both providers cancelled and must not claim
  they "agreed". **Nothing about OQ-004's own question is reopened.**

### OQ-005 — How should barter interact with reviews and reputation?
- **Area:** Barter
- **Why it matters:** Whether a trade produces the same review opportunity as a paid booking, and whether trade-derived reputation is distinguishable.
- **Blocks:** Session 5 — [ROADMAP.md](ROADMAP.md) sequences OQ-001 … OQ-006 there.
- **Status:** Closed by [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 8 on 2026-09-04 — for the first Houston closed beta, **not at all**: no barter reviews, and no barter effect on public reputation or ranking. The post-beta model (how trades might later contribute to reputation) is deferred as "Verified Trade" work and is **not** closed by this; the gaming half of it remains OQ-006.

### OQ-006 — How do we reduce collusion and reciprocal-rating gaming?
- **Area:** Barter
- **Why it matters:** Two providers can trade repeatedly and inflate each other's reputation. Blind reveal (PD-022) helps but does not solve repeat collusion.
- **Blocks:** Any work that lets barter contribute to public reputation or ranking.
- **Reconciliation note (2026-09-04):** deliberately **left open** by Founder ruling — the final
  anti-collusion / reputation-contribution model is intentionally deferred. Two-party scope
  (PD-032) does not close it: two providers can still trade repeatedly. It is not blocking the
  beta, because barter contributes nothing to reputation there
  ([BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 8).
- **Status:** Open

### OQ-007 — What in the existing barter implementation is usable, salvageable, or needs bounded rebuilding?
- **Area:** Barter
- **Why it matters:** `barter_offers` / `barter_interests`, `lib/barter.ts` and the community screens already exist. Redesigning without auditing them wastes working code.
- **Blocks:** Session 5. The Session 4 audit **was performed** — cited at
  `supabase/migrations/20260906000000_barter_integrity_slice1.sql:9`, and Slice 1 acted on its
  findings — but it committed no document to this repository, so its answer is not on `main`.
  An audit would not close this question in any case; only a cited `PD-NNN` does.
- **Reconciliation note (2026-09-08):** still **Open** on its own terms, and deliberately so —
  no `PD-NNN` answers "what of the original implementation was salvageable". But the question has
  been overtaken by events: the barter surface has since been rebuilt in place across Session 7
  (negotiation, agreement, obligations, delivery, cancellation, no-show, Under Review,
  adjudication), each slice audited by the read-only reviewers and pinned by
  `supabase/tests/*.sql`. Whatever remains of the original implementation is `barter_offers`,
  `barter_interests` and the community screens, all of which were hardened by Slice 1 and are
  covered by `supabase/tests/barter.test.sql`. **Recommend the Founder close this as overtaken at
  the Whole-App Audit Round 2**, rather than it lingering as a Session 5 question after the work
  it was blocking has shipped. Not closed here: closing it is the Founder's call, not the
  Steward's.
- **Status:** Open

### OQ-071 — How may a plain Needs Attention enter Under Review?
- **Area:** Barter
- **Why it matters:** This is the **one genuinely open question left in the barter lifecycle
  engine**, and it is a real dead end rather than a theoretical gap. An obligation that was
  marked delivered and never answered passes its 7-day window into **Needs Attention** and can
  sit there permanently: the receiver may still answer at any time (**PD-057** — the RPCs never
  consult the deadline), but if they simply never do, **the deliverer has no route at all**.
  Adjudication cannot help, because **PD-064** makes an obligation eligible only while it is
  **Under Review**, and the only two acts that produce Under Review are an explicit **no-show
  report** and an explicit **`not_received`** answer (**PD-062**). A passed deadline is silence,
  and the ruling is explicit that silence is not a finding.
- **Blocks:** nothing that is currently scheduled. It does **not** block the pre-beta Review
  Queue (**PD-068**), which operates on obligations that are already Under Review. It should be
  settled before live barter beta, because the dead end is reachable by two providers doing
  nothing wrong.
- **Not to be resolved by implementation.** Adding a second timer, an automatic escalation, a
  participant escalation action or an operator auto-escalation would each be answering this
  question in code. None exists today, and **PD-064** asserts that absence rather than assuming
  it.
- **Recorded here 2026-09-08 by the post-Session-7 reconciliation.** This is **not a new
  question**: it has been carried as UNRESOLVED inside **PD-062**, **PD-063**, **PD-064**,
  **PD-068** and `BARTER_BETA_CONTRACT.md` § 7.4 / § 7.5 since 2026-09-07. It is given a number
  so the one open engine question lives in the document whose job that is, instead of only in
  the prose of five locked decisions. **No decision is made or implied by recording it.**
- **CLOSED 2026-09-09 by PD-072** (Founder ruling, Pre-Session-8 Correction 3, item X). The
  answer is the narrow one this entry left room for: a **DELIVERER-INITIATED, EXPLICIT ACT**.
  A provider who delivered and was never answered may ask The Book to review that obligation once
  the window has passed, and that request is the third route into Under Review. **None of the
  four forbidden resolutions was used** — there is no second timer, no automatic escalation, no
  operator auto-escalation, and the participant act that exists is a REQUEST rather than an
  escalation: it produces no outcome, assigns no fault and contradicts nobody's silence. The dead
  end this entry described is gone; a provider whose counterparty stops opening the app now has a
  move. What is NOT closed by this and is tracked in PD-072 instead: nothing processes these
  requests beyond queueing them. **Session 8 delivered the queue half** (PD-085): a trigger opens a
  `barter_review` case, so a request now lands somewhere a person can find. It delivered **no
  operator UI** — the operator RPCs are `service_role`-only — and there is still **no SLA**.
- **Status:** CLOSED — resolved by PD-072, 2026-09-09

### OQ-008 — May an offer's terms still be edited once providers have responded to them?
- **Area:** Barter
- **Why it matters:** Slice 1 made a response permanently immutable — including its `message`
  — on the grounds that it records what was offered at a point in time, but did **not** freeze
  the offer. Its author may still rewrite `offering_service`, `seeking_service`,
  `offering_value` and `notes` after providers have responded, leaving immutable responses
  attached to terms nobody agreed to. The migration records this rather than closing it,
  because freezing offer terms is "a product decision about the negotiation model, not an
  integrity fix" (`supabase/migrations/20260906000000_barter_integrity_slice1.sql:58-66`).
  No edit affordance exists in the app today, so it is reachable only by a direct API call —
  which limits exposure, not the decision. Three shapes are open and none is implied here:
  freeze terms once any response exists; allow edits but withdraw or re-pend the responses;
  or leave it as it is and rely on the absence of an edit affordance.
- **Blocks:** nothing yet — but a slice that adds an offer-edit affordance, or a column a
  counterparty depends on, must settle it first. The migration's § 6 note is explicit that the
  deny-list on `barter_offers` becomes unacceptable at that point.
- **Status:** Closed by **PD-047** on 2026-09-04 — see [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 3.1. The post stays editable; **every proposal snapshots the post terms at creation**, so an edit reaches future responders only and can never rewrite an existing proposal, negotiation or accepted agreement.

---

## Booking lifecycle

### OQ-072 — A booking carries a service DATE but not always an authoritative appointment TIME
- **Area:** Booking lifecycle
- **Why it matters:** PD-071 expires a request at `LEAST(submitted_at + 72 hours,
  appointment_time)`, so the clamp that stops a request outliving its own service time depends on
  `appointment_time` — which is **nullable**. When it is null the 72-hour deadline stands alone,
  and a request can remain answerable after the date the client asked for.
- **What the model actually holds.** `bookings.requested_date` is a `date` and is NOT NULL;
  `bookings.requested_time` is free `text` (a display string, "11:00 AM"); `appointment_time` is
  `timestamptz` and nullable. A deadline derived from the first two requires assuming **a
  time-of-day and a timezone** — neither of which the row carries.
- **How narrow the gap is.** The date/time step will not advance without both a date and a time,
  and its slot labels are exactly the format the parser accepts, so a request made through the
  normal flow **does** carry an `appointment_time`. What remains is rows predating the column and
  any path that reaches the send step without passing that one.
- **One further limitation, recorded with it:** `appointment_time` is assembled on the CLIENT from
  the device's local timezone. For a single-city beta where both parties are in Houston that is
  unremarkable, but it means the "authoritative" timestamp is only as authoritative as the device
  clock. It cannot be abused to LENGTHEN a window — `LEAST` caps at 72 hours regardless — only to
  shorten the client's own.
- **Not to be resolved by implementation.** **PM ruling, 2026-09-09:** do not manufacture a rule
  from the service date. Deriving "end of the requested day" or any other boundary means inventing
  a time-of-day and picking a timezone on the client's behalf, and a rule invented from assumptions
  is worse than a bounded one that is honest about its limit. Options a decision could take —
  making `appointment_time` NOT NULL going forward, storing a booking timezone, or accepting the
  72-hour bound as final — are all genuinely open.
- **Status:** Open

## Messaging

### OQ-010 — What are the rules for provider- or community-initiated contact?
- **Area:** Messaging
- **Why it matters:** Today the client sends the first request. Whether a provider may initiate — and under what anti-spam limits — is undefined.
- **Related, and deliberately not treated as closing this (2026-09-04):** **PD-048** rules that
  a provider who declined another provider's request may later initiate contact, as a new
  reverse-direction episode on the same canonical provider-pair conversation. That settles one
  specific case and **supplies none of the general rules or anti-spam limits this question
  asks for**; PD-048 itself records the work as an unimplemented follow-up. Barter accept also
  opens a provider-to-provider thread server-side (`accept_barter_interest`,
  `20260907000000`), but that is a consequence of a mutual accept, not provider-initiated
  contact, and code does not close a question in any case. **Nor does PR #58's cancellation
  notice** (`20261009000000_pair_conversation_notice.sql`): it is **platform-authored**
  (`sender_id is null`), written only into a conversation that **already exists** — it creates
  none — and it is not a message from one provider to another. It bears on this question no more
  than the release notice `20260910000000` already did.
- **Blocks:** nothing yet.
- **Status:** Open

### OQ-011 — What is the Requests sent/received UX?
- **Area:** Messaging
- **Why it matters:** **Narrowed 2026-09-03.** An earlier draft of this question claimed pending requests had no dedicated surface. That is **false on `main`** — `app/(tabs)/messages.tsx` renders a Requests filter with a live count covering both incoming (provider) and sent (client) pending requests, and `USER_JOURNEYS.md` documents it. The premise was wrong, so the question was narrowed rather than closed: repository evidence alone must not close a question. What **actually remains open** is that the Requests list does not distinguish sent from received within itself, and a `declined` request is `hidden` from the active lists (`lib/messageRequests.ts`) with no surface showing it — so a client has no view of a request that was turned down, and a request that silently disappears is indistinguishable from one never sent.
- **Blocks:** nothing yet.
- **Status:** Open

### OQ-012 — Are there remaining realtime deployment/config requirements?
- **Area:** Messaging
- **Why it matters:** Realtime publication membership is a deployment concern that repository code cannot prove.
- **Blocks:** nothing yet.
- **Status:** Open

---

## Safety

[ROADMAP.md](ROADMAP.md) sequences OQ-020 … OQ-026 to **Session 8 — Safety & trust beta
audit**, which is the `Blocks` value recorded on each entry below.

### OQ-020 — What is the address-disclosure model for home-based and house-call services?
- **Area:** Safety
- **Why it matters:** The highest-risk surface in the product. When an address is revealed, to whom, and after what gate.
- **Blocks:** Session 8.
- **Status:** Open

### OQ-021 — Do we need masked communications?
- **Area:** Safety
- **Why it matters:** Not recorded when the question was opened.
- **Blocks:** Session 8.
- **Status:** Open

### OQ-022 — Do we need check-in / check-out?
- **Area:** Safety
- **Why it matters:** Not recorded when the question was opened.
- **Blocks:** Session 8.
- **Status:** Open

### OQ-023 — Trusted contact and location sharing?
- **Area:** Safety
- **Why it matters:** Not recorded when the question was opened.
- **Blocks:** Session 8.
- **Status:** Open

### OQ-024 — What is the incident reporting model beyond the current `reports` table?
- **Area:** Safety
- **Why it matters:** `app/post-booking/issue.tsx` writes reports; triage, response and escalation are undefined.
- **Blocks:** Session 8.
- **Status:** Open

### OQ-025 — What are the restriction and escalation operations?
- **Area:** Safety
- **Why it matters:** No defined path from repeated reports to account restriction.
- **Blocks:** Session 8.
- **Status:** Open

### OQ-026 — What evidence preservation is required?
- **Area:** Safety
- **Why it matters:** Not recorded when the question was opened.
- **Blocks:** Session 8.
- **Status:** Open

---

## Payments

**Shared context for OQ-040 … OQ-046.** Payments carry the heaviest compliance, fraud and
support burden in the product. PD-042 locks that they come **after** the beta; none of the
mechanics are decided. Each question below is listed separately because each is separately
undecided — the grouping is editorial, not a claim that one answer settles them all.

### OQ-040 — Which processor?
- **Area:** Payments
- **Why it matters:** Processor selection constrains fee structure, payout timing, dispute handling and the compliance surface downstream of it. Nothing is selected.
- **Blocks:** the payments readiness programme.
- **Status:** Open

### OQ-041 — What is the fee structure, and who pays it?
- **Area:** Payments
- **Why it matters:** Whatever is chosen is visible to both sides of the marketplace and sets the platform's economics. The **option space is owned by [BETA_SCOPE.md](BETA_SCOPE.md) § Revenue model**, which keeps percentage, payer, naming, and *whether the model is transactional, subscription, or hybrid* all open — and warns against encoding any of them as final. This entry must not narrow that space: it records that the question is open, not what shape the answer takes.
- **Blocks:** the payments readiness programme.
- **Status:** Open

### OQ-042 — Deposits vs final charges?
- **Area:** Payments
- **Why it matters:** Determines when money moves relative to service delivery, and therefore the shape of the cancellation and refund surface.
- **Blocks:** the payments readiness programme.
- **Status:** Open

### OQ-043 — Payouts and refunds?
- **Area:** Payments
- **Why it matters:** Payout timing and refund mechanics are undefined; both are prerequisites for moving money at all.
- **Blocks:** the payments readiness programme.
- **Status:** Open

### OQ-044 — Cancellation, disputes, chargebacks?
- **Area:** Payments
- **Why it matters:** The heaviest support path in any payments system. No rules exist for cancellation windows, dispute handling, or chargeback response.
- **Blocks:** the payments readiness programme.
- **Status:** Open

### OQ-045 — What is the support model for money problems?
- **Area:** Payments
- **Why it matters:** Money problems need a human response path with defined ownership and turnaround; none is defined.
- **Blocks:** the payments readiness programme.
- **Status:** Open

### OQ-046 — What defines controlled-pilot readiness?
- **Area:** Payments
- **Why it matters:** Without explicit readiness criteria there is no gate between building payments and exposing real money to real users.
- **Blocks:** the payments readiness programme.
- **Status:** Open

---

## Contracts

**Shared context for OQ-050 … OQ-053.** Contract storage and signature paths exist in the
schema; the product rules around them do not. Each question below is separately undecided.

### OQ-050 — What templates are needed?
- **Area:** Contracts
- **Why it matters:** Storage and signature paths exist in the schema, but which documents they are meant to hold is undefined.
- **Blocks:** nothing yet.
- **Status:** Open

### OQ-051 — What legal wording, and reviewed by whom?
- **Area:** Contracts
- **Why it matters:** Legal wording shipped without review is a liability, and no reviewer is identified.
- **Blocks:** nothing yet.
- **Status:** Open

### OQ-052 — What is the signature artifact?
- **Area:** Contracts
- **Why it matters:** What is stored as proof of agreement — and whether it is meaningful as evidence — is undefined.
- **Blocks:** nothing yet.
- **Status:** Open

### OQ-053 — Which categories require a contract at all?
- **Area:** Contracts
- **Why it matters:** The documented status quo is **provider-optional** — [BETA_SCOPE.md](BETA_SCOPE.md) § Provider contracts says providers may supply their own and that whether contracts become **mandatory** for specific categories is undecided. Whether they stay optional, become universal, or become category-specific is the open part; the optional status quo is not a placeholder to be designed away by default.
- **Blocks:** nothing yet.
- **Status:** Open

---

## Houston beta

### OQ-030 — What is the exact provider-category mix?
- **Area:** Houston Beta
- **Why it matters:** Cohort composition determines whether natural client/service/trade relationships form. [HOUSTON_BETA_STRATEGY.md](HOUSTON_BETA_STRATEGY.md) describes the *shape* (interlocking, overlapping needs) but the specific first categories are not locked.
- **Unresolved tension to settle here:** `BETA_SCOPE.md` says the initial launch covers "~**top 15**" categories. The strategy doc argues for density against a 20+ user floor — 15 categories across 20 people is ~1.3 per category, which is the scatter it warns against. These may be describing different things (launch-market breadth vs beta-cohort composition), but nothing states which. **Do not resolve by inference.** *(This field is an intentional extension to the entry schema: it records a live conflict between two authoritative documents, which the four standard fields have nowhere to hold. It must not be dropped in a future normalisation pass.)*
- **Blocks:** Houston closed beta cohort recruitment.
- **Status:** Open

### OQ-031 — What is the exact cohort size and composition?
- **Area:** Houston Beta
- **Why it matters:** The founder floor is 20+ real users with both sides represented ([HOUSTON_BETA_STRATEGY.md](HOUSTON_BETA_STRATEGY.md)); the provider:client ratio and per-category counts are not set. No `PD-NNN` locks that floor — it is a strategy-document position, not a locked decision.
- **Blocks:** Houston closed beta cohort recruitment.
- **Status:** Open

### OQ-032 — What is the recruitment approach?
- **Area:** Houston Beta
- **Why it matters:** Not recorded when the question was opened.
- **Blocks:** Houston closed beta cohort recruitment.
- **Status:** Open

### OQ-033 — What is the concierge/manual support model during beta?
- **Area:** Houston Beta
- **Why it matters:** Not recorded when the question was opened.
- **Blocks:** Houston closed beta.
- **Status:** Open

### OQ-034 — What activation and retention thresholds beyond the minimum success criteria?
- **Area:** Houston Beta
- **Why it matters:** The minimum floor is defined; what "working well" looks like is not.
- **Blocks:** nothing yet — the minimum success floor in [HOUSTON_BETA_STRATEGY.md](HOUSTON_BETA_STRATEGY.md) is already defined.
- **Status:** Open

### OQ-035 — Which identity-verification vendor, and which trust claims may each level display?
- **Area:** Houston Beta
- **PARTLY CLOSED 2026-09-09 by PD-074.** The **trust-claim half is answered**: an approved beta provider carries **"Houston Beta Provider"** and nothing else. Permitted alongside it are real profile/business information, portfolio and service info, location and mode, reviews from completed bookings and their count, completed-booking information, and the provider's own policy/contract. Explicitly NOT permitted: "Verified", "ID Verified", trust scores, any badge implying government identity verification, and barter reputation. The label is a fact — this provider was approved into the Houston beta — and asserts no identity check of any kind. **The VENDOR half remains open**, which is why this entry is not closed.
- **Why it matters:** PD-005 locks that a specialist third party performs government-ID verification and that The Book avoids storing raw documents — but no vendor is selected, ~~and what a verified badge is allowed to *claim* is undefined~~ **(the claim question is now answered by PD-074; the vendor question is not)**. `BETA_SCOPE.md` flags this as PRODUCT DECISION REQUIRED. *(Previously filed under `## Payments` with an `Area` of "Houston Beta / Identity"; relocated to its declared area on 2026-09-03. Identity/verification remains the specific subject — only the filing changed.)*
- **Blocks:** any hard verification gate (PD-004 keeps beta messaging educational).
- **Status:** **PARTLY CLOSED** — the trust-claim half is answered by **PD-074** (2026-09-09); the **vendor/process half remains Open**.

### OQ-036 — Is the "14-day to verify" copy an approved policy?
- **Area:** Houston Beta
- **Why it matters:** `BETA_SCOPE.md` explicitly flags this copy as a **placeholder, not an approved product policy**, yet it was user-visible wording that read as a commitment. **It no longer ships.** It ran at `app/onboarding/provider/golive.tsx` ("Complete verification within 14 days of going live.") — in **provider go-live onboarding**, which is why `USER_JOURNEYS.md` could correctly say the copy was not used by the booking gate without that meaning it was unshipped — until **Pre-Beta Correction 1 (2026-09-08)** removed it. The audit that found it recorded the sharper problem: it named a deadline for a task **no user can perform**, since no user-completable verification flow exists. *(Previously filed under `## Payments`; relocated to its declared area on 2026-09-03.)*
- **Why it is still Open:** removing copy is not a ruling. Whether a verification grace period should exist, and of what length, is untouched by the removal — **a question is closed by a cited decision, never by a deletion.** The go-live screen now describes verification as a future capability with no timeframe, and `__tests__/guards/betaClaimsAbsent.test.ts` fails if any timeframe returns.
- **Blocks:** nothing yet.
- **Status:** Open

---

## Reviews

### OQ-060 — Should the review form's optional chips and heading be neutralised for a low rating?
- **Area:** Reviews
- **Why it matters:** All chips are currently positive ("Great results", "On time") under "WHAT STOOD OUT?". Submission never requires them (PD-023), so this is framing, not gating. Adding negative/mixed vocabulary would be Phase 2 work (PD-028). Raised by the QA reviewer during PR #26.
- **Blocks:** nothing yet.
- **Status:** Open

### OQ-061 — Should a client who files a report be told their review is still open?
- **Area:** Reviews
- **Why it matters:** Reporting and reviewing are deliberately separate (PD-025); a client who reports may not realise the review opportunity survives.
- **Blocks:** nothing yet.
- **Status:** Open

### OQ-062 — Should a client have a persistent review entry on the booking detail screen?
- **Area:** Reviews
- **Why it matters:** Providers have one; clients reach reviews from the bookings list and notifications only.
- **Blocks:** nothing yet.
- **Status:** Open

---

## Schema / data

### OQ-070 — Is `feature_interest_count()` intended to exist, and if so what is its behaviour and security contract?
- **Area:** Schema / data
- **Why it matters:** `components/ComingSoonInterest.tsx:54` calls `supabase.rpc('feature_interest_count', { p_feature_name })`, but **no active migration defines that function**. The only mention inside the migration chain is a note at `supabase/migrations/20260829000000_canonical_live_baseline.sql:3288` recording it as absent live; a loose, non-migration SQL file sits outside the chain at `supabase/feature_interest_count.sql`, which [supabase/README.md](../../supabase/README.md) records as pre-dating the migration rule and flags as an open schema question. The call **fails soft** — the component checks `error` and leaves the count `null`, hiding the social-proof line — so the gap produces no visible defect and will not surface as a bug report. Three things are undecided: **(a)** whether the RPC is intended to exist at all; **(b)** if it is, what it should return and what its security contract should be — the component's own comment asserts a `SECURITY DEFINER` function is needed because RLS limits reads to the caller's own row, but that is a comment in application code, not a contract established by any migration; **(c)** whether the component should instead read an existing path, and the RPC be retired. **This entry records the gap only. It does not propose SQL, infer what the loose file does, or imply any of the three answers.**
- **Blocks:** nothing yet — the surface degrades silently today.
- **Status:** Open

### OQ-073 — Does PD-082 mean a block is never ANNOUNCED, or that it is never DETERMINABLE?
- **Area:** Schema / data
- **Why it matters:** PD-082 says a blocked person "is never told". Session 8 read that as a rule about SURFACES and enforced it there: every refusal message is identical in both directions, and `20261058000000` closed the two routes that let a caller ask about a **stranger** (the `/rpc/` predicates, and a conversation gate that read identity from `NEW`). What remains is narrower and structural: a blocked person acting on their **own** relationship can still infer the block from a **distinct SQLSTATE**. A booking INSERT naming a provider whose `is_approved` is publicly `true` returns `PT427` only when a block exists; a barter response returns `42501`. Both are ordinary writes the shipped client makes. **Making these indistinguishable is not a bug fix — it requires shadow-banning**, i.e. accepting the write, showing success, and discarding it, which `20261046000000:45-49` deliberately rejected on the grounds that a product which lies to one user to protect another has chosen to lie to a user. The two answers lead to genuinely different products, so this is recorded rather than decided. **(a)** PD-082 is a copy rule: no surface names a block, and a determined client can still infer one — accepted, and PD-082 is narrowed in writing. **(b)** PD-082 is an information rule: every block refusal must be indistinguishable from a plausible non-block refusal, which reopens shadow-banning. **This entry proposes neither, and Session 8 implemented neither.**
- **CLOSED 2026-09-09 by PD-087** (Founder ruling, Session 8 final PM rulings). **Reading (a).**
  A block must never be explicitly ANNOUNCED; it does not need to be perfectly DETERMINABLE, and
  shadow-ban complexity must not be built merely to prevent inference. The live-transaction
  exceptions are preserved. No code change follows: the surfaces already comply, and the ruling
  makes that compliance the standard rather than an interim position.
- **Status:** CLOSED — resolved by PD-087, 2026-09-09

### OQ-074 — What bounds report intake, now that a report creates operator work?
- **Area:** Schema / data
- **Why it matters:** Before Session 8 a report was an inert row. Now every `reports` INSERT opens an `operator_cases` row through a trigger, so filing a report **creates work in the queue PD-068 makes a pre-beta requirement**. Two bounds that exist elsewhere do not exist here. **(a) No rate limit:** messaging is limited to 30/min through the `rate-limit` Edge Function, and provider appeals and barter reviews are idempotent per subject — reporting is neither, so N reports produce N live cases. **(b) No standing requirement:** `reported_user_id`, `reported_provider_id` and `booking_id` are validated by foreign key alone, never against the reporter's relationship to them, so a report may name a booking or a person the reporter has never transacted with. Neither is exploitable for data access; both are queue-flooding and fabricated-moderation-record vectors from a single ordinary account. **What makes this a question rather than a defect:** a safety report is exactly the thing you least want to throttle, and a standing requirement would refuse a bystander reporting content they saw in the feed. The right bound depends on whether The Book wants reports from people outside a transaction at all. **This entry records the gap; Session 8 added no limit and no standing check.**
- **CLOSED 2026-09-09 by PD-088** (Founder ruling, Session 8 final PM rulings). A bounded abuse
  control is required **before broad beta**: one open case per (reporter, target) pair with
  subsequent reports appended rather than opening new cases, plus a loose server-side rate limit
  (5/hour, 20/day per reporter). **No standing requirement** — a bystander must be able to report
  what they saw. PD-088 records the exact limits and why they are deliberately loose.
- **Blocks:** broad beta. **NOT IMPLEMENTED** — **assigned to Session 8C** (2026-09-10).
- **Status:** CLOSED — resolved by PD-088, 2026-09-09; implementation outstanding

### OQ-075 — Should someone you have blocked disappear from your feeds, or only be unable to reach you?
- **Area:** Discovery
- **Why it matters:** A block stops CONTACT — messages, booking requests, barter responses — and Session 8 deliberately stopped there. Neither the community feed nor the barter board filters out a blocked person's posts and offers, so a blocker keeps seeing them and can still tap Respond, which is refused. The refusal is terminal and correctly worded, but it points the reader at their **own** eligibility (the one thing true under both causes without naming a block), and for a blocker that is a false lead about themselves. Filtering the feed would fix it and is a bigger change than it looks: it is the difference between "you cannot reach me" and "you do not exist to me", it makes discovery results depend on viewer identity, and it interacts with PD-073's content-neutrality rule for the beta lanes. **This entry records the choice. Session 8 implemented neither, and the current behaviour is the smaller of the two.**
- **CLOSED 2026-09-09 by PD-089** (Founder ruling, Session 8 final PM rulings). Blocked users
  **disappear from each other's ordinary discovery, content and community surfaces**; only the
  narrow access required for existing booking or barter history, logistics, cancellation,
  completion or review is preserved. The larger of the two options, and the one Session 8 did not
  implement.
- **Blocks:** nothing shipped. **NOT IMPLEMENTED** — **assigned to Session 8C** (2026-09-10); not Session 8, and explicitly not Session 8B.
- **Status:** CLOSED — resolved by PD-089, 2026-09-09; implementation outstanding

### OQ-076 — PD-089's filtered views are diffable against their base tables. Is that the inference PD-087 permits, or the oracle it forbids?
- **Area:** Schema / data
- **Why it matters:** PD-089 was implemented as `SECURITY DEFINER` views returning already-filtered content, chosen by Founder ruling over an RLS policy precisely because the policy design would have required re-granting the per-target block predicate `20261055000000` removed. The ruling rested on a stated premise: *"there is no question to ask."* **That premise does not hold as shipped.** Each `_visible` view differs from its base table by the block predicate and nothing else, and the base table is readable by the same caller — `providers_public_read` is `USING (true)`. So two requests (`providers?id=eq.X` and `providers_visible?id=eq.X`) answer *"is there a block between me and X"* deterministically; combined with `iBlocked()`, which shows only the caller's OWN blocks, an absent row there means **they blocked me** — the one fact PD-082 says a person may never be told. **PD-087 excuses "inference from an error code by someone deliberately probing the API"; a clean set-difference is a stronger thing than an error code**, which is why this is filed rather than assumed settled. **Closing it is not a wording change.** Making the diff indistinguishable requires the base tables to stop being readable for the same rows — narrowing `providers_public_read` and routing every remaining read through a view — which touches bookings, threads, reviews and contracts and is materially larger than PD-089's scope. The alternatives: **(a)** accept it, and correct the "no question to ask" wording in PD-089, `20261064000000` and the ledger so the architecture is described truthfully; **(b)** require a second row-eliminating predicate in the views, which weakens but does not remove the signal; **(c)** narrow the base-table read policies, which is a separate slice. **This entry proposes none of them.**
- **CLOSED 2026-09-10 by PD-090** (Founder ruling). **Answer (a), with the reasoning made
  explicit:** The Book will not expose or build a block-status oracle, and inference by a
  technically sophisticated user comparing otherwise-authorized data is an **accepted limitation
  for the Houston closed beta** — not a blocker. The base-table read policies on bookings,
  threads, reviews and contracts are **deliberately NOT narrowed** to close it: that is a large,
  high-risk change to the most transaction-sensitive authorization surface in the product, traded
  against defeating a two-request diff run by someone who already suspects the answer. PD-087
  stands intact and PD-089 is not reopened. Revisit on safety, abuse, privacy, legal or broader
  launch grounds.
- **Status:** CLOSED — resolved by PD-090, 2026-09-10

### OQ-077 — What is the erasure and retention treatment for booking photos, contract evidence and booking records?
- **Area:** Schema / data
- **Why it matters:** Three artifacts now persist as transaction evidence and **none has a decided erasure story**, which is a different question from whether the rows cascade. **(a) `booking-photos` storage objects.** `booking_reference_photos` rows cascade from `bookings` and `auth.users`; **the objects in the bucket do not.** After a booking or an account is deleted, the bytes remain — readable by nobody (`can_read_booking_photo` returns false with no row, which is what makes an orphan harmless) but present, and they are client-supplied personal imagery. **(b) Historical contract evidence.** `contract_versions` is immutable and an accepted version cannot be deleted while the acceptance exists — deliberately, because that is the whole point of it. That directly conflicts with a deletion request that expects a contract's text to go. **(c) Booking records** generally, which carry service, date, message and now photos. **This entry deliberately proposes nothing.** Inventing a deletion or anonymisation timing here would be inventing policy with legal exposure attached, and the Founder ruling is explicit that it stays unresolved. It needs **Operations, legal and the account-deletion policy together**, and the three artifacts may well get different answers — evidence a counterparty may need to rely on is not the same as a photo the client attached for convenience.
- **Also recorded, because it is a limitation and not a defect:** acceptances that predate `20261068000000` are bound to the contract's content **at migration time**. If a provider edited between a client's acceptance and that migration, the original wording is gone — nothing recorded it. Those rows are the **best available historical record and are not proof of the exact original wording**, and support must not describe them as more than that.
- **Blocks:** nothing shipped. It blocks any claim about deletion, and it blocks answering a user who asks for their data to be removed.
- **Status:** Open

---

## Closed — index

**Closed questions are not moved.** An earlier version of this section said they would be, and
practice went the other way: every closed entry has stayed in its own area section, keeping its
full text, with the closure cited in its `Status`. That is what the preamble above requires, and
it is the better of the two conventions — a question read in its area is read next to the
questions it interacts with. This section is therefore an **index**, not a destination. It was
previously reading "None yet" while six questions were closed, which was the one thing it could
say that was false.

| Question | Closed | By |
|---|---|---|
| **OQ-001** — Is "open to trades" provider-level, service-level, or both? | 2026-09-04 | [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 2 — provider-level |
| **OQ-002** — Reciprocal bookings, or a parent trade agreement? | 2026-09-04 | [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) §§ 4, 6 — a parent trade agreement |
| **OQ-003** — What minimum terms must a trade capture for beta? | 2026-09-04 | [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) §§ 5, 6 |
| **OQ-004** — How should cancellation and no-show work for trades? | 2026-09-04 | **PD-046** ([BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 7) |
| **OQ-005** — How should barter interact with reviews and reputation? | 2026-09-04 | [BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 8 — not at all, in the first beta |
| **OQ-008** — May an offer's terms still be edited once providers have responded? | 2026-09-04 | **PD-047** ([BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 3.1) |
| **OQ-071** — How may a plain Needs Attention enter Under Review? | 2026-09-09 | **PD-072** — a **deliverer-initiated, explicit REQUEST**. None of the four forbidden resolutions was used. Implemented in Correction 3 (`0781f49`, PR #74): `20261039000000_barter_review_request.sql`, completed by `20261042000000`. **Nothing processes these beyond queueing them.** |
| **OQ-073** — Does PD-082 mean a block is never ANNOUNCED, or never DETERMINABLE? | 2026-09-09 | **PD-087** — reading (a). Never announced; **need not be undiscoverable**, and shadow-ban complexity must not be built merely to prevent inference. **Satisfied by current behaviour; no code change.** |
| **OQ-074** — What bounds report intake, now that a report creates operator work? | 2026-09-09 | **PD-088** — one open case per (reporter, target) pair, 5/hour and 20/day, **no standing requirement**. **Locked but NOT IMPLEMENTED**; required before broad beta, no home assigned. |
| **OQ-075** — Should someone you blocked disappear from your feeds, or only be unable to reach you? | 2026-09-09 | **PD-089** — they disappear from **ordinary** discovery, content and community surfaces; only the narrow access required for existing booking or barter history, logistics, cancellation, completion or review is preserved. **Locked but NOT IMPLEMENTED**, and explicitly not Session 8B. |

**Three of those four closures are decisions the product has not yet built**, and the index says so
in each row rather than letting "Closed" read as "done". A question is closed by a decision; the
decision is implemented, or not, on its own schedule. **OQ-072** (a booking carries a service DATE
but not always an authoritative appointment TIME) is **Open** and is deliberately not to be resolved
by implementation.

**RECORDED AS DELIBERATELY UNDECIDED, 2026-09-07 (Founder).** How a plain **Needs Attention**
later enters **Under Review** is NOT decided and was NOT implemented. No second timer, no
automatic escalation, no participant escalation action and no operator auto-escalation exists.
The routes that DO exist are: an unanswered receiver window expires to **Needs Attention**; an
explicit **no-show** enters **Under Review**; an explicit **`not_received`** enters **Under
Review** (PD-062). The escalation question will be settled with the adjudication / review
workflow. It is filed here rather than as a numbered OQ because it is a known gap in a decided
area, not an open product question anyone has asked — assign an OQ number if that is preferred.
**Still true on `main` @ `0f2b93c`, after PR #64, PR #65 and PR #66 merged**: the two escalation
shapes the slice
declined to invent — an automatic second timer, and a manual "send this to review" action needing
an actor nobody has defined — are recorded in the migration's own header
(`supabase/migrations/20261012000000_barter_no_show_under_review.sql:38-52`), and § 8 of that file
states the absences directly. **PR #66 did not change this**: it added no migration (the chain is
still 57 files, newest `20261018000000`) and no client escalation control — the negotiation
screen's obligation card still offers only Mark delivered, Confirm received, Didn't receive and
Report no-show (`app/community/negotiation/[id].tsx:643-695`), and `runObligationWrite` still
accepts exactly those four ops (`:376-404`). So **no timer, no automatic escalation, no participant
escalation action and no operator auto-escalation exists**, and the question stays UNRESOLVED and
deliberately undecided, for the adjudication slice — which is next, and is itself not yet built. **A second Founder ruling of the same date belongs beside it:** a
no-show **conversation / in-thread notice is DEFERRED**, to be decided with the adjudication /
review workflow. Neither is an open question anyone has filed; both are absences by decision.

Nothing here was closed by repository evidence. **OQ-006** and **OQ-007** remain Open, and
PD-049 … PD-061 closed no question in this ledger — they answered questions nobody had filed.
(PD-060 and PD-061 do close a **documentation gap** recorded under OQ-004's follow-on note, which
is a different thing from closing the question: OQ-004 was already Closed by PD-046 on
2026-09-04 and its status is unchanged.)
That includes the three rulings recorded on 2026-09-05 alongside PR #56 (`46c0bef`): **PD-057**
(the receiver-confirmation window anchor, implemented by PR #62), **PD-058** (`not_received` is immutable and is
a receiver statement, not a verdict) and **PD-059** (no receiver push notifications in this
pass; Trade Activity must surface an unanswered delivery before beta). None of them closes or
narrows an entry above — OQ-003's closure already recorded a 7-day receiver confirmation window
([BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 6), and PD-057 supplies the anchor that
closure did not state.

**PR #58 (`5b1a7a9`) closed no question here either, and did not reopen one.** It implements
**PD-046 § 7.2** — the pre-delivery cancellation regime that already closed **OQ-004** on
2026-09-04 — so OQ-004 stays Closed, cited to the decision rather than to the migration that
followed it. Two Founder rulings are cited in that PR's migration headers (the counterparty is
told, and the reason is shared with them:
`supabase/migrations/20261007000000_barter_cancellation_signal.sql:1-32`; the second notice must
state a fact rather than an agreement: `20261010000000_cancellation_notice_neutral_copy.sql:1-35`).
The reconciliation that wrote this paragraph recorded both as **undocumented rulings with no
`PD-NNN` entry**, and asked the Founder to close or dismiss the gap. **That gap is now closed and
this sentence is superseded:** PR #61 recorded them as **[PD-060](PRODUCT_DECISIONS.md)** (the
reason is participant-visible context, and the counterparty may get a durable best-effort
in-thread notice) and **[PD-061](PRODUCT_DECISIONS.md)** (the neutral mutual-cancellation
wording). See OQ-004's "Follow-on rulings (2026-09-06)" note above, which was updated at the time
while this index was not. Neither decision closes, narrows or reopens any entry here.

**PR #62 (`26fb7fd`) closed no question here either, and did not reopen one.** It implements
**PD-057** and the Trade Activity half of **PD-059**, both of which were already recorded as
locked decisions that close nothing in this ledger. Two further Founder rulings issued on that PR
— that agreement-level and obligation-level attention are different **scopes**, so the higher one
never suppresses the viewer's own live action; and that the surface scope for the slice is Trade
Activity plus the confirmed-trade detail, with the feed card and offer-responses screen deferred —
are recorded **inside PD-059**, because they refine an existing locked decision rather than
opening or settling a question. **A migration is an implementation, not an approval**, and nothing
in PR #62 closes an entry above by itself: **OQ-006** and **OQ-007** remain Open.

**PR #64 (`23df39c`) closed no question here either, and did not reopen one.** It implements
**PD-062** (no-show reporting, Under Review, the participant-visible reason) and **PD-063** (Under
Review outranks the ordinary exit), both recorded as locked decisions in
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md), and **neither closes, narrows or reopens an entry
above**. **OQ-004** stays Closed by PD-046 on 2026-09-04 — PD-062 supersedes the
`no-show → Needs Attention → adjudication → Unfulfilled` **route** described in
[BARTER_BETA_CONTRACT.md](BARTER_BETA_CONTRACT.md) § 7.4, which is marked superseded there, but it
does not disturb the question's closure or the decision that closed it. **OQ-006** and **OQ-007**
remain **Open**, for the reasons recorded on each. What PR #64 leaves undecided is recorded
immediately above rather than as a new numbered entry, because no one has filed it as a question.

**Correction 3 (`0781f49`, PR #74) and Session 8 (`e5b9125`, PR #76) both closed questions here,
and both opened one — which is the first time in this ledger's history that a slice has done more
than implement a decision made elsewhere.** Correction 3 closed **OQ-071** by PD-072 and opened
**OQ-072**. Session 8 opened **OQ-073**, **OQ-074** and **OQ-075** as questions it deliberately
declined to answer in code, and the Founder then closed all three on the finished branch as
PD-087, PD-088 and PD-089. The same rulings **amended PD-068 to PARTIALLY SATISFIED**, which
**opens no question**: PD-068 was never in doubt, only unfinished.

**Nothing in either merge closed a question by repository evidence**, and the rule that produced
this ledger is unchanged: a migration is an implementation, not an approval. **OQ-006**, **OQ-007**,
**OQ-011**, **OQ-036**, **OQ-070** and **OQ-072** remain **Open**. Neither PD-088 nor PD-089 has an
implementation, and neither may be read as shipped because its question is marked closed.
