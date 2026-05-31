import { useEffect, useState, useRef } from 'react'
import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
  Image,
  useWindowDimensions,
} from 'react-native'
import { Stack, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Feather } from '@expo/vector-icons'
import { PanelContext } from '@/context/PanelContext'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

interface ProviderProfileLite {
  id: string
  display_name: string | null
  category_id: number | null
  neighborhood: string | null
  profile_photo_url: string | null
}

const NAV_SECTIONS = [
  {
    label: 'BUSINESS',
    items: [
      { icon: 'home',        label: 'Dashboard',   route: '/dashboard/provider',              badge: null },
      { icon: 'calendar',    label: 'Bookings',     route: '/dashboard/provider/bookings',     badge: '3'  },
      { icon: 'clock',       label: 'Availability', route: '/dashboard/provider/availability', badge: null },
      { icon: 'users',       label: 'My Clients',   route: '/dashboard/provider/clients',      badge: null },
      { icon: 'bar-chart-2', label: 'Analytics',    route: '/dashboard/provider/analytics',    badge: null },
    ],
  },
  {
    label: 'CONTENT',
    items: [
      { icon: 'image', label: 'Portfolio',   route: '/dashboard/provider/portfolio', badge: null },
      { icon: 'film',  label: 'Posts & Reels', route: '/dashboard/provider/posts',  badge: null },
    ],
  },
  {
    label: 'MONEY',
    items: [
      { icon: 'dollar-sign', label: 'Payouts', route: '/dashboard/provider/payouts',  badge: null },
      { icon: 'tag',         label: 'Services', route: '/dashboard/provider/services', badge: null },
    ],
  },
  {
    label: 'ACCOUNT',
    items: [
      { icon: 'user',        label: 'Edit Profile', route: '/dashboard/provider/edit-profile', badge: null },
      { icon: 'settings',    label: 'Settings',     route: '/dashboard/provider/settings',     badge: null },
      { icon: 'help-circle', label: 'Help',         route: null,                               badge: null },
    ],
  },
]

export default function ProviderDashboardLayout() {
  const insets = useSafeAreaInsets()
  const { width } = useWindowDimensions()
  const panelWidth = Math.min(width * 0.82, 320)
  const { user } = useAuth()

  const [panelOpen, setPanelOpen] = useState(false)
  const slideAnim = useRef(new Animated.Value(-panelWidth)).current
  const overlayAnim = useRef(new Animated.Value(0)).current

  const [providerProfile, setProviderProfile] = useState<ProviderProfileLite | null>(null)
  const [categoryName, setCategoryName] = useState('')

  useEffect(() => {
    if (!user) return
    supabase
      .from('providers')
      .select('id, display_name, category_id, neighborhood, profile_photo_url')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setProviderProfile(data as ProviderProfileLite)
      })
  }, [user])

  useEffect(() => {
    const categoryId = providerProfile?.category_id
    if (categoryId == null) {
      setCategoryName('')
      return
    }
    supabase
      .from('categories')
      .select('name')
      .eq('id', categoryId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.name) setCategoryName(data.name)
      })
  }, [providerProfile?.category_id])

  const displayName =
    providerProfile?.display_name?.trim() ||
    user?.email?.split('@')[0] ||
    'Provider'
  const metaParts = [categoryName, providerProfile?.neighborhood].filter(
    (s): s is string => !!s && s.length > 0,
  )
  const metaLine = metaParts.join(' · ')
  const avatarInitial = displayName.charAt(0).toUpperCase()

  function openPanel() {
    setPanelOpen(true)
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(overlayAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start()
  }

  function closePanel() {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: -panelWidth,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }),
      Animated.timing(overlayAnim, {
        toValue: 0,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start(() => setPanelOpen(false))
  }

  function handleNavItem(route: string | null) {
    closePanel()
    if (route) {
      setTimeout(() => router.push(route as any), 50)
    }
  }

  return (
    <PanelContext.Provider value={{ openPanel, closePanel }}>
      <View style={styles.root}>
        {/* Main stack content */}
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: '#080808' },
            animation: 'none',
          }}
        />

        {/* Overlay */}
        {panelOpen && (
          <Animated.View
            style={[styles.overlay, { opacity: overlayAnim }]}
            pointerEvents="auto"
          >
            <Pressable style={StyleSheet.absoluteFill} onPress={closePanel} />
          </Animated.View>
        )}

        {/* Side panel */}
        <Animated.View
          style={[
            styles.panel,
            { width: panelWidth, transform: [{ translateX: slideAnim }] },
          ]}
        >
          {/* Provider mini profile */}
          <View style={[styles.panelProfile, { paddingTop: insets.top + 16 }]}>
            {providerProfile?.profile_photo_url ? (
              <Image
                source={{ uri: providerProfile.profile_photo_url }}
                style={styles.panelAvatarImg}
              />
            ) : (
              <View style={[styles.panelAvatar, styles.panelAvatarFallback]}>
                <Text style={styles.panelAvatarInitial}>{avatarInitial}</Text>
              </View>
            )}
            <Text style={styles.panelName} numberOfLines={1}>
              {displayName}
            </Text>
            {metaLine.length > 0 && (
              <Text style={styles.panelMeta} numberOfLines={1}>
                {metaLine}
              </Text>
            )}
            <View style={styles.profileLinksRow}>
              <TouchableOpacity
                style={[
                  styles.viewProfileLink,
                  !providerProfile?.id && styles.viewProfileLinkDisabled,
                ]}
                activeOpacity={0.7}
                disabled={!providerProfile?.id}
                onPress={() => {
                  if (providerProfile?.id) {
                    handleNavItem('/providers/' + providerProfile.id)
                  }
                }}
              >
                <Text style={styles.viewProfileText}>View profile</Text>
                <Feather name="external-link" size={11} color="#C8922A" />
              </TouchableOpacity>
              <Text style={styles.profileLinksDot}>·</Text>
              <TouchableOpacity
                style={styles.viewProfileLink}
                activeOpacity={0.7}
                onPress={() => handleNavItem('/dashboard/provider/edit-profile')}
              >
                <Text style={styles.viewProfileText}>Edit profile</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Nav items */}
          <ScrollView
            style={styles.panelScroll}
            showsVerticalScrollIndicator={false}
          >
            {NAV_SECTIONS.map((section) => (
              <View key={section.label}>
                <Text style={styles.navSectionLabel}>{section.label}</Text>
                {section.items.map((item) => (
                  <TouchableOpacity
                    key={item.label}
                    style={styles.navItem}
                    activeOpacity={0.7}
                    onPress={() => handleNavItem(item.route)}
                  >
                    <Feather
                      name={item.icon as any}
                      size={20}
                      color="rgba(240,232,213,0.35)"
                    />
                    <Text style={styles.navLabel}>{item.label}</Text>
                    {item.badge && (
                      <View style={styles.navBadge}>
                        <Text style={styles.navBadgeText}>{item.badge}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Bottom actions */}
          <View style={[styles.panelBottom, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={styles.switchModeRow}
              activeOpacity={0.7}
              onPress={() => {
                closePanel()
                setTimeout(() => router.replace('/(tabs)/'), 50)
              }}
            >
              <Feather name="repeat" size={16} color="rgba(240,232,213,0.4)" />
              <Text style={styles.switchModeText}>Switch to client mode</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.signOutRow}
              activeOpacity={0.7}
              onPress={() => {
                Alert.alert(
                  'Sign Out',
                  'Are you sure you want to sign out?',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Sign Out',
                      style: 'destructive',
                      onPress: async () => {
                        closePanel()
                        await supabase.auth.signOut()
                        router.replace('/')
                      },
                    },
                  ],
                )
              }}
            >
              <Feather name="log-out" size={18} color="rgba(240,232,213,0.35)" />
              <Text style={styles.signOutText}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </PanelContext.Provider>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 40,
  },
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#0A0A0A',
    zIndex: 50,
    borderRightWidth: 1,
    borderRightColor: 'rgba(240,232,213,0.06)',
  },
  panelProfile: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  panelAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  panelAvatarFallback: {
    backgroundColor: '#1A1410',
  },
  panelAvatarInitial: {
    fontSize: 22,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  panelAvatarImg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1A1410',
  },
  panelName: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginTop: 10,
  },
  panelMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  profileLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  profileLinksDot: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
  },
  viewProfileLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewProfileLinkDisabled: {
    opacity: 0.4,
  },
  viewProfileText: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_500Medium',
  },
  panelScroll: {
    flex: 1,
    paddingTop: 12,
  },
  navSectionLabel: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 6,
    fontSize: 9,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
  },
  navLabel: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
    flex: 1,
  },
  navBadge: {
    position: 'absolute',
    right: 16,
    backgroundColor: '#C8922A',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  navBadgeText: {
    fontSize: 10,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  panelBottom: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  switchModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchModeText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  signOutRow: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    marginTop: 8,
    marginHorizontal: -20,
  },
  signOutText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
  },
})
