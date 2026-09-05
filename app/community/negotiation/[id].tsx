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
  createProposal,
  fetchInterestContext,
  finalizeAgreement,
  fetchNegotiation,
  fetchNegotiationForInterest,
  NegotiationRow,
  ProposalVersion,
  submitCounter,
} from '@/lib/negotiation'
import { barterWriteFailure } from '@/lib/barterErrors'
import {
  acceptedAnEarlierVersion,
  MAX_DESCRIPTION,
  negotiationView,
  ProposalDraft,
  ProposalSide,
  shouldShowTermsChangedNote,
  sideLabel,
  TERMS_CHANGED_NOTE,
  TradeSide,
  validateDraft,
} from '@/lib/negotiationState'
import { formatTradeDate } from '@/lib/tradeActivity'

// NEGOTIATION — the terms of one barter trade, and their history.
//
// Reachable from an active row in Trade Activity. The conversation stays where logistics
// happen; this is where the terms live, and the two are deliberately separate: a provider pair
// may trade more than once over time while keeping one conversation.
//
// Nothing here finalises a trade. Both providers accepting the same terms is recorded and
// shown; there is no agreement, obligation or fulfilment model yet, so no copy on this screen
// may say a trade is booked, owed or complete.

const EMPTY_DRAFT: ProposalDraft = { ownerGives: '', responderGives: '' }

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
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [composing, setComposing] = useState(false)
  const [draft, setDraft] = useState<ProposalDraft>(EMPTY_DRAFT)
  const [showHistory, setShowHistory] = useState(false)
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
      setContext({ status: ctx.status, myRole: ctx.myRole })
      setFailed(!ctx.ok)
      setLoading(false)
      return
    }
    const { row: r, versions: v, ok } = await fetchNegotiation(found.row.proposalId)
    setRow(r)
    setVersions(v)
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
      'Confirm this trade?',
      'This makes the terms you both accepted official. They can no longer be changed, and the'
        + ' post comes off the board for good.',
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Confirm trade', onPress: onConfirm },
      ],
    )
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
    const ordered: { key: keyof ProposalDraft; side: ProposalSide }[] = [
      { key: 'ownerGives', side: 'offer_owner' },
      { key: 'responderGives', side: 'responder' },
    ]
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{title}</Text>
        {ordered.map((f) => (
          <View key={f.key} style={styles.draftRow}>
            <Text style={styles.termSide}>{sideLabel(f.side, myRole)}</Text>
            <TextInput
              style={styles.input}
              value={draft[f.key]}
              onChangeText={(v) => setDraft((d) => ({ ...d, [f.key]: v }))}
              placeholder="What is provided"
              placeholderTextColor="rgba(240,232,213,0.35)"
              maxLength={MAX_DESCRIPTION}
              multiline
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
            <Text style={styles.stateDetail}>{view.detail}</Text>

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

            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {view.state === 'ended'
                  ? 'The last terms proposed'
                  : view.state === 'confirmed'
                    ? 'The agreed terms'
                    : 'On the table now'}
              </Text>
              <Text style={styles.cardMeta}>
                {row.currentVersionAuthorId === user?.id ? 'You proposed these' : 'They proposed these'}
                {' · '}
                {formatTradeDate(current.createdAt)}
              </Text>
              {current.terms.map((t) => (
                <View key={t.id} style={styles.term}>
                  <Text style={styles.termSide}>{sideLabel(t.providedBy, row.myRole)}</Text>
                  <Text style={styles.termText}>{t.serviceDescription}</Text>
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
  acceptRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 14 },
  acceptText: { color: 'rgba(240,232,213,0.6)', fontSize: 12.5, marginRight: 10 },
  draftRow: { marginTop: 12 },
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
