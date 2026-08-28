import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
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
import { Message, useMessages } from '../../hooks/useMessaging'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'

const INPUT_ACCESSORY_ID = 'chatInput'
const GROUP_WINDOW_MS = 5 * 60 * 1000

function formatMessageTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user } = useAuth()
  const insets = useSafeAreaInsets()

  const { messages, loading, sending, sendMessage } = useMessages(id as string)
  const [inputText, setInputText] = useState('')
  const [otherPartyName, setOtherPartyName] = useState('')
  const [bookingService, setBookingService] = useState('')
  const [convoFound, setConvoFound] = useState<boolean | null>(null)
  const flatListRef = useRef<FlatList<Message>>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchConversationDetails() {
      if (!id || !user) return
      const { data: convo } = await supabase
        .from('conversation')
        .select('client_id, provider_id, booking_id')
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

      if (isClient) {
        const { data: provider } = await supabase
          .from('providers')
          .select('display_name')
          .eq('id', otherPartyId)
          .maybeSingle()
        if (!cancelled) setOtherPartyName(provider?.display_name || 'Provider')
      } else {
        const { data: client } = await supabase
          .from('clients_provider')
          .select('name')
          .eq('id', otherPartyId)
          .maybeSingle()
        if (!cancelled) setOtherPartyName(client?.name || 'Client')
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

  const hasText = inputText.trim().length > 0
  const avatarInitial = (otherPartyName || 'C').charAt(0).toUpperCase()

  // Conversation not found state
  if (convoFound === false) {
    return (
      <View style={styles.root}>
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
          </TouchableOpacity>
          <Text style={styles.topBarTitle}>Conversation</Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centerWrap}>
          <Ionicons
            name="chatbubble-outline"
            size={40}
            color="rgba(240,232,213,0.2)"
          />
          <Text style={styles.notFoundTitle}>Conversation not found</Text>
          <TouchableOpacity
            style={styles.findBtn}
            onPress={() => router.replace('/(tabs)/messages' as never)}
          >
            <Text style={styles.findBtnText}>Back to Messages</Text>
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
        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{ marginRight: 12 }}
          >
            <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
          </TouchableOpacity>
          <View style={styles.topAvatar}>
            <Text style={styles.topAvatarText}>{avatarInitial}</Text>
          </View>
          <View style={styles.topCenter}>
            <Text style={styles.otherName} numberOfLines={1}>
              {otherPartyName || ' '}
            </Text>
            {bookingService ? (
              <Text style={styles.bookingMeta} numberOfLines={1}>
                {bookingService}
              </Text>
            ) : null}
          </View>
          <TouchableOpacity activeOpacity={0.7}>
            <Ionicons
              name="information-circle-outline"
              size={22}
              color="rgba(240,232,213,0.4)"
            />
          </TouchableOpacity>
        </View>

        {loading && messages.length === 0 ? (
          <View style={styles.centerWrap}>
            <ActivityIndicator color="#C8922A" />
          </View>
        ) : messages.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons
              name="chatbubble-outline"
              size={40}
              color="rgba(240,232,213,0.15)"
              style={{ marginBottom: 12 }}
            />
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptySub}>
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

              if (item.is_mine) {
                return (
                  <View style={[styles.myWrap, ...wrapStyle]}>
                    <View style={styles.myBubble}>
                      <Text style={styles.myBubbleText}>{item.content}</Text>
                    </View>
                    {showTime && (
                      <Text style={styles.myTime}>
                        {formatMessageTime(item.created_at)}
                      </Text>
                    )}
                  </View>
                )
              }
              return (
                <View style={[styles.theirWrap, ...wrapStyle]}>
                  <View style={styles.theirBubble}>
                    <Text style={styles.theirBubbleText}>{item.content}</Text>
                  </View>
                  {showTime && (
                    <Text style={styles.theirTime}>
                      {formatMessageTime(item.created_at)}
                    </Text>
                  )}
                </View>
              )
            }}
          />
        )}

        {/* Input bar */}
        <View style={[styles.inputBar, { paddingBottom: insets.bottom + 12 }]}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Message..."
            placeholderTextColor="rgba(240,232,213,0.25)"
            multiline
            maxLength={1000}
            inputAccessoryViewID={
              Platform.OS === 'ios' ? INPUT_ACCESSORY_ID : undefined
            }
            onSubmitEditing={handleSend}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendBtn, hasText && styles.sendBtnActive]}
            onPress={handleSend}
            disabled={sending || !hasText}
            activeOpacity={0.8}
          >
            {sending ? (
              <ActivityIndicator
                color={hasText ? '#080808' : 'rgba(240,232,213,0.3)'}
                size="small"
              />
            ) : (
              <Ionicons
                name="send"
                size={18}
                color={hasText ? '#080808' : 'rgba(240,232,213,0.2)'}
              />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID} backgroundColor="#111111">
          <View style={styles.accessoryBar}>
            <Text
              style={[
                styles.accessoryCount,
                inputText.length > 800 && styles.accessoryCountWarning,
              ]}
            >
              {inputText.length} / 1000
            </Text>
            <View style={styles.accessoryActions}>
              <TouchableOpacity
                onPress={Keyboard.dismiss}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.accessoryDone}>Done</Text>
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
                    styles.accessorySend,
                    (!hasText || sending) && styles.accessorySendDisabled,
                  ]}
                >
                  Send
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </InputAccessoryView>
      )}
    </>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(240,232,213,0.08)',
  },
  topBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  topAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1A1410',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  topAvatarText: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  topCenter: {
    flex: 1,
    marginRight: 12,
  },
  otherName: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  bookingMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 1,
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
    gap: 12,
  },
  notFoundTitle: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 8,
  },
  findBtn: {
    marginTop: 8,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  findBtnText: {
    fontSize: 14,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },

  // My (amber) bubble
  myWrap: {
    alignItems: 'flex-end',
  },
  myBubble: {
    maxWidth: '75%',
    backgroundColor: '#C8922A',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  myBubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#080808',
    fontFamily: 'Manrope_400Regular',
  },
  myTime: {
    marginTop: 2,
    marginRight: 4,
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'right',
  },

  // Their bubble
  theirWrap: {
    alignItems: 'flex-start',
  },
  theirBubble: {
    maxWidth: '75%',
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  theirBubbleText: {
    fontSize: 15,
    lineHeight: 21,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  theirTime: {
    marginTop: 2,
    marginLeft: 4,
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'left',
  },

  // Input bar
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(240,232,213,0.08)',
    backgroundColor: '#080808',
  },
  input: {
    flex: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    maxHeight: 100,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(240,232,213,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnActive: {
    backgroundColor: '#C8922A',
  },

  // iOS accessory
  accessoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.08)',
  },
  accessoryCount: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
  accessoryCountWarning: {
    color: '#C8922A',
  },
  accessoryActions: {
    flexDirection: 'row',
    gap: 12,
  },
  accessoryDone: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_600SemiBold',
  },
  accessorySend: {
    fontSize: 15,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },
  accessorySendDisabled: {
    color: 'rgba(240,232,213,0.2)',
    fontFamily: 'Manrope_400Regular',
  },
})
