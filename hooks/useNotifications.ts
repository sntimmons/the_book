import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

// In-app notifications are derived from the bookings table for now since
// there is no notifications table in Supabase. A notification is just an
// interesting status transition on a booking the current user is part of.

export type NotificationType =
  | 'booking_accepted'
  | 'booking_declined'
  | 'booking_cancelled'
  | 'new_booking_request'
  | 'booking_completed'

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
        .in('status', [
          'accepted',
          'cancelled_by_provider',
          'completed',
        ])
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
        if (b.status === 'cancelled_by_provider' && b.cancelled_at) {
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
        if (b.status === 'completed' && b.completed_at) {
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
      .channel('notifications-' + user.id)
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
      return next
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
