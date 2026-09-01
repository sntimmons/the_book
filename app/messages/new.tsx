import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { sendPrebookingRequest } from '../../hooks/useMessaging'

// Compose the FIRST pre-booking message request to a provider. Sends one initial
// message; the provider then accepts or declines. Not a free chat yet.
export default function NewMessageRequest() {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const { providerId, providerName } = useLocalSearchParams<{
    providerId: string
    providerName?: string
  }>()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  async function send() {
    if (sending || !user || !providerId || !text.trim()) return
    setSending(true)
    const res = await sendPrebookingRequest(user.id, providerId, text)
    setSending(false)
    if (!res.conversationId) {
      Alert.alert('Could not send', res.error ?? 'Please try again.')
      return
    }
    // Open the (now pending) conversation. replace() so back returns to the profile.
    router.replace(`/messages/${res.conversationId}` as never)
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Message {providerName || 'provider'}</Text>
        <View style={styles.iconBtn} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.help}>
          Send a quick message to introduce yourself or ask about the service. Once
          they accept, you can chat normally.
        </Text>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Hi! I'd love to ask about…"
          placeholderTextColor="rgba(240,232,213,0.35)"
          multiline
          autoFocus
          maxLength={1000}
        />
      </ScrollView>

      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
          activeOpacity={0.85}
          onPress={send}
          disabled={!text.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator color="#080808" size="small" />
          ) : (
            <Text style={styles.sendText}>Send Message Request</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
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
  help: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 21,
    marginBottom: 16,
  },
  input: {
    minHeight: 140,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.12)',
    backgroundColor: 'rgba(240,232,213,0.03)',
    padding: 16,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    textAlignVertical: 'top',
  },
  cta: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  sendBtn: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
  },
  sendBtnDisabled: { backgroundColor: 'rgba(240,232,213,0.1)' },
  sendText: { fontSize: 15, color: '#080808', fontFamily: 'Manrope_700Bold' },
})
