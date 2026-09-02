# Security Reviewer — Sources & Context Loading

Deterministic loading. **Never dump the whole repo into a review.** Load the fixed
always-set, then only the files the scope maps to. The security boundary lives in the
**schema + policies + functions/triggers** first; app code matters mainly for what it
*sends* and whether it makes a trusted decision client-side.

## Always load (small, fixed)
- `AGENTS.md` — authority hierarchy, "source code wins", information classes, vocabulary.
- `docs/product/BETA_SCOPE.md` — approved decisions (what is REAL / DEFERRED / UNDECIDED).
- `supabase/migrations/20260829000000_canonical_live_baseline.sql` — the canonical schema:
  tables, columns, constraints, indexes, RLS enablement, existing policies, functions.
- `src/lib/supabase/*` / `lib/supabase.ts` + `lib/supabaseTarget.ts` — client/SSR/admin
  factories and environment wiring (which key ships where; prod-vs-nonprod guards).

## The security surface (load by scope)

| Surface | Primary sources |
|---|---|
| Conversations & messaging | `supabase/migrations/20260901000000_prebooking_message_requests.sql`, the `conversation`/`messages` tables + policies in the baseline, `hooks/useMessaging.ts`, `lib/messageRequests.ts`, `app/messages/*`, `app/(tabs)/messages.tsx` |
| Bookings & payments | booking tables + RLS/triggers in the baseline and any `..._bookings*`/payment migrations, `store/bookingStore.ts`, `lib/bookingStatus.ts`, `app/book/*`, `app/bookings/[id].tsx` |
| Providers & identity | `providers`/`clients`/`users` tables + policies, `lib/resolveUserRole.ts`, `context/AuthContext.tsx`, `app/onboarding/provider/*` |
| Storage | `storage.buckets` rows + `storage.objects` policies in the baseline, `lib/storage.ts` |
| Reviews | review tables + RLS, `lib/reviews.ts` |
| Migrations / DDL | every file under `supabase/migrations/` relevant to the change; check from-scratch apply |
| Secrets / env | `.env.example`, `.env.local.example`, any `process.env.*` / `EXPO_PUBLIC_*` usage, CI workflow files |

Ownership model (memorize — these are the correct join columns):
`conversation.client_id = auth.uid()`; `conversation.provider_id = providers.id` (row id);
provider ownership via `providers.user_id = auth.uid()`; `messages.sender_id = auth.uid()`;
`bookings.user_id = auth.uid()`, `bookings.provider_id = providers.id`;
`conversation_unique_pair UNIQUE (client_id, provider_id)`.

## PR / branch mode
1. Read the diff / changed-file list first (`git diff main...HEAD` is provided by the invoker;
   the agent reads files with its read-only tools).
2. Map changed files → surfaces (table above). For any changed table/policy/function, also
   read its baseline definition to see the *whole* boundary, not just the delta.
3. Load only the always-set + those surfaces. Do not load unrelated surfaces.

## Runtime evidence the agent CANNOT gather (must disclose)
The agent is read-only and has **no DB access**. It cannot run migrations, execute a role
simulation, read live RLS/publication state, or touch production. Any claim that depends on
runtime behavior is **LIKELY** (name the role-simulation/test that would confirm it), and the
review's "COVERAGE GAPS" section states what remained unproven. Manual, non-CI DB
role-simulations described in audits are **evidence of intent/likelihood**, not committed
automated proof.

## Historical (reference only, never authoritative)
`docs/history/*` and superseded audit sections — never cite as the expected secure behavior;
current schema/migrations + approved decisions win.
