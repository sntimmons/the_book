import { useCallback, useEffect, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { isSystemMessage, notMineFilter } from '@/lib/messageAuthorship'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// Monotonic counter so each hook instance gets a unique realtime channel name.
// Two concurrent mounts (e.g. router.push stacking a duplicate screen) must not
// share a channel topic, or the second subscribe throws
// "cannot add postgres_changes after subscribe" and blanks the screen.
let channelInstanceSeq = 0

// Read-notification IDs persist across app restarts so cleared badges stay
// cleared. Capped so the stored list can never grow unbounded; when over the
// cap the oldest IDs (front of the array) are dropped.
const READ_STORAGE_KEY = '@the_book/read_notifications'
const READ_CAP = 500

// In-app notifications are derived from the bookings table for now since
// there is no notifications table in Supabase. A notification is just an
// interesting status transition on a booking the current user is part of.

export type NotificationType =
  | 'booking_accepted'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'new_booking_request'
  | 'booking_completed'
  | 'new_message'

export interface AppNotification {
  id: string
  bookingId: string
  type: NotificationType
  title: string
  body: string
  isRead: boolean
  createdAt: string
  providerId?: string
  clientId?: string
}

interface ClientBookingRow {
  id: string
  status: string
  service_name: string | null
  provider_id: string
  payment_amount: number | null
  created_at: string
  provider_confirmed_at: string | null
  cancelled_at: string | null
  completed_at: string | null
}

interface ProviderBookingRow {
  id: string
  status: string
  service_name: string | null
  user_id: string
  created_at: string
  cancelled_at: string | null
}

export function useNotifications() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  // Stable unique suffix for this hook instance's realtime channel.
  const channelIdRef = useRef<number | null>(null)
  if (channelIdRef.current === null) channelIdRef.current = ++channelInstanceSeq

  // Load persisted read IDs once on mount and re-stamp any notifications that
  // have already loaded, so restored badges clear immediately.
  useEffect(() => {
    let active = true
    AsyncStorage.getItem(READ_STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return
        const ids = JSON.parse(raw) as unknown
        if (!Array.isArray(ids)) return
        const loaded = new Set<string>(ids as string[])
        setReadIds(loaded)
        setNotifications((prev) => {
          const stamped = prev.map((n) => ({ ...n, isRead: loaded.has(n.id) }))
          setUnreadCount(stamped.filter((n) => !n.isRead).length)
          return stamped
        })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setLoading(false)
      return
    }
    try {
      setLoading(true)
      const { data: providerRow } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      const notifs: AppNotification[] = []

      // Client side: their bookings that landed on a notable status.
      const { data: clientBookings } = await supabase
        .from('bookings')
        .select(
          'id, status, service_name, provider_id, payment_amount, created_at, provider_confirmed_at, cancelled_at, completed_at',
        )
        .eq('user_id', user.id)
        // Anchored on completed_at as well as status: a booking that completed and
        // then legally moved off 'completed' must still surface its completion (and
        // the review prompt it carries). Filtering on status alone re-introduced the
        // same live-status pre-test one layer down (CODE-DUP-028).
        .or(
          'status.in.(accepted,cancelled_by_provider,completed),completed_at.not.is.null',
        )
        .order('created_at', { ascending: false })
        .limit(20)

      for (const b of (clientBookings ?? []) as ClientBookingRow[]) {
        const serviceLabel = b.service_name ?? 'Your booking'
        if (b.status === 'accepted' && b.provider_confirmed_at) {
          notifs.push({
            id: 'accepted_' + b.id,
            bookingId: b.id,
            type: 'booking_accepted',
            title: 'Booking Confirmed',
            body: `${serviceLabel} has been confirmed.`,
            isRead: false,
            createdAt: b.provider_confirmed_at,
            providerId: b.provider_id,
          })
        }
        // `!b.completed_at`: a booking that actually happened must never also be
        // described as never confirmed. Anchoring the completion notice on
        // completed_at (below) made that pair reachable for a completed booking the
        // provider later cancelled; completion is the truthful outcome, so it wins
        // and the decline notice is suppressed (QA-TRUTH-003).
        if (b.status === 'cancelled_by_provider' && b.cancelled_at && !b.completed_at) {
          notifs.push({
            id: 'declined_' + b.id,
            bookingId: b.id,
            type: 'booking_declined',
            title: 'Booking Unavailable',
            body: `${serviceLabel} could not be confirmed. No charge was made.`,
            isRead: false,
            createdAt: b.cancelled_at,
            providerId: b.provider_id,
          })
        }
        // Anchored on completed_at alone, not live status (SEC-AUTHZ-001 /
        // CODE-DUP-010). completed_at is server-stamped once and immutable, so it is
        // the durable record that the appointment happened; a later status change
        // must not retract the "Appointment Complete" notification or the review
        // prompt it carries. The satisfaction screen it links to still resolves the
        // authoritative opportunity, so a booking that is no longer reviewable lands
        // on a truthful terminal state rather than a form.
        if (b.completed_at) {
          notifs.push({
            id: 'completed_' + b.id,
            bookingId: b.id,
            type: 'booking_completed',
            title: 'Appointment Complete',
            body: `How was your ${serviceLabel}? Leave a review.`,
            isRead: false,
            createdAt: b.completed_at,
          })
        }
      }

      // Provider side: pending requests + client cancellations.
      if (providerRow) {
        const { data: providerBookings } = await supabase
          .from('bookings')
          .select('id, status, service_name, user_id, created_at, cancelled_at')
          .eq('provider_id', providerRow.id)
          .in('status', ['pending', 'cancelled_by_client'])
          .order('created_at', { ascending: false })
          .limit(20)

        for (const b of (providerBookings ?? []) as ProviderBookingRow[]) {
          const serviceLabel = b.service_name ?? 'a booking'
          if (b.status === 'pending') {
            notifs.push({
              id: 'request_' + b.id,
              bookingId: b.id,
              type: 'new_booking_request',
              title: 'New Booking Request',
              body: `Someone requested ${serviceLabel}.`,
              isRead: false,
              createdAt: b.created_at,
              clientId: b.user_id,
            })
          }
          if (b.status === 'cancelled_by_client' && b.cancelled_at) {
            notifs.push({
              id: 'cancelled_' + b.id,
              bookingId: b.id,
              type: 'booking_cancelled',
              title: 'Booking Cancelled',
              body: `${serviceLabel} was cancelled by the client.`,
              isRead: false,
              createdAt: b.cancelled_at,
            })
          }
        }
      }

      // MESSAGE NOTIFICATIONS: one per conversation with unread messages
      // the current user did not send. Uses the singular `conversation`
      // table (the live DB name; the plural form does not exist).
      // conversation.provider_id holds a providers.id (provider row id), not an
      // auth id, so a provider must match on their providers.id — not user.id.
      // Reuse providerRow resolved above; null for non-providers (then the
      // filter is client-only).
      const providerDbId = providerRow?.id
      const convoOrFilter = providerDbId
        ? `client_id.eq.${user.id},provider_id.eq.${providerDbId}`
        : `client_id.eq.${user.id}`
      const { data: userConvos } = await supabase
        .from('conversation')
        .select('id, client_id, provider_id')
        .or(convoOrFilter)

      if (userConvos && userConvos.length > 0) {
        const convoIds = userConvos.map((c) => c.id)
        const { data: unreadMessages } = await supabase
          .from('messages')
          .select('id, conversation_id, sender_id, content, created_at')
          .in('conversation_id', convoIds)
          .eq('is_read', false)
          .or(notMineFilter(user.id))
          .order('created_at', { ascending: false })
          .limit(10)

        const seenConvos = new Set<string>()
        for (const msg of (unreadMessages ?? []) as Array<{
          id: string
          conversation_id: string
          // Nullable: a platform notice is authored by nobody. Declaring it `string` here was
          // the same contract lie that let the null case go unhandled in the messaging hook.
          sender_id: string | null
          content: string
          created_at: string
        }>) {
          if (seenConvos.has(msg.conversation_id)) continue
          seenConvos.add(msg.conversation_id)

          const convo = userConvos.find((c) => c.id === msg.conversation_id)
          if (!convo) continue

          const isClient = convo.client_id === user.id
          const otherId = isClient ? convo.provider_id : convo.client_id

          let senderName = 'Someone'
          if (isClient) {
            const { data: provider } = await supabase
              .from('providers')
              .select('display_name')
              .eq('id', otherId)
              .maybeSingle()
            senderName = provider?.display_name || 'Provider'
          } else {
            const { data: client } = await supabase
              .from('clients_provider')
              .select('name')
              .eq('id', otherId)
              .maybeSingle()
            senderName = client?.name || 'Client'
          }

          const preview =
            msg.content.length > 50
              ? msg.content.substring(0, 50) + '...'
              : msg.content

          notifs.push({
            // bookingId field carries the conversation_id for routing.
            id: 'msg_' + msg.conversation_id,
            bookingId: msg.conversation_id,
            type: 'new_message',
            // A platform notice is authored by nobody, so it must not be attributed to the
            // counterparty. Including null senders in the query above without handling them
            // here would have told BOTH providers that the OTHER one sent the release notice --
            // the impersonation the sender_id IS NULL representation exists to prevent,
            // defeated one layer above the database.
            title: isSystemMessage(msg.sender_id)
              ? 'Update on your trade'
              : `${senderName} sent you a message`,
            body: preview,
            isRead: false,
            createdAt: msg.created_at,
          })
        }
      }

      notifs.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )

      // Apply session-local read state so the bell badge clears between
      // refetches. Cleared when the user signs out (hook remounts).
      setReadIds((prev) => {
        const stamped = notifs.map((n) => ({ ...n, isRead: prev.has(n.id) }))
        setNotifications(stamped)
        setUnreadCount(stamped.filter((n) => !n.isRead).length)
        return prev
      })
    } catch (err) {
      console.log('Notifications error:', err)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    fetchNotifications()

    // Realtime: any INSERT or UPDATE on bookings triggers a refetch.
    // Requires the bookings table to have Realtime enabled in the
    // Supabase dashboard (Database -> Replication).
    const channel = supabase
      .channel('notifications-' + user.id + '-' + channelIdRef.current)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'bookings' },
        () => {
          fetchNotifications()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'bookings' },
        () => {
          fetchNotifications()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => {
          fetchNotifications()
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages' },
        () => {
          fetchNotifications()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [user, fetchNotifications])

  const markAllRead = useCallback(() => {
    setReadIds((prev) => {
      const next = new Set(prev)
      for (const n of notifications) {
        next.add(n.id)
      }
      // Cap to the most recent READ_CAP ids (insertion order = age; drop oldest)
      // and persist so cleared badges stay cleared across restarts.
      let arr = [...next]
      if (arr.length > READ_CAP) arr = arr.slice(arr.length - READ_CAP)
      AsyncStorage.setItem(READ_STORAGE_KEY, JSON.stringify(arr)).catch(() => {})
      return new Set(arr)
    })
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    setUnreadCount(0)
  }, [notifications])

  return {
    notifications,
    unreadCount,
    loading,
    refetch: fetchNotifications,
    markAllRead,
  }
}
