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
import { supabase } from '@/lib/supabase'
import { cacheBustedPhoto } from '@/lib/image'
import {
  fetchOfferInterests,
  isOfferOwner,
  declineInterest,
  releaseInterest,
  INTEREST_STATUS_IS_LISTED,
  BarterInterest,
} from '@/lib/barter'
import { barterWriteFailure } from '@/lib/barterErrors'
import { timeAgo, initials } from '@/lib/community'

export default function BarterInterests() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  // offeringService / ownerName are still accepted as params for the caller's convenience but
  // are deliberately NOT read here any more: the match message is composed SERVER-side by
  // accept_barter_interest from providers.display_name and the offer's own text. Previously
  // it was built from navigation params, so a deep link could author a platform-looking
  // "You matched on a barter!" message with arbitrary content.
  const params = useLocalSearchParams<{
    offerId: string
    offeringService?: string
    ownerName?: string
  }>()
  const offerId = params.offerId

  const [interests, setInterests] = useState<BarterInterest[]>([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)
  // This is a real route and is deep-link reachable with any offerId. RLS returns a
  // responder their OWN response row, so without a server-verified ownership check a
  // non-owner would be shown live Accept/Decline controls on a response they cannot action.
  const [isOwner, setIsOwner] = useState<boolean | null>(null)

  const load = useCallback(async () => {
    if (!offerId) {
      setLoading(false)
      return
    }
    const [all, owns] = await Promise.all([
      fetchOfferInterests(offerId),
      user ? isOfferOwner(offerId, user.id) : Promise.resolve(false),
    ])
    setIsOwner(owns)
    // Show pending interests as actionable; drop already-declined ones.
    // Driven by a TOTAL Record, not a deny-list and not inline literals. `!== 'declined'`
    // treated every unknown future status as live and actionable, so `released` would have
    // rendered with a working Accept button that could only fail. A total Record is also the
    // only form that actually breaks the build when the status union widens.
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
    Alert.alert(
      'End this negotiation?',
      // States the irreversible half. "Their response stays on record" alone read as
      // reassurance while concealing that this permanently bars that provider from the post —
      // including the owner's own ability to change their mind. The responder's confirm
      // discloses the same fact about themselves; the party imposing it should not be the
      // less-informed one.
      'This cannot be undone. The other provider will be told, and they will not be able to '
        + 'respond to this post again — you will not be able to re-accept them. Their response '
        + 'stays on record, and you can accept a different response if one is pending.',
      [
        { text: 'Keep negotiating', style: 'cancel' },
        { text: 'End negotiation', style: 'destructive', onPress: () => release(item) },
      ],
    )
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
    const { data, error } = await supabase.rpc('accept_barter_interest', {
      p_interest_id: interest.id,
    })
    if (error) {
      const f = barterWriteFailure('accept', error)
      console.log('Accept interest error:', error)
      setActioningId(null)
      // A terminal outcome means our list is stale — someone else's state won. Reload so the
      // user is not left looking at controls the server has already invalidated.
      if (f.terminal) load()
      Alert.alert(f.title, f.body, [{ text: 'OK' }])
      return
    }
    // The RPC returns the conversation id and only returns on full success, so this is the
    // one place navigation is warranted.
    router.replace(`/messages/${data as string}` as never)
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

  function confirmDecline(interest: BarterInterest) {
    Alert.alert('Decline interest', `Decline ${interest.provider.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Decline', style: 'destructive', onPress: () => decline(interest) },
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
            const accepted = item.status === 'accepted'
            const released = item.status === 'released'
            // At most one response per offer can be accepted (partial unique index). Once one
            // is, Accept on every other response is an action that can only fail — offering it
            // is the same defect as offering Delete on an offer that cannot be deleted.
            const offerMatched = interests.some((i) => i.status === 'accepted')
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

                {/* STATUS BEFORE ROLE. Role-first meant a responder who deep-linked to their
                    own released response was told about permissions and never learned the
                    negotiation had ended — the one fact they most needed. A released row can
                    never be actionable for anyone, so it is safe to resolve it first. */}
                {released ? (
                  <View style={styles.matchedNote}>
                    <Text style={styles.matchedNoteText}>
                      Negotiation ended. This response is kept as history and cannot be
                      accepted.
                    </Text>
                  </View>
                ) : !isOwner ? (
                  <View style={styles.matchedNote}>
                    <Text style={styles.matchedNoteText}>
                      Only the provider who posted this offer can respond to it.
                    </Text>
                  </View>
                ) : accepted ? (
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
                ) : offerMatched ? (
                  <View style={styles.actions}>
                    <TouchableOpacity
                      style={[styles.declineBtn, busy && styles.btnDisabled]}
                      activeOpacity={0.8}
                      disabled={busy}
                      onPress={() => confirmDecline(item)}
                    >
                      <Text style={styles.declineText}>Decline</Text>
                    </TouchableOpacity>
                    <View style={styles.matchedNote}>
                      <Text style={styles.matchedNoteText}>
                        Already matched with another provider
                      </Text>
                    </View>
                  </View>
                ) : (
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
                      onPress={() => accept(item)}
                    >
                      {busy ? (
                        <ActivityIndicator color="#080808" size="small" />
                      ) : (
                        <Text style={styles.acceptText}>Accept</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )
          }}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  matchedNote: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
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
