import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native'
import { Feather, Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { cacheBustedPhoto } from '@/lib/image'
import {
  fetchCommunityPost,
  fetchCommunityReplies,
  fetchLikedPostIds,
  fetchBookmarkedPostIds,
  fetchProviderInfoMap,
  categoryLabel,
  timeAgo,
  initials,
  CommunityPostView,
  CommunityReplyView,
  CommunityProviderInfo,
} from '@/lib/community'

const MAX_REPLY = 500

type ThreadPost = CommunityPostView & { isLiked: boolean; isBookmarked: boolean }

export default function CommunityThread() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user, providerId, isProvider, roleLoading } = useAuth()
  const currentUserId = user?.id ?? null

  const [post, setPost] = useState<ThreadPost | null>(null)
  const [replies, setReplies] = useState<CommunityReplyView[]>([])
  const [myInfo, setMyInfo] = useState<CommunityProviderInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyInput, setReplyInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!id || !isProvider) {
      setLoading(false)
      return
    }
    const [p, r] = await Promise.all([fetchCommunityPost(id), fetchCommunityReplies(id)])
    let liked = false
    let bookmarked = false
    if (p && user) {
      const [likedSet, bookmarkedSet] = await Promise.all([
        fetchLikedPostIds(user.id, [p.id]),
        fetchBookmarkedPostIds(user.id, [p.id]),
      ])
      liked = likedSet.has(p.id)
      bookmarked = bookmarkedSet.has(p.id)
    }
    if (providerId) {
      const infoMap = await fetchProviderInfoMap([providerId])
      setMyInfo(infoMap.get(providerId) ?? null)
    }
    setPost(p ? { ...p, isLiked: liked, isBookmarked: bookmarked } : null)
    setReplies(r)
    setLoading(false)
  }, [id, isProvider, user, providerId])

  useFocusEffect(
    useCallback(() => {
      setLoading(true)
      load()
    }, [load]),
  )

  async function toggleLike() {
    if (!post || !user) return
    const wasLiked = post.isLiked
    setPost((prev) =>
      prev
        ? { ...prev, isLiked: !wasLiked, likeCount: Math.max(0, prev.likeCount + (wasLiked ? -1 : 1)) }
        : prev,
    )
    try {
      const { error } = wasLiked
        ? await supabase
            .from('community_post_likes')
            .delete()
            .eq('user_id', user.id)
            .eq('post_id', post.id)
        : await supabase
            .from('community_post_likes')
            .insert({ user_id: user.id, post_id: post.id })
      if (error) throw error
    } catch (err) {
      console.log('Community like error:', err)
      setPost((prev) =>
        prev
          ? { ...prev, isLiked: wasLiked, likeCount: Math.max(0, prev.likeCount + (wasLiked ? 1 : -1)) }
          : prev,
      )
    }
  }

  async function toggleBookmark() {
    if (!post || !user) return
    const was = post.isBookmarked
    setPost((prev) => (prev ? { ...prev, isBookmarked: !was } : prev))
    try {
      const { error } = was
        ? await supabase
            .from('community_bookmarks')
            .delete()
            .eq('user_id', user.id)
            .eq('post_id', post.id)
        : await supabase
            .from('community_bookmarks')
            .insert({ user_id: user.id, post_id: post.id })
      if (error) throw error
    } catch (err) {
      console.log('Community bookmark error:', err)
      setPost((prev) => (prev ? { ...prev, isBookmarked: was } : prev))
    }
  }

  async function deleteReply(replyId: string) {
    const idx = replies.findIndex((r) => r.id === replyId)
    if (idx < 0) return
    const removed = replies[idx]
    setReplies((prev) => prev.filter((r) => r.id !== replyId))
    setPost((prev) => (prev ? { ...prev, replyCount: Math.max(0, prev.replyCount - 1) } : prev))
    const { error } = await supabase.from('community_replies').delete().eq('id', replyId)
    if (error) {
      console.log('Delete reply error:', error)
      setReplies((prev) => {
        const next = [...prev]
        next.splice(Math.min(idx, next.length), 0, removed)
        return next
      })
      setPost((prev) => (prev ? { ...prev, replyCount: prev.replyCount + 1 } : prev))
      Alert.alert('Could not delete', 'Please try again.', [{ text: 'OK' }])
    }
  }

  function confirmDeleteReply(replyId: string) {
    Alert.alert('Delete reply', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteReply(replyId) },
    ])
  }

  async function submitReply() {
    const text = replyInput.trim()
    if (!text || !user || !providerId || !post || submitting) return
    setSubmitting(true)

    const tempId = `temp-${Date.now()}`
    const optimistic: CommunityReplyView = {
      id: tempId,
      providerId,
      userId: user.id,
      content: text,
      createdAt: new Date().toISOString(),
      provider: myInfo ?? { name: 'You', photo: null, category: '' },
    }
    setReplies((prev) => [...prev, optimistic])
    setReplyInput('')
    setPost((prev) => (prev ? { ...prev, replyCount: prev.replyCount + 1 } : prev))

    try {
      const { data, error } = await supabase
        .from('community_replies')
        .insert({ post_id: post.id, provider_id: providerId, user_id: user.id, content: text })
        .select('id, created_at')
        .single()
      if (error) throw error
      const row = data as { id: string; created_at: string }
      setReplies((prev) =>
        prev.map((r) => (r.id === tempId ? { ...r, id: row.id, createdAt: row.created_at } : r)),
      )
    } catch (err) {
      console.log('Community reply error:', err)
      Sentry.captureException(err)
      setReplies((prev) => prev.filter((r) => r.id !== tempId))
      setPost((prev) => (prev ? { ...prev, replyCount: Math.max(0, prev.replyCount - 1) } : prev))
      Alert.alert('Could not send reply', 'Could not send reply. Please try again.', [{ text: 'OK' }])
    } finally {
      setSubmitting(false)
    }
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
        <Feather name="chevron-left" size={20} color="#F0E8D5" />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Post</Text>
      <View style={styles.iconBtn} />
    </View>
  )

  if (!roleLoading && !isProvider) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.centerBody}>
          <Feather name="users" size={36} color="rgba(240,232,213,0.12)" />
          <Text style={styles.gateTitle}>This space is for providers</Text>
        </View>
      </View>
    )
  }

  const canSend = replyInput.trim().length > 0 && !!providerId && !submitting

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {header}

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : !post ? (
        <View style={styles.centerBody}>
          <Text style={styles.gateTitle}>Post not found</Text>
        </View>
      ) : (
        <FlatList
          data={replies}
          keyExtractor={(r) => r.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 20 }}
          ListHeaderComponent={
            <View>
              {/* Original post */}
              <View style={styles.postCard}>
                <View style={styles.rowTop}>
                  {post.provider.photo ? (
                    <Image
                      source={{ uri: cacheBustedPhoto(post.provider.photo) }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarText}>{initials(post.provider.name)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.authorName}>{post.provider.name}</Text>
                    <Text style={styles.authorMeta}>
                      {post.provider.category ? `${post.provider.category} · ` : ''}
                      {timeAgo(post.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{categoryLabel(post.category)}</Text>
                  </View>
                </View>

                <Text style={styles.postContent}>{post.content}</Text>

                <View style={styles.postActions}>
                  <TouchableOpacity
                    style={styles.actionBtn}
                    activeOpacity={0.7}
                    onPress={toggleLike}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather
                      name="heart"
                      size={17}
                      color={post.isLiked ? '#C8922A' : 'rgba(240,232,213,0.5)'}
                    />
                    <Text style={[styles.actionText, post.isLiked && styles.actionTextActive]}>
                      {post.likeCount}
                    </Text>
                  </TouchableOpacity>
                  <View style={styles.actionBtn}>
                    <Feather name="message-circle" size={17} color="rgba(240,232,213,0.5)" />
                    <Text style={styles.actionText}>{post.replyCount}</Text>
                  </View>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity
                    onPress={toggleBookmark}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={post.isBookmarked ? 'bookmark' : 'bookmark-outline'}
                      size={18}
                      color={post.isBookmarked ? '#C8922A' : 'rgba(240,232,213,0.5)'}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              <Text style={styles.repliesLabel}>
                {replies.length === 0
                  ? 'REPLIES'
                  : `REPLIES · ${replies.length}`}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyReplies}>No replies yet. Start the conversation.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.replyRow}>
              {item.provider.photo ? (
                <Image
                  source={{ uri: cacheBustedPhoto(item.provider.photo) }}
                  style={styles.replyAvatar}
                />
              ) : (
                <View style={[styles.replyAvatar, styles.avatarFallback]}>
                  <Text style={styles.replyAvatarText}>{initials(item.provider.name)}</Text>
                </View>
              )}
              <View style={styles.replyBody}>
                <Text style={styles.replyAuthor}>
                  {item.provider.name}
                  <Text style={styles.replyTime}>{'  '}{timeAgo(item.createdAt)}</Text>
                </Text>
                <Text style={styles.replyContent}>{item.content}</Text>
              </View>
              {item.userId === currentUserId ? (
                <TouchableOpacity
                  onPress={() => confirmDeleteReply(item.id)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  activeOpacity={0.7}
                >
                  <Feather name="more-vertical" size={16} color="rgba(240,232,213,0.35)" />
                </TouchableOpacity>
              ) : null}
            </View>
          )}
        />
      )}

      {/* Reply composer */}
      {!loading && post ? (
        <View style={[styles.inputRow, { paddingBottom: insets.bottom + 10 }]}>
          <TextInput
            style={styles.input}
            placeholder="Add a reply…"
            placeholderTextColor="rgba(240,232,213,0.3)"
            value={replyInput}
            onChangeText={setReplyInput}
            maxLength={MAX_REPLY}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={submitReply}
            disabled={!canSend}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator color="#080808" size="small" />
            ) : (
              <Feather name="arrow-up" size={18} color={canSend ? '#080808' : 'rgba(8,8,8,0.4)'} />
            )}
          </TouchableOpacity>
        </View>
      ) : null}
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
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  },
  gateTitle: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 14,
  },
  postCard: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1A1410' },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  authorName: { fontSize: 15, color: '#F0E8D5', fontFamily: 'Manrope_600SemiBold' },
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
  postContent: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.92)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 23,
    marginTop: 14,
  },
  postActions: { flexDirection: 'row', gap: 24, marginTop: 16 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },
  actionTextActive: { color: '#C8922A' },
  repliesLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 4,
  },
  emptyReplies: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  replyRow: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  replyAvatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#1A1410' },
  replyAvatarText: { fontSize: 12, color: '#F0E8D5', fontFamily: 'Manrope_700Bold' },
  replyBody: { flex: 1 },
  replyAuthor: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  replyTime: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_400Regular',
  },
  replyContent: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.85)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginTop: 3,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F0E8D5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: 'rgba(240,232,213,0.2)' },
})
