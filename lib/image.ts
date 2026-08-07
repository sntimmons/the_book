// Display-time helpers for rendering remote images.
//
// React Native's built-in <Image> caches by URI and exposes no cache control
// (no cachePolicy / cacheKey). A profile photo URL that previously failed —
// e.g. a 403 from before the provider-media bucket existed — can stay cached as
// a blank result and keep rendering blank even once the object is available.
//
// cacheBustedPhoto appends a per-photo token so RN treats the URL as new and
// re-fetches it. The token is derived from the upload timestamp embedded in the
// storage path (…/profile/<timestamp>_<random>.jpg), so it stays constant for a
// given photo (no refetch loops) and changes whenever a new photo is uploaded.
// The stored URL in the DB is never modified — this only affects display.
export function cacheBustedPhoto(
  url: string | null | undefined,
): string | undefined {
  if (!url) return undefined
  const match = url.match(/(\d{10,})/)
  const token = match ? match[1] : String(url.length)
  const separator = url.includes('?') ? '&' : '?'
  return `${url}${separator}t=${token}`
}
