# Booking & Onboarding Integrity — Operations handoff

**Status:** Authoritative for the branch `feat/booking-onboarding-integrity`.
**Anchor:** `main` @ `0b1f563` plus that branch. **Not merged.**

This is the document Business Operations asked for. It states what the system
enforces, what it retains, what it says to users, and what it does NOT do — with
the limitations in the same place as the capabilities, because an operations
handoff that only lists capabilities is how support ends up promising things.

---

## 1. Minimum bookable-provider rules

Three layers, and they are deliberately different. Conflating them is how a
provider gets refused during onboarding for something they could fix later, or
how a client gets sent to an empty calendar.

### Blocks GO LIVE (system-enforced, unchanged this session)
| Field | Why |
|---|---|
| Profile basics (name) | Clients see it on every card and request |
| Profile photo | Enforced at Go Live |
| **At least one active service** | A client picks a service to request a booking |

Nothing else blocks Go Live. Onboarding stays minimal by decision (Item Y).

### Blocks NORMAL BOOKING — profile stays fully visible
Enforced by `public.provider_is_bookable(provider_id)`, which the profile reads
to decide whether to present **Book Now**:

| Condition | Effect |
|---|---|
| `is_approved = false` | Book Now withdrawn (pre-existing, item H / PD-076) |
| **No available slot in weekly availability** | Book Now withdrawn (**new this session**) |
| No active service | Book Now withdrawn |

A provider in this state keeps their profile, portfolio, reviews, message
control and **every existing booking**. Only the one control that would lead to
an empty calendar is removed. **This is not a Go Live gate** — a provider between
schedules is not someone to refuse.

**The availability test is "is there any open day at all" and nothing stricter.**
No minimum hours, no minimum days, no advance-notice rule. Anything more would be
inventing policy.

### OPTIONAL — blocks nothing, ever
Portfolio, Reels, analytics, payouts. **Not required for onboarding completion,
not required for Go Live, not a ranking input.** A B5B assertion pins that a
provider with no media is still bookable, so this survives someone's good
intentions later.

---

## 2. Contract acceptance behaviour

### What is retained
| Field | Source |
|---|---|
| Booking identity | `contract_signatures.booking_id` |
| Client identity | `contract_signatures.client_user_id` |
| Provider identity | via the booking's `provider_id` |
| **Exact document accepted** | `contract_versions` row — title, body, type, `pdf_url`, `pdf_filename`, frozen |
| Acceptance timestamp | `contract_signatures.signed_at` |
| Durable status | `contract_signatures.status = 'signed'` |

### Version behaviour
- A version is created when contract **content** changes. Toggling `is_active` or
  touching `updated_at` does **not** create one.
- Versions are **immutable**: no UPDATE by anyone; DELETE only by `service_role`
  or a no-claims session, so account erasure still cascades.
- An acceptance's version binding is immutable once set.
- **A provider may edit their contract freely.** Editing creates a new version and
  changes nothing about past acceptances.

### Who can revisit, and what they see
`booking_contract_record(booking_id)` — readable by **both** the client who
accepted and the provider whose contract it is, and by nobody else. It returns the
accepted version's text/PDF, the acceptance timestamp, and
`provider_contract_changed_since`, so a surface can say the provider has since
changed their agreement instead of leaving two people to compare documents.

### What this is NOT — and support must not say otherwise
- **Not** DocuSign-equivalent infrastructure.
- **Not** a verified legal e-signature.
- **Not** a guarantee of enforceability.
- **Not** proof the client read every word. The product records that the document
  was opened, which version was accepted, and when.

### One honest limitation in the backfill
Acceptances that existed before this session were bound to **version 1 holding the
contract's content at migration time**. If a provider edited their contract
between a client's acceptance and the migration, the original wording is **gone** —
nothing recorded it. For any dispute about a booking made before this session,
treat the stored version as the best available record, not as proof of what was on
screen.

---

## 3. Booking-expiry behaviour

Unchanged this session and verified as already correct.

- **Response window:** server-authoritative, `LEAST(submitted_at + 72h, appointment_time)`.
- **Appointment sooner:** the practical window shortens to the appointment.
- **Display:** provider and client both read the server's `expires_at`. The old
  client-side `created_at + 24 hours` rule is gone from both sides.
- **After expiry:** the provider cannot accept (`PT425`); the request is shown as
  expired rather than silently disappearing.
- **History:** expired requests are retained, not deleted.

**Still open — OQ-072**, unchanged: what the window should be when a booking has a
service date but no authoritative appointment time. Not resolved here, and not
guessed at.

---

## 4. Customer-facing copy (current, approved)

| Topic | What the product says |
|---|---|
| **Payments** | In-app payments aren't available during beta. Payment is handled directly with your provider. No charge, no deposit, no hold, no payment protection. |
| **Verification** | "Houston Beta Provider" — a fact about admission to the beta. No identity, background or government-ID verification exists or is claimed. |
| **Support** | No "Contact Support" control, because the only support entry is a stub. A de-approved provider has **Request review**, which opens a real operator case. |
| **Safety** | Block and Report exist on profiles and in threads. Reports are recorded and sent to The Book. **No timeframe is promised.** |
| **Contracts** | The Book records that you opened the agreement, which version you accepted, and when. It does not verify you read every word and is not a witnessed or legally certified signature. |
| **Expiry** | The provider has up to 72 hours to respond, or until the appointment if sooner. No notification channel is promised. |
| **Provider approval** | A de-approved provider is told their business is not currently available for new bookings, with no implication of an identity-verification failure. |

---

## 5. Known beta limitations

1. **No in-app payment of any kind.** No charge, deposit, hold, refund or payment protection.
2. **No third-party identity verification.**
3. **No notification channel** — no push, email or SMS. Nothing tells a user their report, appeal or request was looked at.
4. **No SLA anywhere**, and nothing dequeues an operator case except a person.
5. **Contract acceptance is durable but not legally certified** (§ 2).
6. **Pre-session acceptances may not reflect the original wording** (§ 2). They are the
   **best available historical record, not proof of the exact original wording** — support must
   not describe them as more.
10. **Erasure and retention are UNDECIDED** for booking photos, historical contract evidence and
   booking records (**OQ-077**). Photo rows cascade; storage objects do not. An accepted contract
   version cannot be deleted while the acceptance exists, which conflicts with a deletion request
   that expects the text to go. **Support must not promise deletion of any of these**, and the
   three may well get different answers.
7. **A block is inferable** by a determined user comparing otherwise-authorized data — accepted for closed beta (PD-090).
8. **Client media does not exist.** No client photos, videos or reels.
9. **OQ-072 open** — booking expiry with no authoritative appointment time.

---

## 6. Physical-device QA still owed

**Nothing below has been observed on a device. No automated result may be read as having observed it.**

| Case | What to check |
|---|---|
| Booking end to end | Discover → profile → service → date/time → message → photos → policy → contract → accept → send. Confirm the request appears for the provider. |
| Contract, PDF | The PDF opens, and revisiting an accepted booking reopens the **accepted** version after the provider edits their contract. |
| Reference photos | Three attach, the provider sees them before deciding, and a failed upload produces the partial-attach message rather than a silent loss. |
| Small screen + keyboard | `ReportSheet` with the 9-reason list; the booking contract screen; the operator case screen. |
| Provider onboarding | Go Live with no portfolio and no reels; confirm neither blocks. |
| Bookability | A provider with a service but no availability must not present Book Now. |

---

## 7. Failure states — what support should say

| Failure | What the user sees | What it means | What support should do |
|---|---|---|---|
| Contract fails to load | "We could not start this request" | The draft could not be created or read | Ask them to start a new request with that provider. Nothing was sent. |
| Acceptance fails to save | "We could not save your contract signature, so your request has not been sent yet" | The acceptance write failed; the booking is still a draft | Tell them to tap Send again. **Nothing was sent twice** — the draft is resumed, not duplicated. |
| Photo upload fails | "Some photos were not attached" | The request **was** sent; some files did not upload | Tell them the provider can see the ones that did, and to describe the rest in a message. Do not tell them to re-send the request. |
| Request expired | Expired state on both sides | The 72-hour window (or the appointment) passed | The provider cannot accept. A new request is the only path. History is retained. |
| Provider no longer bookable | "Not currently available for new bookings" | De-approved **or** no availability configured | Both look identical to the client, deliberately. For a provider asking why: check approval first, then whether they have any hours set. |
| Agreement changed mid-booking | "This provider updated their agreement while you were booking" | The provider edited between the client opening the agreement and accepting it | **The request was NOT sent.** They must review the current agreement and accept it again. Their earlier bookings still point at the version they accepted then. |
| Photo removal after sending | No control exists in the app | **The whole SET settles when the request is sent** — rows and storage objects, additions and removals alike | Nothing is wrong. They can mention anything that changed in a message. **Do not promise removal**, and note this is about the request record, not about account deletion (OQ-077). |
| Duplicate/retry | Nothing visible | One intent = one request; drafts are resumed | **A retry never creates a second request.** If a client believes they sent two, they did not. |
| Report rate-limited | "Too many reports just now" | 5/hour or 20/day reached | Their text is preserved on screen. If it is urgent, direct them to emergency services — The Book is not an emergency channel. |

---

## 8. New human operational obligations created

1. **The operator Review Queue must be worked by a person.** Reports, provider
   appeals and barter review requests all open real cases. Nothing dequeues them
   automatically, there is no SLA, and no channel tells a waiting user anything.
   A case with no operator stays open indefinitely.
2. **Provider eligibility changes are an operator act** with a recorded actor.
3. **Contract disputes now have evidence** — and Operations should know its limits
   (§ 2), particularly for bookings predating this session.
