# Open Questions

**Status:** Authoritative for what is **undecided**. Maintained by the Project State Steward.
**Reconciled against:** `main` @ `feba568a900401e3e8dffc560ea5e214cb9be38c` (2026-09-04)
**Last edited by:** PR #40

> **`Reconciled against:` is not the tip of `main`.** It is the last commit at which the
> repository facts asserted in this document were verified. A documentation-only merge that
> changes no repository, product, runtime or security fact does **not** advance it — so this
> anchor may legitimately sit behind `main`. `Last edited by:` records the documentation
> mutation separately, as a PR number, because a PR number exists before merge and a merge
> SHA does not: a document can never truthfully cite the commit that lands it.

Everything here is genuinely unresolved. A question is **closed by a decision**, cited to
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) — never by someone implementing one answer, and
never by deletion. Repository code that happens to behave one way does not close a question.

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
- **Status:** Open

### OQ-002 — What is the correct transaction model: reciprocal bookings, or a parent trade agreement?
- **Area:** Barter
- **Why it matters:** Two bookings that reference each other vs one agreement that spawns two obligations. Affects cancellation, completion, reviews, and what "half-done" means.
- **Blocks:** Session 5.
- **Status:** Open

### OQ-003 — What minimum terms must a trade capture for beta?
- **Area:** Barter
- **Why it matters:** Too little invites disputes; too much becomes a contract engine nobody fills in.
- **Blocks:** Session 5 — [ROADMAP.md](ROADMAP.md) sequences OQ-001 … OQ-006 there.
- **Status:** Open

### OQ-004 — How should cancellation and no-show work for trades?
- **Area:** Barter
- **Why it matters:** One side may deliver before the other. A no-show on the second leg is materially different from one on a paid booking. Interacts with PD-026 and PD-027.
- **Blocks:** Session 5 — [ROADMAP.md](ROADMAP.md) sequences OQ-001 … OQ-006 there.
- **Status:** Open

### OQ-005 — How should barter interact with reviews and reputation?
- **Area:** Barter
- **Why it matters:** Whether a trade produces the same review opportunity as a paid booking, and whether trade-derived reputation is distinguishable.
- **Blocks:** Session 5 — [ROADMAP.md](ROADMAP.md) sequences OQ-001 … OQ-006 there.
- **Status:** Open

### OQ-006 — How do we reduce collusion and reciprocal-rating gaming?
- **Area:** Barter
- **Why it matters:** Two providers can trade repeatedly and inflate each other's reputation. Blind reveal (PD-022) helps but does not solve repeat collusion.
- **Blocks:** Session 5 — [ROADMAP.md](ROADMAP.md) sequences OQ-001 … OQ-006 there.
- **Status:** Open

### OQ-007 — What in the existing barter implementation is usable, salvageable, or needs bounded rebuilding?
- **Area:** Barter
- **Why it matters:** `barter_offers` / `barter_interests`, `lib/barter.ts` and the community screens already exist. Redesigning without auditing them wastes working code.
- **Blocks:** Session 5. The Session 4 audit **was performed** — cited at
  `supabase/migrations/20260906000000_barter_integrity_slice1.sql:9`, and Slice 1 acted on its
  findings — but it committed no document to this repository, so its answer is not on `main`.
  An audit would not close this question in any case; only a cited `PD-NNN` does.
- **Status:** Open

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
- **Status:** Open

---

## Messaging

### OQ-010 — What are the rules for provider- or community-initiated contact?
- **Area:** Messaging
- **Why it matters:** Today the client sends the first request. Whether a provider may initiate — and under what anti-spam limits — is undefined.
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
- **Why it matters:** PD-005 locks that a specialist third party performs government-ID verification and that The Book avoids storing raw documents — but no vendor is selected, and what a verified badge is allowed to *claim* is undefined. `BETA_SCOPE.md` flags this as PRODUCT DECISION REQUIRED. *(Previously filed under `## Payments` with an `Area` of "Houston Beta / Identity"; relocated to its declared area on 2026-09-03. Identity/verification remains the specific subject — only the filing changed.)*
- **Blocks:** any hard verification gate (PD-004 keeps beta messaging educational).
- **Status:** Open

### OQ-036 — Is the "14-day to verify" copy an approved policy?
- **Area:** Houston Beta
- **Why it matters:** `BETA_SCOPE.md` explicitly flags this copy as a **placeholder, not an approved product policy**, yet it is user-visible wording that reads as a commitment. It ships today at `app/onboarding/provider/golive.tsx:507` ("Complete verification within 14 days of going live.") — in **provider go-live onboarding**, which is why `USER_JOURNEYS.md` can correctly say the copy is not used by the booking gate without that meaning it is unshipped. *(Previously filed under `## Payments`; relocated to its declared area on 2026-09-03.)*
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

---

## Closed

None yet. When a decision closes a question, it moves here with its `PD-NNN` and date —
the question text is kept, not deleted.
