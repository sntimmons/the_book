import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import { usePanelContext } from '@/context/PanelContext'
import { dashboardBack } from '@/lib/dashboardNav'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { uploadMedia } from '@/lib/storage'
import { cacheBustedPhoto } from '@/lib/image'
import {
  deleteProviderMedia,
  DELETE_MEDIA_COPY,
  DELETE_MEDIA_FAILED,
} from '@/lib/providerMedia'

interface PostItem {
  id: string
  media_url: string
  media_type: string
  thumbnail_url: string | null
}

type UploadKind = 'image' | 'video'

export default function ProviderPosts() {
  const { openPanel } = usePanelContext()
  const { user, providerId: ctxProviderId } = useAuth()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()

  const [providerId, setProviderId] = useState<string | null>(ctxProviderId)
  const [posts, setPosts] = useState<PostItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploadingKind, setUploadingKind] = useState<UploadKind | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const uploading = uploadingKind !== null

  // 3-column grid within 20px page padding and two 12px gaps.
  const cellSize = (width - 40 - 24) / 3

  // Prefer the provider id already resolved once per session in AuthContext.
  // Fall back to a query by user_id (the pattern the main dashboard uses) so
  // the screen still works if the context value has not populated yet.
  const resolveProviderId = useCallback(async (): Promise<string | null> => {
    if (ctxProviderId) return ctxProviderId
    if (!user) return null
    const { data } = await supabase
      .from('providers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()
    return data?.id ?? null
  }, [ctxProviderId, user])

  const loadPosts = useCallback(async (pid: string) => {
    const { data, error: readError } = await supabase
      .from('posts')
      .select('id, media_url, media_type, thumbnail_url')
      .eq('provider_id', pid)
      .eq('is_active', true)
      .order('created_at', { ascending: false })

    if (readError) {
      console.log('Load posts error:', readError)
      setError('Could not load your posts.')
      return
    }
    setPosts((data as PostItem[]) ?? [])
  }, [])

  // Load on focus so newly added content (or content persisted at Go Live)
  // shows immediately, and re-shows after returning from another screen.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      ;(async () => {
        setLoading(true)
        const pid = await resolveProviderId()
        if (cancelled) return
        setProviderId(pid)
        if (pid) await loadPosts(pid)
        if (!cancelled) setLoading(false)
      })()
      return () => {
        cancelled = true
      }
    }, [resolveProviderId, loadPosts]),
  )

  async function pickAndUpload(kind: UploadKind) {
    if (uploading || !user || !providerId) return
    setError(null)

    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!granted) {
      setError('Media access is needed to add content.')
      return
    }

    // Photos are square-cropped to match the grid; videos are picked as-is.
    const result = await ImagePicker.launchImageLibraryAsync(
      kind === 'image'
        ? { mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.8 }
        : { mediaTypes: ['videos'] },
    )
    if (result.canceled || !result.assets[0]) return

    setUploadingKind(kind)
    try {
      const { url, error: uploadError } = await uploadMedia(
        result.assets[0].uri,
        user.id,
        kind === 'image' ? 'portfolio' : 'reels',
        'posts-media',
      )
      if (uploadError || !url) {
        setError('Upload failed. Please try again.')
        return
      }

      const { error: insertError } = await supabase.from('posts').insert({
        provider_id: providerId,
        media_url: url,
        media_type: kind === 'image' ? 'image' : 'video',
        content_type: 'portfolio',
        visibility: 'public',
        is_active: true,
        is_demo: false,
        // Append after existing content so new posts don't pile up at
        // sort_order=0 and skew Discover hero selection / profile ordering.
        sort_order: posts.length,
      })
      if (insertError) {
        console.log('Posts insert error:', insertError)
        setError('Could not save your content. Please try again.')
        return
      }

      await loadPosts(providerId)
    } catch (err) {
      console.log('Posts upload exception:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setUploadingKind(null)
    }
  }

  // ITEM L: posts and reels are deletable by the provider who published them.
  //
  // The same gap the portfolio screen had, and it mattered more here: this list
  // is where a provider's VIDEO content lives, which is what Reels plays to
  // everyone. There was no way to take a reel down.
  function confirmDelete(post: PostItem) {
    if (uploading || deletingId) return
    Alert.alert(DELETE_MEDIA_COPY.title, DELETE_MEDIA_COPY.body, [
      { text: DELETE_MEDIA_COPY.cancelLabel, style: 'cancel' },
      {
        text: DELETE_MEDIA_COPY.confirmLabel,
        style: 'destructive',
        onPress: () => removePost(post),
      },
    ])
  }

  async function removePost(post: PostItem) {
    if (!providerId) return
    setDeletingId(post.id)
    setError(null)
    // The list is re-read from the server either way rather than patched locally:
    // RLS FILTERS a refused delete instead of raising, so "no error" is not proof
    // the row is gone, and a provider must never be shown an empty tile for
    // something still on their public profile and still in Reels.
    const result = await deleteProviderMedia(post.id, post.media_url)
    if (!result.ok) setError(DELETE_MEDIA_FAILED)
    await loadPosts(providerId)
    setDeletingId(null)
  }

  const canAdd = !!providerId && !uploading

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={dashboardBack} activeOpacity={0.8}>
          <Feather name="chevron-left" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.menuBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Posts & Reels</Text>
        <View style={styles.menuBtnSpacer} />
      </View>

      {loading ? (
        <View style={styles.centerBody}>
          <ActivityIndicator color="rgba(240,232,213,0.4)" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.subtitle}>
            Share photos and video reels to show clients your work and stay top of
            mind.
          </Text>

          {/* Add actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnPrimary, !canAdd && styles.actionBtnDisabled]}
              onPress={() => pickAndUpload('image')}
              activeOpacity={0.85}
              disabled={!canAdd}
            >
              {uploadingKind === 'image' ? (
                <ActivityIndicator color="#080808" size="small" />
              ) : (
                <>
                  <Feather name="image" size={16} color="#080808" />
                  <Text style={styles.actionBtnPrimaryText}>Add Photo</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary, !canAdd && styles.actionBtnDisabledOutline]}
              onPress={() => pickAndUpload('video')}
              activeOpacity={0.85}
              disabled={!canAdd}
            >
              {uploadingKind === 'video' ? (
                <ActivityIndicator color="#F0E8D5" size="small" />
              ) : (
                <>
                  <Feather name="video" size={16} color="#F0E8D5" />
                  <Text style={styles.actionBtnSecondaryText}>Add Video</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#C8922A" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {posts.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="film" size={36} color="rgba(240,232,213,0.1)" />
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptySub}>
                Add your first photo or video to show clients your work.
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {posts.map((post) => {
                const isVideo = post.media_type === 'video'
                // Videos have no frame we can show from the video URL itself, so
                // we use thumbnail_url when present, otherwise a dark tile with
                // the play overlay marking it as a video.
                const thumbUri = isVideo ? post.thumbnail_url : post.media_url
                return (
                  <View
                    key={post.id}
                    style={[styles.cell, { width: cellSize, height: cellSize }]}
                  >
                    {thumbUri ? (
                      <Image
                        source={{ uri: cacheBustedPhoto(thumbUri) }}
                        style={StyleSheet.absoluteFill}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.cellDark} />
                    )}
                    {isVideo ? (
                      <View style={styles.playOverlay}>
                        <Feather name="play" size={20} color="#F0E8D5" />
                      </View>
                    ) : null}
                    {deletingId === post.id ? (
                      <View style={styles.cellBusy}>
                        <ActivityIndicator color="#F0E8D5" size="small" />
                      </View>
                    ) : (
                      <Pressable
                        style={styles.deleteBadge}
                        onPress={() => confirmDelete(post)}
                        disabled={!!deletingId || uploading}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        accessibilityLabel={isVideo ? 'Delete this video' : 'Delete this photo'}
                      >
                        <Feather name="trash-2" size={13} color="#F0E8D5" />
                      </Pressable>
                    )}
                  </View>
                )
              })}
            </View>
          )}

          {posts.length > 0 ? (
            <Text style={styles.countText}>
              {posts.length} {posts.length === 1 ? 'post' : 'posts'}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  // Deliberately the same badge as the portfolio grid: one delete affordance,
  // in the same corner, whichever kind of media a provider is looking at.
  deleteBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(8,8,8,0.7)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellBusy: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,8,8,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  root: { flex: 1, backgroundColor: '#080808' },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnSpacer: { width: 84, height: 36 },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  centerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 19,
    marginBottom: 20,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  actionBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderCurve: 'continuous',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  actionBtnPrimary: {
    backgroundColor: '#F0E8D5',
  },
  actionBtnPrimaryText: {
    fontSize: 14,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  actionBtnSecondary: {
    backgroundColor: 'rgba(240,232,213,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
  },
  actionBtnSecondaryText: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  actionBtnDisabled: {
    backgroundColor: 'rgba(240,232,213,0.1)',
  },
  actionBtnDisabledOutline: {
    opacity: 0.5,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(200,146,42,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(200,146,42,0.3)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 48,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    marginTop: 14,
  },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 6,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  cell: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(240,232,213,0.05)',
  },
  cellDark: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,8,8,0.25)',
  },
  countText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 16,
  },
})
