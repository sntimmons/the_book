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
import { getOrCreateConversation } from '@/hooks/useMessaging'
import { cacheBustedPhoto } from '@/lib/image'
import { fetchOfferInterests, BarterInterest } from '@/lib/barter'
import { timeAgo, initials } from '@/lib/community'

export default function BarterInterests() {
  const insets = useSafeAreaInsets()
  const { user, providerId } = useAuth()
  const params = useLocalSearchParams<{
    offerId: string
    offeringService?: string
    ownerName?: string
  }>()
  const offerId = params.offerId
  const offeringService = params.offeringService ?? 'their service'
  const ownerName = params.ownerName ?? 'A provider'

  const [interests, setInterests] = useState<BarterInterest[]>([])
  const [loading, setLoading] = useState(true)
  const [actioningId, setActioningId] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!offerId) {
      setLoading(false)
      return
    }
    const all = await fetchOfferInterests(offerId)
    // Show pending interests as actionable; drop already-declined ones.
    setInterests(all.filter((i) => i.status !== 'declined'))
    setLoading(false)
  }, [offerId])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  async function accept(interest: BarterInterest) {
    if (!user || !providerId || actioningId) return
    setActioningId(interest.id)
    try {
      const { error } = await supabase
        .from('barter_interests')
        .update({ status: 'accepted' })
        .eq('id', interest.id)
      if (error) throw error

      // Connect the two providers through the existing 1:1 messaging system.
      // The interested provider takes the client_id slot (their auth id); the
      // offer owner takes the provider_id slot (their providers.id).
      const convoId = await getOrCreateConversation(
        interest.interestedUserId,
        providerId,
      )
      if (convoId) {
        await supabase.from('messages').insert({
          conversation_id: convoId,
          sender_id: user.id,
          content: `You matched on a barter! ${ownerName} is offering ${offeringService} and you offered interest. Work out the details here.`,
          is_read: false,
          created_at: new Date().toISOString(),
        })
        await supabase
          .from('conversation')
          .update({ last_message_at: new Date().toISOString() })
          .eq('id', convoId)
        router.replace(`/messages/${convoId}` as never)
        return
      }
      // Status was updated but the DM could not be opened; refresh the list.
      setActioningId(null)
      load()
    } catch (err) {
      console.log('Accept interest error:', err)
      // An offer can only ever have ONE accepted response (enforced by a partial unique
      // index). A second accept is permanently impossible, not transiently failing, so
      // it must not be presented as retryable.
      const code = (err as { code?: string } | null)?.code
      if (code === '23505') {
        Alert.alert(
          'Already matched',
          'This offer has already been matched with another provider. Only one response per offer can be accepted.',
          [{ text: 'OK' }],
        )
      } else {
        Alert.alert('Could not accept', 'Please try again.', [{ text: 'OK' }])
      }
      setActioningId(null)
    }
  }

  async function decline(interest: BarterInterest) {
    if (actioningId) return
    setActioningId(interest.id)
    const prev = interests
    setInterests((list) => list.filter((i) => i.id !== interest.id))
    const { error } = await supabase
      .from('barter_interests')
      .update({ status: 'declined' })
      .eq('id', interest.id)
    setActioningId(null)
    if (error) {
      console.log('Decline interest error:', error)
      setInterests(prev)
      // Reachable from a stale list: if this response was already accepted or declined
      // elsewhere, the transition rule refuses it permanently. Retrying cannot help, and
      // the list needs reconciling rather than the same buttons offered again.
      if ((error as { code?: string } | null)?.code === '23514') {
        Alert.alert(
          'Already answered',
          'This response has already been accepted or declined. Pull to refresh to see its current state.',
          [{ text: 'OK', onPress: () => load() }],
        )
      } else {
        Alert.alert('Could not decline', 'Please try again.', [{ text: 'OK' }])
      }
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

                {accepted ? (
                  <View style={styles.acceptedRow}>
                    <Feather name="check-circle" size={14} color="#4CAF50" />
                    <Text style={styles.acceptedText}>Accepted</Text>
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
  acceptedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 16 },
  acceptedText: { fontSize: 13, color: '#4CAF50', fontFamily: 'Manrope_600SemiBold' },
})
