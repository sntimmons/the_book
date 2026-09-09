import {
  View,
  Text,
  ScrollView,
  Pressable,
  TouchableOpacity,
  StyleSheet,
} from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import NeighborhoodPicker from '@/components/NeighborhoodPicker'
import { useClientStore } from '@/store/clientStore'

export default function ClientPreferences() {
  const insets = useSafeAreaInsets()
  // THE SAME VALUE STEP 1 COLLECTED, not a second local copy.
  //
  // This picker held plain local state defaulted to 'Midtown, Houston' and wrote
  // nowhere, while step 1's picker wrote to the store and the preview step
  // persisted THAT. So a client who corrected their area here had the correction
  // silently discarded and the earlier value saved instead — and that value is
  // what the Near You lane reads. Reading and writing the store makes the control
  // do what it appears to do.
  //
  // Whether this step should carry a picker at all when step 1 already asked is a
  // product question (USER_JOURNEYS J1b), and is deliberately not answered here.
  const storeNeighborhood = useClientStore((st) => st.neighborhood)
  const setStoreNeighborhood = useClientStore((st) => st.setNeighborhood)
  // NO DISPLAY-ONLY FALLBACK. This read `storeNeighborhood || 'Midtown, Houston'`,
  // which showed a specific neighborhood the client had never chosen — and
  // `NeighborhoodPicker` only fires `onChange` on an explicit selection, so a
  // client who accepted what they saw and pressed Continue finished onboarding
  // with `clients.neighborhood` NULL. The screen said "Midtown, Houston" and the
  // database said nothing, which left the Near You lane with no viewer
  // neighborhood to match on. Passing the store value straight through means the
  // picker shows its own placeholder when nothing is set: **what is displayed and
  // what is stored can no longer disagree.**
  const location = storeNeighborhood
  const setLocation = setStoreNeighborhood

  return (
    <View style={styles.root}>
      {/* Progress bar: 67% — step 2 of 3. (This comment said 100%.) */}
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
        {/* Was "Set your preferences", for a step that no longer collects a
            preference — PD-079 removed the two it had that nothing read. The
            heading now describes what the screen actually asks.

            OPEN FOR PM: this step now asks the SAME question step 1 asks, with
            the same component, prefilled from the same store. Whether it should
            be merged into step 1 or dropped is a product decision
            (USER_JOURNEYS J1b) and is deliberately not taken here. */}
        <Text style={styles.topBarLabel}>Your area</Text>
        <Text style={styles.topBarStep}>Step 2 of 3</Text>
      </View>

      {/* Scrollable content */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* ITEM 4 (PM decision, PR #74): the interest grid is REMOVED, and the
            headline with it.

            Seven category cards, four pre-selected, under the promise "We'll
            surface the best providers for the things you care about most."
            Nothing consumed them. They were local React state, written to no
            store and no column; the `clients` upsert at the end of onboarding
            writes name, notes, neighborhood and avatar, and no query anywhere
            reads an interests field. Discovery orders by the lanes in
            lib/discovery.ts, which has no interest input at all.

            So the screen asked a new client to describe their taste and then
            discarded the answer, under a sentence saying it would be used. That
            is the same defect item A removed from the notification switches on
            this very screen, and the PM ruling is explicit: do not collect
            placebo preference data, and do not build a recommendation engine to
            justify the field. The grid returns if and when something reads it.

            The LOCATION section below stays: `clients.neighborhood` is really
            persisted and really consumed — it is what the Near You lane reads. */}
        <Text style={styles.headline}>Where are you?</Text>
        {/* PRODUCT TRUTH: the subtext under this used to read "Providers within
            15 miles". There is no distance calculation anywhere in the product —
            discovery matches neighborhood and city as TEXT (lib/discovery.ts) —
            so the number described a radius nothing computes. */}
        <Text style={styles.subtext}>
          We use this to show you providers{'\n'}
          working in your area.
        </Text>

        <NeighborhoodPicker value={location} onChange={setLocation} />

        {/* ITEM 4, SAME RULING, ADJACENT CONTROL: the "Show mobile providers"
            switch is removed too.

            It met the PM test exactly as the interests grid did — local state,
            persisted nowhere, read by nothing — and leaving the last placebo
            control on a screen the same ruling had just cleared would have looked
            like an oversight rather than a boundary. **Flagged for PM**: item 4
            named interests specifically; this is my reading of the principle it
            states, and it is trivially reversible.

            A REAL mobile-provider filter does exist and does work: the "Mobile
            only" switch on Search, which item M wired to `providers.is_mobile`.
            The difference is that one filters and this one did not. */}

        {/* ITEM A (Correction 3): the Notifications section is removed.
            Three switches — booking updates, new providers nearby, deals &
            promotions — were collected during onboarding and then thrown away:
            nothing persisted them, nothing read them, and there is no push,
            device or email channel in this product for them to govern. Asking a
            new client to configure delivery preferences for messages that cannot
            be delivered is worse than not asking. The section returns when there
            is a real channel behind it. */}

      </ScrollView>

      {/* Fixed bottom CTA */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 16 }]}>
        <Pressable
          style={({ pressed }) => [styles.startBtn, pressed && { opacity: 0.88 }]}
          onPress={() => router.push('/onboarding/client/uploads')}
        >
          <Text style={styles.startBtnText}>Continue</Text>
        </Pressable>
        {/* PRODUCT TRUTH: this read "You can update these anytime in settings."
            Settings has Account, Provider, Payments, Privacy, Support and Legal,
            and none of them holds an area — so the claim promised a screen that
            does not exist. The line now points where the value genuinely IS
            editable: `app/me/edit.tsx` reads and upserts `clients.neighborhood`.
            (The earlier version of this note also reasoned about interests and a
            mobile-provider toggle; PD-079 removed both, so only the area is left
            to be true about.) */}
        <Text style={styles.ctaNote}>You can change your area anytime from your profile.</Text>
      </View>
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
    width: '67%',
    height: 4,
    backgroundColor: 'rgba(240,232,213,0.6)',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 8,
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
  scrollContent: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 140,
  },
  headline: {
    fontSize: 32,
    fontWeight: '700',
    color: '#F0E8D5',
    fontFamily: 'Manrope_700Bold',
    lineHeight: 38,
    marginTop: 24,
    marginBottom: 10,
  },
  subtext: {
    fontSize: 14,
    color: 'rgba(240,232,213,0.55)',
    fontFamily: 'Manrope_400Regular',
    lineHeight: 20,
    marginBottom: 28,
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
  startBtn: {
    backgroundColor: '#F0E8D5',
    borderRadius: 14,
    borderCurve: 'continuous',
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    marginBottom: 8,
  },
  startBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#080808',
    fontFamily: 'Manrope_700Bold',
  },
  ctaNote: {
    textAlign: 'center',
    fontSize: 11,
    color: 'rgba(240,232,213,0.3)',
    fontFamily: 'Manrope_400Regular',
  },
})
