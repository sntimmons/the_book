import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { StatusBar } from 'expo-status-bar'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { getOrCreateConversation } from '../../hooks/useMessaging'
import { bookingListNote, bookingRequestUrgency, RequestUrgency } from '../../lib/bookingStatus'
import { reviewEntryFor, ReviewOpportunity } from '../../lib/reviews'
import { useReviewOpportunity } from '../../hooks/useReviewOpportunity'
import { useTheme } from '@/context/ThemeContext'
import Button from '@/components/ui/Button'
import StatusBadge from '@/components/ui/StatusBadge'
import Avatar from '@/components/ui/Avatar'

interface BookingDetail {
  id: string
  user_id: string
  provider_id: string
  service_name: string | null
  service_id: string | null
  requested_date: string | null
  requested_time: string | null
  appointment_time: string | null
  message: string | null
  status: string
  payment_status: string | null
  payment_amount: number | null
  created_at: string
  // NULL means this row is still an unsent DRAFT inside the booking flow. It is
  // invisible to the provider, and nothing here may describe it as a request
  // anyone has been asked to answer.
  submitted_at: string | null
  expires_at: string | null
  provider_first_response_at: string | null
  provider_confirmed_at: string | null
  client_checked_in_at: string | null
  completed_at: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  cancelled_by: string | null
}

type StatusBucket =
  | 'pending'
  | 'accepted'
  | 'arriving'
  | 'checked_in'
  | 'completed'
  | 'cancelled'
  | 'no_show'

export function statusBucket(status: string): StatusBucket {
  switch (status) {
    case 'pending':
      return 'pending'
    case 'accepted':
      return 'accepted'
    case 'arriving':
      return 'arriving'
    case 'checked_in':
      return 'checked_in'
    case 'completed':
      return 'completed'
    case 'no_show':
      return 'no_show'
    case 'rescheduled':
      // A rescheduled booking is still active/upcoming — not terminal. Treat it
      // like an accepted booking so provider actions stay available. Mirrors
      // bookingTab() in lib/bookingStatus.ts, which maps rescheduled -> upcoming.
      // (This action-level bucket is intentionally finer-grained than bookingTab.)
      return 'accepted'
    default:
      return 'cancelled'
  }
}

// `getStatusStyle` used to live here: a second, private colour table that painted
// No show red and Pending amber. Both readings were ruled out — a no-show is a
// transaction OUTCOME, not an error, and nothing here may blame either party. The
// pill is now <StatusBadge>, whose tones come from lib/theme/statusTone.ts, so the
// rule is stated once and tested once instead of being re-decided per screen.

function money(n: number | null): string {
  if (n == null) return '$0.00'
  return '$' + Number(n).toFixed(2)
}

export default function BookingDetailScreen() {
  const { colors, scheme } = useTheme()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const insets = useSafeAreaInsets()

  const [booking, setBooking] = useState<BookingDetail | null>(null)
  const [providerName, setProviderName] = useState('')
  const [providerCategory, setProviderCategory] = useState('')
  const [clientName, setClientName] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [isProvider, setIsProvider] = useState(false)
  // Persistent provider→client review opportunity (QA-JOURNEY-002). Server-
  // authoritative (RPC review_opportunity); the client never computes the window.
  //
  // SEC-AUTHZ-001 / CODE-DUP-010: this deliberately does NOT pre-test
  // `booking.status === 'completed'`. Gating the READ on live status meant a booking
  // whose status moved off 'completed' after completion never got asked about, so an
  // earned review (anchored in the DB on the immutable completed_at) silently lost its
  // entry point. We ask for any booking the provider is viewing and let the server
  // answer; a booking that never completed comes back 'not_completed'.
  const { opportunity: reviewOpp, loading: reviewOppLoading } = useReviewOpportunity(
    id as string | undefined,
    'provider_to_client',
    isProvider,
  )

  const fetchBookingDetail = useCallback(async () => {
    if (!id || !user) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data: bookingData, error } = await supabase
        .from('bookings')
        .select('*')
        .eq('id', id)
        .maybeSingle()

      if (error || !bookingData) {
        console.log('Booking fetch error:', error)
        setLoading(false)
        return
      }

      setBooking(bookingData as BookingDetail)

      const { data: providerRow } = await supabase
        .from('providers')
        .select('id, display_name, category_id, user_id')
        .eq('id', bookingData.provider_id)
        .maybeSingle()

      if (providerRow) {
        setProviderName(providerRow.display_name || 'Provider')
        if (providerRow.user_id === user.id) {
          setIsProvider(true)
        }
        if (providerRow.category_id != null) {
          const { data: cat } = await supabase
            .from('categories')
            .select('name')
            .eq('id', providerRow.category_id)
            .maybeSingle()
          if (cat) setProviderCategory(cat.name)
        }
      }

      // Role-aware client name lookup. A provider viewing the counterpart client
      // reads the provider-scoped view; a client viewing their own booking reads
      // their own row from the base clients table (self-service).
      const viewerIsProvider = providerRow?.user_id === user.id
      const { data: clientRow } = viewerIsProvider
        ? await supabase
            .from('clients_provider')
            .select('name')
            .eq('id', bookingData.user_id)
            .maybeSingle()
        : await supabase
            .from('clients')
            .select('name')
            .eq('id', bookingData.user_id)
            .maybeSingle()
      setClientName(clientRow?.name || 'Client')
    } catch (err) {
      console.log('Booking detail error:', err)
    } finally {
      setLoading(false)
    }
  }, [id, user])

  useEffect(() => {
    fetchBookingDetail()
  }, [fetchBookingDetail])

  async function updateStatus(
    newStatus: string,
    extraFields: Record<string, unknown> = {},
  ) {
    if (!booking) return
    setActionLoading(true)
    const { error } = await supabase
      .from('bookings')
      .update({ status: newStatus, ...extraFields })
      .eq('id', booking.id)
    if (error) {
      console.log('Status update error:', error)
      Alert.alert(
        'Something went wrong',
        'Could not update booking status. Please try again.',
        [{ text: 'OK' }],
      )
      setActionLoading(false)
      return
    }
    setBooking((prev) => (prev ? { ...prev, status: newStatus, ...extraFields } : null))
    setActionLoading(false)

    // After a provider marks a booking complete, route them to rate the
    // client. Only on success (the error path above already returned), and
    // only for the provider — the rate-the-client screen is provider-only.
    // replace (not push) avoids the duplicate-mount issue fixed elsewhere.
    if (newStatus === 'completed' && isProvider) {
      router.replace(`/post-booking/provider-review?id=${booking.id}` as never)
    }
  }

  function handleCancel() {
    const byProvider = isProvider
    // PRODUCT TRUTH: the client branch read "Your deposit protection terms
    // apply." No deposit is ever taken and no protection exists (PD-042). The
    // provider branch promised the client "will be notified"; there is no push
    // channel (PD-059), only an in-app update.
    Alert.alert(
      'Cancel Booking',
      byProvider
        ? 'Cancel this appointment? The client will see this in Third.'
        : 'Cancel this appointment? This cannot be undone.',
      [
        { text: 'Keep', style: 'cancel' },
        {
          text: 'Cancel Booking',
          style: 'destructive',
          onPress: () =>
            updateStatus(
              byProvider ? 'cancelled_by_provider' : 'cancelled_by_client',
              {
                cancelled_at: new Date().toISOString(),
                cancelled_by: user?.id ?? null,
                cancellation_actor: byProvider ? 'provider' : 'client',
              },
            ),
        },
      ],
    )
  }

  function handleMarkCompleted() {
    Alert.alert(
      'Mark as Completed',
      'Confirm this appointment is complete? The client will be prompted to leave a review.',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: 'Mark Complete',
          onPress: () =>
            updateStatus('completed', { completed_at: new Date().toISOString() }),
        },
      ],
    )
  }

  // A booking that has ever completed cannot be marked no_show — the write boundary
  // rejects it unconditionally (migration 20260904000000). Offering the action there
  // would be a guaranteed-failure retry loop behind a generic "please try again"
  // (QA-JOURNEY-006), so the control is withheld instead.
  const everCompleted = !!booking?.completed_at

  function handleMarkNoShow() {
    Alert.alert(
      'Mark as No Show',
      'The client did not show up? This will be recorded on their profile.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark No Show',
          style: 'destructive',
          onPress: () =>
            updateStatus('no_show', {
              no_show_flag: true,
              cancelled_at: new Date().toISOString(),
            }),
        },
      ],
    )
  }

  async function messageOtherParty() {
    if (!booking) return
    const convoId = await getOrCreateConversation(
      booking.user_id,
      booking.provider_id,
      booking.id,
    )
    if (convoId) {
      router.push(`/messages/${convoId}` as never)
    }
  }

  // ─── Render ────────────────────────────────────────────────────────
  const headerNode = (
    <View
      style={[
        styles.topBar,
        { paddingTop: insets.top + 12, borderBottomColor: colors.borderSubtle },
      ]}
    >
      <TouchableOpacity
        onPress={() => router.back()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={24} color={colors.iconPrimary} />
      </TouchableOpacity>
      <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>Bookings</Text>
      {/* Providers can jump straight to their dashboard (and its drawer) from
          here, since this screen lives outside the provider drawer. Clients
          see only the back button. */}
      {isProvider ? (
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/business' as never)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="home-outline" size={22} color={colors.iconPrimary} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 24 }} />
      )}
    </View>
  )

  if (loading) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {headerNode}
        <View style={styles.centerWrap}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      </View>
    )
  }

  if (!booking) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {headerNode}
        <View style={styles.centerWrap}>
          <Text style={[styles.notFoundText, { color: colors.textSecondary }]}>
            Booking not found
          </Text>
          <Button label="Go back" onPress={() => router.back()} fullWidth={false} />
        </View>
      </View>
    )
  }

  const bucket = statusBucket(booking.status)
  const urgency = bookingRequestUrgency(booking)

  // The SAME note the Bookings list shows, from the same helper — a request must
  // not say one thing in the list and another here.
  const listNote = bookingListNote(booking, urgency === 'expired', providerName)

  // PD-077, stated only while it is still true. `expires_at = LEAST(submitted_at +
  // 72 hours, appointment_time)`, so the appointment is often the binding term and
  // a flat "72 hours" would overstate the window in the ordinary case.
  const windowNote =
    urgency === 'expired'
      ? null
      : 'Your provider has up to 72 hours to respond, or until your requested time — whichever comes first.'

  const whenLine = [booking.requested_date, booking.requested_time].filter(Boolean).join(' · ') || '-'
  const providerFirstName = (providerName || 'your provider').split(' ')[0]

  return (
    <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {headerNode}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 220 }]}
      >
        {/* One pill, one rule. `expired` is NOT passed: this screen reads a single
            booking and does no lapse maths of its own — the pending branch below
            states the window from the server's derived urgency instead. */}
        <View style={styles.statusRow}>
          <StatusBadge status={booking.status} testID="booking-detail-status" />
        </View>

        {/* Service card */}
        <View
          style={[
            styles.card,
            { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle },
          ]}
        >
          <Text style={[styles.serviceName, { color: colors.textPrimary }]}>
            {booking.service_name ?? 'Service'}
          </Text>

          {/* THE OTHER PARTY, not a label-and-colon. Whose booking this is reads
              faster as a face and a name than as "Provider: …". */}
          <View style={styles.peerRow}>
            <Avatar name={isProvider ? clientName : providerName} size="medium" />
            <View style={styles.peerText}>
              <Text style={[styles.peerName, { color: colors.textPrimary }]}>
                {(isProvider ? clientName : providerName) || 'Your provider'}
              </Text>
              {!isProvider && providerCategory ? (
                <Text style={[styles.peerMeta, { color: colors.textSecondary }]}>
                  {providerCategory}
                </Text>
              ) : null}
            </View>
          </View>

          {/* WHERE THE REQUEST STANDS — derived, never asserted. `listNote` is the
              same helper the Bookings list uses, so a request says the same thing
              in both places. The window sentence beneath it comes from the SERVER's
              urgency, so it stops being made once the window has closed. */}
          {listNote ? (
            <View style={[styles.stateNote, { borderLeftColor: colors.borderSubtle }]}>
              <Text style={[styles.stateNoteTitle, { color: colors.textPrimary }]}>
                {listNote}
              </Text>
              {!isProvider && windowNote ? (
                <Text
                  style={[styles.stateNoteBody, { color: colors.textSecondary }]}
                  testID="detail-window-note"
                >
                  {windowNote}
                </Text>
              ) : null}
              <Text style={[styles.stateNoteBody, { color: colors.textSecondary }]}>
                Third does not take payment in this beta.
              </Text>
            </View>
          ) : null}

          <View style={[styles.divider, { backgroundColor: colors.borderSubtle }]} />

          <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>BOOKING DETAILS</Text>

          {/* Only the fields this screen actually reads. Length and location are in
              the approved frame but are not in this query — they are omitted rather
              than filled with a placeholder that looks like data. */}
          <DetailRow label="When" value={whenLine} />
          <DetailRow label="Price" value={money(booking.payment_amount)}>
            <PaymentBadge status={booking.payment_status} />
          </DetailRow>
          <DetailRow label="Booking ID" value={booking.id.slice(0, 8).toUpperCase()} last />
        </View>

        {/* The note the CLIENT wrote when they sent the request. */}
        {booking.message ? (
          <View
            style={[
              styles.card,
              { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle },
            ]}
          >
            <Text style={[styles.smallLabel, { color: colors.textSecondary }]}>
              {isProvider ? "CLIENT'S NOTE" : 'YOUR NOTE'}
            </Text>
            <Text style={[styles.noteText, { color: colors.textPrimary }]}>{booking.message}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Fixed bottom action bar */}
      <View
        style={[
          styles.actionBar,
          {
            paddingBottom: insets.bottom + 16,
            backgroundColor: colors.bgCanvas,
            borderTopColor: colors.borderSubtle,
          },
        ]}
      >
        <ActionButtons
          bucket={bucket}
          isProvider={isProvider}
          bookingId={booking.id}
          isDraft={booking.submitted_at === null}
          requestUrgency={urgency}
          providerFirstName={providerFirstName}
          actionLoading={actionLoading}
          reviewOpp={reviewOpp}
          reviewOppLoading={reviewOppLoading}
          onCancel={handleCancel}
          onMarkCompleted={handleMarkCompleted}
          onMarkNoShow={handleMarkNoShow}
          canMarkNoShow={!everCompleted}
          onMessage={messageOtherParty}
          onReviewClient={() =>
            router.push(`/post-booking/provider-review?id=${booking.id}` as never)
          }
          onBack={() => router.back()}
        />
      </View>
    </View>
  )
}

// A label/value pair, the shape the approved frame uses for booking details. The
// icon-per-row treatment it replaces gave a calendar, a clock and a card equal
// visual weight without ever saying what any of them meant.
function DetailRow({
  label,
  value,
  children,
  last,
}: {
  label: string
  value: string
  children?: React.ReactNode
  last?: boolean
}) {
  const { colors } = useTheme()
  return (
    <View
      style={[
        styles.detailRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
      ]}
    >
      <Text style={[styles.detailLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={styles.detailValueWrap}>
        <Text style={[styles.detailText, { color: colors.textPrimary }]}>{value}</Text>
        {children}
      </View>
    </View>
  )
}

function PaymentBadgeNeutral() {
  const { colors } = useTheme()
  return (
    <View style={[styles.payBadge, { backgroundColor: colors.bgSubtle }]}>
      <Text style={[styles.payBadgeText, { color: colors.textSecondary }]}>No in-app payment</Text>
    </View>
  )
}

function PaymentBadge({ status }: { status: string | null }) {
  if (!status) return null
  if (status === 'unpaid') {
    return (
      // PRODUCT TRUTH: "Not charged yet" implied a charge was still to come.
      <PaymentBadgeNeutral />
    )
  }
  // PRODUCT TRUTH: two further branches rendered "Paid" (`captured`) and
  // "Authorized" (`authorized`) — badges asserting that The Book observed a
  // payment being captured or authorized. It observes neither (PD-042). They
  // were unreachable for any row this app creates (the only writer is
  // `payment_status: 'unpaid'` in app/book/payment.tsx), but a seeded, migrated
  // or hand-edited row would have flipped them on, and the badge would have been
  // the strongest payment claim in the product. Removed rather than left as
  // dormant scaffolding. Any status other than 'unpaid' now renders nothing.
  return null
}

interface ActionButtonsProps {
  bucket: StatusBucket
  isProvider: boolean
  bookingId: string
  /** True when this row is still an unsent draft (`submitted_at IS NULL`). */
  isDraft: boolean
  /**
   * The SERVER's derived state for this request: draft | none | nudge | urgent |
   * expired (`lib/bookingStatus.ts`, mirroring `booking_request_urgency`).
   *
   * The client-facing response-window copy is built from this rather than
   * asserted as a constant. PD-077 tells the client the provider has a window;
   * a window statement that never stops being made becomes false the moment the
   * window closes, which is the same defect class ("has 24 hours to respond")
   * PD-077 exists to end.
   */
  requestUrgency: RequestUrgency
  /** First name only — the frame addresses the provider by name on every control. */
  providerFirstName: string
  actionLoading: boolean
  reviewOpp: ReviewOpportunity
  reviewOppLoading: boolean
  canMarkNoShow: boolean
  onCancel: () => void
  onMarkCompleted: () => void
  onMarkNoShow: () => void
  onMessage: () => void
  onReviewClient: () => void
  onBack: () => void
}

// Half-width controls sit in a flexed wrapper so the shared Button keeps its own
// padding and touch target instead of each screen re-deriving a button shape.
function Half({ children }: { children: React.ReactNode }) {
  return <View style={styles.half}>{children}</View>
}

function ActionButtons(props: ActionButtonsProps) {
  const { colors } = useTheme()
  const { bucket, isProvider, bookingId, isDraft, requestUrgency, providerFirstName, actionLoading, reviewOpp, reviewOppLoading, canMarkNoShow, onCancel, onMarkCompleted, onMarkNoShow, onMessage, onReviewClient, onBack } = props

  // Persistent provider→client review entry, keyed by booking_id so each booking is
  // independently reviewable. Driven ONLY by the server's answer — never by `bucket`
  // (SEC-AUTHZ-001 / CODE-DUP-010): a booking whose live status drifted off
  // 'completed' keeps the review it earned, and the server still says 'eligible'.
  // 'unknown' (not read / read failed) and 'not_completed'/'not_participant' render
  // nothing, so no entry is ever invented from a local guess.
  const entry = isProvider
    ? reviewEntryFor(reviewOpp, 'provider_to_client', reviewOppLoading)
    : { kind: 'none' as const, label: '', body: '' }
  const reviewEntry =
    entry.kind === 'action' ? (
      <Button label={entry.label} onPress={onReviewClient} testID="detail-review-client" />
    ) : entry.kind === 'note' ? (
      <View
        style={[
          styles.reviewStateNote,
          { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle },
        ]}
      >
        <Text style={[styles.reviewStateText, { color: colors.textSecondary }]}>{entry.body}</Text>
      </View>
    ) : null
  const isActionable = entry.kind === 'action'

  // Terminal states for both sides.
  if (bucket === 'cancelled' || bucket === 'completed' || bucket === 'no_show') {
    return (
      <>
        {reviewEntry}
        {/* Demoted to secondary only when the review above it is the real action,
            so the screen never shows two primaries. */}
        <View style={isActionable ? styles.stacked : null}>
          <Button
            label="Back to bookings"
            variant={isActionable ? 'secondary' : 'primary'}
            onPress={onBack}
            testID="detail-back-to-bookings"
          />
        </View>
      </>
    )
  }

  if (bucket === 'pending') {
    if (isProvider) {
      return (
        <Button
          label="Review request"
          onPress={() => router.replace(`/bookings/request/${bookingId}` as never)}
          testID="detail-review-request"
        />
      )
    }
    // AN UNSENT DRAFT IS NOT A REQUEST. It is excluded from every list, so this
    // is reached only by direct navigation — but if someone gets here, the screen
    // must not offer to cancel a request nobody received or to message a provider
    // about it. The server refuses to attach a draft to a conversation
    // (`20261045000000`), so the message control could only fail.
    if (isDraft) {
      return (
        <View>
          <Text style={[styles.draftNote, { color: colors.textSecondary }]}>
            You haven&apos;t sent this request yet. Start again from the provider&apos;s
            profile when you&apos;re ready.
          </Text>
          <Button
            label="Discard"
            variant="secondary"
            disabled={actionLoading}
            onPress={onCancel}
            testID="detail-discard-draft"
          />
        </View>
      )
    }
    return (
      <View>
        {/* ITEM 2 (PM decision, PR #74). The confirmation screen tells the client
            "you can check this request anytime" — this is where they check, so
            the window is restated here rather than left on a screen they have
            already navigated away from.

            DERIVED, NOT ASSERTED. The first version of this line rendered for
            every submitted pending request forever, so a client opening a request
            on day 30 was told the provider still had "up to 72 hours" — beside
            live-looking controls, for a request no provider can accept any more
            (the server refuses a late accept with PT425, permanently). Converting
            silence into a claim that never stops being made is exactly the defect
            "has 24 hours to respond" was removed for.

            "or until your requested time, whichever comes first" is not hedging:
            it is the server's rule stated exactly — `expires_at = LEAST(
            submitted_at + 72 hours, appointment_time)`. The calendar sells
            same-day and next-day slots, so the appointment is very often the
            binding term, and a flat "72 hours" would overstate the window in the
            ordinary case rather than an edge one. */}
        {/* The window statement now lives with the rest of the request's state, at
            the top of the screen. What stays here is the one thing that only
            matters at the moment of deciding: that an expired request can no
            longer be accepted, and what to do instead. */}
        {requestUrgency === 'expired' ? (
          <Text
            style={[styles.responseWindowNote, { color: colors.textSecondary }]}
            testID="detail-expired-note"
          >
            This request expired without an answer, so it can no longer be
            accepted. You can send a new one whenever you&apos;re ready.
          </Text>
        ) : null}
        {/* Stacked, per the approved frame: messaging the provider is the action
            with a future in it, and cancelling sits below it rather than beside. */}
        <Button
          label={`Message ${providerFirstName}`}
          onPress={onMessage}
          testID="detail-message"
        />
        <View style={styles.stacked}>
          <Button
            label="Cancel request"
            variant="secondary"
            disabled={actionLoading}
            onPress={onCancel}
            testID="detail-cancel-request"
          />
        </View>
      </View>
    )
  }

  if (bucket === 'accepted') {
    if (isProvider) {
      // reviewEntry is rendered here too: if this booking was completed at some point
      // (completed_at stamped) and its status later moved back, the server still
      // reports an earned review and the provider must still be able to reach it.
      // For a booking that genuinely never completed, reviewEntry is null.
      // Beta flow: the only forward action is Mark Complete; No Show and Cancel
      // are the off-ramps. (Arriving / Checked In were removed.)
      return (
        <View>
          {reviewEntry}
          <View style={styles.row}>
            {canMarkNoShow && (
              <Half>
                <Button
                  label="No show"
                  variant="secondary"
                  disabled={actionLoading}
                  onPress={onMarkNoShow}
                  testID="detail-mark-no-show"
                />
              </Half>
            )}
            <Half>
              <Button
                label="Mark complete"
                disabled={actionLoading}
                onPress={onMarkCompleted}
                testID="detail-mark-complete"
              />
            </Half>
          </View>
          <View style={[styles.row, { marginTop: 10 }]}>
            <Half>
              <Button
                label="Cancel booking"
                variant="secondary"
                disabled={actionLoading}
                onPress={onCancel}
                testID="detail-cancel-booking"
              />
            </Half>
          </View>
        </View>
      )
    }
    return (
      <View>
        <Button
          label={`Message ${providerFirstName}`}
          onPress={onMessage}
          testID="detail-message"
        />
        <View style={styles.stacked}>
          <Button
            label="Cancel booking"
            variant="secondary"
            disabled={actionLoading}
            onPress={onCancel}
            testID="detail-cancel-booking"
          />
        </View>
      </View>
    )
  }

  // arriving + checked_in
  if (isProvider) {
    return (
      <View style={styles.row}>
        <Half>
          <Button
            label="Mark no show"
            variant="secondary"
            disabled={actionLoading}
            onPress={onMarkNoShow}
            testID="detail-mark-no-show"
          />
        </Half>
        <Half>
          <Button
            label="Mark complete"
            disabled={actionLoading}
            onPress={onMarkCompleted}
            testID="detail-mark-complete"
          />
        </Half>
      </View>
    )
  }
  return (
    <Button
      label={`Message ${providerFirstName}`}
      onPress={onMessage}
      testID="detail-message"
    />
  )
}

// Geometry and type only. Colour is resolved from the theme at render time, so this
// screen follows the viewer's Light/Dark/System preference instead of carrying a
// fixed dark skin of its own.
const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontFamily: 'Manrope_700Bold' },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 16,
  },
  notFoundText: { fontSize: 16, fontFamily: 'Manrope_500Medium' },
  scrollContent: { paddingHorizontal: 24 },

  statusRow: { marginTop: 16, marginBottom: 20 },

  // Card
  card: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 20,
    marginBottom: 16,
  },
  serviceName: { fontSize: 22, fontFamily: 'Manrope_700Bold', marginBottom: 4 },
  divider: { height: 1, marginTop: 18, marginBottom: 16 },
  peerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  peerText: { flex: 1 },
  peerName: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  peerMeta: { fontSize: 12, fontFamily: 'Manrope_400Regular', marginTop: 2 },
  stateNote: { borderLeftWidth: 2, paddingLeft: 12, marginTop: 18, gap: 4 },
  stateNoteTitle: { fontSize: 15, fontFamily: 'Manrope_600SemiBold' },
  stateNoteBody: { fontSize: 13, fontFamily: 'Manrope_400Regular', lineHeight: 18 },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 11,
  },
  detailLabel: { fontSize: 14, fontFamily: 'Manrope_400Regular' },
  detailValueWrap: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  detailText: { fontSize: 14, fontFamily: 'Manrope_500Medium', textAlign: 'right' },
  smallLabel: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  noteText: { fontSize: 14, fontFamily: 'Manrope_400Regular', lineHeight: 21 },

  // Payment badge
  payBadge: { marginLeft: 10, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  payBadgeText: { fontSize: 10, fontFamily: 'Manrope_500Medium' },

  // Action bar
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
  stacked: { marginTop: 10 },
  responseWindowNote: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
    marginBottom: 12,
  },
  draftNote: {
    fontSize: 13,
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
    marginBottom: 12,
  },
  reviewStateNote: {
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  reviewStateText: { fontSize: 13, fontFamily: 'Manrope_500Medium', textAlign: 'center' },
})
