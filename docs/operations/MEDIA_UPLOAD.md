# Media upload

**Authoritative.** The shared upload contract in `lib/storage.ts` — what it guarantees, what
it refuses, and the one invariant it exists to enforce.

Everything that puts user or provider media into storage goes through it. There is no second
upload path, and adding one would put the invariant below back at risk.

---

## The invariant

> **Every product-created video post must have a usable thumbnail/still for surfaces that
> cannot play video.**

It is enforced at the **boundary**, not at the call sites. Three files create `posts` rows
and two of them can create video; asking each to remember a rule is how the rule gets lost —
which is exactly what happened before Session 5.

---

## Why it exists

`posts.thumbnail_url` had no writer. Every video a provider uploaded stored NULL, and the
consequences were split across four surfaces with **no error anywhere**:

| Surface | Reads | Behaviour with a NULL thumbnail |
|---|---|---|
| Discover → See the work | `thumbnail_url` | item **dropped** |
| Provider search grid | `thumbnail_url` | **blank tile** |
| Business → Posts grid | `thumbnail_url` | **blank tile** |
| Provider public profile → *In motion / Reels* | `media_url` into `<Image>` | **blank tile** |
| Reels tab | `media_url` | **plays fine** |

The only surface that worked is the one a provider would check after posting. A defect that
hides from the person most likely to notice it survives a long time.

The fourth row was itself missed by the first pass of the fix, whose census named four
surfaces. That is why `__tests__/guards/videoThumbnailIntegrity.test.ts` censuses every file
reading `media_type` rather than asserting against a hand-written list.

---

## The contract

```ts
type UploadResult = { url: string | null; thumbnailUrl: string | null; error: string | null }
interface UploadedMedia { url: string; thumbnailUrl: string | null }
```

`uploadMedia(uri, userId, folder, bucket)` and `uploadMultiple(...)` both carry the
thumbnail alongside the url. `uploadMultiple` returns `UploadedMedia[]` rather than
`string[]` **specifically so a caller cannot drop the still between upload and insert**.

| Input | `url` | `thumbnailUrl` |
|---|---|---|
| Image (`jpg` `jpeg` `png` `webp` `heic`) | the image | `null` — an image is its own still |
| Video (`mp4` `mov` `m4v`) | the video | a JPEG frame of **that** video |
| Video whose still cannot be produced | `null` | `null` — **the whole upload fails** |
| Already-remote `http(s)` URI | passed through | `null` — see below |

### Refusals, and why each is a refusal

- **No still → no upload.** A video row without one is publishable and half-broken. The
  already-stored video object is **removed**, so storage does not accumulate media no row
  will ever point at.
- **No unrelated image is ever substituted.** A still that is not a frame of that video is a
  picture of somebody else's work on somebody's post.
- **A remote passthrough claims no thumbnail.** Re-saving already-uploaded media has no local
  file to sample, so it returns `null` rather than a guess — callers must not overwrite an
  existing `thumbnail_url` with it.

---

## The dependency, and the rebuild it implies

Stills come from **`expo-video-thumbnails`**, pinned by the SDK (`~10.0.8`). It is a **native
module**.

It is **required lazily inside the function**, never imported at the top of the file. A JS
bundle running on a client built *before* the package was added has no native implementation
behind it, and a top-level import would throw at **module load** — taking down every screen
that touches storage, not just video upload. Required defensively, such a client fails *that
upload* with a clear message, which is the failure we want.

**A native rebuild of the dev client and of any EAS build is required** before video upload
works. Expo Go cannot run it.

**No build containing it has been run on a device yet.** Everything documented here is verified
by unit tests, guards and the db-security harness; none of that exercises the native module. The
still-generation path itself is proven only in principle until someone uploads a real video from
a rebuilt client.

---

## Storage and boundaries

The still is written to the **same bucket and the same user-scoped folder** as its video
(`<userId>/<folder>/<timestamp>_<random>.jpg`), through the existing
`supabase.storage.from(bucket).upload(...)` path. **No new bucket, no new storage path shape,
no policy, grant or RLS change** was introduced.

---

## Deleting is also two objects

`deleteProviderMedia(postId, mediaUrl, bucket, thumbnailUrl)` removes **every** object the
post owns. Passing only `media_url` for a video leaves a frame of that video publicly
readable after a takedown the provider was told was complete — which is the case the delete
feature exists for.

A remove that comes back with **fewer objects than it was asked for** is an orphan, not a
success. Storage RLS expresses authorization as a `USING` clause, so a refused remove returns
`error: null` and simply omits the object. Verified against the Storage API: removing a real
object returns one entry, removing nothing returns zero — so a short set is a reliable signal
and not a quirk of the client. The upload's own rollback applies the same check.

## Adding a new post-creation path

If you add a file that inserts into `posts`:

1. Take both `url` and `thumbnailUrl` from the shared upload result.
2. Write `thumbnail_url` on any row where `media_type = 'video'`.
3. Expect `__tests__/guards/videoThumbnailIntegrity.test.ts` to fail until you do — it
   enumerates every `posts` insert site in the repository and fails when it finds one the
   guard does not know about. That check is deliberate: a guard that inspects three files
   while a fourth exists proves nothing.

Behavioural coverage lives in `__tests__/lib/storageVideoStill.test.ts`.
