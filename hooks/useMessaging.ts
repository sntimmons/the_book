import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { checkRateLimit } from '../lib/rateLimit'
import { messageEntryAction } from '../lib/messageRequests'

// Monotonic counter so each hook instance gets a unique realtime channel name.
// Two concurrent mounts must not share a channel topic, or the second subscribe
// throws "cannot add postgres_changes after subscribe" and blanks the screen.
let channelInstanceSeq = 0

// IMPORTANT: live Supabase has a SINGULAR `conversation` table, not the
// plural `conversations` the spec assumed. Confirmed via REST probe:
//   GET /rest/v1/conversation → []  (table exists)
//   GET /rest/v1/conversations → PGRST205 (table not found)
// All queries below use the singular name.
//
// RLS state (verified on the live schema): `conversation` has RLS ENABLED and its
// SELECT policy is participant-scoped —
//     auth.uid() = client_id OR
//     auth.uid() IN (SELECT user_id FROM providers WHERE id = provider_id)
// so anon (whose auth.uid() is null) matches no participant rows and reads nothing
// (the earlier "empty array on probe" was anon being filtered out, not open access).
// A participant-scoped INSERT policy and the `messages` membership policies are
// likewise in place; the pre-booking request integrity (one initial message, no
// provider send while pending, no send after decline, provider-only accept/decline,
// client-only re-open, and the client force-pending / booking-ownership checks) is
// enforced by the SECURITY DEFINER triggers in migration 20260901000000.

export interface Conversation {
  id: string
  client_id: string
  provider_id: string
  booking_id: string | null
  last_message_at: string | null
  created_at: string
  // Pre-booking request lifecycle (null = open/booking/legacy conversation).
  request_status: 'pending' | 'accepted' | 'declined' | null
  other_party_name: string
  other_party_id: string
  last_message_preview: string
  unread_count: number
  booking_service?: string
}

export interface Message {
  id: string
  conversation_id: string
  sender_id: string
  content: string
  is_read: boolean
  created_at: string
  is_mine: boolean
}

export function useConversations() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  // Stable unique suffix for this hook instance's realtime channel.
  const channelIdRef = useRef<number | null>(null)
  if (channelIdRef.current === null) channelIdRef.current = ++channelInstanceSeq

  const fetchConversations = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      // conversation.provider_id holds a providers.id (provider row id), not an
      // auth id, so a provider must match on their providers.id — not user.id.
      // Resolve it first; null for non-providers (client-only filter then).
      const { data: providerRow } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()
      const providerDbId = providerRow?.id
      const orFilter = providerDbId
        ? `client_id.eq.${user.id},provider_id.eq.${providerDbId}`
        : `client_id.eq.${user.id}`
      const { data: convos, error } = await supabase
        .from('conversation')
        .select('*')
        .or(orFilter)
        .order('last_message_at', { ascending: false, nullsFirst: false })

      if (error) {
        console.log('Conversations error:', error)
        setConversations([])
        setLoading(false)
        return
      }

      if (!convos || convos.length === 0) {
        setConversations([])
        setLoading(false)
        return
      }

      // Was N+1 (3-4 queries per conversation). Now a constant number of batch
      // queries regardless of conversation count: gather the ids we need, then
      // fetch every dependency in one `.in(...)` round trip each and join in JS.
      const convoIds = convos.map((c) => c.id)
      const providerOtherIds: string[] = []
      const clientOtherIds: string[] = []
      const bookingIds: string[] = []
      for (const c of convos) {
        // The current user is the client on a conversation when client_id is
        // their auth id; otherwise they are the provider viewing it.
        if (c.client_id === user.id) providerOtherIds.push(c.provider_id)
        else clientOtherIds.push(c.client_id)
        if (c.booking_id) bookingIds.push(c.booking_id)
      }

      // One query each — all in parallel. Empty `.in([])` lists are valid and
      // simply return no rows, so these run unconditionally.
      const [messagesRes, providersRes, clientsRes, bookingsRes] = await Promise.all([
        supabase
          .from('messages')
          .select('conversation_id, content, created_at, sender_id, is_read')
          .in('conversation_id', convoIds)
          .order('created_at', { ascending: false }),
        supabase
          .from('providers')
          .select('id, display_name')
          .in('id', Array.from(new Set(providerOtherIds))),
        supabase
          .from('clients_provider')
          .select('id, name')
          .in('id', Array.from(new Set(clientOtherIds))),
        supabase
          .from('bookings')
          .select('id, service_name')
          .in('id', Array.from(new Set(bookingIds))),
      ])

      const providerName = new Map<string, string>()
      for (const p of (providersRes.data as { id: string; display_name: string | null }[] | null) ?? []) {
        providerName.set(p.id, p.display_name || 'Provider')
      }
      const clientName = new Map<string, string>()
      for (const c of (clientsRes.data as { id: string; name: string | null }[] | null) ?? []) {
        clientName.set(c.id, c.name || 'Client')
      }
      const bookingSvc = new Map<string, string>()
      for (const b of (bookingsRes.data as { id: string; service_name: string | null }[] | null) ?? []) {
        bookingSvc.set(b.id, b.service_name || '')
      }

      // Last message + unread count both derived from the single messages batch.
      // Rows are ordered created_at desc, so the first row seen per conversation
      // is its latest message.
      const lastMessage = new Map<string, string>()
      const unread = new Map<string, number>()
      for (const m of (messagesRes.data as
        | {
            conversation_id: string
            content: string
            created_at: string
            sender_id: string
            is_read: boolean
          }[]
        | null) ?? []) {
        if (!lastMessage.has(m.conversation_id)) {
          lastMessage.set(m.conversation_id, m.content ?? '')
        }
        if (!m.is_read && m.sender_id !== user.id) {
          unread.set(m.conversation_id, (unread.get(m.conversation_id) ?? 0) + 1)
        }
      }

      const enriched: Conversation[] = convos.map((convo) => {
        const isClient = convo.client_id === user.id
        const otherPartyId = isClient ? convo.provider_id : convo.client_id
        const otherPartyName = isClient
          ? providerName.get(convo.provider_id) ?? 'Provider'
          : clientName.get(convo.client_id) ?? 'Client'
        return {
          ...convo,
          other_party_name: otherPartyName,
          other_party_id: otherPartyId,
          last_message_preview: lastMessage.get(convo.id) ?? '',
          unread_count: unread.get(convo.id) ?? 0,
          booking_service: convo.booking_id ? bookingSvc.get(convo.booking_id) ?? '' : '',
        } as Conversation
      })

      setConversations(enriched)
    } catch (err) {
      console.log('Fetch convos error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchConversations()

    // Realtime: refetch the whole inbox on any conversation change or new
    // message. Cheap enough for an inbox of <100 rows.
    const channel = supabase
      .channel('conversations-' + user.id + '-' + channelIdRef.current)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation' },
        () => fetchConversations(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => fetchConversations(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, fetchConversations])

  return { conversations, loading, refetch: fetchConversations }
}

export function useMessages(conversationId: string) {
  const { user } = useAuth()
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  // Stable unique suffix for this hook instance's realtime channel.
  const channelIdRef = useRef<number | null>(null)
  if (channelIdRef.current === null) channelIdRef.current = ++channelInstanceSeq

  const fetchMessages = useCallback(async () => {
    if (!conversationId || !user) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })
      if (error) {
        console.log('Messages error:', error)
        setLoading(false)
        return
      }
      const rows = (data ?? []) as Array<{
        id: string
        conversation_id: string
        sender_id: string
        content: string
        is_read: boolean
        created_at: string
      }>
      setMessages(
        rows.map((m) => ({ ...m, is_mine: m.sender_id === user.id })),
      )
    } catch (err) {
      console.log('Fetch messages error:', err)
    } finally {
      setLoading(false)
    }
  }, [conversationId, user])

  const markMessagesRead = useCallback(async () => {
    if (!user || !conversationId) return
    await supabase
      .from('messages')
      .update({ is_read: true })
      .eq('conversation_id', conversationId)
      .neq('sender_id', user.id)
      .eq('is_read', false)
  }, [user, conversationId])

  useEffect(() => {
    if (!conversationId || !user) return
    fetchMessages()
    markMessagesRead()

    const channel = supabase
      .channel('messages-' + conversationId + '-' + channelIdRef.current)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: 'conversation_id=eq.' + conversationId,
        },
        (payload) => {
          const newMsg = payload.new as {
            id: string
            conversation_id: string
            sender_id: string
            content: string
            is_read: boolean
            created_at: string
          }
          setMessages((prev) => {
            // Guard against duplicate from our own optimistic INSERT round-trip
            if (prev.some((m) => m.id === newMsg.id)) return prev
            return [...prev, { ...newMsg, is_mine: newMsg.sender_id === user.id }]
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, user, fetchMessages, markMessagesRead])

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      if (!user || !content.trim() || !conversationId) return false
      setSending(true)

      // Server-side rate limit (max 30 messages/min/user). Expected behavior,
      // not an error — no Sentry capture.
      const rl = await checkRateLimit(user.id, 'message_send')
      if (!rl.allowed) {
        setSending(false)
        Alert.alert(
          'Slow down',
          rl.message ?? 'You are sending messages too quickly. Please slow down.',
        )
        return false
      }

      try {
        const { error } = await supabase.from('messages').insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: content.trim(),
          is_read: false,
          created_at: new Date().toISOString(),
        })
        if (error) {
          console.log('Send error:', error)
          setSending(false)
          return false
        }
        await supabase
          .from('conversation')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', conversationId)
        setSending(false)
        return true
      } catch (err) {
        console.log('Send exception:', err)
        setSending(false)
        return false
      }
    },
    [user, conversationId],
  )

  return { messages, loading, sending, sendMessage, refetch: fetchMessages }
}

// Get or create a 1:1 conversation between a client (auth.users id) and a
// provider (providers table id). bookingId is optional context.
//
// Resolution is delegated to `resolve_conversation` because a provider<->provider pair has
// TWO legal representations of the same conversation -- `client_id` is a user id while
// `provider_id` is a providers row id, so the same two people can be written either way round
// and `conversation_unique_pair` cannot tell that the two rows are the same pair. Resolving
// one orientation here (as this function used to) created a SECOND thread for a pair that
// already had one, splitting their history. The RPC resolves both orientations against the
// server-owned canonical key and creates the row inside one statement, so a concurrent caller
// cannot win a race that leaves two.
//
// Booking attach is deliberately unchanged and still happens here: this function resolves a
// different row than it used to, and does nothing differently once it has one.
export async function getOrCreateConversation(
  clientId: string,
  providerId: string,
  bookingId?: string | null,
): Promise<string | null> {
  try {
    const { data: convId, error: resolveError } = await supabase.rpc('resolve_conversation', {
      p_client_id: clientId,
      p_provider_id: providerId,
      p_booking_id: bookingId ?? null,
    })
    if (resolveError || !convId) {
      console.log('Resolve convo error:', resolveError)
      return null
    }

    const { data: existing } = await supabase
      .from('conversation')
      .select('id, booking_id, request_status')
      .eq('id', convId)
      .maybeSingle()

    // A real booking supersedes any prior pre-booking REQUEST for this pair:
    // attach the booking and open the conversation for two-way messaging, so a
    // pending/declined request never blocks messaging about an actual booking.
    // Never overwrite an existing booking_id — that stays the initial booking;
    // later bookings for the same pair simply reuse this thread.
    if (bookingId && existing && !existing.booking_id) {
      const { error: attachError } = await supabase
        .from('conversation')
        .update({ booking_id: bookingId, request_status: 'accepted' })
        .eq('id', existing.id)
      if (attachError) {
        // Don't silently pretend the booking attached — the conversation may
        // still be request-gated (pending/declined), so surface the failure to
        // the caller (null) instead of returning an id it would treat as an
        // open chat. (No console here to avoid new lint debt; the null return
        // is the actionable signal.)
        return null
      }
    }
    return convId as string
  } catch (err) {
    console.log('getOrCreate error:', err)
    return null
  }
}

// ── Pre-booking message requests ─────────────────────────────────────────────
// A client's pre-booking contact is a REQUEST, not a free chat: one initial
// message, then the provider accepts/declines. The server (RLS + triggers)
// enforces this; these helpers drive the client/provider UI.

export interface PrebookingConversation {
  id: string
  request_status: 'pending' | 'accepted' | 'declined' | null
  booking_id: string | null
}

// The existing conversation for a client↔provider pair, or null. Used to decide
// whether "Message" opens a thread or composes a new request.
export async function findConversation(
  clientId: string,
  providerId: string,
): Promise<PrebookingConversation | null> {
  // Canonical, because a provider pair's thread may be stored in either orientation. Resolving
  // only the caller's orientation reported "no thread" for a pair that has one, sent the user
  // to a compose screen, and the insert that followed was refused by the pair index.
  const { data, error } = await supabase.rpc('find_conversation', {
    p_client_id: clientId,
    p_provider_id: providerId,
  })
  if (error) {
    console.log('Find conversation error:', error)
    return null
  }
  const rows = (data as PrebookingConversation[] | null) ?? []
  return rows.length > 0 ? rows[0] : null
}

// Send a pre-booking message request: create a new pending conversation with the
// first message, OR re-open a previously declined one. Returns the conversation id.
// Refuses to create a second message if an open/pending conversation already exists
// (the server also enforces this) — returns that conversation id instead.
export async function sendPrebookingRequest(
  clientId: string,
  providerId: string,
  firstMessage: string,
): Promise<{ conversationId: string | null; created: boolean; error?: string }> {
  const body = firstMessage.trim()
  if (!body) return { conversationId: null, created: false, error: 'Message is empty.' }
  try {
    const existing = await findConversation(clientId, providerId)

    // An open or already-pending conversation exists -> do not create a duplicate;
    // just open it (the caller navigates there).
    if (existing && existing.request_status !== 'declined') {
      return { conversationId: existing.id, created: false }
    }

    let conversationId: string
    const nowIso = new Date().toISOString()
    if (existing && existing.request_status === 'declined') {
      // Re-request: re-open the declined conversation before sending.
      const { error: reErr } = await supabase
        .from('conversation')
        .update({ request_status: 'pending', request_opened_at: nowIso })
        .eq('id', existing.id)
      if (reErr) {
        // Never surface the raw trigger text. Only the client may re-open a declined request,
        // so for a provider<->provider pair the party in the PROVIDER slot lands here and the
        // server correctly refuses. Whether they should be able to initiate at all is a
        // product question (provider-initiated contact is deliberately not request-gated
        // elsewhere) and is NOT decided here -- but they must not read a database error.
        return {
          conversationId: null,
          created: false,
          error: 'This conversation cannot be re-opened from here.',
        }
      }
      conversationId = existing.id
    } else {
      // Created through the authoritative path, not a direct insert: a direct insert in the
      // caller's orientation is refused when the pair already has a thread the other way
      // round, and returned the raw constraint text to the user. The server clamps a
      // client-initiated conversation to 'pending' and stamps request_opened_at itself, so the
      // request semantics are unchanged by going through the RPC.
      const { data: createdId, error: cErr } = await supabase.rpc('resolve_conversation', {
        p_client_id: clientId,
        p_provider_id: providerId,
        p_booking_id: null,
      })
      // No console: the returned error is surfaced to the user, which is the actionable
      // signal. Same convention as the booking-attach branch above.
      if (cErr || !createdId) {
        return { conversationId: null, created: false, error: 'Could not start this message.' }
      }
      conversationId = createdId as string
    }

    const { error: mErr } = await supabase.from('messages').insert({
      conversation_id: conversationId,
      sender_id: clientId,
      content: body,
      is_read: false,
      created_at: new Date().toISOString(),
    })
    if (mErr) return { conversationId, created: false, error: mErr.message }
    return { conversationId, created: true }
  } catch (err: any) {
    return { conversationId: null, created: false, error: err?.message ?? 'Failed to send request.' }
  }
}

// Provider accepts/declines an incoming pending request. Server enforces that only
// the provider owner may do this and only from 'pending'.
export async function setRequestStatus(
  conversationId: string,
  status: 'accepted' | 'declined',
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('conversation')
    .update({ request_status: status })
    .eq('id', conversationId)
  if (error) {
    return { ok: false, error: error.message }
  }
  return { ok: true }
}

// Centralized "Message" entry for ANY client-initiated pre-booking contact
// (provider profile, no-availability booking path, …). Resolves — via the same
// messageEntryAction decision — whether to open an existing open/pending
// conversation or compose a new request, and navigates there. Booking-linked
// conversations are unaffected (they are reached through their own flows).
export async function openMessageEntry(
  clientId: string,
  providerId: string,
  providerName?: string,
): Promise<void> {
  const existing = await findConversation(clientId, providerId)
  const action = messageEntryAction(existing?.request_status ?? null, !!existing)
  if (action === 'open' && existing) {
    router.push(`/messages/${existing.id}` as never)
  } else {
    router.push({
      pathname: '/messages/new',
      params: { providerId, providerName: providerName ?? '' },
    } as never)
  }
}
