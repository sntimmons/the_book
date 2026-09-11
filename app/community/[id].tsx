import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  Image,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  InputAccessoryView,
  Keyboard,
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
import { checkRateLimit } from '@/lib/rateLimit'
import {
  submitReport,
  REPORT_SUBMITTED_COPY,
  REPORT_FAILED_COPY,
  REPORT_LIMITED_COPY,
  ReportReason,
} from '@/lib/safety'
import ReportSheet from '@/components/ReportSheet'
import { cacheBustedPhoto } from '@/lib/image'
import {
  fetchCommunityPost,
  fetchCommunityReplies,
  fetchLikedPostIds,
  fetchBookmarkedPostIds,
  fetchProviderInfoMap,
  createCommunityReply,
  deleteOwnReply,
  setPostLiked,
  setPostBookmarked,
  intentLabel,
  timeAgo,
  initials,
  CommunityPostView,
  CommunityReplyView,
  CommunityProviderInfo,
} from '@/lib/community'

const MAX_REPLY = 500
const REPLY_ACCESSORY_ID = 'communityReplyInput'

type ThreadPost = CommunityPostView & { isLiked: boolean; isBookmarked: boolean }

// The same five reasons the feed offers, mapped onto the product-wide
// vocabulary in lib/safety.ts. A second reporting vocabulary would be a second
// thing to keep in step.
const REPLY_REPORT_REASONS: { label: string; value: ReportReason }[] = [
  { label: 'Inappropriate content', value: 'profile_or_content' },
  { label: 'Harassment', value: 'harassment' },
  { label: 'Scam or fraud', value: 'scam_or_fraud' },
  { label: 'Safety concern', value: 'safety_concern' },
  { label: 'Something else', value: 'other' },
]

export default function CommunityThread() {
  const insets = useSafeAreaInsets()
  const { id } = useLocalSearchParams<{ id: string }>()
  const { user, providerId, isProvider } = useAuth()
  const currentUserId = user?.id ?? null

  const [post, setPost] = useState<ThreadPost | null>(null)
  const [replies, setReplies] = useState<CommunityReplyView[]>([])
  const [myInfo, setMyInfo] = useState<CommunityProviderInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyInput, setReplyInput] = useState('')
  const [reportReplyTarget, setReportReplyTarget] = useState<CommunityReplyView | null>(null)
  const [reportingReply, setReportingReply] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    if (!id) {
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
  }, [id, user, providerId])

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
    // One copy of this write, in lib/community.ts, called identically from here
    // and from the feed. The two screens used to spell it inline in shapes that
    // had already diverged.
    const res = await setPostLiked(user.id, post.id, !wasLiked)
    if (!res.ok) {
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
    const res = await setPostBookmarked(user.id, post.id, !was)
    if (!res.ok) {
      setPost((prev) => (prev ? { ...prev, isBookmarked: was } : prev))
    }
  }

  async function deleteReply(replyId: string) {
    const idx = replies.findIndex((r) => r.id === replyId)
    if (idx < 0) return
    const removed = replies[idx]
    setReplies((prev) => prev.filter((r) => r.id !== replyId))
    setPost((prev) => (prev ? { ...prev, replyCount: Math.max(0, prev.replyCount - 1) } : prev))
    // ASSERTED ON THE ROW COUNT. RLS FILTERS someone else's reply out of the
    // caller's DELETE scope, so the statement affects zero rows and raises
    // nothing — a check on `error` alone reports it as deleted.
    const res = await deleteOwnReply(replyId)
    if (!res.ok) {
      setReplies((prev) => {
        const next = [...prev]
        next.splice(Math.min(idx, next.length), 0, removed)
        return next
      })
      setPost((prev) => (prev ? { ...prev, replyCount: prev.replyCount + 1 } : prev))
      Alert.alert('Could not remove', res.message ?? 'Please try again.', [{ text: 'OK' }])
    }
  }

  function confirmDeleteReply(replyId: string) {
    Alert.alert('Delete reply', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteReply(replyId) },
    ])
  }

  // A REPLY CAN BE REPORTED, because a reply can now be HIDDEN. An operator
  // capability with no intake would be a control nobody can reach: the ruling
  // covers posts AND replies, so the report path has to cover both.
  async function reportReply(
    reply: CommunityReplyView,
    reason: ReportReason,
    notes: string | null,
  ) {
    if (!user) return
    const res = await submitReport({
      reporterUserId: user.id,
      type: 'content',
      reason,
      reportedUserId: reply.userId,
      contentKind: 'community_reply',
      contentId: reply.id,
      notes: notes?.trim() || null,
    })
    if (res.limited) {
      Alert.alert(REPORT_LIMITED_COPY.title, REPORT_LIMITED_COPY.body, [{ text: 'OK' }])
      return
    }
    const copy = res.ok ? REPORT_SUBMITTED_COPY : REPORT_FAILED_COPY
    Alert.alert(copy.title, copy.body, [{ text: 'OK' }])
  }

  async function submitReply(kind: 'reply' | 'can_help' = 'reply') {
    const text =
      kind === 'can_help' && replyInput.trim().length === 0
        ? 'I can help with this.'
        : replyInput.trim()
    if (!text || !user || !post || submitting) return
    if (kind === 'can_help' && !replyAsProvider) return
    setSubmitting(true)

    // Replies are the contact surface here, and open to every account since the
    // reshape. Same limiter as the composer, not an error — a wait.
    const rl = await checkRateLimit(user.id, 'community_reply')
    if (!rl.allowed) {
      setSubmitting(false)
      Alert.alert('Please wait', rl.message ?? 'Please wait before trying again.')
      return
    }

    const tempId = `temp-${Date.now()}`
    const asProvider = replyAsProvider
    const optimistic: CommunityReplyView = {
      id: tempId,
      providerId: asProvider ? providerId : null,
      userId: user.id,
      authorKind: asProvider ? 'provider' : 'client',
      kind,
      content: text,
      createdAt: new Date().toISOString(),
      author: {
        kind: asProvider ? 'provider' : 'client',
        name: asProvider ? myInfo?.name ?? 'Your business' : 'You',
        photo: asProvider ? myInfo?.photo ?? null : null,
        providerId: asProvider ? providerId : null,
        category: myInfo?.category ?? '',
        neighborhood: myInfo?.neighborhood ?? null,
      },
    }
    setReplies((prev) => [...prev, optimistic])
    setReplyInput('')
    setPost((prev) => (prev ? { ...prev, replyCount: prev.replyCount + 1 } : prev))

    const res = await createCommunityReply(user.id, post.id, text, { asProvider, kind })
    if (!res.ok) {
      Sentry.addBreadcrumb({ message: 'Community reply refused', category: 'community' })
      setReplies((prev) => prev.filter((r) => r.id !== tempId))
      setPost((prev) => (prev ? { ...prev, replyCount: Math.max(0, prev.replyCount - 1) } : prev))
      Alert.alert('Not sent', res.message ?? 'Please try again.', [{ text: 'OK' }])
      setSubmitting(false)
      return
    }
    // Re-read rather than patching the optimistic row: the server assigns the id
    // and the timestamp, and a reply that shows as sent while the thread does
    // not contain it is the shape of bug this screen used to have.
    await load()
    setSubmitting(false)
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


  // WHO YOU ARE REPLYING AS. A provider can answer as their business — which is
  // what makes an answer actionable, because the surface can then offer their
  // profile — or as a person. A client has only one option and is never shown a
  // choice that does not exist for them.
  const canReplyAsProvider = isProvider && !!providerId
  const [replyAsProvider, setReplyAsProvider] = useState(false)
  useEffect(() => {
    if (canReplyAsProvider) setReplyAsProvider(true)
  }, [canReplyAsProvider])

  // "I can help" is only offered where it means something: a provider, on a post
  // that is someone LOOKING for a provider. Offering it on an announcement would
  // be a button with no referent.
  const canOfferHelp =
    canReplyAsProvider && post?.intent === 'looking_for' && post?.userId !== currentUserId

  const canSend = replyInput.trim().length > 0 && !!user && !submitting

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
                  {post.author.photo ? (
                    <Image
                      source={{ uri: cacheBustedPhoto(post.author.photo) }}
                      style={styles.avatar}
                    />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarText}>{initials(post.author.name)}</Text>
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.authorName}>{post.author.name}</Text>
                    <Text style={styles.authorMeta}>
                      {post.author.kind === 'provider' && post.author.category
                        ? `${post.author.category} · `
                        : ''}
                      {timeAgo(post.createdAt)}
                    </Text>
                  </View>
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryBadgeText}>{intentLabel(post.intent)}</Text>
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
                    {/* THE COUNT THIS VIEWER CAN SEE, not the stored total.
                        `community_posts.reply_count` counts every reply, while
                        `community_replies_visible` hides replies from anyone this
                        viewer is blocked with — so the two disagreed on the same
                        screen at the same moment, and the difference told the
                        viewer a hidden reply existed. */}
                    <Text style={styles.actionText}>{replies.length}</Text>
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
              {item.author.photo ? (
                <Image
                  source={{ uri: cacheBustedPhoto(item.author.photo) }}
                  style={styles.replyAvatar}
                />
              ) : (
                <View style={[styles.replyAvatar, styles.avatarFallback]}>
                  <Text style={styles.replyAvatarText}>{initials(item.author.name)}</Text>
                </View>
              )}
              <View style={styles.replyBody}>
                <Text style={styles.replyAuthor}>
                  {item.author.name}
                  <Text style={styles.replyTime}>{'  '}{timeAgo(item.createdAt)}</Text>
                </Text>
                <Text style={styles.replyContent}>{item.content}</Text>
                {/* A provider who answered is REACHABLE from the answer. That is
                    the whole point of a service community: the reply is not the
                    end of the journey, the provider is. */}
                {item.authorKind === 'provider' && item.author.providerId ? (
                  <TouchableOpacity
                    style={styles.answerActions}
                    activeOpacity={0.8}
                    onPress={() =>
                      router.push({
                        pathname: '/providers/[id]',
                        params: { id: item.author.providerId as string },
                      })
                    }
                  >
                    {item.kind === 'can_help' ? (
                      <View style={styles.helpChip}>
                        <Text style={styles.helpChipText}>Can help</Text>
                      </View>
                    ) : null}
                    <Text style={styles.viewProfile}>View profile</Text>
                    <Feather name="chevron-right" size={13} color="#C8922A" />
                  </TouchableOpacity>
                ) : null}
              </View>
              <TouchableOpacity
                onPress={() =>
                  item.userId === currentUserId
                    ? confirmDeleteReply(item.id)
                    : setReportReplyTarget(item)
                }
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Feather name="more-vertical" size={16} color="rgba(240,232,213,0.35)" />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* Reply composer */}
      {!loading && post ? (
        <View style={{ paddingBottom: insets.bottom + 10 }}>
          {canReplyAsProvider ? (
            <View style={styles.replyAsRow}>
              <TouchableOpacity
                style={[styles.replyAsChip, replyAsProvider && styles.replyAsChipActive]}
                activeOpacity={0.8}
                onPress={() => setReplyAsProvider(true)}
              >
                <Text style={replyAsProvider ? styles.replyAsTextActive : styles.replyAsText}>
                  {myInfo?.name ?? 'Your business'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.replyAsChip, !replyAsProvider && styles.replyAsChipActive]}
                activeOpacity={0.8}
                onPress={() => setReplyAsProvider(false)}
              >
                <Text style={!replyAsProvider ? styles.replyAsTextActive : styles.replyAsText}>
                  You
                </Text>
              </TouchableOpacity>
              {canOfferHelp ? (
                <TouchableOpacity
                  style={styles.canHelpBtn}
                  activeOpacity={0.85}
                  disabled={submitting}
                  onPress={() => submitReply('can_help')}
                >
                  <Feather name="check" size={13} color="#080808" />
                  <Text style={styles.canHelpText}>I can help</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Add a reply…"
            placeholderTextColor="rgba(240,232,213,0.3)"
            value={replyInput}
            onChangeText={setReplyInput}
            maxLength={MAX_REPLY}
            multiline
            inputAccessoryViewID={Platform.OS === 'ios' ? REPLY_ACCESSORY_ID : undefined}
          />
          <TouchableOpacity
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={() => submitReply('reply')}
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
        </View>
      ) : null}

      <ReportSheet
        visible={reportReplyTarget !== null}
        title="Report this reply"
        options={REPLY_REPORT_REASONS}
        submitting={reportingReply}
        onCancel={() => setReportReplyTarget(null)}
        onSubmit={async (reason, notes) => {
          const target = reportReplyTarget
          if (!target) return
          setReportingReply(true)
          await reportReply(target, reason, notes)
          setReportingReply(false)
          setReportReplyTarget(null)
        }}
      />

      {/* iOS: a Done bar above the keyboard so a multiline reply can be
          dismissed (mirrors the message composer's accessory bar). */}
      {Platform.OS === 'ios' && (
        <InputAccessoryView nativeID={REPLY_ACCESSORY_ID} backgroundColor="#111111">
          <View style={styles.accessoryBar}>
            <TouchableOpacity
              onPress={Keyboard.dismiss}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.accessoryDone}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  replyAsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  replyAsChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  replyAsChipActive: { backgroundColor: 'rgba(200,146,42,0.18)' },
  replyAsText: { color: 'rgba(240,232,213,0.45)', fontSize: 11 },
  replyAsTextActive: { color: '#C8922A', fontSize: 11, fontWeight: '600' },
  canHelpBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#C8922A',
  },
  canHelpText: { color: '#080808', fontSize: 11, fontWeight: '700' },
  answerActions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  helpChip: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(200,146,42,0.15)',
  },
  helpChipText: { color: '#C8922A', fontSize: 9, fontWeight: '700' },
  viewProfile: { color: '#C8922A', fontSize: 11, fontWeight: '600' },
  accessoryBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.08)',
  },
  accessoryDone: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_600SemiBold',
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
