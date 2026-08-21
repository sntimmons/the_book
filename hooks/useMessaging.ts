import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert } from 'react-native'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { checkRateLimit } from '../lib/rateLimit'

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
// RLS POLICIES STILL NEEDED before any real users touch the app:
//
//   conversation INSERT:
//     auth.uid() = client_id OR
//     auth.uid() IN (SELECT user_id FROM providers WHERE id = provider_id)
//
//   conversation SELECT:
//     auth.uid() = client_id OR
//     auth.uid() IN (SELECT user_id FROM providers WHERE id = provider_id)
//
//   messages INSERT:
//     auth.uid() = sender_id AND auth.uid() IN (
//       SELECT client_id FROM conversation WHERE id = conversation_id
//       UNION
//       SELECT p.user_id FROM providers p
//         JOIN conversation c ON c.provider_id = p.id
//         WHERE c.id = conversation_id
//     )
//
//   messages SELECT: same membership check as INSERT minus the sender_id eq.
//
// `messages` already has RLS on; `conversation` SELECT currently allows
// anon (empty array on probe). Tighten both before launch.

export interface Conversation {
  id: string
  client_id: string
  provider_id: string
  booking_id: string | null
  last_message_at: string | null
  created_at: string
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

      const enriched = await Promise.all(
        convos.map(async (convo) => {
          const isClient = convo.client_id === user.id
          const otherPartyId = isClient ? convo.provider_id : convo.client_id

          let otherPartyName = 'Unknown'
          if (isClient) {
            const { data: provider } = await supabase
              .from('providers')
              .select('display_name')
              .eq('id', otherPartyId)
              .maybeSingle()
            otherPartyName = provider?.display_name || 'Provider'
          } else {
            const { data: client } = await supabase
              .from('clients')
              .select('name')
              .eq('id', otherPartyId)
              .maybeSingle()
            otherPartyName = client?.name || 'Client'
          }

          const { data: lastMsg } = await supabase
            .from('messages')
            .select('content, created_at, sender_id, is_read')
            .eq('conversation_id', convo.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

          const { count: unreadCount } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', convo.id)
            .eq('is_read', false)
            .neq('sender_id', user.id)

          let bookingService = ''
          if (convo.booking_id) {
            const { data: booking } = await supabase
              .from('bookings')
              .select('service_name')
              .eq('id', convo.booking_id)
              .maybeSingle()
            bookingService = booking?.service_name || ''
          }

          return {
            ...convo,
            other_party_name: otherPartyName,
            other_party_id: otherPartyId,
            last_message_preview: lastMsg?.content ?? '',
            unread_count: unreadCount ?? 0,
            booking_service: bookingService,
          } as Conversation
        }),
      )

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
export async function getOrCreateConversation(
  clientId: string,
  providerId: string,
  bookingId?: string | null,
): Promise<string | null> {
  try {
    const { data: existing } = await supabase
      .from('conversation')
      .select('id')
      .eq('client_id', clientId)
      .eq('provider_id', providerId)
      .maybeSingle()
    if (existing) return existing.id

    const { data: created, error } = await supabase
      .from('conversation')
      .insert({
        client_id: clientId,
        provider_id: providerId,
        booking_id: bookingId ?? null,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) {
      console.log('Create convo error:', error)
      // A concurrent call (or double-tap) may have created the row between our
      // SELECT and INSERT. With the conversation_unique_pair constraint in
      // place this surfaces as a unique violation (23505) — recover by fetching
      // the row that now exists instead of returning null.
      if (error.code === '23505') {
        const { data: existingAfter } = await supabase
          .from('conversation')
          .select('id')
          .eq('client_id', clientId)
          .eq('provider_id', providerId)
          .maybeSingle()
        if (existingAfter) return existingAfter.id
      }
      return null
    }
    return created.id
  } catch (err) {
    console.log('getOrCreate error:', err)
    return null
  }
}
