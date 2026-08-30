# Security Batch 2 — Storage Authorization Investigation & Design (READ-ONLY / DESIGN ONLY)

Scope: `contract-pdfs`, `contract-signatures`, `provider-media`. `posts-media` is
out of scope (investigation did not surface a reason to include it). No migration
written, no production/app/migration change.

**Headline findings**
- **provider-media (LIVE, 19 objects):** any authenticated user can **update or
  delete any other provider's media** — the UPDATE/DELETE/INSERT policies are
  bucket-bound only, not path/owner-bound. This is the acute, exploitable risk.
- **contract-pdfs read** and **contract-signatures read** each have a
  **non-object-bound branch**: *any* signing client can read *any* contract PDF,
  and *any* provider can read *any* client signature (broad IDOR / confidentiality
  break). Both buckets are currently **empty (0 objects)** — feature dormant.
- Path convention is uniformly `${uid}/...` (`generatePath`), and `pdf_url` /
  `signature_url` store the object path, so **owner- and contract-bound policies
  are expressible with the current paths and schema**.

---

## 1. Live bucket configuration

| bucket | public | size limit | mime allow | objects | path convention | scoped by |
|---|---|---|---|---|---|---|
| contract-pdfs | **private** | null | null | **0** | `${providerUid}/contract_<ts>.pdf` | uploader = provider uid |
| contract-signatures | **private** | null | null | **0** | `${signerUid}/...` (anticipated; placeholders today) | signer = client uid |
| provider-media | public | 50MB | image/\*, video/\*, mp4/\* | **19** | `${uid}/{profile\|banner\|...}/<ts>_<rand>.<ext>` | uid = provider user_id |
| posts-media (out of scope) | public | 50MB | image/video list | 27 | `${uid}/...`, `profiles/${uid}/...` | – |

- provider-media conformance: all 19 objects have `foldername[1]` = a uuid; 18/19
  map to a current `providers.user_id` (1 orphan — no current provider; unaffected
  by owner-binding since binding is to `auth.uid()`, and public read is unchanged).
- `storage.objects.owner` is **nullable / unreliable** on older rows → ownership
  must be derived from the **path**, not `owner`.

## 2. Current storage.objects policies (scoped buckets)

### contract-pdfs
| policy | cmd | role | expression | object-bound? |
|---|---|---|---|---|
| `contract_pdfs_upload_own` | INSERT | authenticated | WITH CHECK `bucket AND foldername[1]=auth.uid()` | **yes** (uploader folder) |
| `contract_pdfs_delete_own` | DELETE | authenticated | USING `bucket AND foldername[1]=auth.uid()` | **yes** |
| `contract_pdfs_read` | SELECT | public | USING `bucket AND ( foldername[1]=auth.uid()` **OR** `auth.uid() IN (SELECT cs.client_user_id FROM contract_signatures cs JOIN contracts c ON c.id=cs.contract_id WHERE c.pdf_url IS NOT NULL) )` | **NO** — the client branch is a blanket "any client of any pdf contract", not tied to the object |

### contract-signatures
| policy | cmd | role | expression | object-bound? |
|---|---|---|---|---|
| `signatures_upload_own` | INSERT | authenticated | WITH CHECK `bucket AND foldername[1]=auth.uid()` | **yes** |
| `signatures_read_own_storage` | SELECT | public | USING `bucket AND ( foldername[1]=auth.uid()` **OR** `auth.uid() IN (SELECT user_id FROM providers) )` | **NO** — the provider branch lets *any* provider read *any* signature |

### provider-media
| policy | cmd | role | expression | object-bound? |
|---|---|---|---|---|
| `provider_media_public_read` | SELECT | public | USING `bucket='provider-media'` | n/a (public bucket, intended) |
| `provider_media_authenticated_upload` | INSERT | authenticated | WITH CHECK `bucket='provider-media'` | **NO** — any auth user, any path |
| `Authenticated users can upload 1x3bwnc_0` | INSERT | public | WITH CHECK `bucket='provider-media' AND auth.uid() IS NOT NULL` | **NO** (duplicate upload) |
| `provider_media_authenticated_update` | UPDATE | authenticated | USING `bucket='provider-media'` | **NO** — any auth user can overwrite any object |
| `provider_media_authenticated_delete` | DELETE | authenticated | USING `bucket='provider-media'` | **NO** — any auth user can delete any object |

**Object-guessing / cross-user access found:**
- provider-media UPDATE/DELETE/INSERT: any authenticated user → any object (no path binding).
- contract-pdfs read: any client of any pdf-bearing contract → any PDF.
- contract-signatures read: any provider → any signature.

## 3. App usage map

Single anon-key client; storage helpers in `lib/storage.ts` and `lib/contracts.ts`.

| File | Bucket | Op | Side | Auth ctx | Path construction | Identifiers in path |
|---|---|---|---|---|---|---|
| `lib/storage.ts:80,109` (`uploadMedia`→`generatePath`) | provider-media (+posts-media) | INSERT (upsert:false) | client | authenticated | `${userId}/${folder}/${ts}_${rand}.${ext}` | `userId = auth.uid()` |
| `app/(tabs)/business/edit-profile.tsx:218,235`, `app/me/edit.tsx:162` | provider-media | INSERT | client | authenticated provider | `${user.id}/profile\|banner/...` | user.id |
| `lib/storage.ts:122` | provider-media | getPublicUrl | client | any | – | – |
| `lib/contracts.ts:299-303` (`uploadContractPdf`) | contract-pdfs | INSERT (upsert:true) | client | authenticated **provider** | `${userId}/contract_${Date.now()}.pdf` | userId = provider uid |
| `lib/contracts.ts:311` | contract-pdfs | getPublicUrl (encodes path into `pdf_url`) | client | – | – | – |
| `lib/contracts.ts:335` (`getContractPdfSignedUrl`) | contract-pdfs | createSignedUrl(3600) | client | authenticated (provider or client) | uses stored path | – |
| contract-signatures | contract-signatures | **none yet** — "signatures are placeholders with a null signature_url" (`lib/contracts.ts:7`) | – | – | anticipated `${signerUid}/...` | – |

- **No** `.remove()` / `.move()` / `.update()` on provider-media or the contract
  buckets anywhere in the app → the current any-auth UPDATE/DELETE provider-media
  policies are **unused by the app**.

## 4. Actual authorization relationships (from live schema + code)

- **provider-media ownership:** `foldername(name)[1] = auth.uid()` (uploads pass
  `user.id`; `providers.user_id = auth.uid()`). Robust and path-based.
- **contracts:** `provider_id → providers.id` (owner via `providers.user_id`);
  `user_id` **is the client's auth uid** directly. So a contract's parties are:
  provider = `(SELECT user_id FROM providers WHERE id = contracts.provider_id)`,
  client = `contracts.user_id`.
- **contract-pdfs object → contract:** the PDF path is stored in `contracts.pdf_url`
  → an object is bound to its contract by `pdf_url LIKE '%/' || name`.
- **contract_signatures:** `contract_id → contracts.id`, `client_user_id` = signer's
  auth uid; `signature_url` stores the object path → object bound by
  `signature_url LIKE '%/' || name`.

## 5. Contract PDF model (intended)

| Actor | upload | read/download | replace/update | delete |
|---|---|---|---|---|
| contract provider (owner of folder) | ALLOW | ALLOW | ALLOW (owner) | ALLOW |
| contract client (`contracts.user_id`) | DENY | **ALLOW (this contract only)** | DENY | DENY |
| unrelated authenticated user | DENY | DENY | DENY | DENY |
| anon | DENY | DENY | DENY | DENY |
| service_role | ALLOW | ALLOW | ALLOW | ALLOW |

Both participants should read the PDF (provider via folder ownership; client via
their own contract, object-bound through `pdf_url`).

## 6. Contract signature model (intended)

| Actor | upload own | read own | read counterpart | replace | delete |
|---|---|---|---|---|---|
| signing client (owner) | ALLOW | ALLOW | – | DENY (write-once) | DENY |
| contract provider | DENY | – | **ALLOW (this contract only)** | DENY | DENY |
| unrelated user / other provider | DENY | DENY | DENY | DENY | DENY |
| anon | DENY | DENY | DENY | DENY | DENY |
| service_role | ALLOW | ALLOW | ALLOW | ALLOW | ALLOW |

**Path naming alone must NOT be the only authorization** for counterpart reads —
today `signatures_read_own_storage` lets any provider read any signature. The fix
binds the provider read to the object's contract via `signature_url`.

## 7. Provider media model (intended)

- Objects owned by the provider whose `auth.uid()` is `foldername[1]`.
- Paths **do** encode the owner uid (segment 1). Ownership is expressible safely
  with current schema/paths.
- Today **any authenticated user can update/delete another provider's media** —
  must be restricted to owner.
- Public read **is** intended (public display bucket) → keep public SELECT.

| Actor | upload | read | update | delete |
|---|---|---|---|---|
| owner provider (`foldername[1]=uid`) | ALLOW | ALLOW | ALLOW | ALLOW |
| other authenticated user | DENY (own folder only) | ALLOW (public) | DENY | DENY |
| anon | DENY | ALLOW (public) | DENY | DENY |
| service_role | ALLOW | ALLOW | ALLOW | ALLOW |

## 8. Proposed policy model (least privilege)

All private-bucket policies target `TO authenticated` (anon excluded); provider-media
read stays `TO public`.

### provider-media
| policy | cmd | role | USING / WITH CHECK | reason |
|---|---|---|---|---|
| public read (keep) | SELECT | public | USING `bucket_id='provider-media'` | public display bucket |
| owner upload (replace both current uploads) | INSERT | authenticated | WITH CHECK `bucket_id='provider-media' AND (storage.foldername(name))[1]=auth.uid()::text` | upload only under own folder |
| owner update (replace any-auth update) | UPDATE | authenticated | USING+WITH CHECK `bucket_id='provider-media' AND (storage.foldername(name))[1]=auth.uid()::text` | only owner overwrites |
| owner delete (replace any-auth delete) | DELETE | authenticated | USING `bucket_id='provider-media' AND (storage.foldername(name))[1]=auth.uid()::text` | only owner deletes |

Drop `Authenticated users can upload 1x3bwnc_0` (duplicate).

### contract-pdfs
| policy | cmd | role | USING / WITH CHECK | reason |
|---|---|---|---|---|
| provider upload (keep) | INSERT | authenticated | WITH CHECK `bucket_id='contract-pdfs' AND foldername[1]=auth.uid()::text` | provider uploads under own uid |
| provider update (add, for upsert robustness) | UPDATE | authenticated | USING+CHECK `bucket_id='contract-pdfs' AND foldername[1]=auth.uid()::text` | supports `upsert:true` re-upload by owner |
| provider delete (keep) | DELETE | authenticated | USING `bucket_id='contract-pdfs' AND foldername[1]=auth.uid()::text` | provider deletes own |
| participant read (replace blanket client branch) | SELECT | authenticated | USING `bucket_id='contract-pdfs' AND ( foldername[1]=auth.uid()::text OR EXISTS(SELECT 1 FROM contracts c WHERE c.user_id=auth.uid() AND c.pdf_url LIKE '%/'||name) )` | provider (folder) or the client of **this** contract |

### contract-signatures
| policy | cmd | role | USING / WITH CHECK | reason |
|---|---|---|---|---|
| signer upload (keep) | INSERT | authenticated | WITH CHECK `bucket_id='contract-signatures' AND foldername[1]=auth.uid()::text` | signer uploads own |
| participant read (replace blanket provider branch) | SELECT | authenticated | USING `bucket_id='contract-signatures' AND ( foldername[1]=auth.uid()::text OR EXISTS(SELECT 1 FROM contract_signatures cs JOIN contracts c ON c.id=cs.contract_id JOIN providers p ON p.id=c.provider_id WHERE p.user_id=auth.uid() AND cs.signature_url LIKE '%/'||name) )` | own signature, or provider of **this** signature's contract |
| (no UPDATE/DELETE) | – | – | – | signatures are write-once records |

**anon: no access to any of the three except provider-media public read.**
`service_role` untouched throughout (bypasses RLS).

> Optional hardening (small app change, feasible because contract buckets are
> empty): encode `contract_id` in the PDF/signature path (e.g.
> `${providerUid}/${contractId}/file.pdf`) and bind policies on
> `foldername[2]::uuid = contracts.id` instead of `LIKE`-matching `pdf_url` /
> `signature_url`. Cleaner and avoids URL string-matching, but not required.

## 9. Compatibility analysis

| App operation | Verdict | Note |
|---|---|---|
| provider-media upload (`${user.id}/...`) | **WILL CONTINUE WORKING** | owner-bound INSERT matches `foldername[1]=auth.uid()` |
| provider-media public read | **WILL CONTINUE WORKING** | unchanged |
| provider-media update/delete | **WILL CONTINUE WORKING** | app never calls them; owner-binding only removes cross-user abuse |
| contract-pdfs upload (provider) | **WILL CONTINUE WORKING** | `foldername[1]=auth.uid()` holds (provider uid) |
| contract-pdfs read via signed URL (provider) | **WILL CONTINUE WORKING** | provider folder branch |
| contract-pdfs read via signed URL (client) | **WILL CONTINUE WORKING (and becomes correct)** | object-bound via `pdf_url` once a contract has a PDF; 0 objects today |
| contract-pdfs `upsert:true` re-upload | **WILL CONTINUE WORKING** | timestamped path ⇒ INSERT; owner UPDATE added for safety |
| contract-signatures | **WILL CONTINUE WORKING** | placeholder feature, no uploads yet; policy correct when it goes live |

**Path-strength caveat:** contract read authorization depends on `pdf_url` /
`signature_url` faithfully storing the object path (confirmed in code). It is
secure but relies on URL suffix matching; the optional `contract_id`-in-path
hardening removes that reliance. No app change is **required** to ship securely.

**Nothing classified WOULD BREAK.** The only UNCERTAIN item (upsert UPDATE) is
mitigated by adding the owner-bound UPDATE policy.

## 10. Security risks

- **IDOR / object-guessing:** contract-pdfs (any client → any PDF), signatures
  (any provider → any signature). Closed by object-bound reads.
- **Overwrite:** provider-media any-auth UPDATE → competitor can replace a
  provider's photos. Closed by owner-bound UPDATE.
- **Cross-provider delete:** provider-media any-auth DELETE → competitor can wipe a
  provider's media (19 real objects at risk). Closed by owner-bound DELETE.
- **Signature impersonation / harvesting:** any provider reading any signature is a
  confidentiality and integrity risk. Closed.
- **Contract confidentiality:** blanket client read exposes unrelated contracts.
  Closed.
- **Public bucket exposure:** provider-media/posts-media public read is by design;
  no private data should be placed there (contract PDFs/sigs correctly use private
  buckets).
- **Signed-URL misuse:** `createSignedUrl` requires SELECT under RLS, so the read
  policy gates who can mint a URL; 1-hour TTL is acceptable.
- **Recursion/performance:** proposed `EXISTS` subqueries touch `contracts` /
  `contract_signatures` / `providers` (all indexed on the joined PK/FK columns);
  no policy recursion (storage policies reference public tables, whose own RLS
  does not reference storage). Per-object read does one indexed EXISTS — fine at
  this scale. (A `contracts(pdf_url)` / `contract_signatures(signature_url)` index
  would help if volume grows; not needed now.)

## 11. Security test matrix (ALLOW / DENY)

`service_role` bypasses RLS (ALLOW everywhere), omitted from rows below for brevity.

### provider-media
| actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | A (public) | D | D | D |
| authenticated unrelated | A (public) | A only under own folder | D | D |
| owner (foldername[1]=uid) | A | A | A | A |
| other provider | A (public) | D (their folder only) | D | D |

### contract-pdfs
| actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | D | D | D | D |
| authenticated unrelated | D | D (own folder only) | D | D |
| contract provider (owner) | A | A | A | A |
| contract client | A (this contract) | D | D | D |
| unrelated provider | D | D | D | D |

### contract-signatures
| actor | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | D | D | D | D |
| authenticated unrelated | D | D (own folder only) | D | D |
| signing client (owner) | A (own) | A | D | D |
| contract provider | A (this contract) | D | D | D |
| unrelated provider | D | D | D | D |

## 12. Recommendation

**A. SAFE TO IMPLEMENT WITH CURRENT PATH/SCHEMA.**

Ownership and contract-membership are all expressible with the current
`${uid}/...` paths plus `pdf_url` / `signature_url`. No app or schema change is
required to ship securely (the `contract_id`-in-path option is a nicety, not a
prerequisite).

**Recommended batch boundaries (both safe; split by severity + review surface):**
- **Batch 2a — provider-media owner-scoping.** Highest live severity (19 real
  objects, any-auth overwrite/delete), simplest policy (path ownership only).
  Ship first.
  Proposed file: `supabase/migrations/20260829030000_security_batch_2a_provider_media_ownership.sql`
- **Batch 2b — contract-pdfs + contract-signatures object-bound reads.** Dormant
  (0 objects), relationship-join policies warranting separate review.
  Proposed file: `supabase/migrations/20260829040000_security_batch_2b_contract_storage_scoping.sql`

## 13. Status

- Report: `docs/audits/SECURITY_BATCH_2_STORAGE_INVESTIGATION.md` (uncommitted).
- No migration created; no production/app/migration change. Production access was
  read-only introspection.
