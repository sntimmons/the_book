import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cacheBustedPhoto } from '@/lib/image'
// Provider display info, relative time and avatar initials are shared with the
// community feed — the one genuine overlap between the two surfaces, and the
// reason lib/community.ts is imported here at all.
import { timeAgo, initials } from '@/lib/community'
import {
  fetchBarterFeed,
  fetchMyInterests,
  releaseInterest,
  MyInterest,
  BarterOfferWithProvider,
} from '@/lib/barter'
import { barterWriteFailure, interpretWrite } from '@/lib/barterErrors'
import { confirmCopy, responderFeedState } from '@/lib/tradeActivity'

const INTEREST_MAX = 300

export default function BarterBoard() {
  const insets = useSafeAreaInsets()
  const { user, providerId, isProvider, roleLoading } = useAuth()
  const currentUserId = user?.id ?? null

  // Barter board state.
  const [offers, setOffers] = useState<BarterOfferWithProvider[]>([])
  const [myInterests, setMyInterests] = useState<Map<string, MyInterest>>(new Map())
  const [barterLoading, setBarterLoading] = useState(true)
  const [barterRefreshing, setBarterRefreshing] = useState(false)
  // The offer the interest modal is open for (null = closed) and its draft note.
  const [interestOffer, setInterestOffer] = useState<BarterOfferWithProvider | null>(null)
  const [interestNote, setInterestNote] = useState('')
  const [sendingInterest, setSendingInterest] = useState(false)

  const loadBarter = useCallback(
    async (refresh = false) => {
      if (!isProvider || !user) {
        setBarterLoading(false)
        return
      }
      if (refresh) setBarterRefreshing(true)
      const [feed, mine] = await Promise.all([
        fetchBarterFeed(),
        fetchMyInterests(user.id),
      ])
      setOffers(feed)
      setMyInterests(mine)
      setBarterLoading(false)
      setBarterRefreshing(false)
    },
    [isProvider, user],
  )

  useFocusEffect(
    useCallback(() => {
      setBarterLoading(true)
      loadBarter()
    }, [loadBarter]),
  )

  function openInterest(offer: BarterOfferWithProvider) {
    setInterestNote('')
    setInterestOffer(offer)
  }

  async function submitInterest() {
    const offer = interestOffer
    if (!offer || !user || !providerId || sendingInterest) return
    setSendingInterest(true)
    const { error } = await supabase.from('barter_interests').insert({
      offer_id: offer.id,
      interested_provider_id: providerId,
      interested_user_id: user.id,
      message: interestNote.trim() || null,
      status: 'pending',
    })
    setSendingInterest(false)
    if (error) {
      console.log('Express interest error:', error)
      const f = barterWriteFailure('respond', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      // A terminal refusal will not succeed on a retry, so the composer closes
      // and the board is re-read. Leaving it open — which is what happened
      // before, for every terminal outcome including the two 42501s Session 8
      // added — parked the user in front of a Send button that could only fail,
      // holding a message they had written.
      if (f.terminal) {
        setInterestOffer(null)
        setInterestNote('')
        loadBarter()
      }
      return
    }
    // Mark this offer as interested and bump its local count.
    setMyInterests((prev) => {
      const next = new Map(prev)
      next.set(offer.id, {
        id: 'pending-local',
        status: 'pending',
        agreementId: null,
        // An optimistic row for a response just sent: there is no agreement yet, so there is
        // nothing to have cancelled.
        iCancelled: false,
        theyCancelled: false,
      })
      return next
    })
    setOffers((prev) =>
      prev.map((o) => (o.id === offer.id ? { ...o, interestCount: o.interestCount + 1 } : o)),
    )
    setInterestOffer(null)
    setInterestNote('')
  }

  function confirmEndNegotiation(interestId: string) {
    // Shared copy. This route previously omitted "This cannot be undone.", making a responder
    // ending from the feed the least-informed party performing the most irreversible barter
    // action available.
    const c = confirmCopy('endNegotiation', 'responder', 'The other provider')
    Alert.alert(c.title, c.body, [
      { text: c.cancelLabel, style: 'cancel' },
      {
        text: c.confirmLabel,
        style: 'destructive',
        onPress: () => endNegotiation(interestId),
      },
    ])
  }


  async function endNegotiation(interestId: string) {
    const { ok, error } = await releaseInterest(interestId)
    if (!ok) {
      console.log('End negotiation error:', error)
      const f = barterWriteFailure('release', error)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      // A terminal refusal means this card is stale, so re-read the barter state rather than
      // leaving a control the server has already refused.
      if (f.terminal) loadBarter()
      return
    }
    loadBarter()
  }

  async function closeOffer(offerId: string) {
    const prev = offers
    setOffers((list) => list.filter((o) => o.id !== offerId))
    // `.select()` because authorization here is an RLS USING clause, which FILTERS a row the
    // caller may not touch rather than rejecting the statement: a blocked update returns no
    // error at all. Without this the card stays optimistically removed and the user is told
    // the offer closed when nothing was written.
    const { data, error } = await supabase
      .from('barter_offers')
      .update({ is_active: false })
      .eq('id', offerId)
      .select('id')
    const { ok, error: failure } = interpretWrite(error, data)
    if (!ok) {
      console.log('Close offer error:', failure)
      setOffers(prev)
      const f = barterWriteFailure('closeOffer', failure)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
    }
  }

  async function deleteOffer(offerId: string) {
    const prev = offers
    setOffers((list) => list.filter((o) => o.id !== offerId))
    // `.select()` for the same reason as closeOffer: a non-owner delete is FILTERED by RLS
    // and raises nothing. The owner's blocked delete does raise (23514) and is classified.
    const { data, error } = await supabase
      .from('barter_offers')
      .delete()
      .eq('id', offerId)
      .select('id')
    const { ok, error: failure } = interpretWrite(error, data)
    if (!ok) {
      console.log('Delete offer error:', failure)
      setOffers(prev)
      const f = barterWriteFailure('deleteOffer', failure)
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
    }
  }

  function openOfferMenu(offer: BarterOfferWithProvider) {
    // An offer with responses cannot be deleted (server rule). Offering the action
    // anyway would be asking for a tap that can only fail, so the menu shows closing
    // as the only removal path once anyone has responded.
    const hasResponses = offer.interestCount > 0
    Alert.alert('Manage offer', undefined, [
      {
        text: 'Close offer',
        onPress: () => {
          // Shared copy. Closing is now irreversible (PD-051) and withdraws BOTH accept and
          // decline (PD-052); the inline string here still said the owner could not reopen it
          // "from here" and mentioned only accept -- it had fallen behind rulings shipped in
          // the same commit, which is exactly what confirmCopy exists to prevent.
          const c = confirmCopy('closeOffer', 'owner', '')
          Alert.alert(c.title, c.body, [
            { text: c.cancelLabel, style: 'cancel' },
            { text: c.confirmLabel, style: 'destructive', onPress: () => closeOffer(offer.id) },
          ])
        },
      },
      ...(hasResponses
        ? []
        : [
            {
              text: 'Delete offer',
              style: 'destructive' as const,
              onPress: () =>
                Alert.alert('Delete offer', 'This cannot be undone.', [
                  { text: 'Cancel', style: 'cancel' as const },
                  {
                    text: 'Delete',
                    style: 'destructive' as const,
                    onPress: () => deleteOffer(offer.id),
                  },
                ]),
            },
          ]),
      { text: 'Cancel', style: 'cancel' as const },
    ])
  }

  function viewInterests(offer: BarterOfferWithProvider) {
    router.push({
      pathname: '/community/barter-interests',
      params: {
        offerId: offer.id,
      },
    } as never)
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Feather name="chevron-left" size={20} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Trades</Text>
      <TouchableOpacity
        style={styles.iconBtn}
        activeOpacity={0.8}
        onPress={() => router.push('/community/trade-activity' as never)}
      >
        <Feather name="repeat" size={18} color="rgba(240,232,213,0.75)" />
      </TouchableOpacity>
    </View>
  )

  if (!roleLoading && !isProvider) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centerBody}>
          <Feather name="users" size={36} color="rgba(240,232,213,0.12)" />
          <Text style={styles.gateTitle}>Trading is for providers</Text>
          {/* Community itself is no longer provider-only (20261088000000). The
              TRADE BOARD still is, and that is not a leftover gate: a trade is
              service-for-service between two businesses, so there is nothing a
              client could offer or accept here. Community is the surface that
              opened; this one did not. */}
          <Text style={styles.gateSub}>
            Barter is a service-for-service trade between two businesses. Community is open
            to everyone — this board is not.
          </Text>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.root}>
      {header}

      {barterLoading ? (

        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <FlatList
          data={offers}
          keyExtractor={(o) => o.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100, paddingTop: 4 }}
          refreshControl={
            <RefreshControl
              refreshing={barterRefreshing}
              onRefresh={() => loadBarter(true)}
              tintColor="rgba(240,232,213,0.4)"
            />
          }
          ListEmptyComponent={
            <View style={styles.centerBody}>
              <Feather name="repeat" size={36} color="rgba(240,232,213,0.12)" />
              <Text style={styles.gateTitle}>No barter offers yet</Text>
              <Text style={styles.gateSub}>Post one to start trading.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <BarterCard
              offer={item}
              isOwner={item.userId === currentUserId}
              myInterest={myInterests.get(item.id) ?? null}
              onEndNegotiation={confirmEndNegotiation}
              onInterest={() => openInterest(item)}
              onMenu={() => openOfferMenu(item)}
              onViewInterests={() => viewInterests(item)}
            />
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 24 }]}
        activeOpacity={0.85}
        onPress={() => router.push('/community/barter-compose' as never)}
      >
        <Feather name="repeat" size={18} color="#080808" />
        <Text style={styles.fabText}>Post Offer</Text>
      </TouchableOpacity>

      {/* Express-interest modal */}
      <Modal
        visible={interestOffer !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setInterestOffer(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setInterestOffer(null)} />
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.modalTitle}>Express interest</Text>
            {interestOffer ? (
              <Text style={styles.modalSub} numberOfLines={2}>
                {interestOffer.provider.name} is offering {interestOffer.offeringService}
              </Text>
            ) : null}
            <TextInput
              style={styles.modalInput}
              placeholder="Add a note about what you can offer…"
              placeholderTextColor="rgba(240,232,213,0.25)"
              multiline
              maxLength={INTEREST_MAX}
              value={interestNote}
              onChangeText={setInterestNote}
              textAlignVertical="top"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalCancel}
                activeOpacity={0.8}
                onPress={() => setInterestOffer(null)}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSend, sendingInterest && styles.modalSendDisabled]}
                activeOpacity={0.85}
                disabled={sendingInterest}
                onPress={submitInterest}
              >
                {sendingInterest ? (
                  <ActivityIndicator color="#080808" size="small" />
                ) : (
                  <Text style={styles.modalSendText}>Send interest</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </View>
  )
}

function BarterCard({
  offer,
  isOwner,
  myInterest,
  onEndNegotiation,
  onInterest,
  onMenu,
  onViewInterests,
}: {
  offer: BarterOfferWithProvider
  isOwner: boolean
  myInterest: MyInterest | null
  onEndNegotiation?: (interestId: string) => void
  onInterest: () => void
  onMenu: () => void
  onViewInterests: () => void
}) {
  const feedState = myInterest
    ? responderFeedState(myInterest.status, myInterest.agreementId, {
        iCancelled: myInterest.iCancelled,
        theyCancelled: myInterest.theyCancelled,
      })
    : null

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        {offer.provider.photo ? (
          <Image source={{ uri: cacheBustedPhoto(offer.provider.photo) }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <Text style={styles.avatarText}>{initials(offer.provider.name)}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.authorName} numberOfLines={1}>
            {offer.provider.name}
          </Text>
          <Text style={styles.authorMeta} numberOfLines={1}>
            {offer.provider.category ? `${offer.provider.category} · ` : ''}
            {timeAgo(offer.createdAt)}
          </Text>
        </View>
        {isOwner ? (
          <TouchableOpacity
            style={styles.menuBtn}
            onPress={onMenu}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="more-horizontal" size={18} color="rgba(240,232,213,0.4)" />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.tradeRow}>
        <View style={styles.tradeCol}>
          <Text style={styles.tradeLabel}>OFFERING</Text>
          <Text style={styles.tradeValue}>{offer.offeringService}</Text>
        </View>
        <Feather name="repeat" size={16} color="rgba(240,232,213,0.3)" style={styles.tradeIcon} />
        <View style={styles.tradeCol}>
          <Text style={styles.tradeLabel}>SEEKING</Text>
          <Text style={styles.tradeValue}>{offer.seekingService}</Text>
        </View>
      </View>

      {/* NO `~$N value` BADGE (PD-069). A legacy offer may still carry `offeringValue` in the
          database, and it is deliberately NOT rendered: The Book does not appraise, equalize or
          compare a trade, and a platform-drawn dollar figure beside a barter offer invites the
          price comparison that decision exists to prevent. The field is deprecated server-side
          and no new offer records one. Do not render it, sort by it, or filter on it. */}
      {offer.notes ? <Text style={styles.notes}>{offer.notes}</Text> : null}

      <View style={styles.cardActions}>
        {isOwner ? (
          <TouchableOpacity
            style={styles.interestCountBtn}
            activeOpacity={0.7}
            onPress={onViewInterests}
          >
            <Feather name="users" size={15} color="rgba(240,232,213,0.6)" />
            <Text style={styles.interestCountText}>
              {offer.interestCount} interested
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            {/* No response count for non-owners. BARTER_BETA_CONTRACT: interest counts are not
                public -- a provider does not see how many others responded. The number shown
                here was also MEANINGLESS: barter_interests RLS returns only the offer owner's
                rows or the caller's own, so a non-owner was shown 0 or 1 rendered as a total. */}
            <View style={{ flex: 1 }} />
            {myInterest ? (
              // TOTAL Record, not a ternary chain. The chain's final branch was "Interest
              // sent", so a status added later would have been labelled as an outstanding
              // response on the responder's only surface for this post -- a live-sounding
              // claim about a finished state. `status === 'x'` comparisons do not fail when
              // the union widens; an incomplete Record does.
              feedState?.action === 'end' ? (
                <TouchableOpacity
                  style={styles.interestSentBtn}
                  activeOpacity={0.85}
                  onPress={() => onEndNegotiation?.(myInterest.id)}
                >
                  <Feather
                    name={feedState.icon}
                    size={15}
                    color="rgba(240,232,213,0.6)"
                  />
                  <Text style={styles.interestSentText}>{feedState.label}</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.interestSentBtn}>
                  <Feather
                    name={feedState?.icon ?? 'check'}
                    size={15}
                    color="rgba(240,232,213,0.5)"
                  />
                  <Text style={styles.interestSentText}>
                    {feedState?.label ?? 'Interest sent'}
                  </Text>
                </View>
              )
            ) : (
              <TouchableOpacity style={styles.interestBtn} activeOpacity={0.85} onPress={onInterest}>
                <Text style={styles.interestBtnText}>I'm Interested</Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
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
    paddingTop: 80,
  },
  gateTitle: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 14,
    textAlign: 'center',
  },
  gateSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  },
  pillScroll: { maxHeight: 56, flexGrow: 0 },
  pillRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  pillActive: { backgroundColor: '#F0E8D5' },
  pillInactive: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  pillTextActive: { fontSize: 13, color: '#080808', fontFamily: 'Manrope_700Bold' },
  pillTextInactive: { fontSize: 13, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_500Medium' },
  // Secondary filters (service type + location)
  filtersLabel: {
    paddingHorizontal: 16,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
  },
  filterScroll: { maxHeight: 44, flexGrow: 0 },
  filterRow: { paddingHorizontal: 16, paddingTop: 8, gap: 6 },
  filterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
  },
  filterPillActive: { backgroundColor: 'rgba(200,146,42,0.15)', borderColor: '#C8922A' },
  filterPillText: { fontSize: 12, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_500Medium' },
  filterPillTextActive: { fontSize: 12, color: '#C8922A', fontFamily: 'Manrope_600SemiBold' },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    gap: 12,
  },
  locationDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
  },
  locationDropdownText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.8)',
    fontFamily: 'Manrope_500Medium',
  },
  locationClear: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  locationOptionText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
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
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1410' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  authorName: { fontSize: 14, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
  authorMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  categoryBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(200,146,42,0.12)',
  },
  categoryBadgeText: {
    fontSize: 10,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  menuBtn: { paddingLeft: 4 },
  content: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.9)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    marginTop: 12,
  },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 24, marginTop: 14 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: { fontSize: 13, color: 'rgba(240,232,213,0.5)', fontFamily: 'Manrope_500Medium' },
  actionTextActive: { color: '#C8922A' },
  activityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginLeft: 'auto',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(240,232,213,0.08)',
  },
  activityBtnText: { color: 'rgba(240,232,213,0.75)', fontSize: 12, fontWeight: '500' },

  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0E8D5',
    borderRadius: 26,
    paddingHorizontal: 20,
    height: 52,
  },
  fabText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingTop: 12 },
  tabTextActive: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  tabTextInactive: { fontSize: 15, color: 'rgba(240,232,213,0.4)', fontFamily: 'Manrope_600SemiBold' },
  tabUnderline: {
    height: 2,
    width: 40,
    borderRadius: 1,
    marginTop: 10,
    backgroundColor: 'transparent',
  },
  tabUnderlineActive: { backgroundColor: '#C8922A' },
  tradeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 14 },
  tradeCol: { flex: 1 },
  tradeIcon: { marginTop: 12 },
  tradeLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
    marginBottom: 4,
  },
  tradeValue: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    lineHeight: 21,
  },
  notes: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.8)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    marginTop: 12,
  },
  interestCountBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  interestCountText: { fontSize: 13, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_500Medium' },
  interestBtn: {
    paddingHorizontal: 18,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  interestBtnText: { fontSize: 13, color: '#080808', fontFamily: 'Manrope_700Bold' },
  interestSentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
  },
  interestSentText: { fontSize: 13, color: 'rgba(240,232,213,0.6)', fontFamily: 'Manrope_600SemiBold' },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: {
    backgroundColor: '#141210',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  modalTitle: { fontSize: 17, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  modalSub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
    lineHeight: 19,
  },
  modalInput: {
    minHeight: 90,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 22,
    padding: 14,
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancel: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
  },
  modalCancelText: { fontSize: 14, color: 'rgba(240,232,213,0.7)', fontFamily: 'Manrope_600SemiBold' },
  modalSend: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  modalSendDisabled: { opacity: 0.5 },
  modalSendText: { fontSize: 14, color: '#080808', fontFamily: 'Manrope_700Bold' },
})
