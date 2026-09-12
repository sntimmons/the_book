# Account erasure and retention — Operations and support note

**Status:** Authoritative for the branch `feat/account-erasure-retention-integrity`. **Not merged.**
**Anchor:** `main` @ `fc14fe5` plus that branch.
**Policy:** **PD-102** (closed-beta retention), **PD-103** (OQ-077 technical fixes).

Written for whoever answers *"delete my account"*, *"I changed my mind"*, *"why do
you still have my contract"*, and *"the deletion failed"*. Limits sit beside
behaviour, because a support note that lists only what works is how people get
promised things.

> **NO LEGAL CLAIM IS MADE IN THIS DOCUMENT.** Nothing here asserts legal
> enforceability, statutory compliance, or that any retention period is legally
> required. Two classes are **interim closed-beta policy pending attorney
> review** and are flagged every time they appear.

---

## 1. The user's flow, exactly

**Settings → Account → Delete Account.** Self-service, in the app. **A user must
never be told that emailing support is the only way to delete their account.**

1. The screen states, in three labelled groups, what is **deleted permanently**,
   what is **kept with the name removed**, and what is **kept as a record**.
2. It lists any **unresolved bookings or trade obligations** — and does **not**
   block on them. They stay resolvable afterwards.
3. Confirmation is two things: a **recent sign-in** (a token issued in the last
   15 minutes; if theirs is older the screen asks for their password) and typing
   **DELETE**.
4. On submit, a **verified deletion request** is created. Nothing is erased yet.
5. The screen then shows the **scheduled permanent-deletion date** and a
   **Restore my account** button, and says what is already true of the account.

**Pressing the button twice does nothing twice.** The request is idempotent.

### What becomes true immediately, before any grace period elapses

- Account inactive; **profile hidden** from Discover, search, Community, Reels
  and every feed.
- **No new** bookings, messages, posts, reviews, Community activity, barter
  offers or responses. Refused with `PT440`.
- **The provider cannot be booked** — a client sees the ordinary *"not currently
  available"* message, deliberately: a distinct error would tell a stranger that
  this person is deleting their account.
- **Portfolio, Reels, captions and Community content leave public access.**
- Sessions: **revoked at final deletion**, when the auth row and its refresh
  tokens go. See § 7 for the honest limit during the grace period.

### What deliberately stays usable

**Existing bookings and trade obligations remain visible and resolvable by both
sides.** An erasure that strands a counterparty mid-transaction is a worse
outcome than one that waits, and **an erasure cannot be used to walk away from an
active dispute** — reports, evidence and adjudicated outcomes are retained.

---

## 2. Restoration

**Any time before the scheduled date**, from the same screen. One tap.

- The account comes back **as it was**: same identity, same profile, same
  bookings, discoverable again, able to post again.
- **No duplicate account or profile row is created.** Restoration cancels the
  request; deactivation was derived from it and lifts by itself.
- **Only the owner can restore.** The function takes no account id, so there is
  no way to name somebody else's.
- Once the job has started **finalising**, restore is refused (`PT445`) — several
  steps are irreversible and a half-restored account is worse than an honest no.
- **After final deletion, restoration is impossible.** If the person signs up
  again later it is a **new account**; none of the anonymized history reconnects,
  and it cannot — the pseudonym on those rows is not an account id and no signup
  can be issued it.

---

## 3. The retention windows — and where they live

**Every one is a row in `public.retention_policy`.** Read it rather than quoting
this table from memory; the engine, the app and this document all read the same
row.

| Key | Value | Notes |
|---|---|---|
| `account_grace_period` | **30 days** | Request → permanent deletion |
| `booking_photos` | **90 days** | From booking completion/cancellation |
| `messages` | **180 days** | From conversation/booking close |
| `operator_audit` | **1460 days (4 years)** | Append-only |
| `provider_content` | **30 days** | Tracks the grace period |
| `community_content` | **30 days** | Tracks the grace period |
| `accepted_contracts` | **not set** | **INTERIM — PENDING ATTORNEY REVIEW** |
| `reports_evidence` | **not set** | **INTERIM — PENDING ATTORNEY REVIEW** |

**"Not set" does not mean forever and does not mean zero.** It means no period has
been decided. The engine retains the class under interim policy and refuses to
invent a number. **Do not tell a user a duration for these two.**

### The later-of rule

Booking photos and messages have their own clocks. When an account is deleted the
effective date is the **later of** the class window and the grace-period end. A
photo does not outlive its own clock because an account was deleted, and it does
not die early either.

---

## 4. What is deleted, anonymized, and retained

**Deleted permanently** (at grace end): sign-in credentials, contact details,
profile fields, device tokens, profile media, portfolio/Reels/captions, Community
posts and replies, saved providers, follows, likes, bookmarks, care reminders,
rate-limit history, blocks. Analytics identity is severed.

**Anonymized — kept, name removed, shows as "Former member"**: bookings (status,
service snapshot and timestamps kept; the client's own message and safety notes
removed), reviews (rating, text and transaction linkage kept), barter history
(terms, status, fulfilment outcome and operator decisions kept), messages
(identity severed at once, content on its own clock).

**Retained as a record, restricted access**: accepted contracts and report/safety
evidence (**both INTERIM, pending attorney review**), and the operator audit
trail (4 years).

**Anonymization is not a renaming.** The ordinary link back to the account is
broken: the account row is gone, the profile row is gone, and the id on the
retained rows resolves to no account and no profile.

---

## 5. Support scripts

### Someone asks to delete their account
> *"You can do it yourself in Settings → Account → Delete Account. Your account
> goes inactive straight away and is permanently deleted 30 days later, and you
> can restore it any time in those 30 days. The screen tells you exactly what is
> deleted, what stays with your name removed, and what we keep as a record."*

Do **not** offer to do it for them as the primary path. Do **not** promise an
email confirmation — there isn't one (§ 7).

### Someone wants to restore
> *"Open Settings → Account → Delete Account and tap Restore my account. It has
> to be before the date shown there."*

If the date has passed, or they say they cannot sign in: **their account is
gone.** Say so plainly. **Do not imply it can be recovered.** They may sign up
again, and it will be a new account with none of the old history.

### What a departing provider stops showing

At the request, and not only in the feed: their profile, portfolio, Reels, Reel
comments, Community content, **service menu, working hours, cancellation and deposit
policies, and blocked dates** all leave public access. At finalisation all of it is
deleted along with the business settings and the follower list. The `providers` row
itself is kept, emptied and ownerless, because bookings point at it — so a client's
booking history stays readable and still says what was booked.

### Looking up somebody who is leaving

**A departing or erased provider will not appear when you search the app as an
ordinary account.** That is deliberate (PD-104): their row leaves public access at
the request, and stays visible only to them, to an operator, and to a client who
already has a booking or a conversation with them. Use the operator surface, not
an ordinary session, and do not tell a user "they don't exist" when what is true
is that they are no longer visible.

### A deletion job failed
Symptoms: the request sits in `failed`, or a user says their account still
appears somewhere after the date.

1. Read `account_deletion_requests` for the subject: `status`, `last_error`,
   `attempts`.
2. Read `account_deletion_steps` for that request: any row not `completed` shows
   its `status` and `last_error`.
3. **The fix is to run the sweep again** — `select public.sweep_account_deletions();`
   as `service_role`. Every step is idempotent; completed steps no-op and only
   what is left runs, **and a failed purge is retried** rather than left behind.
4. **`select * from public.overdue_account_deletion_work();`** (service_role) is
   the one query that answers "is anything being retained longer than it should
   be". It returns two kinds of row: **any request past its grace date that nothing
   has finalised** — the row reads `(request never finalised)`, and this is the
   case that matters most, because there is no scheduler — and **any step that is
   failed, held, or past due**, with its error. Nothing else surfaces either: no
   client role can read these tables, so this query belongs in the same routine as
   the sweep.
5. A step in `held` is **not** a failure — see § 6.
6. A step in `scheduled` is **not** a failure — it is dated future work (§ 3).

**Tell the user only that it is being completed, and never a date you have not
confirmed.** Do not say "it's done" while any step is outstanding.

### Someone asks why you still have their contract or a report about them
> *"When you accept a provider's terms we keep the exact version you accepted and
> when you accepted it, and we keep safety reports and their outcomes. Those are
> kept as records — they aren't visible on any profile and only The Book can see
> them. We're finishing our legal review of how long we keep them, so I can't give
> you a length of time yet."*

**Do not** say it is legally required. **Do not** give a duration. **Do not**
describe the contract record as a legal signature.

### Someone asks whether deleting removes their reviews
> *"The reviews you wrote stay, because they're part of the provider's honest
> record — but your name comes off them and they show as 'Former member'."*

---

## 6. Holds

An operator can place a **hold on one class** of a specific request
(`account_deletion_holds`) when a legal or safety matter needs that class kept.

- The engine **skips the held class and finishes everything else.** The profile,
  the credentials and the contact details still go.
- **A hold never keeps the whole account alive.** That is the point of it being
  per-class: one open report must not be a reason to keep somebody's profile
  photo.
- Every hold records who placed it and why. **Release it with
  `select public.release_account_deletion_hold('<hold id>');`** as `service_role` —
  that marks it released, puts the held steps back in the queue, and returns the
  request to a state the sweep picks up, so the next sweep finishes the work. Until
  this function existed the note promised holds could be released and nothing in
  the schema ever wrote `released_at`.
- **An open hold stops the matching purge as well as the matching sever.** A hold on
  `messages` or `booking_photos` now blocks that class's delayed purge too.
- **A step can also be held without anyone placing a hold**: if a class's retention
  window is unset, the engine holds that step with the reason rather than guessing
  a number or silently skipping it. `overdue_account_deletion_work()` lists these.
  Today the only two unset windows are the ones awaiting counsel (§ 8), and neither
  has an automated purge, so this is a safeguard rather than a live state.

---

## 7. Known limitations — read these before answering anyone

- **There is no scheduler.** `sweep_account_deletions()` is run by a **person**.
  Nothing finalises automatically when a grace period ends. **This is the single
  biggest operational obligation this feature creates** (§ 9).
- **There is no email or push confirmation**, of the request or of completion.
  The app records the request durably and shows its status on the screen, and the
  screen says so in as many words. **Never tell a user a notification was sent.**
- **Media bytes cannot be deleted from the database.** Supabase requires the
  Storage API, so objects are queued in `pending_media_deletions` and an
  **operator must delete them through the Storage API and then call
  `confirm_media_deleted`**. Until every object is confirmed, the request cannot
  reach `completed` — which is deliberate: an erasure must not report success with
  the bytes still in the bucket.
- **Access tokens during the grace period.** Refresh tokens die with the auth row
  at final deletion, so a session cannot be renewed afterwards. During the grace
  period an already-issued access token keeps working until it expires — but the
  account is already inactive, so it can **read** and **resolve existing
  transactions** and cannot start anything new.
- **A client author is not told when their Community post was hidden** (from the
  moderation work) — unrelated to erasure, but the same screen gap.
- **Backups.** Deleted data may persist in provider-managed backups until those
  backups age out. **The current infrastructure does not expose a retention or
  expiry window for them**, so this document states no number. Getting one is a
  read-only question for whoever administers the Supabase project; **do not quote
  a figure to a user until it is established.** Live deleted data is never
  restored from a backup as part of any supported flow.
- **Physical-device QA is owed** for the whole flow: the disclosure, the
  reauthentication prompt, the scheduled-date display and the restore path have
  not been exercised on a real device.

---

## 8. For legal review

Four items, none of which engineering should answer:

1. **Accepted-contract retention duration** (`retention_policy.accepted_contracts`,
   currently unset).
2. **Report / safety evidence retention duration**
   (`retention_policy.reports_evidence`, currently unset).
3. **Privacy policy language** describing deletion, anonymization and retention.
4. **Beta FAQ language**, including what to say about the two interim classes.

Tracked as **OQ-084**. The product currently describes all of this in plain
operational terms and explicitly calls the two classes interim — truthful, and
not a substitute for a policy document.

---

## 9. New human operational obligation

**Someone has to run the sweep.** `select public.sweep_account_deletions();` as
`service_role`, on a regular cadence. It finalises every request whose grace
period has ended and runs every purge that has come due, and it is safe to run
repeatedly. **Nothing else will do it.** A request whose grace period passed and
whose sweep never ran is an account that was promised deletion and did not get it.

**Someone has to drain the media queue.** Read `pending_media_deletions` where
`deleted_at is null`, delete each object through the Storage API, and call
`confirm_media_deleted(bucket, path)`. Until that is done the deletion is not
complete, and the system correctly refuses to say it is.

**Someone has to work held classes.** A hold is a decision to keep something; it
needs revisiting and releasing, or it becomes an indefinite retention nobody
chose.

**Support must not promise a completion they have not checked.** The state is in
`account_deletion_requests` and `account_deletion_steps`, and it is the only
answer.
