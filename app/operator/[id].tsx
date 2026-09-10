import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '@/context/AuthContext'
import {
  CASE_TYPE_LABEL,
  OUTCOME_HELP,
  OUTCOME_LABEL,
  adjudicateObligation,
  caseDetail,
  setProviderEligibility,
  updateCase,
  type CaseDetail,
} from '@/lib/operator'

// One case, its facts, its history, and the one action it supports.
//
// ── THE RULE THIS SCREEN IS BUILT AROUND ──────────────────────────────────
//
// It shows FACTS and never a verdict. A case is a question someone raised; the
// product must not answer it before the operator does, and a screen that leads
// with a computed conclusion is answering it. So the facts are listed flat, in
// the order they happened, with no summary line above them.

function Fact({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === '') return null
  const text =
    typeof value === 'boolean' ? (value ? 'yes' : 'no') : String(value)
  return (
    <View style={s.fact}>
      <Text style={s.factLabel}>{label}</Text>
      <Text style={s.factValue}>{text}</Text>
    </View>
  )
}

export default function OperatorCase() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const [c, setC] = useState<CaseDetail | null>(null)
  const [failed, setFailed] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const d = await caseDetail(id as string)
    setFailed(d === null)
    setC(d)
  }, [id])

  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      ;(async () => {
        const d = await caseDetail(id as string)
        if (cancelled) return
        setFailed(d === null)
        setC(d)
      })()
      return () => {
        cancelled = true
      }
    }, [id]),
  )

  async function act(action: 'claimed' | 'resolved' | 'dismissed' | 'noted') {
    if (!user || busy) return
    setBusy(true)
    const r = await updateCase(id as string, action, user.id, note)
    setBusy(false)
    if (!r.ok) {
      Alert.alert('Could not record that', 'Please try again.')
      return
    }
    setNote('')
    await load()
  }

  // The resolution action for a PROVIDER APPEAL. Restoring eligibility closes
  // the case through the same audited path that made the decision
  // (20261054000000), so this deliberately does NOT also call updateCase — that
  // would append a second, contradictory closure.
  async function decideAppeal(approved: boolean) {
    if (!user || !c || busy) return
    const providerId = (c.facts?.provider_id as string | undefined) ?? null
    if (!providerId) return
    setBusy(true)
    const r = await setProviderEligibility(providerId, approved, user.id, note)
    setBusy(false)
    if (!r.ok) {
      Alert.alert('Could not record that', 'Please try again.')
      return
    }
    setNote('')
    await load()
  }

  function decideTrade(outcome: 'fulfilled' | 'unfulfilled' | 'closed_without_resolution') {
    if (!user || !c) return
    const obligationId = (c.facts?.obligation_id as string | undefined) ?? null
    if (!obligationId) return
    const rationale = note.trim()
    if (!rationale) {
      // The server requires it. Asking here means the operator does not lose
      // what they typed to a round trip, and it says WHY rather than "required".
      Alert.alert(
        'A rationale is required',
        'Every outcome records why it was reached. It is internal — participants '
        + 'never see it — but a decision nobody has to justify is a decision nobody '
        + 'can review.',
      )
      return
    }
    Alert.alert(
      OUTCOME_LABEL[outcome],
      `${OUTCOME_HELP[outcome]}\n\nThis cannot be changed or withdrawn once recorded.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record',
          style: 'destructive',
          onPress: async () => {
            setBusy(true)
            const r = await adjudicateObligation(obligationId, outcome, user.id, rationale)
            setBusy(false)
            if (!r.ok) {
              Alert.alert('Could not record that', 'Please try again.')
              return
            }
            // Recording an outcome answers the question the case asked, so the
            // case is closed in the same breath — otherwise the queue keeps
            // showing work that is done.
            //
            // TWO CALLS, AND THE SECOND CAN FAIL ON ITS OWN. The outcome is
            // already recorded and is IMMUTABLE — there is no undo, by design
            // (PD-066) — so a failure here leaves the trade terminally resolved
            // with its case still open. That is recoverable and the operator
            // must be told which half landed, because the obvious reaction to a
            // silent failure is to try the outcome again, and the outcome is the
            // one thing that cannot be retried.
            const closed = await updateCase(
              id as string, 'resolved', user.id, `outcome: ${outcome}`,
            )
            setNote('')
            await load()
            if (!closed.ok) {
              Alert.alert(
                'Outcome recorded — case still open',
                'The outcome was saved and cannot be changed. Closing the case did not '
                + 'go through, so it is still open in the queue. Open it again and use '
                + '"Resolve" to close it — do not record the outcome a second time.',
              )
            }
          },
        },
      ],
    )
  }

  if (c === null && !failed) {
    return (
      <View style={s.center}>
        <ActivityIndicator color="#C8922A" />
      </View>
    )
  }
  if (failed || !c) {
    return (
      <View style={s.center}>
        <Text style={s.gone}>Could not load this case.</Text>
      </View>
    )
  }

  const closed = c.status === 'resolved' || c.status === 'dismissed'
  const facts = c.facts ?? {}
  const alreadyDecided = (facts.existing_outcome as string | undefined) ?? null

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40 }}
    >
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={s.title}>{CASE_TYPE_LABEL[c.case_type]}</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={s.status}>{c.status.replace('_', ' ')}</Text>

      <Text style={s.section}>FACTS</Text>
      {c.facts === null ? (
        <Text style={s.gone}>The subject of this case no longer exists.</Text>
      ) : (
        <View style={s.card}>
          {Object.entries(facts).map(([k, v]) => (
            <Fact key={k} label={k.replace(/_/g, ' ')} value={v} />
          ))}
        </View>
      )}

      <Text style={s.section}>HISTORY</Text>
      <View style={s.card}>
        {c.history.length === 0 ? (
          <Text style={s.factValue}>Nothing recorded yet.</Text>
        ) : (
          c.history.map((e) => (
            <View key={e.id} style={s.event}>
              <Text style={s.eventHead}>
                {e.action}
                {e.from_status ? ` · ${e.from_status} → ${e.to_status ?? ''}` : ''}
              </Text>
              {e.note ? <Text style={s.eventNote}>{e.note}</Text> : null}
              <Text style={s.eventTime}>{new Date(e.created_at).toLocaleString()}</Text>
            </View>
          ))
        )}
      </View>

      {closed ? (
        // A closed case is history. It stays fully readable — the record is the
        // point — but it offers no controls, because reopening is not a
        // supported action and a control that cannot succeed is worse than none.
        <Text style={s.closedNote}>
          This case is closed. It is kept as a record and cannot be reopened from here.
        </Text>
      ) : (
        <>
          <Text style={s.section}>INTERNAL NOTE</Text>
          <Text style={s.hint}>
            Participants never see this. It is attached to whichever action you take next.
          </Text>
          <TextInput
            style={s.input}
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={4000}
            placeholder="What you found, and what you are doing about it"
            placeholderTextColor="rgba(240,232,213,0.3)"
          />

          <View style={s.actions}>
            {c.status === 'open' ? (
              <TouchableOpacity style={s.btn} disabled={busy} onPress={() => act('claimed')}>
                <Text style={s.btnText}>Start reviewing</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity style={s.btn} disabled={busy} onPress={() => act('noted')}>
              <Text style={s.btnText}>Add note only</Text>
            </TouchableOpacity>
          </View>

          {c.case_type === 'provider_appeal' ? (
            <>
              <Text style={s.section}>DECISION</Text>
              <View style={s.actions}>
                <TouchableOpacity
                  style={[s.btn, s.btnPrimary]}
                  disabled={busy}
                  onPress={() => decideAppeal(true)}
                >
                  <Text style={[s.btnText, s.btnPrimaryText]}>Restore availability</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btn} disabled={busy} onPress={() => act('dismissed')}>
                  <Text style={s.btnText}>Leave unavailable</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.hint}>
                The provider is not told which of these happened in words — what they see is
                whether their business is available again.
              </Text>
            </>
          ) : null}

          {c.case_type === 'barter_review' ? (
            <>
              <Text style={s.section}>OUTCOME</Text>
              {alreadyDecided ? (
                <Text style={s.gone}>
                  Already resolved as {OUTCOME_LABEL[alreadyDecided] ?? alreadyDecided}. An outcome
                  cannot be changed or withdrawn.
                </Text>
              ) : (
                <>
                  {(['fulfilled', 'unfulfilled', 'closed_without_resolution'] as const).map((o) => (
                    <TouchableOpacity
                      key={o}
                      style={s.outcome}
                      disabled={busy}
                      onPress={() => decideTrade(o)}
                    >
                      <Text style={s.outcomeLabel}>{OUTCOME_LABEL[o]}</Text>
                      <Text style={s.outcomeHelp}>{OUTCOME_HELP[o]}</Text>
                    </TouchableOpacity>
                  ))}
                  <Text style={s.hint}>
                    The outcome is participant-visible. Your rationale and your identity are not.
                  </Text>
                </>
              )}
            </>
          ) : null}

          {c.case_type === 'user_report' ? (
            <>
              <Text style={s.section}>DECISION</Text>
              <View style={s.actions}>
                <TouchableOpacity style={s.btn} disabled={busy} onPress={() => act('resolved')}>
                  <Text style={s.btnText}>Resolve</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.btn} disabled={busy} onPress={() => act('dismissed')}>
                  <Text style={s.btnText}>Dismiss</Text>
                </TouchableOpacity>
              </View>
              <Text style={s.hint}>
                Neither tells the reporter anything — there is no channel to tell them through,
                and none is promised.
              </Text>
            </>
          ) : null}
        </>
      )}
    </ScrollView>
  )
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  center: { flex: 1, backgroundColor: '#080808', alignItems: 'center', justifyContent: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: { fontSize: 17, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  status: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  section: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_700Bold',
    letterSpacing: 1,
    paddingHorizontal: 20,
    marginTop: 22,
    marginBottom: 8,
  },
  card: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    padding: 14,
    gap: 10,
  },
  fact: { flexDirection: 'row', gap: 12 },
  factLabel: { flex: 1, fontSize: 12, color: 'rgba(240,232,213,0.45)', fontFamily: 'Manrope_400Regular' },
  factValue: { flex: 1.4, fontSize: 13, color: '#F0E8D5', fontFamily: 'Manrope_400Regular' },
  event: { borderTopWidth: 1, borderTopColor: 'rgba(240,232,213,0.06)', paddingTop: 10 },
  eventHead: { fontSize: 12, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  eventNote: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.7)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  eventTime: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  hint: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    paddingHorizontal: 20,
    marginTop: 8,
    lineHeight: 16,
  },
  gone: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    paddingHorizontal: 20,
  },
  closedNote: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    paddingHorizontal: 20,
    marginTop: 24,
    lineHeight: 19,
  },
  input: {
    marginHorizontal: 16,
    minHeight: 90,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    padding: 14,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 12 },
  btn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: { fontSize: 13, color: '#F0E8D5', fontFamily: 'Manrope_500Medium' },
  btnPrimary: { backgroundColor: '#F0E8D5', borderColor: '#F0E8D5' },
  btnPrimaryText: { color: '#080808', fontFamily: 'Manrope_700Bold' },
  outcome: {
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  outcomeLabel: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  outcomeHelp: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    lineHeight: 17,
  },
})
