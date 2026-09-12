# Account erasure and retention — Operations and support note

**Status:** Authoritative. **Merged to `main`** 2026-09-12 (PR #83, `070f6df`).
**Anchor:** `main` @ `070f6df`.
**Policy:** **PD-102** (closed-beta retention), **PD-103** (OQ-077 technical fixes),
**PD-104** (the guarantee lives in the data, not the view), **PD-105** (an anonymized record is a
relationship, not a person), **PD-106** (grace preserves resolution, not participation),
**PD-107** (retention is the accepted artifact), **PD-108** (finalisation is automatic; the CLI is
the fallback — **on the `feat/account-erasure-scheduler` branch, not yet merged**).

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
3. Confirmation is two things: a **recent authentication** and typing **DELETE**.
   **PD-104 corrected what "recent" means here, and this note had the old
   wording.** The gate reads the token's `amr` authentication timestamp where
   there is one and falls back to `iat` where there is not — and those are **not
   the same bar**: `iat` is restamped by an ordinary background
   `refreshSession()` without anybody typing a password, so a token can be
   minutes old and represent no fresh proof of identity. The screen asks for the
   password when the bar is not met. **No claim is made that this is equivalent
   to step-up authentication**; do not tell a user a stolen session could not
   have done this.
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

**Anonymization is not a renaming, and since PD-105 it is not one identity
either.** The ordinary link back to the account is broken — the account row is
gone, the profile row is gone, and the id on a retained row resolves to no
account and no profile. **And the id is per RELATIONSHIP**: the same departed
person carries a different id in each provider's records and in each
conversation, so one provider's booking history cannot be used to follow them
through the public review list to every other provider they used. Within one
provider they remain one distinct client, which is what keeps that provider's
rating unchanged (PD-091/PD-092).

**What an operator can and cannot resolve.** An operator cannot look a pseudonym
up. The map lives in a table revoked from every client role, and an operator is
a client role — so "who was this?" has no answer through any ordinary tool. The
one identity an operator CAN still resolve is the party on a retained accepted
contract or a retained safety report, which is the single exception the policy
keeps and is itself restricted (§ 8, OQ-084).

**A provider loses access to a departed client's reference photos.** The photo
path contains the client's account id, so the erasure severs the path the same way
it severs the id (PD-105) — and object access resolves through that path. The
photo row survives on its own 90-day clock so the bytes are deleted on schedule,
but it can no longer be opened. **If a provider asks why the photos on an old
booking stopped loading, this is why**, and it is not a fault. They keep the
booking, its status, its service and its dates.

**Contract artifacts are narrowed, not kept wholesale (PD-107).** What is
retained is the accepted evidence: the exact version that was accepted, its PDF
where that is the stored artifact, the acceptance timestamp and the minimum party
identity. Abandoned drafts, superseded versions nobody accepted, and the PDFs
behind them are deleted with everything else. **No signature image is retained
because none exists** — this product has never written one. One exception runs
the other way: where an acceptance does not record WHICH version it accepted,
every version of that contract is kept, because any of them could be the one.
The erasure reports when it has done that. If support is ever
asked to produce "the signed copy", the honest answer is the accepted version and
its timestamp, and **never that a signature was captured**.

---

## 4a. What a deactivated account may still do (PD-106)

During the 30-day grace period the account is **read-only**, with two exceptions
and no others: **restoring the account**, and **the minimum actions that finish a
transaction which already existed** when the request was made.

**They CAN still**: cancel, accept, decline or complete an existing booking;
report a no-show; mark a barter obligation delivered, confirm or dispute receipt,
report a no-show, ask for a review, cancel an agreement; decline or release a
barter interest; close a barter offer; mark a message read; delete their own
content; file a safety report or block someone; and cancel the deletion.

**They CANNOT**: send a new booking (including one they had drafted earlier), send
a message, write a review, post in Community, edit a post or a Reel, like, follow,
save or bookmark, add or change services, availability, policies or contracts,
accept somebody's contract, start or finalise a barter agreement, upload anything,
or change their own name or photo.

**Messaging is closed, deliberately.** If a counterparty needs to reach someone
mid-deletion, or vice versa, **that is ours to relay** — it is a support
obligation, not a reason to reopen the channel. Do not tell a user to "just
message them".

**What they see when they try**: *"This account is scheduled for deletion and
cannot start new activity."* A counterparty aiming at them sees the ordinary
*"not currently available for new bookings"* instead, which is deliberate — a
distinct message would disclose that somebody is deleting their account.

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
   case that matters most — a request whose scheduled run never happened; see § 10
   for how that is now detected rather than waited for — and **any step that is
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

- **Deletion finalisation is AUTOMATIC (PD-108).** `pg_cron` runs the worker
  daily at 04:17 UTC. Nobody has to remember anything, and **OQ-088 is closed.**
  What remains true is that the timer has never been *watched* firing. Every link
  in the chain it triggers has been proven end to end **by hand, once, against
  non-production** — which is a different claim, and **nothing in CI exercises
  it**: a wrong vault secret or a rotated worker secret would fail no committed
  test. § 10 is how you find that out.
- **There is no email or push confirmation**, of the request or of completion.
  The app records the request durably and shows its status on the screen, and the
  screen says so in as many words. **Never tell a user a notification was sent.**
- **Media bytes cannot be deleted from the database.** Supabase requires the
  Storage API, so objects are queued in `pending_media_deletions` and something
  must delete them through the Storage API and then call `confirm_media_deleted`.
  The worker does exactly that; before it existed this was dashboard clicking.
  Until every object is confirmed, the request cannot reach `completed` — which is
  deliberate: an erasure must not report success with the bytes still in the
  bucket.
- **Access tokens during the grace period.** Refresh tokens die with the auth row
  at final deletion, so a session cannot be renewed afterwards. During the grace
  period an already-issued access token keeps working until it expires — but the
  account is already inactive, so it can **read** and **resolve existing
  transactions** and cannot start anything new.
- **A client author is not told when their Community post was hidden** (from the
  moderation work) — unrelated to erasure, but the same screen gap.
- **A deletion is confirmed only when Storage says the object is not there**
  (PD-109). Not when a request fails, not because no error came back, and never
  before checking. So a media object can legitimately show as outstanding for a
  cycle while the worker retries it — that is the rule working, not a fault.
- **The scheduler's own grants are a platform default we cannot remove.** See the
  standing rule in § 10. Not currently reachable; recorded because it depends on
  a setting outside this repository.
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

## 9. The automatic path (PD-108)

```
pg_cron  →  public.invoke_account_deletion_worker()  →  pg_net
         →  the account-deletion-worker Edge Function
         →  the erasure engine and the Storage API
         →  public.account_deletion_worker_runs
```

| | |
|---|---|
| **Scheduler** | `pg_cron`, job `account-deletion-worker` |
| **Cadence** | daily, **04:17 UTC** — read it from `cron.job`, never from a comment |
| **Changing it** | `select public.set_account_deletion_worker_schedule('<cron expr>');` as `service_role`. The only supported way. |
| **What runs** | the `account-deletion-worker` Edge Function, which runs the same sequence as the CLI fallback, from the same file |
| **Owner** | The Book operator/founder for the closed beta. **The execution is automatic; the owner watches it, they do not drive it.** |

**A successful run** finalises every request past its grace date, deletes every
queued storage object through the Storage API, confirms each one, sweeps again so
`media_purge` can pass, and records a row in `account_deletion_worker_runs` with
`ok = true` and `overdue_count = 0`.

**What the promise to a user is.** A DATE, not a minute. A deletion scheduled for
the 12th completes on the 12th's run. **Never quote a user a time of day**, and
never say they will be emailed — no notification of any kind is sent, then or now.

---

## 10. When it fails — how Stephen checks

**Two queries. The first answers "is there deletion work outstanding?"**

```sql
select * from public.overdue_account_deletion_work();
```

Empty is clean. Any row is a request past its grace date that nothing finalised,
or a step that is failed, held or past due — each with its `last_error`.

**Did it even run?**

```sql
select ran_at, source, ok, media_examined, media_deleted, media_failed, overdue_count
  from public.account_deletion_worker_runs
 order by ran_at desc limit 14;
```

A gap in `ran_at` means the scheduler did not fire — a different problem from a
run that fired and failed, and the two need different fixes. `source` says
whether it was the scheduler (`scheduled`) or a person (`manual`).

**Why did the call itself fail?** `pg_net` records the HTTP result:

```sql
select id, status_code, error_msg, left(content, 500)
  from net._http_response order by id desc limit 5;
```

A non-2xx `status_code` is the function telling you work is late — the body
carries the counts. `error_msg` with no status means the call never arrived.

**The query that turns an ABSENCE into a row.** Nobody notices a missing row, so
"the scheduler stopped" is itself reported:

```sql
select * from public.account_deletion_worker_health();
```

Empty is healthy. It reports four things, each a positive signal:

| `problem` | What it means |
|---|---|
| `dispatch_never_answered` | The job fired and the Edge Function never recorded a run — a wrong vault secret, a rotated worker secret, an undelivered call. **`cron` will have reported SUCCESS**, because the SQL succeeded. |
| `no_successful_run` | No successful run in over two days. The scheduler has stopped. |
| `run_failed` | A run arrived and did not come out clean. |
| `media_stuck` | One object has failed three or more times. Somebody has to look at that one. |

**Is the job still scheduled?**

```sql
select jobname, schedule, active from cron.job;
```

### A standing rule the scheduler created

**Do not add `net` or `cron` to the project's exposed PostgREST schemas.**

Installing `pg_net` grants PUBLIC `EXECUTE` on `net.http_post` and ALL
privileges on `net._http_response`. Those grants were made by `supabase_admin`,
so **`postgres` cannot revoke them and no migration in this repository can** — it
was attempted, and the revoke was a silent no-op. What keeps them out of reach is
that PostgREST exposes `public` and `graphql_public` only. Exposing `net` would
hand every signed-in account the ability to make the database issue arbitrary
HTTP requests.

The worker is built so that even then it leaks no identities: its response body
is counts only, and the detail lives in `account_deletion_worker_runs`, which is
`service_role`-only.

**This is now a checkable release gate, not a hope:**

```bash
SUPABASE_URL=<project url> SUPABASE_ANON_KEY=<anon key> \
  node scripts/check-api-schemas.mjs
```

It must print `OK` before any release. Verified on non-production 2026-09-12 —
all five forbidden objects refused with `PGRST106`. See
[MIGRATION_LEDGER.md](MIGRATION_LEDGER.md) § Production release configuration
checks. **Production has not been checked; somebody authorized must.**

**A non-clean result means somebody is waiting.** Someone asked to be deleted and
has been told a date. Work the failures, then run the fallback until the overdue
query is empty.

---

## 11. Manual fallback

**Use it when the automatic path is failing, when a backlog must be drained now
rather than tonight, or when you are diagnosing a run that did not come out
clean. It is not the primary mechanism.**

```bash
cd /Users/stephentimmons/the-book-app
set -a; . ./.env.tooling.local; set +a
node scripts/account-deletion-worker.mjs            # --dry-run to look first
```

- **Environment:** `TEST_SUPABASE_URL` and `TEST_SUPABASE_SERVICE_ROLE_KEY` from
  `.env.tooling.local` (never `EXPO_PUBLIC_*`, never committed).
- **Production guard:** the script parses the project ref out of the URL and
  **refuses to run against production**, and refuses any URL whose ref it cannot
  positively identify. It is not a warning; it throws before connecting.
- **Bounded:** `--max=<n>` caps how many objects one run deletes (default 200).
- **Exit code:** non-zero whenever anything is late, any object failed to delete,
  or any step errored. A clean run exits 0 and says so.

**The recovery sequence when automation has failed:**

1. Run the worker.
2. Read `overdue_account_deletion_work()`.
3. Resolve any media failures — `last_error` on `pending_media_deletions` says
   what the Storage API refused.
4. Re-run until the overdue query is empty.
5. **Then find out why the scheduler did not.** A drained backlog with an
   unexplained scheduler is the same outage tomorrow.

---

## 12. Standing operational obligations

**Nobody has to run the worker.** It runs itself — see § 9. What follows is the
FALLBACK, for when it does not.

```bash
set -a; . ./.env.tooling.local; set +a
node scripts/account-deletion-worker.mjs            # --dry-run to look first
```

It sweeps (finalising every request whose grace period has ended and running
every purge that has come due), drains `pending_media_deletions` through the
Storage API, calls `confirm_media_deleted` **only after each delete actually
succeeded**, sweeps again so `media_purge` can pass, and prints
`overdue_account_deletion_work()`. It is safe to run repeatedly, it refuses to
run against the production project ref, and `--max=<n>` bounds how many objects
one run will delete.

**Treat a non-zero exit as a page.** It means something is late: a request past
its grace date nothing finalised, or a step that is failed, held or past due.

**Nothing else will do it.** A request whose grace period passed and whose worker
never ran is an account that was promised deletion and did not get it. The
underlying calls are still available directly — `select public.sweep_account_deletions();`
as `service_role` — if the worker cannot be run for some reason.

**Someone has to watch the run log.** Automation removed the obligation to RUN
the worker; it did not remove the obligation to notice that it stopped working.
§ 10 is the whole of it.

**Someone has to work held classes.** A hold is a decision to keep something; it
needs revisiting and releasing, or it becomes an indefinite retention nobody
chose.

**Support must not promise a completion they have not checked.** The state is in
`account_deletion_requests` and `account_deletion_steps`, and it is the only
answer.
