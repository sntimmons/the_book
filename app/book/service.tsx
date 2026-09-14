import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { router } from 'expo-router'
import { useBookingStore } from '@/store/bookingStore'
import { bookingProgressLabel } from '@/lib/bookingProgress'
import { useTheme } from '@/context/ThemeContext'
import BookingFlowScreen, {
  BookingFlowHeading,
  BookingFlowNote,
} from '@/components/ui/BookingFlowScreen'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import { useProvider, Service } from '../../hooks/useProviders'

export default function BookService() {
  const { colors } = useTheme()
  const {
    providerId,
    providerName,
    providerCategory,
    providerLocation,
    setSelectedService,
    contractRequired,
  } = useBookingStore()
  const { services, loading } = useProvider(providerId)
  // Seeded from the store so a service preselected at the booking-start boundary
  // (lib/startBooking) shows as selected here. This screen still owns selection
  // and Continue is still gated on it — the seed only stops the step forgetting
  // a choice the client already made one screen earlier.
  const [selectedId, setSelectedId] = useState<string | null>(
    useBookingStore.getState().selectedService?.id ?? null,
  )

  useEffect(() => {
    if (!providerId) {
      router.replace('/(tabs)/' as never)
    }
  }, [providerId])

  // ── WHY THE STEP TOTAL IS NOT RESOLVED HERE ─────────────────────────────
  //
  // The obvious move is to ask, on this screen, whether this provider has a
  // contract — the provider id is known, and then every later screen could show
  // "Step N of 6". **It cannot be done safely, and trying is a known trap.**
  //
  // `fetchProviderContract` reads `contracts` directly, and that table's RLS is
  // `auth.uid() = user_id OR is_contract_signer(id)` — the owner, or somebody who
  // has ALREADY signed. A first-time client is neither, so the read returns **zero
  // rows and no error**. lib/contracts.ts records that this exact false negative
  // once "skipped the signing gate entirely for every client, every provider,
  // always". Asking here would reintroduce it as a progress claim: the indicator
  // would confidently promise five steps to a client who will take six.
  //
  // `contract_for_booking` is the safe read, and it is keyed on a BOOKING that does
  // not exist until the contract step creates it — deliberately, so nobody holds a
  // standing read path into other providers' terms.
  //
  // So the total stays unknown until the contract step establishes it, and
  // `lib/bookingProgress.ts` renders "Step 1" with no total rather than guessing.
  // An unknown total is honest; a wrong one is the thing this whole task is fixing.
  // Making it knowable from step 1 needs a narrow boolean RPC — a product decision,
  // recorded in the handoff rather than taken here.


  const activeServices = services.filter((s) => s.is_active)

  function handleSelect(service: Service) {
    setSelectedId(service.id)
    setSelectedService({
      id: service.id,
      name: service.name,
      price: service.price.toFixed(2),
      duration: `${service.duration_minutes} min`,
      depositRequired: false,
      depositAmount: '0',
      addOns: [],
    })
  }

  const selectedService = activeServices.find((s) => s.id === selectedId)

  return (
    <BookingFlowScreen
      progressLabel={bookingProgressLabel('service', contractRequired)}
      onBack={() => router.back()}
      testID="book-service"
      footer={
        <>
          {selectedService ? (
            <View style={styles.selectedSummary}>
              <Text style={[styles.selectedSummaryName, { color: colors.textPrimary }]}>
                {selectedService.name}
              </Text>
              <Text style={[styles.selectedSummaryPrice, { color: colors.textPrimary }]}>
                ${selectedService.price.toFixed(0)}
              </Text>
            </View>
          ) : null}
          <Button
            label="Continue"
            disabled={!selectedId}
            onPress={() => selectedId && router.push('/book/datetime')}
            testID="book-service-continue"
          />
        </>
      }
    >
      <BookingFlowHeading
        title="What do you need?"
        subtitle={`${providerName} · ${providerCategory} · ${providerLocation}`}
      />

      {/* PRODUCT TRUTH: this badge read "Only charged when your provider says
          yes" beside a padlock and "Secure booking". Both claimed a payment
          system that does not exist — nothing is ever charged, and "secure"
          there meant payment protection, not account security (PD-042). */}
      <BookingFlowNote
        title="No in-app payment in this beta"
        body={`Prices are set by ${providerName}. You pay them directly.`}
      />

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.textSecondary} />
        </View>
      ) : activeServices.length === 0 ? (
        <EmptyState
          title="No services listed yet."
          body="This provider has not added services."
          testID="book-service-empty"
        />
      ) : (
        <View style={styles.serviceList}>
          {activeServices.map((service) => {
            const isSelected = selectedId === service.id
            return (
              <TouchableOpacity
                key={service.id}
                style={[
                  styles.serviceCard,
                  {
                    backgroundColor: colors.bgSurface,
                    borderColor: isSelected ? colors.actionPrimary : colors.borderSubtle,
                    borderWidth: isSelected ? 1.5 : 1,
                  },
                ]}
                activeOpacity={0.8}
                onPress={() => handleSelect(service)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={`${service.name}, ${service.duration_minutes} minutes, $${service.price.toFixed(0)}`}
                testID={`book-service-option-${service.id}`}
              >
                <View style={styles.serviceLeft}>
                  {/* Long service names wrap; nothing here is height-locked. */}
                  <Text style={[styles.serviceName, { color: colors.textPrimary }]}>
                    {service.name}
                  </Text>
                  <Text style={[styles.durationText, { color: colors.textSecondary }]}>
                    {service.duration_minutes} min
                  </Text>
                  {service.description ? (
                    <Text
                      style={[styles.descText, { color: colors.textSecondary }]}
                      numberOfLines={2}
                    >
                      {service.description}
                    </Text>
                  ) : null}
                </View>
                <Text style={[styles.servicePrice, { color: colors.textPrimary }]}>
                  ${service.price.toFixed(0)}
                </Text>
                {/* Selection is carried by the radio AND the accessibility state,
                    never by colour alone. */}
                <View
                  style={[
                    styles.radio,
                    {
                      borderColor: isSelected ? colors.actionPrimary : colors.borderSubtle,
                      borderWidth: isSelected ? 6 : 1.5,
                    },
                  ]}
                />
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </BookingFlowScreen>
  )
}

// Geometry only. Colour arrives from the theme at render time.
const styles = StyleSheet.create({
  loadingWrap: { paddingVertical: 48, alignItems: 'center' },
  serviceList: { gap: 12 },
  serviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 64,
  },
  serviceLeft: { flex: 1, gap: 3 },
  serviceName: { fontSize: 18, lineHeight: 24, fontFamily: 'Manrope_600SemiBold' },
  durationText: { fontSize: 11, lineHeight: 15, fontFamily: 'Manrope_500Medium' },
  descText: { fontSize: 13, lineHeight: 18, fontFamily: 'Manrope_400Regular' },
  servicePrice: { fontSize: 18, lineHeight: 24, fontFamily: 'Manrope_600SemiBold' },
  radio: { width: 20, height: 20, borderRadius: 10 },
  selectedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  selectedSummaryName: { fontSize: 13, lineHeight: 18, fontFamily: 'Manrope_400Regular', flex: 1 },
  selectedSummaryPrice: { fontSize: 13, lineHeight: 18, fontFamily: 'Manrope_600SemiBold' },
})
