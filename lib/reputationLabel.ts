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
