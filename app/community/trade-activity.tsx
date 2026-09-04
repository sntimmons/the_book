import { useCallback, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cacheBustedPhoto } from '@/lib/image'
import {
  BarterInterestStatus,
  fetchTradeActivity,
  releaseInterest,
  TRADE_ACTIVITY_SECTION,
  TradeActivityRow,
  TradeActivitySection,
} from '@/lib/barter'
import { barterWriteFailure } from '@/lib/barterErrors'

// TRADE ACTIVITY — durable access to barter relationships, independent of the discovery feed.
//
// Deliberately NOT called "My Trades". No agreement schema exists yet, so calling a
// pre-agreement negotiation a trade would be false product language. This becomes My Trades
// when the agreement lifecycle lands.
//
// The feed is discovery: it filters `is_active = true` and shows the newest 50. An accepted
// negotiation is durable workflow state. Hanging the End-negotiation control off a feed card
// meant closing the post — or the post simply ageing out — removed the only route to it for
// BOTH parties, leaving the slot consumed and the counterparty never told.

// A TOTAL Record keyed by the exported section type, so adding a section breaks the build here
// rather than silently dropping every row in it — an array would not.
//
// The captions take the ROLE, because the view carries `my_role` and the same status means
// opposite things on the two sides: a pending interest is waiting on the OWNER to answer and on
// the RESPONDER to be answered, and "not selected" is something the owner DID, not something
// that happened to them. Role-blind copy told an owner to wait for something that would never
// come.
const SECTION_COPY: Record<
  TradeActivitySection,
  { title: string; caption: (role: 'owner' | 'responder') => string }
> = {
  active: {
    title: 'Active negotiations',
    caption: () => 'You are working out the details of these.',
  },
  pending: {
    title: 'Pending',
    caption: (role) =>
      role === 'owner'
        ? 'Responses to your posts, waiting on you.'
        : 'Sent, waiting on the other provider.',
  },
  ended: {
    title: 'Ended',
    caption: () => 'Negotiations that ended before a trade was agreed.',
  },
  notSelected: {
    title: 'Not selected',
    caption: (role) =>
      role === 'owner' ? 'Responses you declined.' : 'The provider chose someone else.',
  },
}

// TOTAL over the status vocabulary. The previous nested ternary fell through to "Waiting on
// the other provider." for any unknown status — a confident false statement about a state the
// code does not model. A Record makes a fifth status a compile error instead.
const HISTORY_NOTE: Record<
  BarterInterestStatus,
  (role: 'owner' | 'responder') => string
> = {
  accepted: () => '',
  pending: (role) =>
    role === 'owner' ? 'Waiting on you to accept or decline.' : 'Waiting on the other provider.',
  released: () => 'Negotiation ended. Kept as history.',
  declined: (role) =>
    role === 'owner' ? 'You declined this response. Kept as history.' : 'Not selected. Kept as history.',
}

function historyNote(item: TradeActivityRow): string {
  return HISTORY_NOTE[item.status](item.myRole)
}

const SECTION_ORDER: TradeActivitySection[] = ['active', 'pending', 'ended', 'notSelected']

export default function TradeActivityScreen() {
  const insets = useSafeAreaInsets()
  const [rows, setRows] = useState<TradeActivityRow[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [actioningId, setActioningId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { rows: data, ok } = await fetchTradeActivity()
    setRows(data)
    setFailed(!ok)
    setLoading(false)
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  function confirmEnd(item: TradeActivityRow) {
    const body =
      item.myRole === 'owner'
        ? 'This cannot be undone. The other provider will be told, and they will not be able to '
          + 'respond to this post again — you will not be able to re-accept them. Their response '
          + 'stays on record.'
        : 'This cannot be undone. The other provider will be told, and you will not be able to '
          + 'respond to this post again. Your response stays on record.'
    Alert.alert('End this negotiation?', body, [
      { text: 'Keep negotiating', style: 'cancel' },
      { text: 'End negotiation', style: 'destructive', onPress: () => end(item) },
    ])
  }

  async function end(item: TradeActivityRow) {
    if (actioningId) return
    setActioningId(item.interestId)
    const { ok, error } = await releaseInterest(item.interestId)
    setActioningId(null)
    if (!ok) {
      const f = barterWriteFailure('release', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      // A terminal refusal means this row is stale, so re-read rather than leaving a control
      // the server has already refused.
      if (f.terminal) load()
      return
    }
    load()
  }

  const grouped = SECTION_ORDER.map((key) => {
    const items = rows.filter((r) => TRADE_ACTIVITY_SECTION[r.status] === key)
    return {
      key,
      title: SECTION_COPY[key].title,
      // Role is per-row; the caption takes the majority role in the section so it is truthful
      // for what the user is actually looking at rather than assuming they are the responder.
      caption: SECTION_COPY[key].caption(
        items.filter((i) => i.myRole === 'owner').length > items.length / 2
          ? 'owner'
          : 'responder',
      ),
      items,
    }
  }).filter((s) => s.items.length > 0)

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.back} onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="chevron-left" size={22} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Trade Activity</Text>
        <View style={styles.back} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#F0E8D5" />
        </View>
      ) : failed ? (
        // NOT the empty state. "No trade activity yet" on a failed read is the original
        // stranding wearing a truthful-sounding sentence: a provider with a live negotiation is
        // told they have none, on the one surface built to guarantee they can always find it.
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>Could not load your trade activity</Text>
          <Text style={styles.emptyBody}>
            This is a connection problem, not an empty list. Your negotiations are safe.
          </Text>
          <TouchableOpacity
            style={styles.retryBtn}
            activeOpacity={0.85}
            onPress={() => {
              setLoading(true)
              load()
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : grouped.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No trade activity yet</Text>
          <Text style={styles.emptyBody}>
            Responses you send, and responses you accept, show up here — and stay here after the
            post comes off the board.
          </Text>
        </View>
      ) : (
        <FlatList
          data={grouped}
          keyExtractor={(s) => s.key}
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionCaption}>{section.caption}</Text>
              {section.items.map((item) => {
                const busy = actioningId === item.interestId
                const isActive = item.status === 'accepted'
                return (
                  <View key={item.interestId} style={styles.card}>
                    <View style={styles.cardTop}>
                      {item.provider.photo ? (
                        <Image
                          source={{ uri: cacheBustedPhoto(item.provider.photo) }}
                          style={styles.avatar}
                        />
                      ) : (
                        <View style={[styles.avatar, styles.avatarFallback]}>
                          <Feather name="user" size={16} color="rgba(240,232,213,0.6)" />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.name} numberOfLines={1}>
                          {item.provider.name}
                        </Text>
                        <Text style={styles.terms} numberOfLines={2}>
                          {item.offeringService} for {item.seekingService}
                        </Text>
                      </View>
                    </View>

                    {/* Only on a LIVE negotiation. Rendered outside this branch it also fired
                        on ended and declined rows, telling a provider "the negotiation is still
                        open" directly above "Negotiation ended" — two sentences that cannot both
                        be true, with the wrong one reading as the actionable one. */}
                    {isActive && !item.offerIsActive && (
                      <Text style={styles.closedNote}>
                        This post is no longer on the board. The negotiation is still open.
                      </Text>
                    )}

                    {isActive ? (
                      <View style={styles.actions}>
                        {item.conversationId ? (
                          <TouchableOpacity
                            style={styles.secondaryBtn}
                            activeOpacity={0.8}
                            onPress={() =>
                              router.push(`/messages/${item.conversationId}` as never)
                            }
                          >
                            <Feather
                              name="message-circle"
                              size={14}
                              color="rgba(240,232,213,0.75)"
                            />
                            <Text style={styles.secondaryText}>Open conversation</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          style={[styles.endBtn, busy && styles.btnDisabled]}
                          activeOpacity={0.8}
                          disabled={busy}
                          onPress={() => confirmEnd(item)}
                        >
                          {busy ? (
                            <ActivityIndicator color="#F0E8D5" size="small" />
                          ) : (
                            <Text style={styles.endText}>End negotiation</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.historyNote}>{historyNote(item)}</Text>
                    )}
                  </View>
                )
              })}
            </View>
          )}
        />
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
  emptyTitle: { color: '#F0E8D5', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  emptyBody: {
    color: 'rgba(240,232,213,0.55)',
    fontSize: 13.5,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.1)',
  },
  retryText: { color: '#F0E8D5', fontSize: 13.5, fontWeight: '500' },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#F0E8D5', fontSize: 15, fontWeight: '600' },
  sectionCaption: { color: 'rgba(240,232,213,0.45)', fontSize: 12.5, marginTop: 2 },
  card: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 38, height: 38, borderRadius: 19 },
  avatarFallback: {
    backgroundColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: '#F0E8D5', fontSize: 14.5, fontWeight: '600' },
  terms: { color: 'rgba(240,232,213,0.6)', fontSize: 12.5, marginTop: 2 },
  closedNote: {
    color: 'rgba(240,232,213,0.5)',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 10,
    fontStyle: 'italic',
  },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  secondaryText: { color: 'rgba(240,232,213,0.75)', fontSize: 12.5, fontWeight: '500' },
  endBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.25)',
  },
  endText: { color: '#F0E8D5', fontSize: 12.5, fontWeight: '500' },
  btnDisabled: { opacity: 0.5 },
  historyNote: { color: 'rgba(240,232,213,0.45)', fontSize: 12.5, marginTop: 10 },
})
