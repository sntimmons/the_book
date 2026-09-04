// Who authored a message. Pure logic, NO I/O — deliberately separate from hooks/useMessaging.ts,
// which imports the Supabase client and therefore cannot be imported by a unit test. Same seam
// as lib/barterErrors.ts, and for the same reason: this rule already went wrong once.
//
// `messages.sender_id` is nullable, and a NULL sender means the message was authored by the
// PLATFORM, not by either participant. That third case was the whole defect: the unread count
// was computed in JS (`null !== uid` → true → counted) while the mark-read write used a
// PostgREST `.neq`, which compiles to `sender_id <> uid` and is NULL for a null sender, so the
// row was excluded from the update set. Counted, never clearable. One definition now.

/** True when the message was not written by this user — including a platform notice. */
export function isNotMine(senderId: string | null, userId: string): boolean {
  return senderId !== userId
}

/** True when nobody authored it: a platform notice, attributable to neither participant. */
export function isSystemMessage(senderId: string | null): boolean {
  return senderId === null
}

/**
 * The PostgREST form of `isNotMine`, for `.or(...)`. `.neq` alone silently drops null senders
 * because SQL `NULL <> x` is NULL rather than TRUE — which is what made a platform notice
 * permanently unread.
 */
export function notMineFilter(userId: string): string {
  return `sender_id.is.null,sender_id.neq.${userId}`
}
