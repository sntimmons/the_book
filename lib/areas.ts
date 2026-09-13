// ── ONE LIST OF AREAS ─────────────────────────────────────────────────────
//
// The Houston neighbourhoods the beta operates in. This was a hard-coded array
// inside the community screen, a second copy of which would have appeared in the
// composer the moment a post could carry an area — so it lives in one place
// before there are two.
//
// It is NOT a database constraint, deliberately. `community_posts.area` is free
// text with a length bound, because a locked geography vocabulary is a product
// decision about where The Book operates, and the beta being Houston-only is a
// fact about today rather than a rule about the schema.
/**
 * The city every beta provider is in, written to `providers.location`.
 *
 * `location` and `neighborhood` are DIFFERENT CONCEPTS and were being written from
 * the same value, which broke the proximity fallback: `lib/discovery.ts` reads
 * `neighborhood` for an exact local match and `location` through `cityOf()` for a
 * city-level one, and a bare area name ("Midtown") in both meant the city tier could
 * never match. So the city is stated once, here, beside the areas it contains.
 *
 * FORMAT MATTERS: `cityOf()` splits on a comma, so this must carry a city and a
 * region. It is a constant rather than a picker because the beta being Houston-only
 * is a fact about today — the same reasoning that keeps the area list out of the
 * schema. When The Book operates in a second city this becomes a real field, not a
 * longer constant.
 */
export const BETA_CITY = 'Houston, TX'

export const HOUSTON_AREAS = [
  'Downtown',
  'Midtown',
  'Montrose',
  'The Heights',
  'River Oaks',
  'Uptown / Galleria',
  'Museum District',
  'Medical Center',
  'EaDo',
  'Rice Village',
] as const
