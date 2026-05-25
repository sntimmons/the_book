import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  KeyboardAvoidingView,
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

interface Message {
  id: string
  senderId: 'client' | 'provider' | 'system'
  type: 'text' | 'booking' | 'system'
  content: string
  timestamp: string
  read: boolean
}

const MOCK_MESSAGES: Message[] = [
  {
    id: '1',
    senderId: 'system',
    type: 'system',
    content: 'Conversation started',
    timestamp: 'May 24',
    read: true,
  },
  {
    id: '2',
    senderId: 'client',
    type: 'text',
    content: 'Hi Nia! I sent a booking request for a classic full set. I have short natural lashes, is that okay?',
    timestamp: '10:22 AM',
    read: true,
  },
  {
    id: '3',
    senderId: 'provider',
    type: 'text',
    content: 'Hey! Yes absolutely, I work with all lash types. Your classic set will look amazing.',
    timestamp: '10:45 AM',
    read: true,
  },
  {
    id: '4',
    senderId: 'system',
    type: 'booking',
    content: 'Nia accepted your booking for Classic Full Set on May 28 at 1:00 PM',
    timestamp: '11:02 AM',
    read: true,
  },
  {
    id: '5',
    senderId: 'provider',
    type: 'text',
    content: 'Just accepted your request. See you on the 28th! Please arrive 5 minutes early.',
    timestamp: '11:03 AM',
    read: false,
  },
]

const PROVIDER_NAMES: Record<string, string> = {
  '1': 'Nia Laurent',
  '2': 'Marcus Blade',
  '3': 'Camille Brooks',
}

const INPUT_ACCESSORY_ID = 'chatInput'

export default function ChatScreen() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const providerName = PROVIDER_NAMES[id ?? '1'] ?? 'Nia Laurent'
  const firstName = providerName.split(' ')[0]

  const [message, setMessage] = useState('')
  const [messages, setMessages] = useState<Message[]>(MOCK_MESSAGES)
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<ScrollView>(null)

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 80)
  }, [])

  function sendMessage() {
    const text = message.trim()
    if (!text) return
    const newMsg: Message = {
      id: String(Date.now()),
      senderId: 'client',
      type: 'text',
      content: text,
      timestamp: 'Now',
      read: false,
    }
    setMessages((prev) => [...prev, newMsg])
    setMessage('')

    setIsTyping(true)
    setTimeout(() => {
      setIsTyping(false)
      const reply: Message = {
        id: String(Date.now() + 1),
        senderId: 'provider',
        type: 'text',
        content: 'Got it! See you soon.',
        timestamp: 'Now',
        read: false,
      }
      setMessages((prev) => [...prev, reply])
    }, 2000)
  }

  const hasText = message.trim().length > 0

  return (
    <>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <View style={styles.inner}>

            {/* Top bar */}
            <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
              <TouchableOpacity
                style={styles.backBtn}
                onPress={() => router.back()}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <Feather name="chevron-left" size={18} color="#F0E8D5" />
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.providerRow}
                activeOpacity={0.8}
                onPress={() => router.push('/providers/1' as any)}
              >
                <View style={styles.providerAvatar}>
                  <Feather name="user" size={16} color="rgba(240,232,213,0.4)" />
                  <View style={styles.avatarOnlineDot} />
                </View>
                <View>
                  <Text style={styles.providerName}>{providerName}</Text>
                  <Text style={styles.providerStatus}>Active now</Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.infoBtn}
                activeOpacity={0.7}
                onPress={() => router.push('/providers/1' as any)}
              >
                <Feather name="info" size={16} color="rgba(240,232,213,0.5)" />
              </TouchableOpacity>
            </View>

            {/* Messages scroll area */}
            <ScrollView
              ref={scrollRef}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardDismissMode="interactive"
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={() =>
                scrollRef.current?.scrollToEnd({ animated: true })
              }
            >
              {messages.map((msg) => {
                if (msg.type === 'system') {
                  return (
                    <View key={msg.id} style={styles.systemRow}>
                      <Text style={styles.systemTimestamp}>{msg.timestamp}</Text>
                      <Text style={styles.systemText}>{msg.content}</Text>
                    </View>
                  )
                }

                if (msg.type === 'booking') {
                  return (
                    <View key={msg.id} style={styles.bookingCardWrap}>
                      <View style={styles.bookingCard}>
                        <View style={styles.bookingCardHeader}>
                          <Feather name="check-circle" size={14} color="#4CAF50" />
                          <Text style={styles.bookingCardLabel}>BOOKING CONFIRMED</Text>
                        </View>
                        <Text style={styles.bookingCardContent}>{msg.content}</Text>
                        <Text style={styles.bookingCardTimestamp}>{msg.timestamp}</Text>
                      </View>
                    </View>
                  )
                }

                const isClient = msg.senderId === 'client'
                return (
                  <View
                    key={msg.id}
                    style={[styles.messageRow, isClient ? styles.messageRowRight : styles.messageRowLeft]}
                  >
                    {!isClient && (
                      <View style={styles.messageAvatar}>
                        <Feather name="user" size={12} color="rgba(240,232,213,0.3)" />
                      </View>
                    )}
                    <View style={[styles.bubble, isClient ? styles.bubbleClient : styles.bubbleProvider]}>
                      <Text style={[styles.bubbleText, isClient ? styles.bubbleTextClient : styles.bubbleTextProvider]}>
                        {msg.content}
                      </Text>
                      <Text style={[styles.bubbleTime, isClient ? styles.bubbleTimeClient : styles.bubbleTimeProvider]}>
                        {msg.timestamp}
                      </Text>
                    </View>
                  </View>
                )
              })}

              {isTyping && (
                <View style={[styles.messageRow, styles.messageRowLeft]}>
                  <View style={styles.messageAvatar}>
                    <Feather name="user" size={12} color="rgba(240,232,213,0.3)" />
                  </View>
                  <View style={[styles.bubble, styles.bubbleProvider, styles.typingBubble]}>
                    <Text style={styles.typingDots}>•  •  •</Text>
                  </View>
                </View>
              )}

              <View style={{ height: 8 }} />
            </ScrollView>

            {/* Input bar — sits naturally at bottom, KAV lifts it */}
            <View style={[styles.inputBar, { paddingBottom: insets.bottom + 8 }]}>
              <TouchableOpacity
                style={styles.attachBtn}
                activeOpacity={0.7}
                onPress={() => {}}
              >
                <Feather name="plus" size={18} color="rgba(240,232,213,0.4)" />
              </TouchableOpacity>

              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={message}
                  onChangeText={setMessage}
                  placeholder={`Message ${firstName}...`}
                  placeholderTextColor="rgba(240,232,213,0.3)"
                  multiline
                  maxLength={1000}
                  inputAccessoryViewID={Platform.OS === 'ios' ? INPUT_ACCESSORY_ID : undefined}
                />
              </View>

              <TouchableOpacity
                style={[styles.sendBtn, hasText && styles.sendBtnActive]}
                activeOpacity={0.7}
                onPress={sendMessage}
              >
                <Feather
                  name="send"
                  size={16}
                  color={hasText ? '#080808' : 'rgba(240,232,213,0.25)'}
                />
              </TouchableOpacity>
            </View>

          </View>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      {/* iOS keyboard toolbar */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={INPUT_ACCESSORY_ID} backgroundColor="#111111">
          <View style={styles.accessoryBar}>
            <Text style={[
              styles.accessoryCount,
              message.length > 800 && styles.accessoryCountWarning,
            ]}>
              {message.length} / 1000
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
                    sendMessage()
                    Keyboard.dismiss()
                  }
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                disabled={!hasText}
              >
                <Text style={[styles.accessorySend, !hasText && styles.accessorySendDisabled]}>
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
  inner: {
    flex: 1,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  providerAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#080808',
  },
  providerName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  providerStatus: {
    fontSize: 11,
    color: '#4CAF50',
    fontFamily: 'Manrope_400Regular',
    marginTop: 1,
  },
  infoBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },
  systemRow: {
    alignItems: 'center',
    marginVertical: 12,
    gap: 4,
  },
  systemTimestamp: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    letterSpacing: 0.5,
  },
  systemText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },
  bookingCardWrap: {
    alignItems: 'center',
    marginVertical: 8,
  },
  bookingCard: {
    backgroundColor: 'rgba(76,175,80,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.18)',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 14,
    width: '90%',
  },
  bookingCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  bookingCardLabel: {
    fontSize: 10,
    color: '#4CAF50',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
  },
  bookingCardContent: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
    lineHeight: 18,
  },
  bookingCardTimestamp: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
  },
  messageRow: {
    flexDirection: 'row',
    marginBottom: 10,
    alignItems: 'flex-end',
    gap: 8,
  },
  messageRowLeft: {
    justifyContent: 'flex-start',
  },
  messageRowRight: {
    justifyContent: 'flex-end',
  },
  messageAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(240,232,213,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  bubble: {
    maxWidth: '75%',
    borderRadius: 18,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleClient: {
    backgroundColor: '#F0E8D5',
    borderBottomRightRadius: 4,
  },
  bubbleProvider: {
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderBottomLeftRadius: 4,
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: 'Manrope_400Regular',
  },
  bubbleTextClient: {
    color: '#080808',
  },
  bubbleTextProvider: {
    color: '#F0E8D5',
  },
  bubbleTime: {
    fontSize: 10,
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
  },
  bubbleTimeClient: {
    color: 'rgba(8,8,8,0.4)',
    textAlign: 'right',
  },
  bubbleTimeProvider: {
    color: 'rgba(240,232,213,0.3)',
  },
  typingBubble: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  typingDots: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
    letterSpacing: 2,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    backgroundColor: '#080808',
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },
  inputWrap: {
    flex: 1,
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 20,
    borderCurve: 'continuous',
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 40,
    justifyContent: 'center',
  },
  input: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    maxHeight: 100,
    padding: 0,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginBottom: 2,
  },
  sendBtnActive: {
    backgroundColor: '#C8922A',
  },
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
