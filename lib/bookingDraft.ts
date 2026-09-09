import { supabase } from '@/lib/supabase'

// Convert "May 28, 2026" to "2026-05-28" for the date column.
export function toIsoDate(displayDate: string): string {
  const d = new Date(displayDate)
  if (Number.isNaN(d.getTime())) return displayDate
  const yyyy = d.getFullYear()
  const mm = (d.getMonth() + 1).toString().padStart(2, '0')
  const dd = d.getDate().toString().padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

// Assemble an ISO timestamp from a YYYY-MM-DD date and a "H:MM AM/PM" time
// using numeric parts. Hermes (React Native's engine) cannot parse locale
// strings like "June 21, 2026 11:00 AM" via new Date(), so we never rely on
// string parsing. Returns null if inputs are missing or malformed, so a bad
// value can never throw "Date value out of bounds" (appointment_time is
// nullable).
export function buildAppointmentTime(
  isoDate: string | null | undefined,
  displayTime: string | null | undefined,
): string | null {
  if (!isoDate || !displayTime) return null
  const dateMatch = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const timeMatch = displayTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i)
  if (!dateMatch || !timeMatch) return null
  let hour = parseInt(timeMatch[1], 10) % 12
  if (/PM/i.test(timeMatch[3])) hour += 12
  const d = new Date(
    parseInt(dateMatch[1], 10),
    parseInt(dateMatch[2], 10) - 1,
    parseInt(dateMatch[3], 10),
    hour,
    parseInt(timeMatch[2], 10),
  )
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}

// The client half of "one intent = one request" (Correction 3, items J and K).
//
// ── WHY THE ROW EXISTS BEFORE THE CONTRACT STEP ───────────────────────────
//
// The booking used to be inserted on the very last screen, after signing. That
// ordering forced two things this correction removes. Contract access had to be
// granted on "any live provider" rather than on a transaction the client is
// actually in (item J), because there was no transaction to point at yet. And
// every failure between the first screen and the last — a dropped network, a
// failed signature insert, a back-out and a re-entry — either lost the whole
// attempt or risked a second request for the same intent (item K).
//
// So the row is created as a DRAFT as soon as the flow has the details, and the
// same row is carried through the contract, the signature and the submit. A
// draft has `submitted_at IS NULL`, which means NO PROVIDER CAN SEE IT: the
// provider SELECT policy requires that column to be non-null. An abandoned flow
// leaves a private, invisible draft, not a request someone has to answer.
//
// ── ONE DRAFT PER CLIENT PER PROVIDER ─────────────────────────────────────
//
// Enforced by the partial unique index `bookings_one_draft_per_pair`, so a
// concurrent second attempt is impossible rather than merely unlikely. This
// module's job is to RESUME that row: look it up, revise it in place, and never
// insert a second one. The unique-violation path below is not defensive
// decoration — two devices, or a double tap that outruns the first insert, land
// there, and the correct response is to adopt the row that won.

export interface BookingDraftDetails {
  providerId: string
  serviceId: string | null
  serviceName: string
  requestedDate: string
  requestedTime: string
  appointmentTime: string | null
  message: string | null
  paymentAmount: number
}

// Raised when the provider is no longer taking new bookings (item H). The
// database refuses the INSERT with PT426; this surfaces it as a distinct type so
// callers can show the availability wording rather than a generic failure.
export class ProviderUnavailableError extends Error {
  constructor() {
    super('This provider is not currently available for new bookings.')
    this.name = 'ProviderUnavailableError'
  }
}

const DRAFT_COLUMNS = 'id, provider_id, submitted_at, status'

// A zero-row write is NOT a success.
//
// RLS expresses authorization as a USING clause, which FILTERS rows rather than
// raising — so a write the policy refuses comes back with `error === null` and no
// rows. Treating that as success is how a client gets told "BOOKING REQUEST SENT"
// for a request that was never written, which is the worst outcome this module
// has. Every write below therefore asks for the affected row back and checks it.
export class BookingWriteBlockedError extends Error {
  constructor(what: string) {
    super(`That ${what} could not be saved. Please try again.`)
    this.name = 'BookingWriteBlockedError'
  }
}

function isUniqueViolation(error: { code?: string } | null): boolean {
  return error?.code === '23505'
}

function isProviderUnavailable(error: { code?: string; message?: string } | null): boolean {
  // PostgREST surfaces the SQLSTATE the trigger raised. Match on the code, not
  // the message, so the copy can be reworded without breaking the branch.
  return error?.code === 'PT426'
}

// The client's existing draft with this provider, or null. Never throws for
// "none found" — only for a technical failure, because a failed lookup must not
// be mistaken for "no draft" and cause a second row to be inserted.
async function findDraft(userId: string, providerId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('bookings')
    .select(DRAFT_COLUMNS)
    .eq('user_id', userId)
    .eq('provider_id', providerId)
    .is('submitted_at', null)
    // A LIVE draft only. A client who abandoned an earlier attempt leaves a
    // `cancelled_by_client` row that is still `submitted_at IS NULL`; adopting it
    // would hand the flow a row the client's own UPDATE policy no longer admits,
    // and every write against it would be filtered to zero rows. That produced a
    // permanent per-provider lockout behind a success screen. The matching
    // partial index (`20261045000000`) carries the same `status = 'pending'`
    // term, so a cancelled draft frees the slot rather than holding it forever.
    .eq('status', 'pending')
    .maybeSingle()
  // Rethrown, not logged: the caller decides what to say, and the error object
  // reaches it intact. What must NOT happen is returning null on a failure —
  // that would read as "no draft" and insert a second one.
  if (error) throw error
  return data ? (data as { id: string }).id : null
}

// Find-or-create the draft for this (client, provider) pair and bring it up to
// date with what the flow currently holds.
//
// Every field written here is one the write-integrity trigger allows a client to
// revise WHILE the row is a draft and freezes the moment it is submitted, which
// is what lets the client move backwards through the steps and change their mind
// without stranding a half-finished request. `status`, `submitted_at` and
// `expires_at` are all server-controlled and are deliberately not sent.
export async function ensureBookingDraft(
  userId: string,
  details: BookingDraftDetails,
): Promise<string> {
  const row = {
    service_id: details.serviceId,
    service_name: details.serviceName,
    requested_date: details.requestedDate,
    requested_time: details.requestedTime,
    appointment_time: details.appointmentTime,
    message: details.message,
    payment_amount: details.paymentAmount,
  }

  const existing = await findDraft(userId, details.providerId)
  if (existing) {
    const { data, error } = await supabase
      .from('bookings')
      .update(row)
      .eq('id', existing)
      .select('id')
    if (error) throw error
    if (((data as { id: string }[] | null) ?? []).length === 0) {
      throw new BookingWriteBlockedError('booking')
    }
    return existing
  }

  const { data, error } = await supabase
    .from('bookings')
    .insert({
      user_id: userId,
      provider_id: details.providerId,
      created_at: new Date().toISOString(),
      ...row,
    })
    .select('id')
    .single()

  if (error) {
    if (isProviderUnavailable(error)) throw new ProviderUnavailableError()
    // Lost the race for the one draft slot. Adopt the row that won rather than
    // reporting a failure to a client who did nothing wrong.
    if (isUniqueViolation(error)) {
      const won = await findDraft(userId, details.providerId)
      if (won) {
        const { data: wonRows, error: updateError } = await supabase
          .from('bookings')
          .update(row)
          .eq('id', won)
          .select('id')
        if (updateError) throw updateError
        if (((wonRows as { id: string }[] | null) ?? []).length === 0) {
          throw new BookingWriteBlockedError('booking')
        }
        return won
      }
    }
    console.log('Insert booking draft error:', error)
    throw error
  }

  return (data as { id: string }).id
}

// Turn the draft into a real request. This is the ONLY moment the provider can
// see it, and the only moment the 72-hour clock starts.
//
// The value sent is ignored: the trigger stamps `submitted_at` with server time
// and derives `expires_at` from it, so a wrong device clock cannot lengthen or
// shorten a provider's window to answer. We still have to send SOMETHING
// non-null, because the transition is "null -> not null" and the trigger reads
// the column to detect it.
//
// IDEMPOTENT. A request that is already submitted returns quietly instead of
// erroring: a double tap, or a retry after a response the client never saw, must
// land on the same request rather than on an error screen. Re-submission is
// refused by the trigger, so this checks first rather than relying on the message.
export async function submitBookingRequest(bookingId: string): Promise<void> {
  const { data, error: readError } = await supabase
    .from('bookings')
    .select('id, submitted_at')
    .eq('id', bookingId)
    .single()
  if (readError) throw readError
  if ((data as { submitted_at: string | null }).submitted_at) return

  const { data: updated, error } = await supabase
    .from('bookings')
    .update({ submitted_at: new Date().toISOString() })
    .eq('id', bookingId)
    // THE MOST IMPORTANT `.select()` IN THIS MODULE. Without it a policy-filtered
    // submit returns no error and no rows, this function returns normally, and
    // the client is shown a confirmation screen for a request that was never
    // sent. The row is asked for back, and its absence is a failure.
    .select('id, submitted_at')
  if (error) throw error
  const rows = (updated as { id: string; submitted_at: string | null }[] | null) ?? []
  if (rows.length === 0 || !rows[0].submitted_at) {
    throw new BookingWriteBlockedError('request')
  }
}
