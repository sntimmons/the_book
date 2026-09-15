import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { Message, useMessages, setRequestStatus } from '../../hooks/useMessaging'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import {
  composerState,
  type RequestStatus,
  type ViewerRole,
} from '@/lib/messageRequests'
import ReportSheet from '@/components/ReportSheet'
import {
  BLOCKED_THREAD_COPY,
  REPORT_REASONS,
  REPORT_SUBMITTED_COPY,
  REPORT_FAILED_COPY,
  REPORT_LIMITED_COPY,
  iBlocked,
  submitReport,
  type ReportReason,
} from '@/lib/safety'
import { openSafetyMenu, confirmUnblock } from '@/lib/safetyMenu'
import { useTheme } from '@/context/ThemeContext'

const INPUT_ACCESSORY_ID = 'chatInput'
const GROUP_WINDOW_MS = 5 * 60 * 1000

// Monotonic per-mount suffix so two concurrent mounts of the same conversation
// never share a realtime channel topic (which would throw "cannot add
// postgres_changes after subscribe" and blank the screen) — mirrors the
// channelInstanceSeq guard in hooks/useMessaging.ts.
let statusChannelSeq = 0

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

// ── DAY SEPARATORS, DERIVED AND NOTHING MORE ─────────────────────────────
//
// A long thread had no date boundary anywhere: messages grouped by sender
// within a five-minute window, and a reply sent three weeks later sat directly
// under the one it answered with nothing between them. These separators read
// the timestamps the messages already carry. No message data changes, no
// grouping semantics change, and nothing is persisted — the same thread with the
// same rows renders the same conversation, with the days named.

/** Local calendar day for a timestamp, as a comparable key. */
function dayKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

/** "Today" / "Yesterday" / "Tuesday" within the week / an explicit date beyond it. */
function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  if (Number.isNaN(d.getTime())) return ''
  const now = new Date()
  if (dayKey(dateStr) === dayKey(now.toISOString())) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (dayKey(dateStr) === dayKey(yesterday.toISOString())) return 'Yesterday'

  // Inside the last week a weekday name is the most readable form; past that it
  // stops being locating and a date is clearer.
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (days >= 0 && days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })

  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const insets = useSafeAreaInsets()
  const { colors, type } = useTheme()

  const { messages, loading, sending, sendMessage } = useMessages(id as string)
  const [inputText, setInputText] = useState('')
  const [otherPartyName, setOtherPartyName] = useState('')
  const [bookingService, setBookingService] = useState('')
  const [convoFound, setConvoFound] = useState<boolean | null>(null)
  const [requestStatus, setRequestStatusState] = useState<RequestStatus>(null)
  const [viewerRole, setViewerRole] = useState<ViewerRole>('client')
  const [statusBusy, setStatusBusy] = useState(false)
  // ── SESSION 8 (QA-JOURNEY-004) ───────────────────────────────────────────
  //
  // Until now every safety control in the product lived on a PROVIDER PROFILE,
  // which only a client ever opens. A provider being harassed by a client had
  // no block and no report anywhere — and `ReportTarget: 'client'` and the
  // `client_conduct` reason existed in lib/safety.ts with no surface that could
  // ever reach them.
  //
  // The thread is the right seam, and the only one: it is where these two
  // people actually meet, it exists for both roles, and it is reachable from
  // either side of a booking. So the controls go here, symmetrically.
  const [otherUserId, setOtherUserId] = useState<string | null>(null)
  // The other party's PROVIDER row, when they have one — which is not the same
  // question as whether the viewer is a client. On a barter thread both sides
  // are providers. Null means they genuinely have no business.
  const [otherProviderId, setOtherProviderId] = useState<string | null>(null)
  const [blockedByMe, setBlockedByMe] = useState<boolean | null>(null)
  const [reportOpen, setReportOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const statusChannelId = useRef(++statusChannelSeq)
  const flatListRef = useRef<FlatList<Message>>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchConversationDetails() {
      if (!id || !user) return
      const { data: convo } = await supabase
        .from('conversation')
        .select('client_id, provider_id, booking_id, request_status')
        .eq('id', id)
        .maybeSingle()

      if (cancelled) return

      if (!convo) {
        setConvoFound(false)
        return
      }
      setConvoFound(true)

      const isClient = convo.client_id === user.id
      const otherPartyId = isClient ? convo.provider_id : convo.client_id
      setViewerRole(isClient ? 'client' : 'provider')
      setRequestStatusState((convo.request_status as RequestStatus) ?? null)

      if (isClient) {
        const { data: provider } = await supabase
          .from('providers')
          .select('display_name, user_id')
          .eq('id', otherPartyId)
          .maybeSingle()
        if (!cancelled) {
          setOtherPartyName(provider?.display_name || 'Provider')
          // Blocking is between PEOPLE, not businesses, so the provider row id
          // in `conversation.provider_id` has to be resolved to its owner.
          // `conversation.client_id` already IS a user id, which is why the
          // other branch needs no lookup.
          setOtherUserId((provider as { user_id?: string } | null)?.user_id ?? null)
          setOtherProviderId(otherPartyId ?? null)
        }
      } else {
        // THE OTHER SIDE IS NOT NECESSARILY A CLIENT.
        //
        // `viewerRole` is derived from which COLUMN you occupy, and a barter
        // thread is provider-to-provider: one provider sits in `client_id` and
        // the other in `provider_id`. So the provider on the `provider_id` side
        // was filing `report_type: 'client'` with a null provider reference
        // about a fellow provider — a trade dispute arriving in the operator
        // queue typed as a client report, with no route from the case to the
        // business, its trades or its eligibility. The sheet header called their
        // trading counterpart a client, which is wrong in the product's own
        // vocabulary (PD-069).
        //
        // The column says where you sit. It does not say what the other person
        // IS, so that is looked up rather than assumed.
        const { data: theirProvider } = await supabase
          .from('providers')
          .select('id, display_name')
          .eq('user_id', otherPartyId)
          .maybeSingle()
        const { data: client } = await supabase
          .from('clients_provider')
          .select('name')
          .eq('id', otherPartyId)
          .maybeSingle()
        if (!cancelled) {
          const p = theirProvider as { id: string; display_name: string } | null
          setOtherPartyName(client?.name || p?.display_name || 'Client')
          setOtherUserId(otherPartyId ?? null)
          setOtherProviderId(p?.id ?? null)
        }
      }

      if (convo.booking_id) {
        const { data: booking } = await supabase
          .from('bookings')
          .select('service_name')
          .eq('id', convo.booking_id)
          .maybeSingle()
        if (!cancelled) setBookingService(booking?.service_name || '')
      }
    }
    fetchConversationDetails()
    return () => {
      cancelled = true
    }
  }, [id, user])

  useEffect(() => {
    let cancelled = false
    if (!user || !otherUserId || otherUserId === user.id) return
    ;(async () => {
      const mine = await iBlocked(user.id, otherUserId)
      if (!cancelled) setBlockedByMe(mine)
    })()
    return () => {
      cancelled = true
    }
  }, [user, otherUserId])

  // Live-update this thread's request status: when the provider accepts/declines,
  // the composer/notice reacts without the client having to leave and reopen.
  // Scoped to THIS conversation id (RLS still limits delivery to participants);
  // cleaned up on unmount / conversation change.
  useEffect(() => {
    if (!id) return
    const channel = supabase
      .channel('conversation-status-' + id + '-' + statusChannelId.current)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation', filter: 'id=eq.' + id },
        (payload) => {
          const next =
            ((payload.new as { request_status?: RequestStatus })?.request_status ?? null)
          setRequestStatusState(next)
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [id])

  useEffect(() => {
    if (messages.length > 0) {
      const t = setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true })
      }, 100)
      return () => clearTimeout(t)
    }
  }, [messages])

  async function handleSend() {
    const text = inputText.trim()
    if (!text || sending) return
    setInputText('')
    const ok = await sendMessage(text)
    if (!ok) setInputText(text)
  }

  // One flow, shared with the provider profile (lib/safetyMenu.ts). A provider
  // blocking a client and a client blocking a provider are the same act against
  // the same table, and the copy never names a role.
  function safetyMenu() {
    if (!user || !otherUserId) return
    void openSafetyMenu({
      userId: user.id,
      otherUserId,
      title: otherPartyName || 'This person',
      blocked: blockedByMe,
      onBlockedChange: setBlockedByMe,
      onReport: () => setReportOpen(true),
    })
  }

  function unblockFromThread() {
    if (!user || !otherUserId) return
    confirmUnblock({
      userId: user.id,
      otherUserId,
      title: otherPartyName || 'This person',
      blocked: true,
      onBlockedChange: setBlockedByMe,
      onReport: () => setReportOpen(true),
    })
  }

  async function handleReport(reason: ReportReason, notes: string | null) {
    if (!user || !otherUserId) return
    setReporting(true)
    // Typed by WHAT the other party is, not by which column they occupy. If they
    // have a provider row, the report is about a provider and names it; if they
    // do not, it is about a client. This is still the only path in the product
    // that can produce `report_type = 'client'`.
    const res = await submitReport({
      reporterUserId: user.id,
      type: otherProviderId ? 'provider' : 'client',
      reason,
      notes,
      reportedUserId: otherUserId,
      reportedProviderId: otherProviderId,
    })
    setReporting(false)
    if (res.limited) {
      // THE SHEET STAYS OPEN. PD-088 requires the text be kept, and closing the
      // sheet would throw away what they wrote — the one thing a refused report
      // must never do.
      Alert.alert(REPORT_LIMITED_COPY.title, REPORT_LIMITED_COPY.body)
      return
    }
    setReportOpen(false)
    const copy = res.ok ? REPORT_SUBMITTED_COPY : REPORT_FAILED_COPY
    Alert.alert(copy.title, copy.body)
  }

  // Provider accepts/declines a pending incoming request.
  async function handleRequestDecision(status: 'accepted' | 'declined') {
    if (statusBusy) return
    setStatusBusy(true)
    const res = await setRequestStatus(id as string, status)
    setStatusBusy(false)
    if (!res.ok) {
      Alert.alert('Could not update', res.error ?? 'Please try again.')
      return
    }
    if (status === 'accepted') {
      setRequestStatusState('accepted') // composer opens for both parties
    } else {
      // Declined requests leave the active list; return to the inbox.
      router.back()
    }
  }

  const gate = composerState(requestStatus, viewerRole)

  const hasText = inputText.trim().length > 0
  const avatarInitial = (otherPartyName || 'C').charAt(0).toUpperCase()

  // Conversation not found state
  if (convoFound === false) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bgCanvas }]}>
        <View
          style={[
            styles.topBar,
            { paddingTop: insets.top + 12, borderBottomColor: colors.borderSubtle },
          ]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.iconPrimary} />
          </TouchableOpacity>
          <Text style={[styles.topBarTitle, type.titleCard, { color: colors.textPrimary }]}>
            Conversation
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerWrap}>
          <Text style={[styles.notFoundTitle, type.titleCard, { color: colors.textPrimary }]}>
            Conversation not found
          </Text>
          <TouchableOpacity
            style={[styles.findBtn, { backgroundColor: colors.actionPrimary }]}
            onPress={() => router.replace('/(tabs)/messages' as never)}
            accessibilityRole="button"
          >
            <Text style={[type.labelAction, { color: colors.textOnAction }]}>
              Back to Messages
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Top bar: back, who, and the safety control. Structure unchanged. */}
        <View
          style={[
            styles.topBar,
            { paddingTop: insets.top + 12, borderBottomColor: colors.borderSubtle },
          ]}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginRight: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={colors.iconPrimary} />
          </TouchableOpacity>
          <View style={[styles.topAvatar, { backgroundColor: colors.bgSubtle }]}>
            <Text style={[type.labelAction, { color: colors.textSecondary }]}>
              {avatarInitial}
            </Text>
          </View>
          <View style={styles.topCenter}>
            <Text
              style={[styles.otherName, type.titleCard, { color: colors.textPrimary }]}
              numberOfLines={1}
            >
              {otherPartyName || ' '}
            </Text>
          </View>
          {/* This slot held an `information-circle-outline` icon with NO
              `onPress` — a dead button that had been sitting in the thread
              header doing nothing. It is now the safety control, which is the
              one thing this screen was missing and the one place a provider can
              reach it at all. Withheld only while we do not yet know who the
              other party is, so it never opens onto an unresolved target. */}
          {otherUserId && otherUserId !== user?.id ? (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={safetyMenu}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Safety options"
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 22 }} />
          )}
        </View>

        {/* ── THE CONTEXT BAND ──────────────────────────────────────────────
            One place that answers "what is this conversation, and what state is
            it in". It carries ONLY what the screen already knew: the booking
            service (previously a second line under the name in the header) and
            the request state (previously a notice bar that appeared down beside
            the keyboard, which is the worst place to explain why you cannot
            type). It invents no state and changes no gating.

            SAFETY NOTICES ARE NOT IN HERE, deliberately. The blocker's notice
            stays immediately above the composer where it sits today, because it
            is paired with the composer it does not close and with its Unblock
            action. Moving it would have been a safety-behaviour change in a
            visual session. */}
        {bookingService || gate.notice ? (
          <View
            style={[
              styles.contextBand,
              { backgroundColor: colors.bgSubtle, borderBottomColor: colors.borderSubtle },
            ]}
          >
            {bookingService ? (
              <Text style={[type.labelMeta, { color: colors.statusLocal }]} numberOfLines={1}>
                {bookingService}
              </Text>
            ) : null}
            {gate.notice ? (
              <Text
                style={[
                  type.bodySmall,
                  { color: colors.textSecondary, marginTop: bookingService ? 4 : 0 },
                ]}
              >
                {gate.notice}
              </Text>
            ) : null}
          </View>
        ) : null}

        {loading && messages.length === 0 ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator color={colors.textSecondary} />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={[styles.emptyTitle, type.titleCard, { color: colors.textPrimary }]}>
              No messages yet
            </Text>
            <Text style={[styles.emptySub, type.bodyDefault, { color: colors.textSecondary }]}>
              Send a message to start the conversation.
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.list}
            renderItem={({ item, index }) => {
              const prev = messages[index - 1]
              const next = messages[index + 1]
              // GROUPING IS UNCHANGED. Same sender, inside the same five-minute
              // window, on both sides — exactly as before this migration.
              const sameSenderAsPrev =
                prev &&
                prev.sender_id === item.sender_id &&
                new Date(item.created_at).getTime() -
                  new Date(prev.created_at).getTime() <
                  GROUP_WINDOW_MS
              const sameSenderAsNext =
                next &&
                next.sender_id === item.sender_id &&
                new Date(next.created_at).getTime() -
                  new Date(item.created_at).getTime() <
                  GROUP_WINDOW_MS
              const showTime = !sameSenderAsNext
              const wrapStyle: any[] = [
                { marginBottom: sameSenderAsNext ? 2 : 8 },
              ]
              if (sameSenderAsPrev) wrapStyle.push({ marginTop: 0 })

              // A new calendar day opens with a rule. Derived from the
              // timestamps already on these rows; the first message always
              // opens one, so a thread never begins mid-air.
              const startsNewDay = !prev || dayKey(prev.created_at) !== dayKey(item.created_at)
              const daySeparator = startsNewDay ? (
                <View style={styles.dayWrap}>
                  <View style={[styles.dayRule, { backgroundColor: colors.borderSubtle }]} />
                  <Text style={[styles.dayLabel, type.caption, { color: colors.textSecondary }]}>
                    {formatDayLabel(item.created_at)}
                  </Text>
                  <View style={[styles.dayRule, { backgroundColor: colors.borderSubtle }]} />
                </View>
              ) : null

              // A platform notice is authored by NOBODY. Falling through to the
              // participant branches would render it in the counterparty's bubble — the
              // impersonation the server-side representation exists to avoid. Centred,
              // unattributed, and visually distinct from both participants.
              if (item.is_system) {
                return (
                  <>
                    {daySeparator}
                    <View style={[styles.systemWrap, ...wrapStyle]}>
                      <Text
                        style={[styles.systemText, type.bodySmall, { color: colors.textSecondary }]}
                      >
                        {item.content}
                      </Text>
                      {showTime && (
                        <Text style={[type.caption, { color: colors.textSecondary }]}>
                          {formatMessageTime(item.created_at)}
                        </Text>
                      )}
                    </View>
                  </>
                )
              }

              // SLABS, NOT CHAT BUBBLES. Incoming and outgoing are told apart by
              // alignment and by one tonal step, with a hairline on the incoming
              // side. No tails, low rounding, and NO MULBERRY FILL — Mulberry is
              // the one primary-action colour on this screen and it belongs to
              // Send and to Accept, not to every sentence the viewer typed.
              if (item.is_mine) {
                return (
                  <>
                    {daySeparator}
                    <View style={[styles.myWrap, ...wrapStyle]}>
                      <View style={[styles.slab, styles.mySlab, { backgroundColor: colors.bgElevated }]}>
                        <Text style={[type.bodyDefault, { color: colors.textPrimary }]}>
                          {item.content}
                        </Text>
                      </View>
                      {showTime && (
                        <Text style={[styles.myTime, type.caption, { color: colors.textSecondary }]}>
                          {formatMessageTime(item.created_at)}
                        </Text>
                      )}
                    </View>
                  </>
                )
              }
              return (
                <>
                  {daySeparator}
                  <View style={[styles.theirWrap, ...wrapStyle]}>
                    <View
                      style={[
                        styles.slab,
                        styles.theirSlab,
                        { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle },
                      ]}
                    >
                      <Text style={[type.bodyDefault, { color: colors.textPrimary }]}>
                        {item.content}
                      </Text>
                    </View>
                    {showTime && (
                      <Text style={[styles.theirTime, type.caption, { color: colors.textSecondary }]}>
                        {formatMessageTime(item.created_at)}
                      </Text>
                    )}
                  </View>
                </>
              )
            }}
          />
        )}

        {/* THE BLOCKER'S NOTICE, AND ONLY THE BLOCKER'S.
            `blockedByMe` is true for exactly one person — the one who made the
            block — so this cannot leak to the person blocked (PD-082).

            It does NOT close the composer, and that is deliberate rather than
            lazy: a pair with a live booking keeps a working thread by design,
            and the client cannot evaluate that condition, because
            `has_live_transaction` is not callable by design either. Hiding the
            composer would be a guess, and half the time the wrong one. So the
            screen states the fact and the remedy, and lets the send answer for
            itself — which it now does out loud (MESSAGE_REFUSED_COPY) instead
            of silently.

            IT STAYS HERE, ABOVE THE COMPOSER, and was deliberately NOT moved
            into the context band with the request state. It is paired with the
            composer it does not close and with its own Unblock action; relocating
            a safety notice is a safety change, not a visual one. */}
        {blockedByMe === true ? (
          <View
            style={[
              styles.blockedNotice,
              { backgroundColor: colors.bgSubtle, borderTopColor: colors.borderSubtle },
            ]}
          >
            <Text style={[type.bodySmall, { color: colors.textSecondary, flex: 1 }]}>
              {BLOCKED_THREAD_COPY.notice}
            </Text>
            <TouchableOpacity
              onPress={unblockFromThread}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Text style={[type.labelAction, { color: colors.actionText }]}>
                {BLOCKED_THREAD_COPY.action}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Composer / request controls, gated by the request status. The GATING
            IS UNCHANGED — `composerState` decides, exactly as before. */}
        {gate.canCompose ? (
          <View
            style={[
              styles.inputBar,
              {
                paddingBottom: insets.bottom + 12,
                backgroundColor: colors.bgCanvas,
                borderTopColor: colors.borderSubtle,
              },
            ]}
          >
            <TextInput
              style={[
                styles.input,
                type.bodyDefault,
                {
                  backgroundColor: colors.bgSurface,
                  borderColor: colors.borderSubtle,
                  color: colors.textPrimary,
                },
              ]}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Message..."
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={1000}
              inputAccessoryViewID={
                Platform.OS === 'ios' ? INPUT_ACCESSORY_ID : undefined
              }
              onSubmitEditing={handleSend}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                { backgroundColor: hasText ? colors.actionPrimary : colors.bgSubtle },
              ]}
              onPress={handleSend}
              disabled={sending || !hasText}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Send message"
            >
              {sending ? (
                <ActivityIndicator
                  color={hasText ? colors.textOnAction : colors.textSecondary}
                  size="small"
                />
              ) : (
                <Ionicons
                  name="send"
                  size={18}
                  color={hasText ? colors.textOnAction : colors.textSecondary}
                />
              )}
            </TouchableOpacity>
          </View>
        ) : gate.showAcceptDecline ? (
          /* ACCEPT AND DECLINE STAY AT THE BOTTOM, where the composer would be
             and where the thumb already is. Accept is the one Mulberry fill;
             Decline is an outline beside it and must never out-weigh it. */
          <View
            style={[
              styles.requestBar,
              {
                paddingBottom: insets.bottom + 12,
                backgroundColor: colors.bgCanvas,
                borderTopColor: colors.borderSubtle,
              },
            ]}
          >
            <Text style={[styles.requestPrompt, type.bodySmall, { color: colors.textSecondary }]}>
              {otherPartyName} sent a message request.
            </Text>
            <View style={styles.requestBtns}>
              <TouchableOpacity
                style={[
                  styles.declineBtn,
                  { borderColor: colors.borderSubtle, opacity: statusBusy ? 0.5 : 1 },
                ]}
                onPress={() => handleRequestDecision('declined')}
                disabled={statusBusy}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                <Text style={[type.labelAction, { color: colors.textPrimary }]}>Decline</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.acceptBtn,
                  { backgroundColor: colors.actionPrimary, opacity: statusBusy ? 0.5 : 1 },
                ]}
                onPress={() => handleRequestDecision('accepted')}
                disabled={statusBusy}
                activeOpacity={0.85}
                accessibilityRole="button"
              >
                {statusBusy ? (
                  <ActivityIndicator color={colors.textOnAction} size="small" />
                ) : (
                  <Text style={[type.labelAction, { color: colors.textOnAction }]}>Accept</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
        {/* The notice that used to sit here now lives in the context band under
            the header, which is persistent and never scrolls away. Rendering it
            in both places would have said the same sentence twice; and in these
            states there is no control to reach at the bottom, so nothing is lost
            by the move. */}

      </KeyboardAvoidingView>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID} backgroundColor={colors.bgElevated}>
          <View style={[styles.accessoryBar, { borderTopColor: colors.borderSubtle }]}>
            <Text
              style={[
                type.caption,
                {
                  color:
                    inputText.length > 800 ? colors.statusDanger : colors.textSecondary,
                },
              ]}
            >
              {inputText.length} / 1000
            </Text>
            <View style={styles.accessoryActions}>
              <TouchableOpacity
                onPress={Keyboard.dismiss}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={[type.labelAction, { color: colors.textSecondary }]}>Done</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (hasText) {
                    handleSend()
                    Keyboard.dismiss()
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={!hasText || sending}
              >
                <Text
                  style={[
                    type.labelAction,
                    {
                      color: colors.actionText,
                      opacity: !hasText || sending ? 0.4 : 1,
                    },
                  ]}
                >
                  Send
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </InputAccessoryView>
      )}

      <ReportSheet
        visible={reportOpen}
        title={otherProviderId ? 'Report this provider' : 'Report this client'}
        options={REPORT_REASONS}
        submitting={reporting}
        onCancel={() => setReportOpen(false)}
        onSubmit={handleReport}
      />
    </>
  )
}

// STRUCTURE ONLY — every colour resolves from the theme at render time. This
// screen previously carried ~50 literals from the retired The Book palette and a
// hardcoded near-black canvas, so it could not follow a Light/Dark/System change
// at all. Unlike Reels, Messages has no media on it: nothing here needs to be
// scheme-invariant, and every surface follows the viewer's choice.
const styles = StyleSheet.create({
  root: { flex: 1 },

  // Top bar
  topBar: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
  },
  topAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  topCenter: {
    flex: 1,
    marginRight: 10,
  },
  otherName: {},

  // Context band
  contextBand: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  notFoundTitle: {
    textAlign: 'center',
  },
  findBtn: {
    paddingHorizontal: 20,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    marginBottom: 8,
    textAlign: 'center',
  },
  emptySub: {
    textAlign: 'center',
  },

  list: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },

  // Day separators
  dayWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 16,
  },
  dayRule: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dayLabel: {
    letterSpacing: 0.3,
  },

  // Message slabs
  slab: {
    maxWidth: '82%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderCurve: 'continuous',
  },
  mySlab: {},
  theirSlab: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  myWrap: {
    alignItems: 'flex-end',
  },
  theirWrap: {
    alignItems: 'flex-start',
  },
  myTime: {
    marginTop: 4,
    marginRight: 2,
  },
  theirTime: {
    marginTop: 4,
    marginLeft: 2,
  },
  systemWrap: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 4,
  },
  systemText: {
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Blocked notice
  blockedNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },

  // Composer
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Request bar
  requestBar: {
    paddingHorizontal: 20,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  requestPrompt: {
    textAlign: 'center',
  },
  requestBtns: {
    flexDirection: 'row',
    gap: 10,
  },
  declineBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // iOS input accessory
  accessoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  accessoryActions: {
    flexDirection: 'row',
    gap: 20,
  },
})
