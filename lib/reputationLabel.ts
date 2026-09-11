// PD-091: the public rating is the mean of each client's LATEST revealed review,
// so the number that explains a rating is **how many clients it averages** — not
// how many reviews were written. Those two numbers are equal only until someone
// books the same provider twice.
//
// This matters most on compact surfaces. A card reading `★ 4.8 (12)` is read as
// "twelve people thought this" — and under PD-091 it can truthfully be two people
// who each returned six times. The rating is not inflated (that is what PD-091
// buys), but the CONFIDENCE the bare count implies is, and a bare parenthetical
// cannot be corrected by context the reader does not have.
//
// One helper, because the phrasing is a product decision and not a per-screen
// styling choice — when PD-091 changes, it should change in one place.

/** How many distinct clients the displayed rating is computed over. */
export function ratingClientLabel(clients: number | null | undefined): string | null {
  const n = clients ?? 0
  if (n <= 0) return null
  return `${n} ${n === 1 ? 'client' : 'clients'}`
}

/**
 * The review total, labelled as reviews. Safe to show ALONGSIDE the client label
 * — both are true and they answer different questions — but never as the
 * explanation of a rating on its own.
 */
export function reviewTotalLabel(reviews: number | null | undefined): string | null {
  const n = reviews ?? 0
  if (n <= 0) return null
  return `${n} ${n === 1 ? 'review' : 'reviews'}`
}

/**
 * The rating to DISPLAY for a provider, or null when they do not have one yet.
 *
 * `providers.average_rating` is `numeric(3,2) NOT NULL DEFAULT 0`, and since
 * PD-094 `providers.rating` mirrors it — so both are **0, never null**, for a
 * provider nobody has reviewed. Every surface that tested `!= null` therefore
 * rendered `★ 0.0` for every new provider: a zero-star claim about someone who
 * has simply not been rated. The provider's own profile said "New" on the same
 * data, because it tested `> 0`.
 *
 * That mattered least when no rating was real. PD-094 makes them real, so a
 * fabricated 0.0 now stands beside genuine 4.x values in Discover, search and
 * the post-decline alternatives — where it reads as a verdict rather than as an
 * absence.
 *
 * One helper, because "does this provider have a rating yet" is one question and
 * six screens were answering it differently.
 */
export function displayRating(
  p: { average_rating?: number | null; rating?: number | null } | null | undefined,
): number | null {
  const r = p?.average_rating ?? p?.rating
  if (r == null) return null
  const n = Number(r)
  // 0 is "not rated", not "rated zero" — the scale starts at 1.
  return Number.isFinite(n) && n > 0 ? n : null
}
