import { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rateLimit'
import { COMMUNITY_CATEGORIES, DEFAULT_CATEGORY } from '@/lib/community'

const MAX_LEN = 1000

export default function CommunityCompose() {
  const insets = useSafeAreaInsets()
  const { user, providerId } = useAuth()

  const [content, setContent] = useState('')
  const [category, setCategory] = useState(DEFAULT_CATEGORY)
  const [submitting, setSubmitting] = useState(false)

  const canPost = content.trim().length > 0 && !!providerId && !!user && !submitting

  async function submit() {
    const text = content.trim()
    if (!text || !user || !providerId || submitting) return
    setSubmitting(true)

    // Server-side rate limit (max 10 posts/hour/provider). Not an error.
    const rl = await checkRateLimit(
      user.id,
      'community_post',
      RATE_LIMITS.community_post.maxRequests,
      RATE_LIMITS.community_post.windowSeconds,
    )
    if (!rl.allowed) {
      setSubmitting(false)
      Alert.alert('Please wait', rl.message ?? 'Please wait before trying again.')
      return
    }

    Sentry.addBreadcrumb({ message: 'Community post submit', category: 'community' })
    try {
      const { error } = await supabase.from('community_posts').insert({
        provider_id: providerId,
        user_id: user.id,
        content: text,
        category,
      })
      if (error) throw error
      router.back()
    } catch (err) {
      console.log('Community post create error:', err)
      Sentry.captureException(err)
      Alert.alert('Could not post', 'Could not post. Please try again.', [{ text: 'OK' }])
      setSubmitting(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Post</Text>
        <TouchableOpacity onPress={submit} disabled={!canPost} activeOpacity={0.7}>
          {submitting ? (
            <ActivityIndicator color="#C8922A" size="small" />
          ) : (
            <Text style={[styles.postText, !canPost && styles.postTextDisabled]}>Post</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <Text style={styles.label}>CATEGORY</Text>
        <View style={styles.catRow}>
          {COMMUNITY_CATEGORIES.map((c) => {
            const active = category === c.key
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.catChip, active ? styles.catChipActive : styles.catChipInactive]}
                activeOpacity={0.8}
                onPress={() => setCategory(c.key)}
              >
                <Text style={active ? styles.catTextActive : styles.catTextInactive}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>

        <TextInput
          style={styles.input}
          placeholder="Share advice, ask a question, or celebrate a win…"
          placeholderTextColor="rgba(240,232,213,0.25)"
          multiline
          maxLength={MAX_LEN}
          value={content}
          onChangeText={setContent}
          textAlignVertical="top"
          autoFocus
        />
        <Text style={styles.counter}>
          {content.length}/{MAX_LEN}
        </Text>

        <View style={styles.privacyRow}>
          <Feather name="lock" size={12} color="rgba(240,232,213,0.35)" />
          <Text style={styles.privacyText}>
            Visible to providers only. Clients never see the community hub.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  cancelText: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
  headerTitle: { fontSize: 16, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  postText: { fontSize: 15, color: '#C8922A', fontFamily: 'Manrope_700Bold' },
  postTextDisabled: { color: 'rgba(240,232,213,0.3)' },
  body: { paddingHorizontal: 20, paddingTop: 20 },
  label: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  catRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 24,
  },
  catChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  catChipActive: { backgroundColor: '#F0E8D5' },
  catChipInactive: {
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
  },
  catTextActive: { fontSize: 13, color: '#080808', fontFamily: 'Manrope_700Bold' },
  catTextInactive: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_500Medium',
  },
  input: {
    minHeight: 160,
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 24,
    padding: 0,
  },
  counter: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'right',
    marginTop: 8,
  },
  privacyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 20,
  },
  privacyText: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
  },
})
