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
import { useTheme } from '@/context/ThemeContext'
import { sendPrebookingRequest } from '../../hooks/useMessaging'

// Compose the FIRST pre-booking message request to a provider. Sends one initial
// message; the provider then accepts or declines. Not a free chat yet.
//
// THE ENTRY PAGE INTO WORKING LETTER, NOT A THIRD MESSAGES STYLE.
//
// This screen sits inside a journey that was visually broken in the middle:
// the provider profile is migrated, the conversation thread is migrated, and
// this — reached from the profile's Message control and from the booking flow's
// datetime step whenever `messageEntryAction` resolves to `compose` — was still
// on the retired The Book palette. So a client crossed from Third into The Book
// and back into Third to send one sentence.
//
// It therefore borrows the thread's own vocabulary rather than inventing a
// third: the same hairline-bounded header, the same input surface and radius,
// the same single Mulberry action. Nothing about who may start a conversation,
// what gets created, or where it lands changed here — `sendPrebookingRequest`
// still decides all of that and this screen still only reports what it says.
export default function NewMessageRequest() {
  const insets = useSafeAreaInsets()
  const { colors, type } = useTheme()
  const { user } = useAuth()
  const { providerId, providerName } = useLocalSearchParams<{
    providerId: string
    providerName?: string
  }>()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  // The same monogram the inbox row and the thread header draw, from the name
  // already passed in the route params — no fetch, and nothing shown when the
  // caller did not supply a name rather than a monogram built from the word
  // "provider".
  const initial = providerName ? providerName.charAt(0).toUpperCase() : null

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
      style={[styles.root, { backgroundColor: colors.bgCanvas }]}
      behavior={process.env.EXPO_OS === 'ios' ? 'padding' : undefined}
    >
      {/* The thread's header shape: back, who, and a hairline beneath. Left
          aligned rather than centred so the identity sits where it does on the
          conversation this becomes. */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: colors.borderSubtle },
        ]}
      >
        <TouchableOpacity
          style={styles.iconBtn}
          onPress={() => router.back()}
          activeOpacity={0.8}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Feather name="chevron-left" size={20} color={colors.iconPrimary} />
        </TouchableOpacity>
        {initial ? (
          <View style={[styles.monogram, { backgroundColor: colors.bgSubtle }]}>
            <Text style={[type.labelAction, { color: colors.textSecondary }]}>{initial}</Text>
          </View>
        ) : null}
        <Text
          style={[styles.headerTitle, type.titleCard, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          Message {providerName || 'provider'}
        </Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={[styles.help, type.bodyDefault, { color: colors.textSecondary }]}>
          Send a quick message to introduce yourself or ask about the service. Once
          they accept, you can chat normally.
        </Text>
        <TextInput
          style={[
            styles.input,
            type.bodyDefault,
            {
              backgroundColor: colors.bgSurface,
              borderColor: colors.borderSubtle,
              color: colors.textPrimary,
            },
          ]}
          value={text}
          onChangeText={setText}
          placeholder="Hi! I'd love to ask about…"
          placeholderTextColor={colors.textSecondary}
          multiline
          autoFocus
          maxLength={1000}
        />
      </ScrollView>

      {/* One primary action, in Mulberry — the same fill Send and Accept take in
          the thread, and the only place it appears on this screen. */}
      <View
        style={[
          styles.cta,
          { paddingBottom: insets.bottom + 16, borderTopColor: colors.borderSubtle },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.sendBtn,
            {
              backgroundColor: colors.actionPrimary,
              opacity: !text.trim() || sending ? 0.45 : 1,
            },
          ]}
          activeOpacity={0.85}
          onPress={send}
          disabled={!text.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message request"
        >
          {sending ? (
            <ActivityIndicator color={colors.textOnAction} size="small" />
          ) : (
            <Text style={[type.labelAction, { color: colors.textOnAction }]}>
              Send Message Request
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

// STRUCTURE ONLY — every colour resolves from the theme at render time. The
// input's radius and surface, and the action's height and radius, deliberately
// match the conversation thread's composer and Accept control: this screen is
// the doorway into that one, and the two should not look like different systems.
const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogram: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  headerTitle: {
    flex: 1,
  },
  help: {
    marginBottom: 16,
  },
  input: {
    minHeight: 140,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    textAlignVertical: 'top',
  },
  cta: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sendBtn: {
    height: 46,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
})
