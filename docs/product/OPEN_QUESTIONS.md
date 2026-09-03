# Open Questions

**Status:** Authoritative for what is **undecided**. Maintained by the Project State Steward.

Everything here is genuinely unresolved. A question is **closed by a decision**, cited to
[PRODUCT_DECISIONS.md](PRODUCT_DECISIONS.md) — never by someone implementing one answer, and
never by deletion. Repository code that happens to behave one way does not close a question.

---

## Barter

### OQ-001 — Is "open to trades" provider-level, service-level, or both?
- **Why it matters:** Determines the data model and how discovery filters work. Provider-level is simpler; service-level is more honest (a stylist may trade a haircut but not a full colour).
- **Blocks:** Session 5 barter decisions.
- **Status:** Open

### OQ-002 — What is the correct transaction model: reciprocal bookings, or a parent trade agreement?
- **Why it matters:** Two bookings that reference each other vs one agreement that spawns two obligations. Affects cancellation, completion, reviews, and what "half-done" means.
- **Blocks:** Session 5.
- **Status:** Open

### OQ-003 — What minimum terms must a trade capture for beta?
- **Why it matters:** Too little invites disputes; too much becomes a contract engine nobody fills in.
- **Status:** Open

### OQ-004 — How should cancellation and no-show work for trades?
- **Why it matters:** One side may deliver before the other. A no-show on the second leg is materially different from one on a paid booking. Interacts with PD-026 and PD-027.
- **Status:** Open

### OQ-005 — How should barter interact with reviews and reputation?
- **Why it matters:** Whether a trade produces the same review opportunity as a paid booking, and whether trade-derived reputation is distinguishable.
- **Status:** Open

### OQ-006 — How do we reduce collusion and reciprocal-rating gaming?
- **Why it matters:** Two providers can trade repeatedly and inflate each other's reputation. Blind reveal (PD-022) helps but does not solve repeat collusion.
- **Status:** Open

### OQ-007 — What in the existing barter implementation is usable, salvageable, or needs bounded rebuilding?
- **Why it matters:** `barter_offers` / `barter_interests`, `lib/barter.ts` and the community screens already exist. Redesigning without auditing them wastes working code.
- **Blocks:** Session 5 — answered by the Session 4 read-only audit.
- **Status:** Open

---

## Messaging

### OQ-010 — What are the rules for provider- or community-initiated contact?
- **Why it matters:** Today the client sends the first request. Whether a provider may initiate — and under what anti-spam limits — is undefined.
- **Status:** Open

### OQ-011 — What is the Requests sent/received UX?
- **Correction (2026-09-03):** an earlier draft of this question claimed pending requests had no dedicated surface. That is **false on `main`** — `app/(tabs)/messages.tsx` renders a Requests filter with a live count, covering both incoming (provider) and sent (client) pending requests, and `USER_JOURNEYS.md` documents it. The premise was wrong; the question is narrowed rather than closed, because repository evidence alone must not close a question.
- **What actually remains open:** the Requests list does not distinguish sent from received within itself, and a `declined` request is `hidden` from the active lists (`lib/messageRequests.ts`) with no surface showing it — so a client has no view of a request that was turned down.
- **Why it matters:** a request that silently disappears is indistinguishable from one never sent.
- **Status:** Open (narrowed)

### OQ-012 — Are there remaining realtime deployment/config requirements?
- **Why it matters:** Realtime publication membership is a deployment concern that repository code cannot prove.
- **Status:** Open

---

## Safety

### OQ-020 — What is the address-disclosure model for home-based and house-call services?
- **Why it matters:** The highest-risk surface in the product. When an address is revealed, to whom, and after what gate.
- **Blocks:** Session 8.
- **Status:** Open

### OQ-021 — Do we need masked communications?
- **Status:** Open

### OQ-022 — Do we need check-in / check-out?
- **Status:** Open

### OQ-023 — Trusted contact and location sharing?
- **Status:** Open

### OQ-024 — What is the incident reporting model beyond the current `reports` table?
- **Why it matters:** `app/post-booking/issue.tsx` writes reports; triage, response and escalation are undefined.
- **Status:** Open

### OQ-025 — What are the restriction and escalation operations?
- **Why it matters:** No defined path from repeated reports to account restriction.
- **Status:** Open

### OQ-026 — What evidence preservation is required?
- **Status:** Open

---

## Payments

### OQ-040 — Which processor?
### OQ-041 — What is the fee structure, and who pays it?
### OQ-042 — Deposits vs final charges?
### OQ-043 — Payouts and refunds?
### OQ-044 — Cancellation, disputes, chargebacks?
### OQ-045 — What is the support model for money problems?
### OQ-046 — What defines controlled-pilot readiness?

- **Why they matter:** Payments carry the heaviest compliance, fraud and support burden in the product. PD-042 locks that they come after the beta; none of the mechanics are decided.
- **Blocks:** the payments readiness programme.
- **Status:** All open

---

### OQ-035 — Which identity-verification vendor, and which trust claims may each level display?
- **Area:** Houston Beta / Identity
- **Why it matters:** PD-005 locks that a specialist third party performs government-ID verification and that The Book avoids storing raw documents — but no vendor is selected, and what a verified badge is allowed to *claim* is undefined. `BETA_SCOPE.md` flags this as PRODUCT DECISION REQUIRED.
- **Blocks:** any hard verification gate (PD-004 keeps beta messaging educational).
- **Status:** Open

### OQ-036 — Is the "14-day to verify" copy an approved policy?
- **Area:** Houston Beta / Identity
- **Why it matters:** `BETA_SCOPE.md` explicitly flags this copy as a **placeholder, not an approved product policy**, yet it is user-visible wording that reads as a commitment.
- **Status:** Open

---

## Contracts

### OQ-050 — What templates are needed?
### OQ-051 — What legal wording, and reviewed by whom?
### OQ-052 — What is the signature artifact?
### OQ-053 — Which categories require a contract at all?

- **Why they matter:** Contract storage and signature paths exist in the schema; the product rules around them do not.
- **Status:** All open

---

## Houston beta

### OQ-030 — What is the exact provider-category mix?
- **Why it matters:** Cohort composition determines whether natural client/service/trade relationships form. [HOUSTON_BETA_STRATEGY.md](HOUSTON_BETA_STRATEGY.md) describes the *shape* (interlocking, overlapping needs) but the specific first categories are not locked.
- **Unresolved tension to settle here:** `BETA_SCOPE.md` says the initial launch covers "~**top 15**" categories. The strategy doc argues for density against a 20+ user floor — 15 categories across 20 people is ~1.3 per category, which is the scatter it warns against. These may be describing different things (launch-market breadth vs beta-cohort composition), but nothing states which. **Do not resolve by inference.**
- **Status:** Open

### OQ-031 — What is the exact cohort size and composition?
- **Why it matters:** PD/founder floor is 20+ real users with both sides represented; the provider:client ratio and per-category counts are not set.
- **Status:** Open

### OQ-032 — What is the recruitment approach?
- **Status:** Open

### OQ-033 — What is the concierge/manual support model during beta?
- **Status:** Open

### OQ-034 — What activation and retention thresholds beyond the minimum success criteria?
- **Why it matters:** The minimum floor is defined; what "working well" looks like is not.
- **Status:** Open

---

## Reviews

### OQ-060 — Should the review form's optional chips and heading be neutralised for a low rating?
- **Why it matters:** All chips are currently positive ("Great results", "On time") under "WHAT STOOD OUT?". Submission never requires them (PD-023), so this is framing, not gating. Adding negative/mixed vocabulary would be Phase 2 work (PD-028).
- **Evidence:** raised by the QA reviewer during PR #26.
- **Status:** Open

### OQ-061 — Should a client who files a report be told their review is still open?
- **Why it matters:** Reporting and reviewing are deliberately separate (PD-025); a client who reports may not realise the review opportunity survives.
- **Status:** Open

### OQ-062 — Should a client have a persistent review entry on the booking detail screen?
- **Why it matters:** Providers have one; clients reach reviews from the bookings list and notifications only.
- **Status:** Open

---

## Closed

None yet. When a decision closes a question, it moves here with its `PD-NNN` and date —
the question text is kept, not deleted.
