import { useEffect, useRef, useState } from 'react'
import {
  View,
  Text,
  Modal,
  FlatList,
  Pressable,
  TouchableOpacity,
  TextInput,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// Curated Houston-area neighborhoods. Selected value is saved as a plain
// string matching the list item exactly. "Other" stays last for anywhere not
// listed.
export const HOUSTON_NEIGHBORHOODS = [
  'Midtown', 'Montrose', 'Heights', 'EaDo', 'Downtown',
  'Museum District', 'Medical Center', 'Greenway Plaza',
  'River Oaks', 'Galleria', 'Uptown', 'Memorial',
  'Spring Branch', 'Garden Oaks', 'Oak Forest',
  'Third Ward', 'Fourth Ward', 'Fifth Ward', 'Acres Homes',
  'Alief', 'Sharpstown', 'Meyerland', 'Bellaire',
  'West University', 'Southside Place', 'Pearland',
  'Sugar Land', 'Missouri City', 'Stafford', 'Richmond',
  'Katy', 'Cypress', 'Humble', 'Kingwood', 'Atascocita',
  'Baytown', 'Pasadena', 'Clear Lake', 'Webster',
  'League City', 'Friendswood', 'Manvel', 'Alvin',
  'Spring', 'The Woodlands', 'Conroe', 'Tomball',
  'Channelview', 'Deer Park', 'La Porte', 'Seabrook',
  'Other',
]

// "Other" is pinned to the bottom of the list; everything else is shown
// alphabetically and is what the search box filters over.
const OTHER_OPTION = 'Other'
const SORTED_NEIGHBORHOODS = HOUSTON_NEIGHBORHOODS.filter(
  (n) => n !== OTHER_OPTION,
).sort((a, b) => a.localeCompare(b))

interface NeighborhoodPickerProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function NeighborhoodPicker({
  value,
  onChange,
  placeholder = 'Select your neighborhood',
}: NeighborhoodPickerProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const searchRef = useRef<TextInput>(null)
  const insets = useSafeAreaInsets()

  // Auto-focus the search field when the sheet opens; clear it when it closes.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 250)
      return () => clearTimeout(t)
    }
    setSearch('')
  }, [open])

  const q = search.trim().toLowerCase()
  const filtered = q
    ? SORTED_NEIGHBORHOODS.filter((n) => n.toLowerCase().includes(q))
    : SORTED_NEIGHBORHOODS
  // "Other" always stays available at the bottom, even when the filter hides
  // every other option.
  const listData = [...filtered, OTHER_OPTION]

  function select(item: string) {
    onChange(item)
    setOpen(false)
  }

  return (
    <>
      <TouchableOpacity
        style={styles.trigger}
        activeOpacity={0.8}
        onPress={() => setOpen(true)}
      >
        <Feather
          name="map-pin"
          size={16}
          color="rgba(240,232,213,0.3)"
          style={{ marginRight: 10 }}
        />
        <Text
          style={[styles.triggerText, !value && styles.triggerPlaceholder]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <Feather name="chevron-down" size={18} color="rgba(240,232,213,0.4)" />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select your neighborhood</Text>
              <TouchableOpacity
                onPress={() => setOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                activeOpacity={0.7}
              >
                <Feather name="x" size={22} color="#F0E8D5" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchRow}>
              <Feather name="search" size={16} color="rgba(240,232,213,0.35)" />
              <TextInput
                ref={searchRef}
                style={styles.searchInput}
                placeholder="Search neighborhoods"
                placeholderTextColor="rgba(240,232,213,0.3)"
                value={search}
                onChangeText={setSearch}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
              />
              {search.length > 0 ? (
                <TouchableOpacity
                  onPress={() => setSearch('')}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="x" size={16} color="rgba(240,232,213,0.35)" />
                </TouchableOpacity>
              ) : null}
            </View>

            <FlatList
              data={listData}
              keyExtractor={(item) => item}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item === value
                return (
                  <Pressable style={styles.row} onPress={() => select(item)}>
                    <Text
                      style={[styles.rowText, selected && styles.rowTextSelected]}
                    >
                      {item}
                    </Text>
                    {selected ? (
                      <Feather name="check" size={18} color="#C8922A" />
                    ) : null}
                  </Pressable>
                )
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 16,
  },
  triggerText: {
    flex: 1,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
  },
  triggerPlaceholder: {
    color: 'rgba(240,232,213,0.25)',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: '#121212',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    paddingHorizontal: 20,
    paddingTop: 16,
    maxHeight: '75%',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.06)',
  },
  sheetTitle: {
    fontSize: 16,
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(240,232,213,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(240,232,213,0.08)',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
    marginTop: 4,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#F0E8D5',
    fontFamily: 'Manrope_400Regular',
    padding: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(240,232,213,0.05)',
  },
  rowText: {
    fontSize: 15,
    color: 'rgba(240,232,213,0.85)',
    fontFamily: 'Manrope_400Regular',
  },
  rowTextSelected: {
    color: '#C8922A',
    fontFamily: 'Manrope_600SemiBold',
  },
})
