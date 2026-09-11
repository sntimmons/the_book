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
