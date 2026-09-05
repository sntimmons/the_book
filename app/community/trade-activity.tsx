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
  acceptInterest,
  declineInterest,
  fetchTradeActivity,
  releaseInterest,
  TRADE_ACTIVITY_SECTION,
  TradeActivityRow,
} from '@/lib/barter'
import { barterWriteFailure } from '@/lib/barterErrors'
import { confirmCopy, SECTION_COPY, SECTION_ORDER, tradeRowState } from '@/lib/tradeActivity'

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

// Section copy, section ORDER and per-row state all live in lib/tradeActivity.ts. They are pure
// and unit tested there: every defect this screen has shipped was a copy defect, and copy rules
// embedded in a react-native component cannot be tested without rendering one.

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
    const c = confirmCopy('endNegotiation', item.myRole, item.provider.name)
    Alert.alert(c.title, c.body, [
      { text: c.cancelLabel, style: 'cancel' },
      { text: c.confirmLabel, style: 'destructive', onPress: () => end(item) },
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

  // Accept and decline are reachable HERE, not only from the offer's responses screen, because
  // that screen is reachable only from an owner's card in the discovery feed -- which filters
  // `is_active = true` and takes the newest 50. A still-active post that simply aged out of
  // that window left its owner with a pending response and no route to answer it.
  //
  // Only offered when the post is still active; tradeRowState decides, and the server holds
  // the same rule so a stale screen is refused rather than silently reopening a closed post.
  async function answerAccept(item: TradeActivityRow) {
    if (actioningId) return
    setActioningId(item.interestId)
    const { ok, conversationId, error } = await acceptInterest(item.interestId)
    setActioningId(null)
    if (!ok) {
      const f = barterWriteFailure('accept', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      if (f.terminal) load()
      return
    }
    // Only navigate on a conversation the server actually returned. Accepting is worthless
    // without the thread, and pushing to `/messages/null` would be a dead screen.
    if (conversationId) {
      router.push(`/messages/${conversationId}` as never)
    } else {
      load()
    }
  }

  async function answerDecline(item: TradeActivityRow) {
    if (actioningId) return
    setActioningId(item.interestId)
    const { ok, error } = await declineInterest(item.interestId)
    setActioningId(null)
    if (!ok) {
      const f = barterWriteFailure('decline', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      if (f.terminal) load()
      return
    }
    load()
  }

  function confirmAccept(item: TradeActivityRow) {
    const c = confirmCopy('accept', item.myRole, item.provider.name)
    Alert.alert(c.title, c.body, [
      { text: c.cancelLabel, style: 'cancel' },
      { text: c.confirmLabel, onPress: () => answerAccept(item) },
    ])
  }

  function confirmDecline(item: TradeActivityRow) {
    const c = confirmCopy('decline', item.myRole, item.provider.name)
    Alert.alert(c.title, c.body, [
      { text: c.cancelLabel, style: 'cancel' },
      { text: c.confirmLabel, style: 'destructive', onPress: () => answerDecline(item) },
    ])
  }

  // Which posts already have their negotiation slot filled. Computed once from the caller's
  // own rows -- the owner sees every response to their post -- so no extra query is needed.
  const matchedOfferIds = new Set(
    rows.filter((r) => r.status === 'accepted').map((r) => r.offerId),
  )

  const grouped = SECTION_ORDER.map((key) => {
    const items = rows.filter((r) => TRADE_ACTIVITY_SECTION[r.status] === key)
    return {
      key,
      title: SECTION_COPY[key].title,
      caption: SECTION_COPY[key].caption,
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
                // One pure function decides what this row SAYS and what it can DO, so the two
                // can never disagree -- which is how "Waiting on you to accept or decline."
                // ended up printed on a row with no accept or decline control.
                const state = tradeRowState({
                  ...item,
                  offerHasAcceptedResponse: matchedOfferIds.has(item.offerId),
                })
                const showActions = state.action !== 'none' || item.conversationId !== null
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

                    {state.note ? (
                      <Text
                        style={state.action === 'end' ? styles.closedNote : styles.historyNote}
                      >
                        {state.note}
                      </Text>
                    ) : null}

                    {showActions ? (
                      <View style={styles.actions}>
                        {/* Offered on EVERY row that has a thread, not only live ones: the
                            release notice is written INTO that thread, so an ended row with no
                            route to it hides the only record of how it ended. */}
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

                        {state.action === 'end' ? (
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
                        ) : null}

                        {/* Styled as the row's primary action, not as `secondaryBtn`. In the
                            `answer` layout Decline is secondary because Accept sits beside it;
                            here it is the only control, and sharing a style with "Open
                            conversation" put an irreversible action and a benign navigation
                            side by side looking identical. */}
                        {state.action === 'declineOnly' ? (
                          <TouchableOpacity
                            style={[styles.endBtn, busy && styles.btnDisabled]}
                            activeOpacity={0.8}
                            disabled={busy}
                            onPress={() => confirmDecline(item)}
                          >
                            {busy ? (
                              <ActivityIndicator color="#F0E8D5" size="small" />
                            ) : (
                              <Text style={styles.endText}>Decline</Text>
                            )}
                          </TouchableOpacity>
                        ) : null}

                        {state.action === 'answer' ? (
                          <>
                            <TouchableOpacity
                              style={[styles.secondaryBtn, busy && styles.btnDisabled]}
                              activeOpacity={0.8}
                              disabled={busy}
                              onPress={() => confirmDecline(item)}
                            >
                              <Text style={styles.secondaryText}>Decline</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.endBtn, busy && styles.btnDisabled]}
                              activeOpacity={0.8}
                              disabled={busy}
                              onPress={() => confirmAccept(item)}
                            >
                              {busy ? (
                                <ActivityIndicator color="#F0E8D5" size="small" />
                              ) : (
                                <Text style={styles.endText}>Accept</Text>
                              )}
                            </TouchableOpacity>
                          </>
                        ) : null}
                      </View>
                    ) : null}
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
