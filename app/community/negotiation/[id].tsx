import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import {
  acceptVersion,
  BarterObligation,
  cancelTrade,
  confirmObligationReceived,
  createProposal,
  fetchInterestContext,
  finalizeAgreement,
  fetchNegotiation,
  fetchNegotiationForInterest,
  markObligationDelivered,
  NegotiationRow,
  ProposalVersion,
  reportObligationNotReceived,
  submitCounter,
} from '@/lib/negotiation'
import { barterWriteFailure } from '@/lib/barterErrors'
import {
  acceptedAnEarlierVersion,
  CONFIRM_TRADE_COPY,
  MAX_DESCRIPTION,
  negotiationView,
  ProposalDraft,
  ProposalSide,
  shouldShowTermsChangedNote,
  sideLabel,
  termsTimingStillValid,
  TERMS_EXPIRED_NOTE,
  TERMS_CHANGED_NOTE,
  TradeSide,
  validateDraft,
} from '@/lib/negotiationState'
import {
  anyDelivered,
  CONFIRM_RECEIVED_COPY,
  MARK_DELIVERED_COPY,
  NOT_RECEIVED_COPY,
  ObligationActionCopy,
  obligationRole,
  obligationTimeline,
  obligationView,
  RESPOND_LABELS,
} from '@/lib/obligationState'
import {
  AGREE_TO_CANCEL_COPY,
  CancelActionCopy,
  CANCEL_REASON_NOTE,
  CANCEL_REASON_PLACEHOLDER,
  CANCEL_TRADE_COPY,
  cancellationReasons,
  cancellationView,
  cancelReasonPayload,
  isCancelled,
  MAX_CANCEL_REASON,
  validateCancelReason,
} from '@/lib/tradeCancellation'
import { formatTradeDate } from '@/lib/tradeActivity'

// NEGOTIATION — the terms of one barter trade, and their history.
//
// Reachable from an active row in Trade Activity. The conversation stays where logistics
// happen; this is where the terms live, and the two are deliberately separate: a provider pair
// may trade more than once over time while keeping one conversation.
//
// Finalization records an official agreement and creates two directed obligations. Each
// obligation can now be marked delivered by ITS deliverer and answered by ITS receiver.
//
// Before either side has delivered, either participant may also CANCEL the trade, and the
// counterparty may separately record that they agree — two explicit acts, which is the only
// route to "mutually cancelled". Cancelling ends the trade; it decides nothing about whether
// anyone fulfilled anything.
//
// That is all it can do. There is still no timeout, automatic fulfilment or completion,
// no-show, Needs Attention, Under Review, adjudication or terminal outcome — for the
// obligation or for the agreement — so no copy on this screen may say a trade is booked,
// complete, fulfilled, unfulfilled, disputed, resolved or under review. Until it is cancelled
// the agreement stays "Trade confirmed" while its obligations progress.

const EMPTY_DRAFT: ProposalDraft = {
  ownerGives: '',
  ownerDueAt: '',
  ownerScheduledAt: '',
  responderGives: '',
  responderDueAt: '',
  responderScheduledAt: '',
}

function formatTermTime(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString()
}

export default function NegotiationScreen() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  // Keyed on the INTEREST, not the proposal: a negotiation is one-per-accepted-response, and
  // the interest is what Trade Activity holds. It also means this route works before any terms
  // exist, which is where the first proposal is written.
  const params = useLocalSearchParams<{ id: string; role?: string }>()
  const interestId = params.id

  const [row, setRow] = useState<NegotiationRow | null>(null)
  const [versions, setVersions] = useState<ProposalVersion[]>([])
  const [obligations, setObligations] = useState<BarterObligation[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState<ProposalDraft>(EMPTY_DRAFT)
  const [showHistory, setShowHistory] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  // The interest's own state, used only when no negotiation exists yet. Without it this screen
  // cannot tell "nobody has proposed yet" from "this ended before anyone proposed".
  const [context, setContext] = useState<{
    status: NegotiationRow['interestStatus'] | null
    myRole: TradeSide | null
  }>({ status: null, myRole: null })

  const load = useCallback(async () => {
    if (!interestId) {
      setLoading(false)
      return
    }
    const found = await fetchNegotiationForInterest(interestId)
    if (!found.ok) {
      // A failed read is NOT an empty negotiation. Collapsing the two would let a connection
      // problem render as "no terms yet" on the surface that holds the trade — and the first
      // control on that screen writes a proposal.
      setFailed(true)
      setLoading(false)
      return
    }
    if (!found.row) {
      const ctx = await fetchInterestContext(interestId)
      setRow(null)
      setVersions([])
      setObligations([])
      setContext({ status: ctx.status, myRole: ctx.myRole })
      setFailed(!ctx.ok)
      setLoading(false)
      return
    }
    const { row: r, versions: v, obligations: o, ok } = await fetchNegotiation(found.row.proposalId)
    setRow(r)
    setVersions(v)
    setObligations(o)
    setFailed(!ok)
    setLoading(false)
  }, [interestId])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  const current = versions.find((v) => v.id === row?.currentVersionId) ?? null
  const previous = versions.filter((v) => v.id !== row?.currentVersionId)
  // ONE source for the viewer's side, resolved once per render. It was spelled three times —
  // once from `row.myRole` and twice from the route param — and two of those spellings could
  // disagree, which would label the draft "You give" against the side actually sent. The
  // server-derived role wins whenever a negotiation exists; the param only fills the gap
  // before one does, and only to choose a label.
  // Server-derived in both cases now: from the negotiation when one exists, otherwise from the
  // interest. The route param is a last-resort label only, and no longer the thing that decides
  // which side of the trade a first proposal is written against.
  const myRole: TradeSide =
    row?.myRole ?? context.myRole ?? (params.role === 'owner' ? 'owner' : 'responder')
  // Which obligation is whose comes from `obligationRole`, the same predicate the card itself
  // uses. Re-spelling it here as `side === sideForRole(myRole)` was a second copy of a rule
  // that module owns: the two agree today, but only the module's copy is tested, so a change
  // there would not follow here.
  const myObligation =
    obligations.find((o) => obligationRole(o.side, myRole) === 'deliverer') ?? null
  const theirObligation =
    obligations.find((o) => obligationRole(o.side, myRole) === 'receiver') ?? null
  // Cancellation is an AGREEMENT-level fact, so it is derived once here and said once, above
  // both obligations — not repeated inside each of them.
  // Both obligations present is the precondition for trusting `anyDelivered` at all: the
  // database guarantees exactly two, so anything else means the read did not land.
  const obligationsLoaded = obligations.length === 2
  // Derived by lib/obligationState.ts, not here: this is the PD-046 precondition that decides
  // whether an irreversible control is rendered, and a rule computed in JSX cannot be tested.
  const delivered = anyDelivered(obligations)
  const cancellationFacts = {
    iCancelled: row?.iCancelled ?? false,
    theyCancelled: row?.theyCancelled ?? false,
    cancelledAt: row?.cancelledAt ?? null,
  }
  const cancel = cancellationView(cancellationFacts, delivered)
  // Participant-visible context, per the ruling on PR #58. Attribution is derived by
  // lib/tradeCancellation.ts rather than by a ternary here: putting the wrong label on a
  // provider's stated reason for abandoning a commitment is the one mistake this must not make.
  const cancelReasons = cancellationReasons(
    cancellationFacts,
    row?.myCancelReason ?? null,
    row?.theirCancelReason ?? null,
  )
  // ONE predicate for "is this trade cancelled". The JSX below also branches on
  // `view.state === 'cancelled'`, and the two are equivalent only because `negotiationView`
  // returns that state exactly when `live && agreementId !== null && tradeCancelled` — and a
  // confirmed interest cannot leave `accepted`, which is enforced two migrations away by
  // `enforce_no_change_after_agreement` (20260930000000). If a later slice ever gives a
  // confirmed interest another status, `live` goes false, `view.state` becomes 'ended', and
  // this screen splits: the banner below renders while the obligations do not. Keep the two
  // spellings in step, or collapse them, when that day comes.
  const tradeCancelled = isCancelled(cancellationFacts)
  // Live only when the underlying interest is accepted. A released negotiation with no terms
  // must not be offered a compose control the server will always refuse.
  const contextIsLive = (row?.interestStatus ?? context.status) === 'accepted'
  // No row and no context means the interest is not readable by this viewer (deep link to a
  // foreign or deleted id). That is "not found", not "this negotiation ended".
  const contextUnknown = !row && context.status === null
  const iAcceptedAnEarlierVersion = acceptedAnEarlierVersion(
    versions,
    row?.currentVersionId ?? null,
    user?.id ?? null,
  )
  const view = row
    ? negotiationView({
        interestStatus: row.interestStatus,
        iAcceptedCurrent: row.iAcceptedCurrent,
        theyAcceptedCurrent: row.theyAcceptedCurrent,
        bothAccepted: row.bothAccepted,
        everBothAccepted: versions.some((v) => v.acceptedBy.length >= 2),
        agreementId: row.agreementId,
        tradeCancelled,
        currentTermsStillValid: current ? termsTimingStillValid(current.terms) : true,
      })
    : null

  async function onAccept() {
    if (!row || busy) return
    setBusy(true)
    const { ok, error } = await acceptVersion(row.currentVersionId)
    setBusy(false)
    if (!ok) {
      const f = barterWriteFailure('acceptTerms', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      // Re-read on ANY refusal here, terminal or not: "the terms changed" is not terminal but
      // the screen is definitely stale, and leaving the old terms on screen invites a second
      // acceptance of something already replaced.
      load()
      return
    }
    load()
  }

  async function onOpen() {
    if (busy) return
    const problem = validateDraft(draft)
    if (problem) {
      Alert.alert('Check these terms', problem, [{ text: 'OK' }])
      return
    }
    setBusy(true)
    const { ok, error } = await createProposal(interestId, draft)
    setBusy(false)
    if (!ok) {
      const f = barterWriteFailure('proposeTerms', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      // `stale` as well as `terminal`: "they proposed first" is recoverable, but the screen is
      // definitely out of date, and leaving it saying "No terms yet" made the alert tell the
      // user to read terms that were not on screen.
      if (f.terminal || f.stale) {
        setComposing(false)
        setLoading(true)
        load()
      }
      return
    }
    setComposing(false)
    setDraft(EMPTY_DRAFT)
    setLoading(true)
    load()
  }

  async function onConfirm() {
    if (!row || busy) return
    setBusy(true)
    const { ok, error } = await finalizeAgreement(row.proposalId)
    setBusy(false)
    if (!ok) {
      const f = barterWriteFailure('confirmTrade', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      // Re-read on any refusal: whatever moved, the screen is now stale.
      setLoading(true)
      load()
      return
    }
    setLoading(true)
    load()
  }

  function confirmTrade() {
    if (!row) return
    Alert.alert(
      CONFIRM_TRADE_COPY.title,
      CONFIRM_TRADE_COPY.body,
      [
        { text: CONFIRM_TRADE_COPY.cancelLabel, style: 'cancel' },
        { text: CONFIRM_TRADE_COPY.confirmLabel, onPress: onConfirm },
      ],
    )
  }

  // ── Delivery and receipt ──────────────────────────────────────────────────
  // One handler for all three obligation writes. The OBLIGATION ID is the only thing sent;
  // the server derives who the caller is, which end of the obligation they are on, and every
  // timestamp. This function cannot express "mark their obligation delivered" — there is no
  // parameter for it here and no RPC for it there.
  async function runObligationWrite(
    op: 'markDelivered' | 'confirmReceived' | 'reportNotReceived',
    obligationId: string,
  ) {
    if (busy) return
    setBusy(true)
    const { ok, error } =
      op === 'markDelivered'
        ? await markObligationDelivered(obligationId)
        : op === 'confirmReceived'
          ? await confirmObligationReceived(obligationId)
          : await reportObligationNotReceived(obligationId)
    setBusy(false)
    if (!ok) {
      const f = barterWriteFailure(op, error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      // Re-read on terminal OR stale: every refusal here means the obligation moved under the
      // button, and leaving the old controls on screen invites the same impossible tap again.
      if (f.terminal || f.stale) {
        setLoading(true)
        load()
      }
      return
    }
    setLoading(true)
    load()
  }

  function askThenWrite(
    copy: ObligationActionCopy,
    op: 'markDelivered' | 'confirmReceived' | 'reportNotReceived',
    obligationId: string,
  ) {
    Alert.alert(copy.title, copy.body, [
      { text: copy.cancelLabel, style: 'cancel' },
      { text: copy.confirmLabel, onPress: () => runObligationWrite(op, obligationId) },
    ])
  }

  // ── Pre-delivery cancellation ─────────────────────────────────────────────
  // ONE handler for both "Cancel trade" and "Agree to cancel": they are the same act on the
  // server — this participant records their own cancellation — and only the number of acts
  // decides whether the result is cancelled-by-one or mutual. The client sends the trade and
  // an optional reason and nothing else; it cannot name the actor, the time, or the outcome.
  async function onCancelTrade() {
    if (!row?.agreementId || busy) return
    const problem = validateCancelReason(cancelReason)
    if (problem) {
      Alert.alert('Check that reason', problem, [{ text: 'OK' }])
      return
    }
    setBusy(true)
    const { ok, error } = await cancelTrade(row.agreementId, cancelReasonPayload(cancelReason))
    setBusy(false)
    if (!ok) {
      const f = barterWriteFailure('cancelTrade', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      // Re-read on terminal OR stale: a refusal here means the trade moved under the button —
      // most likely because the counterparty delivered — and the control must not stay on
      // screen inviting the same impossible tap.
      if (f.terminal || f.stale) {
        setLoading(true)
        load()
      }
      return
    }
    setCancelReason('')
    setLoading(true)
    load()
  }

  function askThenCancel(copy: CancelActionCopy) {
    Alert.alert(copy.title, copy.body, [
      { text: copy.cancelLabel, style: 'cancel' },
      { text: copy.confirmLabel, style: 'destructive', onPress: onCancelTrade },
    ])
  }

  async function onSend() {
    if (!row || busy) return
    const problem = validateDraft(draft)
    if (problem) {
      Alert.alert('Check these terms', problem, [{ text: 'OK' }])
      return
    }
    setBusy(true)
    const { ok, error } = await submitCounter(row.proposalId, draft)
    setBusy(false)
    if (!ok) {
      const f = barterWriteFailure('proposeTerms', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      if (f.terminal || f.stale) {
        setComposing(false)
        load()
      }
      return
    }
    setComposing(false)
    setDraft(EMPTY_DRAFT)
    load()
  }

  function startComposing() {
    setDraft(EMPTY_DRAFT)
    setComposing(true)
  }

  // One composer for both opening and countering: two fixed inputs, one per side, labelled
  // from the viewer's server-derived role. OWNER-FIRST for both roles — the same order the
  // terms cards use — so the composer lines up with the card directly above it. It briefly
  // put the viewer's own side first, which flipped the order for a responder in exactly the
  // place a wrong-box entry would be typed and sent. Nothing here decides which participant a
  // side belongs to; the server derives that, and the client sends content only.
  function renderComposer(title: string, onSubmit: () => void) {
    const ordered: {
      givesKey: keyof ProposalDraft
      dueKey: keyof ProposalDraft
      scheduledKey: keyof ProposalDraft
      side: ProposalSide
    }[] = [
      {
        givesKey: 'ownerGives',
        dueKey: 'ownerDueAt',
        scheduledKey: 'ownerScheduledAt',
        side: 'offer_owner',
      },
      {
        givesKey: 'responderGives',
        dueKey: 'responderDueAt',
        scheduledKey: 'responderScheduledAt',
        side: 'responder',
      },
    ]
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{title}</Text>
        {ordered.map((f) => (
          <View key={f.givesKey} style={styles.draftRow}>
            <Text style={styles.termSide}>{sideLabel(f.side, myRole)}</Text>
            <Text style={styles.fieldLabel}>What this side provides</Text>
            <TextInput
              style={styles.input}
              value={draft[f.givesKey]}
              onChangeText={(v) => setDraft((d) => ({ ...d, [f.givesKey]: v }))}
              placeholder="What is provided"
              placeholderTextColor="rgba(240,232,213,0.35)"
              maxLength={MAX_DESCRIPTION}
              multiline
            />
            <Text style={styles.fieldLabel}>Due by</Text>
            <TextInput
              style={styles.input}
              value={draft[f.dueKey]}
              onChangeText={(v) => setDraft((d) => ({ ...d, [f.dueKey]: v }))}
              placeholder="2026-10-15 5:00 PM"
              placeholderTextColor="rgba(240,232,213,0.35)"
            />
            <Text style={styles.fieldLabel}>Optional scheduled time</Text>
            <TextInput
              style={styles.input}
              value={draft[f.scheduledKey]}
              onChangeText={(v) => setDraft((d) => ({ ...d, [f.scheduledKey]: v }))}
              placeholder="2026-10-10 2:00 PM"
              placeholderTextColor="rgba(240,232,213,0.35)"
            />
          </View>
        ))}
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => setComposing(false)}
            disabled={busy}
          >
            <Text style={styles.secondaryText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryBtn, busy && styles.btnDisabled]}
            onPress={onSubmit}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#080808" size="small" />
            ) : (
              <Text style={styles.primaryText}>Send terms</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  function renderObligation(obligation: BarterObligation | null) {
    if (!obligation) return null
    // Both inputs are server-derived: `myRole` from the negotiation row, `side` from the
    // obligation row. The title is NOT chosen by the caller any more — passing it in is how a
    // screen ends up labelling an obligation "You agreed to provide" while offering the
    // receiver's controls beside it.
    const role = obligationRole(obligation.side, myRole)
    const o = obligationView(role, obligation.status, tradeCancelled)
    return (
      <View style={styles.term}>
        <Text style={styles.termSide}>{o.title}</Text>
        <Text style={styles.termText}>{obligation.agreedDescription}</Text>
        <Text style={styles.termTiming}>Due by {formatTermTime(obligation.dueAt)}</Text>
        {obligation.scheduledAt ? (
          <Text style={styles.termTiming}>
            Scheduled for {formatTermTime(obligation.scheduledAt)}
          </Text>
        ) : null}
        <Text style={styles.obligationState}>{o.state}</Text>
        {obligationTimeline(obligation.deliveredAt, obligation.receiptRespondedAt).map((t) => (
          // Labels come from the module, so they are covered by the same forbidden-vocabulary
          // sweep as the rest of the card. Formatted with `formatTermTime`, the SAME formatter
          // the due and scheduled lines above use — the date-only history formatter dropped the
          // time of day, which is the part of a delivery time that actually matters.
          <Text key={t.key} style={styles.termTiming}>
            {t.label} {formatTermTime(t.at)}
          </Text>
        ))}
        {o.note ? <Text style={styles.obligationNote}>{o.note}</Text> : null}
        {o.canMarkDelivered ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() =>
                askThenWrite(MARK_DELIVERED_COPY, 'markDelivered', obligation.id)
              }
            >
              <Text style={styles.primaryText}>{MARK_DELIVERED_COPY.confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
        {o.canRespond ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() =>
                askThenWrite(CONFIRM_RECEIVED_COPY, 'confirmReceived', obligation.id)
              }
            >
              <Text style={styles.primaryText}>{RESPOND_LABELS.received}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() =>
                askThenWrite(NOT_RECEIVED_COPY, 'reportNotReceived', obligation.id)
              }
            >
              <Text style={styles.secondaryText}>{RESPOND_LABELS.notReceived}</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()}>
          <Feather name="chevron-left" size={22} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade terms</Text>
        <View style={styles.back} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#F0E8D5" />
        </View>
      ) : failed ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load these terms</Text>
          <Text style={styles.emptyBody}>
            This is a connection problem, not a change to your trade.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setLoading(true)
              load()
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : !row || !current || !view ? (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
          <Text style={styles.state}>
            {contextUnknown
              ? 'This trade is not available'
              : contextIsLive
                ? 'No terms yet'
                : 'This negotiation ended'}
          </Text>
          <Text style={styles.stateDetail}>
            {contextUnknown
              ? 'It may have been removed, or it may not be one of yours. Your trades are in '
                + 'Trade Activity.'
              : contextIsLive
                ? 'Nobody has proposed terms for this trade. Say what each of you is giving to '
                  + 'get started — the other provider can send changes back.'
                : 'No terms were ever proposed, and the negotiation has since ended. There is '
                  + 'nothing on record for this trade.'}
          </Text>
          {composing ? (
            renderComposer('Propose terms', onOpen)
          ) : contextIsLive ? (
            <View style={styles.actions}>
              <TouchableOpacity style={styles.primaryBtn} onPress={startComposing}>
                <Text style={styles.primaryText}>Propose terms</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </ScrollView>
        </KeyboardAvoidingView>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}>
            <Text style={styles.state}>{view.headline}</Text>
            {/* ONE composition point for the page-level sentence. `negotiationView` owns the
                headline for every state including `cancelled`, but deliberately returns an empty
                detail there, because which participant cancelled is per-viewer copy owned by
                lib/tradeCancellation.ts. Reading both in one place is what stops this screen
                saying "Trade confirmed … arrange the details in your conversation" directly
                above a banner saying the trade is cancelled. */}
            <Text style={styles.stateDetail}>{view.detail || cancel.detail}</Text>

            {/* The one moment where an acceptance silently stopped counting. Keyed on whether
                THIS viewer accepted an earlier set — the inline condition it replaced fired for
                people who never accepted and was suppressed for the one person whose acceptance
                actually lapsed. */}
            {shouldShowTermsChangedNote({
              interestStatus: row.interestStatus,
              iAcceptedAnEarlierVersion,
              iAcceptedCurrent: row.iAcceptedCurrent,
            }) ? (
              <Text style={styles.changedNote}>{TERMS_CHANGED_NOTE}</Text>
            ) : null}
            {view.timingExpired ? (
              <Text style={styles.changedNote}>{TERMS_EXPIRED_NOTE}</Text>
            ) : null}

            <View style={styles.card}>
              {/* Read from the view, not chosen here. This title used to be a ternary total
                  over only 'ended' and 'confirmed', so a cancelled trade fell through to
                  'On the table now' directly above its own "Cancelled" stamp. */}
              <Text style={styles.cardTitle}>{view.termsTitle}</Text>
              <Text style={styles.cardMeta}>
                {row.currentVersionAuthorId === user?.id ? 'You proposed these' : 'They proposed these'}
                {' · '}
                {formatTradeDate(current.createdAt)}
              </Text>
              {tradeCancelled && cancel.timeLabel ? (
                <View style={styles.cancelBanner}>
                  <Text style={styles.cancelDetail}>
                    {cancel.timeLabel} {formatTermTime(cancel.cancelledAt)}
                  </Text>
                  {/* Both participants see both reasons. Labelled by who SAID it, never by
                      who was right: nothing here is a fault finding, a reliability judgment or
                      an adjudication, and none of those exist. */}
                  {cancelReasons.map((r) => (
                    <Text key={r.key} style={styles.cancelDetail}>
                      {r.label}: {r.reason}
                    </Text>
                  ))}
                </View>
              ) : null}
              {view.state === 'confirmed' || view.state === 'cancelled' ? (
                obligationsLoaded ? (
                  <>
                    {renderObligation(myObligation)}
                    {renderObligation(theirObligation)}
                  </>
                ) : (
                  // A confirmed trade whose two sides did not both arrive. The database
                  // guarantees exactly two and both are readable by both participants, so this
                  // should be unreachable — but the alternative fallback was the PRE-AGREEMENT
                  // view, which would show a confirmed trade the acceptance checkmarks and no
                  // delivery controls, and say nothing about why.
                  <Text style={styles.obligationState}>
                    This trade is confirmed, but its two sides could not be loaded just now. Go
                    back and open it again.
                  </Text>
                )
              ) : null}

              {/* The ordinary exit, available only while nothing has been delivered. Once
                  either obligation is delivered the control disappears for good — PD-046
                  removes it permanently, and a later "didn't receive" does not bring it back,
                  so this must never reappear on that state.
                  Gated on `obligationsLoaded` as well: `anyDelivered` is derived from the
                  obligation rows, and an EMPTY list reads as "nothing delivered" — which is
                  indistinguishable from the truth. Offering an irreversible action off a
                  precondition computed from data the screen has just said it could not load is
                  exactly the case the message above warns about. */}
              {obligationsLoaded && (cancel.canCancel || cancel.canAgree) ? (
                <View style={styles.cancelBlock}>
                  <Text style={styles.cancelDetail}>{CANCEL_REASON_NOTE}</Text>
                  <TextInput
                    style={styles.input}
                    placeholder={CANCEL_REASON_PLACEHOLDER}
                    placeholderTextColor="rgba(240,232,213,0.35)"
                    value={cancelReason}
                    onChangeText={setCancelReason}
                    maxLength={MAX_CANCEL_REASON}
                    multiline
                  />
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                      disabled={busy}
                      onPress={() =>
                        askThenCancel(cancel.canAgree ? AGREE_TO_CANCEL_COPY : CANCEL_TRADE_COPY)
                      }
                    >
                      <Text style={styles.secondaryText}>
                        {cancel.canAgree
                          ? AGREE_TO_CANCEL_COPY.confirmLabel
                          : CANCEL_TRADE_COPY.confirmLabel}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {view.state !== 'confirmed' && view.state !== 'cancelled' ? (
                <>
                  {current.terms.map((t) => (
                    <View key={t.id} style={styles.term}>
                      <Text style={styles.termSide}>{sideLabel(t.providedBy, row.myRole)}</Text>
                      <Text style={styles.termText}>{t.serviceDescription}</Text>
                      <Text style={styles.termTiming}>Due by {formatTermTime(t.dueAt)}</Text>
                      {t.scheduledAt ? (
                        <Text style={styles.termTiming}>
                          Scheduled for {formatTermTime(t.scheduledAt)}
                        </Text>
                      ) : null}
                    </View>
                  ))}
                  <View style={styles.acceptRow}>
                    <Feather
                      name={row.iAcceptedCurrent ? 'check-circle' : 'circle'}
                      size={14}
                      color={row.iAcceptedCurrent ? '#4CAF50' : 'rgba(240,232,213,0.4)'}
                    />
                    <Text style={styles.acceptText}>You</Text>
                    <Feather
                      name={row.theyAcceptedCurrent ? 'check-circle' : 'circle'}
                      size={14}
                      color={row.theyAcceptedCurrent ? '#4CAF50' : 'rgba(240,232,213,0.4)'}
                    />
                    <Text style={styles.acceptText}>Them</Text>
                  </View>
                </>
              ) : null}
            </View>

            {composing ? (
              renderComposer('Send different terms', onSend)
            ) : (
              <View style={styles.actions}>
                {view.canPropose ? (
                  <TouchableOpacity style={styles.secondaryBtn} onPress={startComposing}>
                    <Text style={styles.secondaryText}>Send different terms</Text>
                  </TouchableOpacity>
                ) : null}
                {view.canAccept ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, busy && styles.btnDisabled]}
                    onPress={onAccept}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#080808" size="small" />
                    ) : (
                      <Text style={styles.primaryText}>Accept these terms</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                {view.canConfirm ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, busy && styles.btnDisabled]}
                    onPress={confirmTrade}
                    disabled={busy}
                  >
                    {busy ? (
                      <ActivityIndicator color="#080808" size="small" />
                    ) : (
                      <Text style={styles.primaryText}>Confirm trade</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
              </View>
            )}

            {previous.length > 0 ? (
              <TouchableOpacity
                style={styles.historyToggle}
                onPress={() => setShowHistory((v) => !v)}
              >
                <Text style={styles.historyToggleText}>
                  {showHistory ? 'Hide earlier terms' : `Earlier terms (${previous.length})`}
                </Text>
              </TouchableOpacity>
            ) : null}

            {showHistory
              ? previous.map((v) => (
                  <View key={v.id} style={[styles.card, styles.historyCard]}>
                    <Text style={styles.cardMeta}>
                      {v.authorUserId === user?.id ? 'You proposed' : 'They proposed'}
                      {' · '}
                      {formatTradeDate(v.createdAt)}
                      {v.acceptedBy.length >= 2
                        ? ' · accepted by both'
                        : v.acceptedBy.length === 1
                          ? user?.id && v.acceptedBy.includes(user.id)
                            ? ' · you accepted'
                            : ' · they accepted'
                          : ''}
                    </Text>
                    {v.terms.map((t) => (
                      <View key={t.id} style={styles.term}>
                        <Text style={styles.termSide}>{sideLabel(t.providedBy, row.myRole)}</Text>
                        <Text style={styles.termText}>{t.serviceDescription}</Text>
                        <Text style={styles.termTiming}>Due by {formatTermTime(t.dueAt)}</Text>
                        {t.scheduledAt ? (
                          <Text style={styles.termTiming}>
                            Scheduled for {formatTermTime(t.scheduledAt)}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                ))
              : null}
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  back: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { color: '#F0E8D5', fontSize: 17, fontWeight: '600' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { color: '#F0E8D5', fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptyBody: {
    color: 'rgba(240,232,213,0.6)',
    fontSize: 13.5,
    textAlign: 'center',
    lineHeight: 19,
  },
  retryBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.3)',
  },
  retryText: { color: '#F0E8D5', fontSize: 13, fontWeight: '500' },
  state: { color: '#F0E8D5', fontSize: 18, fontWeight: '600' },
  stateDetail: {
    color: 'rgba(240,232,213,0.6)',
    fontSize: 13.5,
    lineHeight: 19,
    marginTop: 4,
  },
  changedNote: {
    color: '#E8C468',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 12,
  },
  card: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  historyCard: { opacity: 0.7 },
  cardTitle: { color: '#F0E8D5', fontSize: 14, fontWeight: '600' },
  cardMeta: { color: 'rgba(240,232,213,0.45)', fontSize: 12, marginTop: 3 },
  term: { marginTop: 10 },
  termSide: {
    color: 'rgba(240,232,213,0.45)',
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  termText: { color: '#F0E8D5', fontSize: 14, lineHeight: 20, marginTop: 2 },
  termTiming: { color: 'rgba(240,232,213,0.6)', fontSize: 12.5, lineHeight: 18, marginTop: 2 },
  cancelBanner: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(232,196,104,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(232,196,104,0.3)',
  },
  cancelDetail: {
    color: 'rgba(240,232,213,0.75)',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 4,
  },
  cancelBlock: { marginTop: 16 },
  obligationState: { color: '#F0E8D5', fontSize: 13, lineHeight: 19, marginTop: 8 },
  obligationNote: {
    color: 'rgba(240,232,213,0.6)',
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
  },
  acceptRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  acceptText: { color: 'rgba(240,232,213,0.6)', fontSize: 12.5, marginRight: 10 },
  draftRow: { marginTop: 12 },
  fieldLabel: { color: 'rgba(240,232,213,0.6)', fontSize: 12, marginTop: 8 },
  input: {
    marginTop: 4,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.18)',
    color: '#F0E8D5',
    fontSize: 14,
    minHeight: 44,
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  secondaryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.25)',
  },
  secondaryText: { color: 'rgba(240,232,213,0.8)', fontSize: 13, fontWeight: '500' },
  primaryBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#F0E8D5',
  },
  primaryText: { color: '#080808', fontSize: 13, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
  historyToggle: { marginTop: 18, alignSelf: 'flex-start' },
  historyToggleText: {
    color: 'rgba(240,232,213,0.6)',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
})
