import { useState } from 'react'
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useBookingStore } from '@/store/bookingStore'
import { useProvider, Service } from '../../hooks/useProviders'

export default function BookService() {
  const insets = useSafeAreaInsets()
  const {
    providerId,
    providerName,
    providerCategory,
    providerLocation,
    setSelectedService,
  } = useBookingStore()
  const { services, loading } = useProvider(providerId)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const activeServices = services.filter((s) => s.is_active)

  function handleSelect(service: Service) {
    setSelectedId(service.id)
    setSelectedService({
      id: service.id,
      name: service.name,
      price: (service.price / 100).toFixed(2),
      duration: `${service.duration_minutes} min`,
      depositRequired: false,
      depositAmount: '0',
    })
  }

  const selectedService = activeServices.find((s) => s.id === selectedId)

  return (
    <View style={styles.root}>
      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          activeOpacity={0.7}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>Select a Service</Text>
        <View style={styles.topBarSpacer} />
      </View>

      {/* Provider strip */}
      <View style={styles.providerStrip}>
        <View style={styles.providerAvatar}>
          <Feather name="user" size={16} color="rgba(240,232,213,0.4)" />
        </View>
        <View style={styles.providerInfo}>
          <Text style={styles.providerName}>{providerName}</Text>
          <Text style={styles.providerMeta}>
            {providerCategory} · {providerLocation}
          </Text>
        </View>
      </View>

      {/* Trust badge */}
      <View style={styles.trustBadge}>
        <Feather name="shield" size={12} color="#4CAF50" />
        <Text style={styles.trustBadgeMain}>Only charged when your provider says yes</Text>
        <View style={styles.trustDot} />
        <Feather name="lock" size={12} color="rgba(240,232,213,0.3)" />
        <Text style={styles.trustBadgeSub}>Secure booking</Text>
      </View>

      {/* Services list */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 140 }]}
      >
        <Text style={styles.sectionLabel}>ALL SERVICES</Text>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color="rgba(240,232,213,0.4)" />
          </View>
        ) : activeServices.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>No services listed yet.</Text>
            <Text style={styles.emptySub}>
              This provider has not added services.
            </Text>
          </View>
        ) : (
          activeServices.map((service) => {
            const isSelected = selectedId === service.id
            return (
              <TouchableOpacity
                key={service.id}
                style={[styles.serviceCard, isSelected && styles.serviceCardSelected]}
                activeOpacity={0.8}
                onPress={() => handleSelect(service)}
              >
                <View style={styles.serviceTopRow}>
                  <View style={styles.serviceLeft}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <View style={styles.durationRow}>
                      <Feather name="clock" size={11} color="rgba(240,232,213,0.45)" />
                      <Text style={styles.durationText}>{service.duration_minutes} min</Text>
                    </View>
                    {service.description ? (
                      <Text style={styles.descText} numberOfLines={2}>
                        {service.description}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.serviceRight}>
                    <Text style={styles.servicePrice}>
                      ${(service.price / 100).toFixed(0)}
                    </Text>
                  </View>
                </View>

                {isSelected && (
                  <View style={styles.selectedIndicator}>
                    <Feather name="check-circle" size={14} color="#4CAF50" />
                    <Text style={styles.selectedText}>Selected</Text>
                  </View>
                )}
              </TouchableOpacity>
            )
          })
        )}
      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        {selectedService && (
          <View style={styles.selectedSummary}>
            <Text style={styles.selectedSummaryName}>{selectedService.name}</Text>
            <Text style={styles.selectedSummaryPrice}>
              ${(selectedService.price / 100).toFixed(0)}
            </Text>
          </View>
        )}
        <Pressable
          style={[styles.nextBtn, !selectedId && styles.nextBtnInactive]}
          onPress={() => selectedId && router.push('/book/datetime')}
        >
          <Text style={[styles.nextBtnText, !selectedId && styles.nextBtnTextInactive]}>
            Next: Schedule Your Appointment
          </Text>
        </Pressable>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 4,
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
  topBarTitle: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  topBarSpacer: {
    width: 36,
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
    backgroundColor: 'rgba(76,175,80,0.04)',
  },
  trustBadgeMain: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
  },
  trustDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(240,232,213,0.2)',
  },
  trustBadgeSub: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
  },
  providerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  providerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(240,232,213,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  providerMeta: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
    marginTop: 4,
  },
  loadingWrap: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
  },
  emptySub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
  serviceCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1.5,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
    marginBottom: 10,
  },
  serviceCardSelected: {
    borderColor: 'rgba(240,232,213,0.25)',
    backgroundColor: 'rgba(240,232,213,0.06)',
  },
  serviceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  serviceLeft: {
    flex: 1,
    marginRight: 12,
  },
  serviceName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  durationText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  descText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
    lineHeight: 17,
  },
  serviceRight: {
    alignItems: 'flex-end',
  },
  servicePrice: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  selectedIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.08)',
  },
  selectedText: {
    fontSize: 12,
    color: '#4CAF50',
    fontFamily: 'Manrope_500Medium',
  },
  cta: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#080808',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  selectedSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  selectedSummaryName: {
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  selectedSummaryPrice: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  nextBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  nextBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  nextBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
})
