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

/**
 * Does this message count as unread FOR this user?
 *
 * A platform notice carries `system_recipient_id`: the participant it is for. The actor who
 * caused it already confirmed the action and watched their own screen change, so badging them
 * for their own act is noise. NULL means addressed to both — which is every ordinary message,
 * so their behaviour is unchanged.
 */
export function countsAsUnread(
  senderId: string | null,
  systemRecipientId: string | null,
  userId: string,
): boolean {
  if (!isNotMine(senderId, userId)) return false
  if (systemRecipientId === null) return true
  return systemRecipientId === userId
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

/**
 * PostgREST form of the addressing rule, for the unread/notification queries: a message is
 * either addressed to everyone (NULL) or to me. Combined with `notMineFilter` this yields
 * "not mine AND addressed to me".
 */
export function addressedToMeFilter(userId: string): string {
  return `system_recipient_id.is.null,system_recipient_id.eq.${userId}`
}
