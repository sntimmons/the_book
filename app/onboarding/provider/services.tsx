import { useState, useRef, useEffect } from 'react'
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TouchableOpacity,
  Switch,
  Modal,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useProviderStore } from '@/store/providerStore'

const DURATION_PILLS = ['30 min', '45 min', '1 hr', '1.5 hr', '2 hr', '3 hr', '4 hr+', 'Custom']

interface AddOn {
  name: string
  extraTime: string
  extraPrice: string
}

interface Service {
  id: string
  name: string
  price: string
  duration: string
  depositRequired: boolean
  depositAmount: string
  addOns: AddOn[]
}

export default function ProviderServices() {
  const insets = useSafeAreaInsets()
  const scrollRef = useRef<ScrollView>(null)

  const { services, setServices } = useProviderStore()
  const [showAddService, setShowAddService] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  // Draft fields
  const [draftName, setDraftName] = useState('')
  const [draftPrice, setDraftPrice] = useState('')
  const [draftDuration, setDraftDuration] = useState('')
  const [draftCustomDuration, setDraftCustomDuration] = useState('')
  const [draftDepositRequired, setDraftDepositRequired] = useState(false)
  const [draftDepositAmount, setDraftDepositAmount] = useState('')
  const [draftAddOns, setDraftAddOns] = useState<AddOn[]>([])
  const [showAddOnInput, setShowAddOnInput] = useState(false)
  const [addonName, setAddonName] = useState('')
  const [addonTime, setAddonTime] = useState('')
  const [addonPrice, setAddonPrice] = useState('')

  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false })
    }, 0)
    return () => clearTimeout(t)
  }, [])

  function resetDraft() {
    setDraftName('')
    setDraftPrice('')
    setDraftDuration('')
    setDraftCustomDuration('')
    setDraftDepositRequired(false)
    setDraftDepositAmount('')
    setDraftAddOns([])
    setShowAddOnInput(false)
    setAddonName('')
    setAddonTime('')
    setAddonPrice('')
    setEditingId(null)
  }

  function openEdit(service: Service) {
    setDraftName(service.name)
    setDraftPrice(service.price)
    // If duration matches a pill label use it, otherwise Custom
    const pillMatch = DURATION_PILLS.slice(0, -1).includes(service.duration)
    setDraftDuration(pillMatch ? service.duration : 'Custom')
    setDraftCustomDuration(pillMatch ? '' : service.duration)
    setDraftDepositRequired(service.depositRequired)
    setDraftDepositAmount(service.depositAmount)
    setDraftAddOns(service.addOns)
    setEditingId(service.id)
    setShowAddService(true)
  }

  function saveService() {
    if (!draftName.trim() || !draftPrice.trim()) return
    const resolvedDuration = draftDuration === 'Custom' ? draftCustomDuration : draftDuration

    if (editingId) {
      setServices(
        services.map((s) =>
          s.id === editingId
            ? {
                ...s,
                name: draftName.trim(),
                price: draftPrice,
                duration: resolvedDuration,
                depositRequired: draftDepositRequired,
                depositAmount: draftDepositAmount,
                addOns: draftAddOns,
              }
            : s
        )
      )
    } else {
      const newService: Service = {
        id: Date.now().toString(),
        name: draftName.trim(),
        price: draftPrice,
        duration: resolvedDuration,
        depositRequired: draftDepositRequired,
        depositAmount: draftDepositAmount,
        addOns: draftAddOns,
      }
      setServices([...services, newService])
    }

    setShowAddService(false)
    resetDraft()
  }

  function removeService(id: string) {
    setServices(services.filter((s) => s.id !== id))
  }

  function saveAddOn() {
    if (!addonName.trim() || !addonTime.trim() || !addonPrice.trim()) return
    setDraftAddOns((prev) => [
      ...prev,
      { name: addonName.trim(), extraTime: addonTime.trim(), extraPrice: addonPrice.trim() },
    ])
    setAddonName('')
    setAddonTime('')
    setAddonPrice('')
    setShowAddOnInput(false)
  }

  function removeAddOn(index: number) {
    setDraftAddOns((prev) => prev.filter((_, i) => i !== index))
  }

  const canSave = draftName.trim().length > 0 && draftPrice.trim().length > 0
  const canContinue = services.length >= 1

  return (
    <View style={styles.root}>
      {/* Progress bar: 50% */}
      <View style={styles.progressTrack}>
        <View style={styles.progressFill} />
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: insets.top + 16 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
          style={styles.backBtn}
        >
          <Feather name="chevron-left" size={18} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarLabel}>Your services</Text>
        <Text style={styles.topBarStep}>Step 4 of 8</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 160 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustContentInsets={false}
      >
        <Text style={styles.headline}>What do you offer?</Text>
        <Text style={styles.subtext}>
          Add the services clients can book. You can always edit these later.
        </Text>

        {/* Service cards */}
        {services.length === 0 ? (
          <View style={styles.emptyState}>
            <Feather name="briefcase" size={36} color="rgba(240,232,213,0.12)" />
            <Text style={styles.emptyTitle}>No services yet</Text>
            <Text style={styles.emptySub}>Add at least one service to continue.</Text>
          </View>
        ) : (
          services.map((service) => (
            <View key={service.id} style={styles.serviceCard}>
              {/* Top row */}
              <View style={styles.cardTopRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName}>{service.name}</Text>
                  {service.duration ? (
                    <Text style={styles.cardDuration}>{service.duration}</Text>
                  ) : null}
                </View>
                <View style={styles.cardTopRight}>
                  <Text style={styles.cardPrice}>${service.price}</Text>
                  <Pressable style={styles.editBtn} onPress={() => openEdit(service)}>
                    <Feather name="edit-2" size={13} color="rgba(240,232,213,0.5)" />
                  </Pressable>
                </View>
              </View>

              {/* Deposit */}
              {service.depositRequired && service.depositAmount ? (
                <View style={styles.depositRow}>
                  <Feather name="shield" size={12} color="#C8922A" />
                  <Text style={styles.depositText}>
                    Deposit required: ${service.depositAmount}
                  </Text>
                </View>
              ) : null}

              {/* Add-ons */}
              {service.addOns.length > 0 && (
                <View>
                  <Text style={styles.addOnsLabel}>ADD-ONS</Text>
                  {service.addOns.map((addon, i) => (
                    <View key={i} style={styles.addonRow}>
                      <Text style={styles.addonName}>{addon.name}</Text>
                      <Text style={styles.addonMeta}>
                        +{addon.extraTime} · +${addon.extraPrice}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Delete */}
              <Pressable style={styles.deleteRow} onPress={() => removeService(service.id)}>
                <Text style={styles.deleteText}>Remove service</Text>
              </Pressable>
            </View>
          ))
        )}

        {/* Add service button */}
        <TouchableOpacity
          activeOpacity={0.7}
          style={styles.addBtn}
          onPress={() => { resetDraft(); setShowAddService(true) }}
        >
          <Feather name="plus" size={16} color="rgba(240,232,213,0.4)" />
          <Text style={styles.addBtnText}>Add a service</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Fixed CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        {services.length > 0 && (
          <View style={styles.countPillWrap}>
            <View style={styles.countPill}>
              <Text style={styles.countPillText}>
                {services.length} {services.length === 1 ? 'service' : 'services'} added
              </Text>
            </View>
          </View>
        )}
        <Pressable
          style={[styles.continueBtn, !canContinue && styles.continueBtnInactive]}
          onPress={() => { if (canContinue) router.push('/onboarding/provider/availability') }}
        >
          <Text style={[styles.continueBtnText, !canContinue && styles.continueBtnTextInactive]}>
            Continue
          </Text>
        </Pressable>
        <Text style={styles.ctaNote}>At least one service required to go live.</Text>
      </View>

      {/* Add service modal */}
      <Modal
        visible={showAddService}
        animationType="slide"
        transparent
        onRequestClose={() => { setShowAddService(false); resetDraft() }}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => { setShowAddService(false); resetDraft() }}
          />
          <View style={[styles.modalSheet, { paddingBottom: 0 }]}>
            {/* Handle */}
            <View style={styles.modalHandle} />

            {/* Modal header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingId ? 'Edit service' : 'Add a service'}
              </Text>
              <Pressable
                style={styles.modalCloseBtn}
                onPress={() => { setShowAddService(false); resetDraft() }}
              >
                <Feather name="x" size={14} color="rgba(240,232,213,0.5)" />
              </Pressable>
            </View>

            {/* Modal scroll */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.modalScrollContent}
            >
              {/* Service name */}
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>SERVICE NAME</Text>
                <View style={styles.modalInputWrap}>
                  <TextInput
                    style={styles.modalInput}
                    value={draftName}
                    onChangeText={setDraftName}
                    placeholder="Classic Full Set"
                    placeholderTextColor="rgba(240,232,213,0.25)"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              {/* Price */}
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>PRICE</Text>
                <View style={[styles.modalInputWrap, styles.rowInputWrap]}>
                  <Text style={styles.prefix}>$</Text>
                  <TextInput
                    style={[styles.modalInput, { flex: 1 }]}
                    value={draftPrice}
                    onChangeText={setDraftPrice}
                    keyboardType="decimal-pad"
                    placeholder="145"
                    placeholderTextColor="rgba(240,232,213,0.25)"
                  />
                </View>
              </View>

              {/* Duration */}
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>DURATION</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.durationPillRow}
                >
                  {DURATION_PILLS.map((pill) => (
                    <Pressable
                      key={pill}
                      style={[
                        styles.durationPill,
                        draftDuration === pill && styles.durationPillActive,
                      ]}
                      onPress={() => setDraftDuration(pill)}
                    >
                      <Text
                        style={[
                          styles.durationPillText,
                          draftDuration === pill && styles.durationPillTextActive,
                        ]}
                      >
                        {pill}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {draftDuration === 'Custom' && (
                  <View style={[styles.modalInputWrap, { marginTop: 10 }]}>
                    <TextInput
                      style={styles.modalInput}
                      value={draftCustomDuration}
                      onChangeText={setDraftCustomDuration}
                      placeholder="e.g. 90 minutes"
                      placeholderTextColor="rgba(240,232,213,0.25)"
                    />
                  </View>
                )}
              </View>

              {/* Deposit */}
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>REQUIRE A DEPOSIT</Text>
                <View style={styles.depositToggleRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.depositToggleTitle}>Deposit required</Text>
                    <Text style={styles.depositToggleSub}>Charged at booking confirmation</Text>
                  </View>
                  <Switch
                    value={draftDepositRequired}
                    onValueChange={setDraftDepositRequired}
                    trackColor={{ false: 'rgba(240,232,213,0.15)', true: 'rgba(240,232,213,0.5)' }}
                    thumbColor={draftDepositRequired ? '#F0E8D5' : 'rgba(240,232,213,0.4)'}
                    ios_backgroundColor="rgba(240,232,213,0.15)"
                  />
                </View>

                {draftDepositRequired && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={[styles.modalFieldLabel, { marginBottom: 8 }]}>
                      DEPOSIT AMOUNT
                    </Text>
                    <View style={[styles.modalInputWrap, styles.rowInputWrap]}>
                      <Text style={styles.prefix}>$</Text>
                      <TextInput
                        style={[styles.modalInput, { flex: 1 }]}
                        value={draftDepositAmount}
                        onChangeText={setDraftDepositAmount}
                        keyboardType="decimal-pad"
                        placeholder="45"
                        placeholderTextColor="rgba(240,232,213,0.25)"
                      />
                    </View>
                    <Text style={styles.helper}>Deducted from total at appointment.</Text>
                  </View>
                )}
              </View>

              {/* Add-ons */}
              <View style={styles.modalField}>
                <Text style={styles.modalFieldLabel}>ADD-ONS (OPTIONAL)</Text>
                <Text style={styles.addOnHelperText}>
                  Extra time or options clients can add when booking this service.
                </Text>

                {draftAddOns.map((addon, i) => (
                  <View key={i} style={styles.addonListRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.addonListName}>{addon.name}</Text>
                      <Text style={styles.addonListMeta}>
                        +{addon.extraTime} · +${addon.extraPrice}
                      </Text>
                    </View>
                    <Pressable
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      onPress={() => removeAddOn(i)}
                    >
                      <Feather name="x" size={14} color="rgba(240,232,213,0.3)" />
                    </Pressable>
                  </View>
                ))}

                {showAddOnInput ? (
                  <View style={styles.addonInputRow}>
                    <TextInput
                      style={[styles.addonInput, { flex: 1 }]}
                      value={addonName}
                      onChangeText={setAddonName}
                      placeholder="e.g. Extra length"
                      placeholderTextColor="rgba(240,232,213,0.2)"
                    />
                    <TextInput
                      style={[styles.addonInput, styles.addonInputShort]}
                      value={addonTime}
                      onChangeText={setAddonTime}
                      placeholder="+30 min"
                      placeholderTextColor="rgba(240,232,213,0.2)"
                    />
                    <TextInput
                      style={[styles.addonInput, styles.addonInputShort]}
                      value={addonPrice}
                      onChangeText={setAddonPrice}
                      keyboardType="decimal-pad"
                      placeholder="+$50"
                      placeholderTextColor="rgba(240,232,213,0.2)"
                    />
                    <Pressable style={styles.addonSaveBtn} onPress={saveAddOn}>
                      <Feather name="check" size={16} color="#F0E8D5" />
                    </Pressable>
                  </View>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    style={styles.addAddonBtn}
                    onPress={() => setShowAddOnInput(true)}
                  >
                    <Feather name="plus" size={14} color="rgba(240,232,213,0.3)" />
                    <Text style={styles.addAddonText}>Add an option</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>

            {/* Save button */}
            <View style={[styles.modalSaveWrap, { paddingBottom: insets.bottom + 16 }]}>
              <Pressable
                style={[styles.saveBtn, !canSave && styles.saveBtnInactive]}
                onPress={saveService}
              >
                <Text style={[styles.saveBtnText, !canSave && styles.saveBtnTextInactive]}>
                  Save Service
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#080808',
  },
  progressTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.1)',
    zIndex: 10,
  },
  progressFill: {
    width: '50%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 12,
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
  topBarLabel: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  topBarStep: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  headline: {
    fontSize: 30,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 36,
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 32,
  },

  // Empty state
  emptyState: {
    paddingVertical: 48,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_500Medium',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 4,
    textAlign: 'center',
  },

  // Service card
  serviceCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 16,
    marginBottom: 12,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardName: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },
  cardDuration: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 3,
  },
  cardTopRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardPrice: {
    fontSize: 17,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  editBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(240,232,213,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  depositText: {
    fontSize: 12,
    color: '#C8922A',
    fontFamily: 'Manrope_400Regular',
  },
  addOnsLabel: {
    fontSize: 9,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  addonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  addonName: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_400Regular',
  },
  addonMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
  },
  deleteRow: {
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.05)',
  },
  deleteText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
  },

  // Add service button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(240,232,213,0.15)',
    borderRadius: 12,
    backgroundColor: 'rgba(240,232,213,0.03)',
    marginTop: 4,
    marginBottom: 32,
  },
  addBtnText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },

  // CTA
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
  countPillWrap: {
    alignItems: 'center',
    marginBottom: 12,
  },
  countPill: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  countPillText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_500Medium',
  },
  continueBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  continueBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  continueBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  continueBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
  ctaNote: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.25)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    marginTop: 10,
  },

  // Modal
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  modalSheet: {
    backgroundColor: '#0D0D0D',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '92%',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(240,232,213,0.15)',
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  modalHeader: {
    paddingHorizontal: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(240,232,213,0.07)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalScrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  modalField: {
    marginBottom: 20,
  },
  modalFieldLabel: {
    fontSize: 10,
    color: 'rgba(240,232,213,0.4)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  modalInputWrap: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  rowInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  modalInput: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
  },
  prefix: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_500Medium',
  },


  // Duration pills
  durationPillRow: {
    gap: 8,
    paddingVertical: 2,
  },
  durationPill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    backgroundColor: 'transparent',
  },
  durationPillActive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
    borderColor: 'rgba(240,232,213,0.3)',
  },
  durationPillText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  durationPillTextActive: {
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
  },

  // Deposit toggle
  depositToggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 12,
  },
  depositToggleTitle: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  depositToggleSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  helper: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 6,
  },

  // Add-ons in modal
  addOnHelperText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 17,
    marginBottom: 12,
  },
  addonListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  addonListName: {
    fontSize: 14,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  addonListMeta: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_400Regular',
  },
  addonInputRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    alignItems: 'center',
  },
  addonInput: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.1)',
    borderRadius: 10,
    height: 44,
    paddingHorizontal: 12,
    fontSize: 13,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  addonInputShort: {
    width: 80,
  },
  addonSaveBtn: {
    width: 36,
    height: 44,
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addAddonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingVertical: 4,
  },
  addAddonText: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.35)',
    fontFamily: 'Manrope_400Regular',
  },

  // Modal save
  modalSaveWrap: {
    backgroundColor: '#0D0D0D',
    paddingHorizontal: 24,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.06)',
  },
  saveBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  saveBtnInactive: {
    backgroundColor: 'rgba(240,232,213,0.12)',
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  saveBtnTextInactive: {
    color: 'rgba(240,232,213,0.35)',
  },
})
