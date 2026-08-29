# F5B - Isolated Baseline Validation (RETRY)

Second isolated execution of the canonical baseline after the F5B-C1 sequence
correction. **Result: FAIL again**, on a new and distinct defect
(constraint dependency ordering). The F5B-C1 sequence fix is validated as
effective. Production was not touched.

This report does NOT overwrite the original
`docs/audits/F5B_ISOLATED_BASELINE_VALIDATION.md` (initial failure) and follows
`docs/audits/F5A_CANONICAL_BASELINE_REVIEW.md` (with the F5B-C1 sequence
correction, commit `31f5c8f`).

## 1. Target project ref

`zwahaxmaxwrhoucvdiij` (`the-book-f5b-validation`, us-east-1). Same disposable
project used in the initial run (still empty after the previous transactional
rollback).

## 2. Production-vs-target safety confirmation

Verified before any SQL:

```
PRODUCTION : kxregomuawwcqvisuhtr
F5B TARGET : zwahaxmaxwrhoucvdiij
CONFIRMED DIFFERENT
```

All SQL targeted `/v1/projects/zwahaxmaxwrhoucvdiij/database/query`. Production
`kxregomuawwcqvisuhtr` received no writes.

## 3. Clean-target verification

Before apply: `tables=0, sequences=0, views=0, functions=0, policies=0` (clean).
After the failed apply: `tables=0, sequences=0, views=0, functions=0,
triggers=0, policies=0` - the batch is transactional and rolled back fully. The
disposable project is clean/empty and reusable.

## 4. Execution result

**FAILED.**

- **SQLSTATE:** `42830` (invalid_foreign_key / "there is no unique constraint
  matching given keys for referenced table").
- **Error:** `there is no unique constraint matching given keys for referenced
  table "providers"`.
- **Failing statement (baseline line 530):**
  `alter table public.barter_interests add constraint
  barter_interests_interested_provider_id_fkey FOREIGN KEY
  (interested_provider_id) REFERENCES providers(id) ON DELETE CASCADE;`
- **Why:** this FK references `providers(id)`, whose backing constraint
  `providers_pkey` is not added until baseline line 652 (122 lines later). At the
  time the FK is created, `providers` has no PK/UNIQUE yet, so PostgreSQL rejects
  it.
- **Transaction behavior:** single transaction, full rollback (Section 3).

## 5. Full object counts

Not reached. Execution aborted in the constraints section and rolled back.

## 6. F4 comparison

Not reached (deferred to a corrected run).

## 7. Sequence validation (F5B-C1 result)

**The sequence correction is validated as effective.** In the initial run,
execution failed at `public.categories.id` (line ~127, the tables section). In
this run, execution advanced past the sequence and all 39 `create table`
statements and failed only later, in the constraints section (line 530). That
progression proves `create sequence public.categories_id_seq`, its grant, and
the `categories` table with its `nextval` default all executed successfully
within the transaction before the new (unrelated) FK-ordering error. The
categories/sequence defect from the initial F5B is resolved.

## 8. Grants / ACL comparison

Not reached. The F5A grant-bootstrap ACL uncertainty remains unvalidated.

## 9. Storage comparison

Not reached.

## 10. Security-debt preservation

Not validated at runtime (nothing persisted). By construction the baseline still
reproduces the known live debt as-is; unconfirmed on the disposable project
because the apply failed.

## 11. All differences / defect

Exactly one, and it is a **DEPENDENCY / ORDERING** defect (baseline assembly, not
a live-vs-repo object difference):

- The constraints section (derived from the F4 capture, ordered by the table each
  constraint is ON, alphabetically, then PK -> UNIQUE -> FK -> CHECK within that
  table) adds FOREIGN KEY constraints before the REFERENCED table's PRIMARY
  KEY / UNIQUE constraint exists whenever the referenced table sorts
  alphabetically after the referencing table.
- Concretely: 22 FKs reference `providers`; `providers` sorts after most tables,
  so FKs to `providers` from earlier tables (`barter_interests`, `barter_offers`,
  `bookings`, ...) are emitted before `providers_pkey` (line 652). The same class
  affects any FK whose referenced table's PK/UNIQUE is added later in the file.

Classification: **DEPENDENCY / ORDERING.** Not a baseline object defect, not a
managed prerequisite, not an ACL bootstrap difference, not UNKNOWN.

### Proposed correction (FOR REVIEW - not applied, not retried)

- **Targeted fix:** reorder the constraints section so that **all PRIMARY KEY and
  UNIQUE constraints (across all tables) are added first**, then **all FOREIGN
  KEY constraints**, then **all CHECK constraints**. (Constraints only need their
  own table plus, for FKs, the referenced table's PK/UNIQUE; a global
  PK/UNIQUE-before-FK ordering satisfies this. CHECKs may follow.)
- **Preferred fix:** regenerate the canonical baseline from a service-role
  `pg_dump --schema-only`, which emits constraints in dependency-correct order
  (and resolves the still-open grant-bootstrap ACL question and any other latent
  ordering issues in one authoritative artifact). This is the second
  ordering-class defect surfaced by execution validation and further supports the
  F5A recommendation to source the final baseline from a dump rather than from
  catalog reconstruction.
- Per instruction, the baseline was **not** patched and **not** retried a second
  time.

## 12. PASS / FAIL conclusion

**F5B (retry) FAILS.** The corrected baseline resolves the sequence defect but
does not yet apply cleanly on a fresh environment due to constraint ordering.

## 13. F5C unblocked?

**No.** F5B has not passed. Migration-history repair, migration archival, and any
production `db push` remain blocked. The disposable project is left intact.

## State

Disposable project `zwahaxmaxwrhoucvdiij` left intact (empty after rollback),
not deleted, not for product use. Production, remote migration history, and app
code unchanged. Read-only production inspection was limited to the earlier
F5B-C1 sequence capture; this retry only wrote to the disposable project (and
rolled back).
