import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'

// Numeric / decimal / number-pad keyboards on iOS have no return key, so a
// focused fee/price field can only be dismissed by tapping outside it. This adds
// a "Done" bar above the keyboard. A TextInput opts in via
// inputAccessoryViewID={DONE_ACCESSORY_ID}.
//
// InputAccessoryView is iOS-only; on Android this renders nothing (its number
// keyboards already expose a dismiss affordance), so it is safe to mount always.
export const DONE_ACCESSORY_ID = 'numeric-done-accessory'

export function DoneAccessory({ nativeID = DONE_ACCESSORY_ID }: { nativeID?: string }) {
  if (Platform.OS !== 'ios') return null
  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.bar}>
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <Text style={styles.done}>Done</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  )
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: '#141414',
    borderTopWidth: 1,
    borderTopColor: 'rgba(240,232,213,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  done: {
    fontSize: 16,
    color: '#C8922A',
    fontFamily: 'Manrope_700Bold',
  },
})
