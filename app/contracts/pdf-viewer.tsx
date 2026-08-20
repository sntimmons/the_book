import { useCallback, useEffect, useState } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  StyleSheet,
} from 'react-native'
import { WebView } from 'react-native-webview'
import { Feather } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { getSignedPdfUrl } from '@/lib/contracts'

// iOS WebView renders a PDF URL inline. Android's system WebView does not, so we
// wrap it in Google's document viewer (the signed URL is fetched by Google for
// the hour it stays valid). A native inline viewer arrives with the EAS build.
function viewerUri(signedUrl: string): string {
  if (Platform.OS === 'android') {
    return `https://docs.google.com/viewer?embedded=true&url=${encodeURIComponent(signedUrl)}`
  }
  return signedUrl
}

export default function PdfViewer() {
  const insets = useSafeAreaInsets()
  const { url } = useLocalSearchParams<{ url: string }>()

  const [signedUri, setSignedUri] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  const prepare = useCallback(async () => {
    setFailed(false)
    setSignedUri(null)
    if (!url) {
      setFailed(true)
      return
    }
    const signed = await getSignedPdfUrl(url)
    if (!signed) {
      setFailed(true)
      return
    }
    setSignedUri(viewerUri(signed))
  }, [url])

  useEffect(() => {
    prepare()
  }, [prepare])

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Feather name="x" size={20} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Contract</Text>
        <View style={styles.iconBtn} />
      </View>

      <View style={styles.body}>
        {failed ? (
          <View style={styles.centerBody}>
            <Feather name="alert-triangle" size={32} color="rgba(240,232,213,0.25)" />
            <Text style={styles.errorText}>
              Unable to load PDF. The file may have moved or been deleted.
            </Text>
            <TouchableOpacity style={styles.retryBtn} activeOpacity={0.85} onPress={prepare}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : signedUri ? (
          <WebView
            source={{ uri: signedUri }}
            style={styles.webview}
            originWhitelist={['*']}
            startInLoadingState
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            renderLoading={() => (
              <View style={styles.webviewLoading}>
                <ActivityIndicator color="rgba(240,232,213,0.4)" />
              </View>
            )}
          />
        ) : (
          <View style={styles.centerBody}>
            <ActivityIndicator color="rgba(240,232,213,0.4)" />
          </View>
        )}
      </View>
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
  body: { flex: 1 },
  webview: { flex: 1, backgroundColor: '#F0E8D5' },
  webviewLoading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#080808',
  },
  centerBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 14,
  },
  errorText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
    textAlign: 'center',
    lineHeight: 20,
  },
  retryBtn: {
    paddingHorizontal: 24,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0E8D5',
    marginTop: 4,
  },
  retryText: { fontSize: 14, color: '#080808', fontFamily: 'Manrope_700Bold' },
})
