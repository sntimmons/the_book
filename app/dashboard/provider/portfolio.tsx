import { useCallback, useState } from 'react'
import {
  View,
  Text,
  Image,
  Pressable,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  useWindowDimensions,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect } from 'expo-router'
import * as ImagePicker from 'expo-image-picker'
import * as Sentry from '@sentry/react-native'
import { usePanelContext } from '@/context/PanelContext'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { uploadMedia } from '@/lib/storage'
import { cacheBustedPhoto } from '@/lib/image'

interface PortfolioPhoto {
  id: string
  media_url: string
  sort_order: number
}

export default function ProviderPortfolio() {
  const { openPanel } = usePanelContext()
  const { user, providerId: ctxProviderId } = useAuth()
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()

  const [providerId, setProviderId] = useState<string | null>(ctxProviderId)
  const [photos, setPhotos] = useState<PortfolioPhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const loadPhotos = useCallback(async (pid: string) => {
    const { data, error: readError } = await supabase
      .from('posts')
      .select('id, media_url, sort_order')
      .eq('provider_id', pid)
      .eq('media_type', 'image')
      .eq('content_type', 'portfolio')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })

    if (readError) {
      console.log('Load portfolio error:', readError)
      setError('Could not load your portfolio.')
      return
    }
    setPhotos((data as PortfolioPhoto[]) ?? [])
  }, [])

  // Load on focus so a photo added here (or content persisted at Go Live)
  // shows immediately, and re-shows after returning from another screen.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false
      ;(async () => {
        setLoading(true)
        const pid = await resolveProviderId()
        if (cancelled) return
        setProviderId(pid)
        if (pid) await loadPhotos(pid)
        if (!cancelled) setLoading(false)
      })()
      return () => {
        cancelled = true
      }
    }, [resolveProviderId, loadPhotos]),
  )

  async function pickAndUpload() {
    if (uploading || !user || !providerId) return
    setError(null)

    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!granted) {
      setError('Photo access is needed to add portfolio photos.')
      return
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled || !result.assets[0]) return

    setUploading(true)
    try {
      const { url, error: uploadError } = await uploadMedia(
        result.assets[0].uri,
        user.id,
        'portfolio',
        'posts-media',
      )
      if (uploadError || !url) {
        Sentry.captureException(new Error(`Portfolio upload failed: ${uploadError ?? 'no url'}`))
        setError('Upload failed. Please check your connection and try again.')
        return
      }

      const { error: insertError } = await supabase.from('posts').insert({
        provider_id: providerId,
        media_url: url,
        media_type: 'image',
        content_type: 'portfolio',
        visibility: 'public',
        is_active: true,
        is_demo: false,
        // New photo goes to the end of the current list.
        sort_order: photos.length,
      })
      if (insertError) {
        console.log('Portfolio insert error:', insertError)
        Sentry.captureException(insertError)
        setError('Could not save your photo. Please try again.')
        return
      }

      await loadPhotos(providerId)
    } catch (err) {
      console.log('Portfolio upload exception:', err)
      Sentry.captureException(err)
      setError('Upload failed. Please check your connection and try again.')
    } finally {
      setUploading(false)
    }
  }

  const canAdd = !!providerId && !uploading

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity style={styles.menuBtn} onPress={openPanel} activeOpacity={0.8}>
          <Feather name="menu" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Portfolio</Text>
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
            Portfolio photos show clients your best work. They stay permanently on
            your public profile.
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#C8922A" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {photos.length === 0 ? (
            <View style={styles.emptyState}>
              <Feather name="image" size={36} color="rgba(240,232,213,0.1)" />
              <Text style={styles.emptyTitle}>No photos yet</Text>
              <Text style={styles.emptySub}>
                Add your first photo to show clients your work.
              </Text>
              <TouchableOpacity
                style={[styles.addBtn, !canAdd && styles.addBtnDisabled]}
                onPress={pickAndUpload}
                activeOpacity={0.85}
                disabled={!canAdd}
              >
                {uploading ? (
                  <ActivityIndicator color="#080808" size="small" />
                ) : (
                  <Text style={styles.addBtnText}>Add photo</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.grid}>
              {photos.map((photo) => (
                <View
                  key={photo.id}
                  style={[styles.cell, { width: cellSize, height: cellSize }]}
                >
                  <Image
                    source={{ uri: cacheBustedPhoto(photo.media_url) }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                </View>
              ))}

              {/* Add-photo cell */}
              <Pressable
                style={({ pressed }) => [
                  styles.cell,
                  styles.addCell,
                  { width: cellSize, height: cellSize },
                  pressed && canAdd && styles.addCellPressed,
                ]}
                onPress={pickAndUpload}
                disabled={!canAdd}
              >
                {uploading ? (
                  <ActivityIndicator color="rgba(240,232,213,0.6)" size="small" />
                ) : (
                  <Feather name="plus" size={24} color="rgba(240,232,213,0.4)" />
                )}
              </Pressable>
            </View>
          )}

          {photos.length > 0 ? (
            <Text style={styles.countText}>
              {photos.length} {photos.length === 1 ? 'photo' : 'photos'}
            </Text>
          ) : null}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
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
  menuBtnSpacer: { width: 36, height: 36 },
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
    paddingTop: 60,
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
    marginBottom: 24,
  },
  addBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    paddingHorizontal: 28,
    height: 48,
    minWidth: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnDisabled: {
    backgroundColor: 'rgba(240,232,213,0.1)',
  },
  addBtnText: {
    fontSize: 15,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
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
  addCell: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addCellPressed: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderColor: 'rgba(240,232,213,0.35)',
  },
  countText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 16,
  },
})
