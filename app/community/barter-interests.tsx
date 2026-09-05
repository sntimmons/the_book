import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { cacheBustedPhoto } from '@/lib/image'
import {
  fetchOfferInterests,
  acceptInterest,
  fetchOfferAccess,
  declineInterest,
  releaseInterest,
  INTEREST_STATUS_IS_LISTED,
  BarterInterest,
} from '@/lib/barter'
import { barterWriteFailure } from '@/lib/barterErrors'
import { confirmCopy, tradeRowState } from '@/lib/tradeActivity'
import { timeAgo, initials } from '@/lib/community'

export default function BarterInterests() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  // ONLY offerId. This route once also carried offeringService and ownerName, and the match
  // message was built from them -- so a deep link could author a platform-looking "You matched
  // on a barter!" message with arbitrary content. The message is composed SERVER-side now, by
  // accept_barter_interest from providers.display_name and the offer's own text, and the params
  // are gone rather than merely unread: leaving them kept the SHAPE of that vector alive for
  // the next contributor to wire back into copy.
  const params = useLocalSearchParams<{
    offerId: string
  }>()
  const offerId = params.offerId

  const [interests, setInterests] = useState<BarterInterest[]>([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)
  // This is a real route and is deep-link reachable with any offerId. RLS returns a
  // responder their OWN response row, so without a server-verified ownership check a
  // non-owner would be shown live Accept/Decline controls on a response they cannot action.
  const [isOwner, setIsOwner] = useState<boolean | null>(null)
  // PD-050: a closed post's pending responses are history, not actionable. Starts false so a
  // slow or failed read cannot render an Accept the server would refuse.
  const [offerIsActive, setOfferIsActive] = useState(false)
  // Whether the offer read actually landed. A failure must withhold the CONTROL without
  // asserting the post is closed -- that would be a false claim to its own owner.
  const [offerReadOk, setOfferReadOk] = useState(true)
  const [hasAccepted, setHasAccepted] = useState(false)

  const load = useCallback(async () => {
    if (!offerId) {
      setLoading(false)
      return
    }
    const [all, access] = await Promise.all([
      fetchOfferInterests(offerId),
      user
        ? fetchOfferAccess(offerId, user.id)
        : Promise.resolve({ isOwner: false, isActive: false, ok: false }),
    ])
    setIsOwner(access.isOwner)
    setOfferIsActive(access.isActive)
    setOfferReadOk(access.ok)
    // Show pending interests as actionable; drop already-declined ones.
    // Driven by a TOTAL Record, not a deny-list and not inline literals. `!== 'declined'`
    // treated every unknown future status as live and actionable, so `released` would have
    // rendered with a working Accept button that could only fail. A total Record is also the
    // only form that actually breaks the build when the status union widens.
    // The capability fact comes from ALL rows, before the display filter. Deriving it from
    // the filtered list coupled a presentation decision to a capability decision: hiding
    // accepted rows from the owner's list -- a purely cosmetic change -- would have flipped
    // this to false and restored a live Accept on every pending row.
    setHasAccepted(all.some((i) => i.status === 'accepted'))
    setInterests(all.filter((i) => INTEREST_STATUS_IS_LISTED[i.status]))
    setLoading(false)
  }, [offerId, user])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  // ONE authoritative success boundary. Previously this was four sequential client writes
  // — accept, get-or-create conversation, insert message, bump last_message_at — each able
  // to fail after the accept had already committed, and the code navigated regardless. Slice
  // 1 made that permanent: the accept slot could never be freed. accept_barter_interest does
  // the whole handoff in one transaction, so either the response is accepted AND a usable
  // conversation exists, or nothing happened at all.
  function confirmRelease(item: BarterInterest) {
    // Shared copy, so the owner's disclosure does not depend on which screen they ended it
    // from. The two routes previously differed on whether another response could be accepted.
    // Owner-only: this screen's End control sits behind the ownership gate. The ternary that
    // was here read as though a responder path existed, which it does not.
    const c = confirmCopy('endNegotiation', 'owner', item.provider.name)
    Alert.alert(c.title, c.body, [
      { text: c.cancelLabel, style: 'cancel' },
      { text: c.confirmLabel, style: 'destructive', onPress: () => release(item) },
    ])
  }

  async function release(item: BarterInterest) {
    if (actioningId) return
    setActioningId(item.id)
    const { ok, error } = await releaseInterest(item.id)
    setActioningId(null)
    if (!ok) {
      const f = barterWriteFailure('release', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      // A terminal refusal means our view of the row is stale, so re-read rather than leaving
      // a control the server has already refused.
      if (f.terminal) load()
      return
    }
    load()
  }

  async function accept(interest: BarterInterest) {
    if (!user || actioningId || !isOwner) return
    setActioningId(interest.id)
    // Through the shared helper, NOT a raw rpc call. Both accept entry points must go through
    // one definition or they drift: this site used to cast the result to `string`, so a null
    // conversation navigated to `/messages/null` -- a dead screen -- while Trade Activity
    // guarded it.
    const { ok, conversationId, error } = await acceptInterest(interest.id)
    if (!ok) {
      const f = barterWriteFailure('accept', error)
      setActioningId(null)
      // A terminal outcome means our list is stale — someone else's state won. Reload so the
      // user is not left looking at controls the server has already invalidated.
      if (f.terminal) load()
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      return
    }
    if (!conversationId) {
      setActioningId(null)
      Alert.alert(
        'Accepted, but the conversation could not be opened',
        'The response was accepted. Open it from Trade Activity to continue.',
        [{ text: 'OK' }],
      )
      load()
      return
    }
    router.replace(`/messages/${conversationId}` as never)
  }

  async function decline(interest: BarterInterest) {
    if (actioningId || !isOwner) return
    setActioningId(interest.id)
    const prev = interests
    setInterests((list) => list.filter((i) => i.id !== interest.id))
    // Uses the helper that treats a zero-row write as a failure. A plain update on a row RLS
    // filters out raises nothing, so trusting `error` alone reported success for a decline
    // that never happened and left the card removed from the list.
    const { ok, error } = await declineInterest(interest.id)
    setActioningId(null)
    if (!ok) {
      console.log('Decline interest error:', error)
      setInterests(prev)
      const f = barterWriteFailure('decline', error)
      if (f.terminal) load()
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
    }
  }

  function confirmAccept(interest: BarterInterest) {
    const c = confirmCopy('accept', 'owner', interest.provider.name)
    Alert.alert(c.title, c.body, [
      { text: c.cancelLabel, style: 'cancel' },
      { text: c.confirmLabel, onPress: () => accept(interest) },
    ])
  }

  function confirmDecline(interest: BarterInterest) {
    // Shared copy: this dialog previously disclosed no irreversibility at all, on the screen
    // where declining is the primary action.
    const c = confirmCopy('decline', 'owner', interest.provider.name)
    Alert.alert(c.title, c.body, [
      { text: c.cancelLabel, style: 'cancel' },
      { text: c.confirmLabel, style: 'destructive', onPress: () => decline(interest) },
    ])
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Interested</Text>
        <View style={styles.iconBtn} />
      </View>

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <FlatList
          data={interests}
          keyExtractor={(i) => i.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 40, paddingTop: 8 }}
          ListEmptyComponent={
            <View style={styles.centerBody}>
              <Feather name="inbox" size={36} color="rgba(240,232,213,0.12)" />
              <Text style={styles.emptyTitle}>No interest yet</Text>
              <Text style={styles.emptySub}>
                When providers express interest in your offer, they show up here.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const busy = actioningId === item.id
            // ONE interpreter. This screen used to re-derive capability from its own ternary
            // chain over `released` / `isOwner` / `accepted` / `offerIsActive` / `offerMatched`.
            // That chain was NOT total -- a status added later matched no branch and fell
            // through to the final else, which renders a live Accept, on the screen where
            // Accept is the primary action. It had also already drifted from tradeRowState on
            // whether a closed post's response may be declined. Capability now comes from the
            // same pure, total, unit-tested function Trade Activity uses.
            //
            // Role here is the VIEWER's: RLS returns a row only to the offer owner or the
            // responder themselves, so a non-owner reading this screen is necessarily the
            // responder.
            const state = tradeRowState({
              status: item.status,
              myRole: isOwner ? 'owner' : 'responder',
              offerIsActive,
              releasedAt: item.releasedAt,
              releaseReason: item.releaseReason,
              offerHasAcceptedResponse: hasAccepted,
            })
            // `isOwner` is `boolean | null` -- null means the ownership read has not landed.
            // Controls require a POSITIVE answer, so an unresolved read shows none.
            const canAct = isOwner === true
            // `released` and `declined` are terminal facts about the row itself; `pending` and
            // `accepted` notes speak about the post's liveness, which a failed read does not
            // know.
            const rowDependsOnOffer = item.status === 'pending' || item.status === 'accepted'
            const rowNote = offerReadOk || !rowDependsOnOffer
              ? state.note
              : 'Could not load this post just now, so its responses cannot be answered here. '
                + 'Open it again to retry.'
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  {item.provider.photo ? (
                    <Image
                      source={{ uri: cacheBustedPhoto(item.provider.photo) }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarText}>{initials(item.provider.name)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.provider.name}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {item.provider.category ? `${item.provider.category} · ` : ''}
                      {timeAgo(item.createdAt)}
                    </Text>
                  </View>
                </View>

                {item.message ? <Text style={styles.message}>{item.message}</Text> : null}

                {/* STATUS BEFORE ROLE, preserved: the row's own state is stated first, so a
                    responder who deep-links to their released response learns the negotiation
                    ended rather than being told only about permissions. */}
                {/* A released or declined row's note is a pure function of the ROW, so a
                    failed OFFER read must not replace it with a retry instruction for
                    something that will never change. Only liveness-dependent notes are
                    suppressed. */}
                {rowNote ? (
                  <View style={styles.matchedNote}>
                    <Text style={styles.matchedNoteText}>{rowNote}</Text>
                  </View>
                ) : null}

                {/* ENDING comes first, and is NOT behind the ownership gate: either
                    participant may end an accepted negotiation (release_barter_interest checks
                    participation, and PD-052 keeps this legal on a closed post). Putting the
                    ownership note first told a responder who deep-linked to their own accepted
                    row that they could not act, while tradeRowState and both other surfaces
                    correctly granted them the control. */}
                {state.action === 'end' ? (
                  <View style={styles.acceptedRow}>
                    <View style={styles.acceptedRowLeft}>
                      <Feather name="check-circle" size={14} color="#4CAF50" />
                      <Text style={styles.acceptedText}>In negotiation</Text>
                    </View>
                    <TouchableOpacity
                      style={[styles.declineBtn, busy && styles.btnDisabled]}
                      activeOpacity={0.8}
                      disabled={busy}
                      onPress={() => confirmRelease(item)}
                    >
                      <Text style={styles.declineText}>End negotiation</Text>
                    </TouchableOpacity>
                  </View>
                ) : isOwner === false ? (
                  // Only when ownership is RESOLVED as false. `isOwner === null` means the read
                  // has not landed, and asserting non-ownership then told a post's real owner
                  // they did not own it -- the same false-claim-on-a-failed-read defect that
                  // `ok` was added to fetchOfferAccess to prevent, one line away.
                  <View style={styles.matchedNote}>
                    <Text style={styles.matchedNoteText}>
                      Only the provider who posted this offer can respond to it.
                    </Text>
                  </View>
                ) : !canAct ? null : state.action === 'answer' ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.declineBtn, busy && styles.btnDisabled]}
                      activeOpacity={0.8}
                      disabled={busy}
                      onPress={() => confirmDecline(item)}
                    >
                      <Text style={styles.declineText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.acceptBtn, busy && styles.btnDisabled]}
                      activeOpacity={0.85}
                      disabled={busy}
                      onPress={() => confirmAccept(item)}
                    >
                      {busy ? (
                        <ActivityIndicator color="#080808" size="small" />
                      ) : (
                        <Text style={styles.acceptText}>Accept</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                ) : state.action === 'declineOnly' ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.declineBtn, busy && styles.btnDisabled]}
                      activeOpacity={0.8}
                      disabled={busy}
                      onPress={() => confirmDecline(item)}
                    >
                      <Text style={styles.declineText}>Decline</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // minHeight, not a fixed height: these notes now carry the whole explanation for why a
  // control is absent, and they run two to three lines. A fixed 40pt box clipped them on
  // Android, where View overflow defaults to hidden.
  matchedNote: {
    flex: 1,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  matchedNoteText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
  },
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  iconBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  centerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 100,
  },
  emptyTitle: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 14,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1410' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  name: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  meta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  message: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.85)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    marginTop: 12,
  },
  actions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  declineBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
  },
  declineText: { fontSize: 14, color: 'rgba(240,232,213,0.7)', fontFamily: 'Manrope_600SemiBold' },
  acceptBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  acceptText: { fontSize: 14, color: '#080808', fontFamily: 'Manrope_700Bold' },
  btnDisabled: { opacity: 0.5 },
  acceptedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 16,
  },
  acceptedRowLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  acceptedText: { fontSize: 13, color: '#4CAF50', fontFamily: 'Manrope_600SemiBold' },
})
