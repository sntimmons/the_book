import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { DoneAccessory, DONE_ACCESSORY_ID } from '../../../components/DoneAccessory'

interface Service {
  id: string
  provider_id: string
  name: string
  description: string | null
  price: number
  duration_minutes: number
  is_active: boolean
  deposit_required: boolean | null
  deposit_type: DepositType | null
  deposit_amount: number | null
  created_at: string
}

type DepositType = 'fixed' | 'percentage'

interface ServiceForm {
  id?: string
  name: string
  description: string
  price: string
  duration: string
  isActive: boolean
  depositRequired: boolean
  depositType: DepositType
  depositAmount: string
}

const EMPTY_FORM: ServiceForm = {
  name: '',
  description: '',
  price: '',
  duration: '60',
  isActive: true,
  depositRequired: false,
  depositType: 'fixed',
  depositAmount: '',
}

const DURATION_OPTIONS = [
  { label: '30 min', value: '30' },
  { label: '45 min', value: '45' },
  { label: '60 min', value: '60' },
  { label: '75 min', value: '75' },
  { label: '90 min', value: '90' },
  { label: '2 hours', value: '120' },
  { label: '3 hours', value: '180' },
  { label: '4 hours', value: '240' },
]

function durationLabel(value: string): string {
  const match = DURATION_OPTIONS.find((d) => d.value === value)
  if (match) return match.label
  const mins = parseInt(value, 10)
  if (!isNaN(mins)) {
    if (mins >= 60 && mins % 60 === 0) {
      const hrs = mins / 60
      return hrs === 1 ? '1 hour' : hrs + ' hours'
    }
    return mins + ' min'
  }
  return '60 min'
}

export default function ProviderServicesScreen() {
  const { user } = useAuth()
  const insets = useSafeAreaInsets()

  const [providerDbId, setProviderDbId] = useState<string | null>(null)
  const [services, setServices] = useState<Service[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingService, setEditingService] = useState<ServiceForm>(EMPTY_FORM)
  const [isEditing, setIsEditing] = useState(false)
  const [showDurationSheet, setShowDurationSheet] = useState(false)

  useEffect(() => {
    if (!user) return
    fetchServices()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function fetchServices() {
    if (!user) return
    try {
      setLoading(true)
      const { data: provider } = await supabase
        .from('providers')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!provider) {
        setLoading(false)
        return
      }

      setProviderDbId(provider.id)

      const { data: svcs, error } = await supabase
        .from('provider_services')
        .select('*')
        .eq('provider_id', provider.id)
        .order('created_at', { ascending: true })

      if (error) {
        console.log('Services error:', error)
        setLoading(false)
        return
      }

      setServices((svcs || []) as Service[])
    } catch (err) {
      console.log('Fetch services error:', err)
    } finally {
      setLoading(false)
    }
  }

  function handleAddService() {
    setEditingService(EMPTY_FORM)
    setIsEditing(false)
    setShowForm(true)
  }

  function handleEditService(service: Service) {
    setEditingService({
      id: service.id,
      name: service.name,
      description: service.description || '',
      price: service.price.toString(),
      duration: service.duration_minutes.toString(),
      isActive: service.is_active,
      depositRequired: service.deposit_required ?? false,
      depositType: service.deposit_type ?? 'fixed',
      depositAmount:
        service.deposit_amount != null && service.deposit_amount > 0
          ? service.deposit_amount.toString()
          : '',
    })
    setIsEditing(true)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingService(EMPTY_FORM)
  }

  async function handleSaveService() {
    if (!providerDbId) return

    if (!editingService.name.trim()) {
      Alert.alert('Name required', 'Please enter a service name.', [
        { text: 'OK' },
      ])
      return
    }

    const price = parseFloat(editingService.price)
    if (isNaN(price) || price <= 0) {
      Alert.alert(
        'Valid price required',
        'Please enter a price greater than zero.',
        [{ text: 'OK' }],
      )
      return
    }

    // Deposit validation only matters when a deposit is required.
    const depositAmount = parseFloat(editingService.depositAmount)
    if (editingService.depositRequired) {
      const isPct = editingService.depositType === 'percentage'
      if (isNaN(depositAmount) || depositAmount <= 0) {
        Alert.alert(
          'Valid deposit required',
          isPct
            ? 'Enter a deposit percentage greater than zero.'
            : 'Enter a deposit amount greater than zero.',
          [{ text: 'OK' }],
        )
        return
      }
      if (isPct && depositAmount > 100) {
        Alert.alert('Deposit too high', 'A percentage deposit cannot exceed 100%.', [
          { text: 'OK' },
        ])
        return
      }
      if (!isPct && depositAmount > price) {
        Alert.alert('Deposit too high', 'A deposit cannot exceed the service price.', [
          { text: 'OK' },
        ])
        return
      }
    }

    setSaving(true)

    const serviceData = {
      provider_id: providerDbId,
      name: editingService.name.trim(),
      description: editingService.description.trim() || null,
      price,
      duration_minutes: parseInt(editingService.duration, 10) || 60,
      is_active: editingService.isActive,
      deposit_required: editingService.depositRequired,
      deposit_type: editingService.depositType,
      deposit_amount: editingService.depositRequired && !isNaN(depositAmount) ? depositAmount : 0,
    }

    try {
      if (isEditing && editingService.id) {
        const { error } = await supabase
          .from('provider_services')
          .update(serviceData)
          .eq('id', editingService.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('provider_services')
          .insert(serviceData)
        if (error) throw error
      }

      closeForm()
      await fetchServices()
    } catch (err) {
      console.log('Save service error:', err)
      Alert.alert('Could not save', 'Something went wrong. Please try again.', [
        { text: 'OK' },
      ])
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(service: Service) {
    const next = !service.is_active
    setServices((prev) =>
      prev.map((s) => (s.id === service.id ? { ...s, is_active: next } : s)),
    )

    const { error } = await supabase
      .from('provider_services')
      .update({ is_active: next })
      .eq('id', service.id)

    if (error) {
      console.log('Toggle error:', error)
      setServices((prev) =>
        prev.map((s) =>
          s.id === service.id ? { ...s, is_active: !next } : s,
        ),
      )
    }
  }

  function handleDeleteService(service: Service) {
    Alert.alert(
      'Delete Service',
      'Delete "' + service.name + '"? This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('provider_services')
              .delete()
              .eq('id', service.id)
            if (error) {
              console.log('Delete error:', error)
              Alert.alert('Could not delete', 'Please try again.', [
                { text: 'OK' },
              ])
              return
            }
            setServices((prev) => prev.filter((s) => s.id !== service.id))
          },
        },
      ],
    )
  }

  const activeServices = services.filter((s) => s.is_active)
  const inactiveServices = services.filter((s) => !s.is_active)

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color="#F0E8D5" />
        </TouchableOpacity>
        <Text style={styles.topBarTitle}>My Services</Text>
        <TouchableOpacity
          onPress={handleAddService}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle" size={26} color="#C8922A" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: insets.bottom + 100,
          }}
        >
          {[0, 1, 2].map((i) => (
            <View key={i} style={[styles.serviceCard, styles.skeletonCard]}>
              <View style={styles.skeletonLineWide} />
              <View style={styles.skeletonLineNarrow} />
            </View>
          ))}
        </ScrollView>
      ) : services.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons
            name="cut-outline"
            size={48}
            color="rgba(240,232,213,0.15)"
            style={{ marginBottom: 16 }}
          />
          <Text style={styles.emptyTitle}>No services yet</Text>
          <Text style={styles.emptyBody}>
            Add your first service to start accepting bookings.
          </Text>
          <TouchableOpacity
            style={styles.emptyCta}
            activeOpacity={0.85}
            onPress={handleAddService}
          >
            <Text style={styles.emptyCtaText}>Add Service</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: 24,
            paddingTop: 8,
            paddingBottom: insets.bottom + 100,
          }}
        >
          {activeServices.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 8 }]}>ACTIVE</Text>
              {activeServices.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onEdit={handleEditService}
                  onDelete={handleDeleteService}
                  onToggle={handleToggleActive}
                />
              ))}
            </>
          )}
          {inactiveServices.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 24 }]}>
                INACTIVE
              </Text>
              {inactiveServices.map((service) => (
                <ServiceCard
                  key={service.id}
                  service={service}
                  onEdit={handleEditService}
                  onDelete={handleDeleteService}
                  onToggle={handleToggleActive}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}

      {showForm && (
        <>
          <Pressable style={styles.overlay} onPress={closeForm} />
          <View
            style={[
              styles.sheet,
              { paddingBottom: insets.bottom + 24 },
            ]}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={20}
            >
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>
                  {isEditing ? 'Edit Service' : 'Add Service'}
                </Text>
                <TouchableOpacity
                  onPress={closeForm}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name="close"
                    size={24}
                    color="rgba(240,232,213,0.5)"
                  />
                </TouchableOpacity>
              </View>

              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  paddingHorizontal: 24,
                  paddingBottom: 24,
                }}
              >
                <Text style={styles.fieldLabel}>SERVICE NAME</Text>
                <TextInput
                  style={styles.input}
                  value={editingService.name}
                  onChangeText={(v) =>
                    setEditingService((prev) => ({ ...prev, name: v }))
                  }
                  placeholder="Classic Full Set"
                  placeholderTextColor="rgba(240,232,213,0.25)"
                  autoFocus
                />

                <View style={styles.row}>
                  <View style={styles.half}>
                    <Text style={styles.fieldLabel}>PRICE</Text>
                    <View style={styles.priceWrap}>
                      <Text style={styles.priceDollar}>$</Text>
                      <TextInput
                        style={[styles.input, styles.priceInput]}
                        value={editingService.price}
                        onChangeText={(v) =>
                          setEditingService((prev) => ({ ...prev, price: v }))
                        }
                        placeholder="85"
                        placeholderTextColor="rgba(240,232,213,0.25)"
                        keyboardType="decimal-pad"
                        inputAccessoryViewID={DONE_ACCESSORY_ID}
                      />
                    </View>
                  </View>
                  <View style={styles.half}>
                    <Text style={styles.fieldLabel}>DURATION</Text>
                    <TouchableOpacity
                      style={[styles.input, styles.selectInput]}
                      activeOpacity={0.7}
                      onPress={() => setShowDurationSheet(true)}
                    >
                      <Text style={styles.selectText}>
                        {durationLabel(editingService.duration)}
                      </Text>
                      <Ionicons
                        name="chevron-down"
                        size={16}
                        color="rgba(240,232,213,0.5)"
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                  DESCRIPTION (OPTIONAL)
                </Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  value={editingService.description}
                  onChangeText={(v) =>
                    setEditingService((prev) => ({ ...prev, description: v }))
                  }
                  placeholder="What's included..."
                  placeholderTextColor="rgba(240,232,213,0.25)"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />

                <View style={styles.activeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeLabel}>Require deposit?</Text>
                    <Text style={styles.activeSub}>
                      Charged at booking confirmation
                    </Text>
                  </View>
                  <Toggle
                    value={editingService.depositRequired}
                    onChange={(next) =>
                      setEditingService((prev) => ({
                        ...prev,
                        depositRequired: next,
                      }))
                    }
                  />
                </View>

                {editingService.depositRequired ? (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: 16 }]}>DEPOSIT TYPE</Text>
                    <View style={styles.depositTypeRow}>
                      {(['fixed', 'percentage'] as DepositType[]).map((t) => {
                        const active = editingService.depositType === t
                        return (
                          <TouchableOpacity
                            key={t}
                            style={[styles.depositTypeBtn, active && styles.depositTypeBtnActive]}
                            activeOpacity={0.8}
                            onPress={() =>
                              setEditingService((prev) => ({ ...prev, depositType: t }))
                            }
                          >
                            <Text
                              style={
                                active ? styles.depositTypeTextActive : styles.depositTypeText
                              }
                            >
                              {t === 'fixed' ? 'Fixed amount' : 'Percentage'}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>

                    <Text style={[styles.fieldLabel, { marginTop: 16 }]}>
                      {editingService.depositType === 'percentage'
                        ? 'DEPOSIT PERCENTAGE'
                        : 'DEPOSIT AMOUNT'}
                    </Text>
                    <View style={styles.priceWrap}>
                      <Text style={styles.priceDollar}>
                        {editingService.depositType === 'percentage' ? '%' : '$'}
                      </Text>
                      <TextInput
                        style={[styles.input, styles.priceInput]}
                        value={editingService.depositAmount}
                        onChangeText={(v) =>
                          setEditingService((prev) => ({ ...prev, depositAmount: v }))
                        }
                        placeholder={editingService.depositType === 'percentage' ? '25' : '20'}
                        placeholderTextColor="rgba(240,232,213,0.25)"
                        keyboardType="decimal-pad"
                        inputAccessoryViewID={DONE_ACCESSORY_ID}
                      />
                    </View>
                  </>
                ) : null}

                <View style={styles.activeRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.activeLabel}>Active</Text>
                    <Text style={styles.activeSub}>
                      Clients can book this service
                    </Text>
                  </View>
                  <Toggle
                    value={editingService.isActive}
                    onChange={(next) =>
                      setEditingService((prev) => ({
                        ...prev,
                        isActive: next,
                      }))
                    }
                  />
                </View>

                <TouchableOpacity
                  style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                  activeOpacity={0.85}
                  disabled={saving}
                  onPress={handleSaveService}
                >
                  {saving ? (
                    <ActivityIndicator color="#080808" />
                  ) : (
                    <Text style={styles.saveBtnText}>
                      {isEditing ? 'Save Changes' : 'Add Service'}
                    </Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </>
      )}

      {showDurationSheet && (
        <>
          <Pressable
            style={styles.overlay}
            onPress={() => setShowDurationSheet(false)}
          />
          <View
            style={[
              styles.sheet,
              styles.durationSheet,
              { paddingBottom: insets.bottom + 24 },
            ]}
          >
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select Duration</Text>
              <TouchableOpacity
                onPress={() => setShowDurationSheet(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="close"
                  size={24}
                  color="rgba(240,232,213,0.5)"
                />
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingBottom: 8,
              }}
            >
              {DURATION_OPTIONS.map((opt) => {
                const selected = opt.value === editingService.duration
                return (
                  <TouchableOpacity
                    key={opt.value}
                    style={styles.durationRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      setEditingService((prev) => ({
                        ...prev,
                        duration: opt.value,
                      }))
                      setShowDurationSheet(false)
                    }}
                  >
                    <Text
                      style={[
                        styles.durationLabel,
                        selected && styles.durationLabelSelected,
                      ]}
                    >
                      {opt.label}
                    </Text>
                    {selected && (
                      <Ionicons name="checkmark" size={20} color="#C8922A" />
                    )}
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </>
      )}
      <DoneAccessory />
    </View>
  )
}

function ServiceCard({
  service,
  onEdit,
  onDelete,
  onToggle,
}: {
  service: Service
  onEdit: (s: Service) => void
  onDelete: (s: Service) => void
  onToggle: (s: Service) => void
}) {
  return (
    <View
      style={[styles.serviceCard, !service.is_active && styles.serviceCardInactive]}
    >
      <View style={styles.cardTopRow}>
        <View style={{ flex: 1, paddingRight: 8 }}>
          <Text style={styles.serviceName}>{service.name}</Text>
          {service.description ? (
            <Text style={styles.serviceDesc} numberOfLines={2}>
              {service.description}
            </Text>
          ) : null}
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={() => onEdit(service)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.7}
            style={{ marginRight: 12 }}
          >
            <Ionicons
              name="create-outline"
              size={20}
              color="rgba(240,232,213,0.5)"
            />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onDelete(service)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            activeOpacity={0.7}
          >
            <Ionicons
              name="trash-outline"
              size={20}
              color="rgba(220,50,50,0.5)"
            />
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.cardBottomRow}>
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>${service.price.toFixed(0)}</Text>
          <View style={styles.durationPill}>
            <Text style={styles.durationPillText}>
              {service.duration_minutes} min
            </Text>
          </View>
        </View>
        <Toggle value={service.is_active} onChange={() => onToggle(service)} />
      </View>
    </View>
  )
}

function Toggle({
  value,
  onChange,
}: {
  value: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onChange(!value)}
      style={[
        styles.toggleTrack,
        { backgroundColor: value ? '#C8922A' : 'rgba(240,232,213,0.15)' },
      ]}
    >
      <View style={[styles.toggleThumb, { left: value ? 21 : 3 }]} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#080808' },
  topBar: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  topBarTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  sectionLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
    marginBottom: 12,
  },
  serviceCard: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.07)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  serviceCardInactive: { opacity: 0.5 },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  serviceName: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 4,
  },
  serviceDesc: {
    fontSize: 13,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 18,
    marginBottom: 4,
  },
  cardBottomRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  priceText: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    marginRight: 12,
  },
  durationPill: {
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  durationPillText: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_500Medium',
  },
  toggleTrack: {
    width: 44,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
  },
  toggleThumb: {
    position: 'absolute',
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#F0E8D5',
    top: 3,
  },
  skeletonCard: {
    minHeight: 90,
  },
  skeletonLineWide: {
    height: 14,
    width: '60%',
    backgroundColor: 'rgba(240,232,213,0.08)',
    borderRadius: 6,
    marginBottom: 10,
  },
  skeletonLineNarrow: {
    height: 12,
    width: '30%',
    backgroundColor: 'rgba(240,232,213,0.06)',
    borderRadius: 6,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 18,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    marginBottom: 8,
  },
  emptyBody: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  emptyCta: {
    backgroundColor: '#C8922A',
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyCtaText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    zIndex: 100,
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#111111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    zIndex: 101,
  },
  durationSheet: {
    maxHeight: '60%',
  },
  sheetHeader: {
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetTitle: {
    fontSize: 20,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  fieldLabel: {
    fontSize: 11,
    color: 'rgba(240,232,213,0.45)',
    fontFamily: 'Manrope_600SemiBold',
    letterSpacing: 1,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(240,232,213,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  half: { flex: 1 },
  priceWrap: {
    position: 'relative',
    justifyContent: 'center',
  },
  priceDollar: {
    position: 'absolute',
    left: 14,
    top: 14,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_600SemiBold',
    zIndex: 1,
  },
  priceInput: {
    paddingLeft: 28,
  },
  selectInput: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectText: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  textarea: {
    minHeight: 80,
    paddingTop: 14,
  },
  activeRow: {
    marginTop: 20,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  depositTypeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  depositTypeBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  depositTypeBtnActive: {
    borderColor: '#C8922A',
    backgroundColor: 'rgba(200,146,42,0.12)',
  },
  depositTypeText: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.6)',
    fontFamily: 'Manrope_500Medium',
  },
  depositTypeTextActive: {
    fontSize: 14,
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
  activeLabel: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_500Medium',
  },
  activeSub: {
    fontSize: 12,
    color: 'rgba(240,232,213,0.5)',
    fontFamily: 'Manrope_400Regular',
    marginTop: 2,
  },
  saveBtn: {
    marginTop: 24,
    backgroundColor: '#C8922A',
    borderRadius: 14,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontSize: 16,
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  durationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  durationLabel: {
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  durationLabelSelected: {
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
})
