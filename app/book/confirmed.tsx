import { View, Text, StyleSheet } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { useBookingStore } from '@/store/bookingStore'
import { useTheme } from '@/context/ThemeContext'
import TerminalStatement from '@/components/ui/TerminalStatement'
import Button from '@/components/ui/Button'

export default function BookConfirmed() {
  const { colors } = useTheme()
  const { bookingId } = useLocalSearchParams<{ bookingId?: string }>()
  const {
    providerName,
    selectedService,
    selectedDate,
    selectedTime,
    reset,
  } = useBookingStore()

  const displayProviderName = providerName || 'Your provider'
  const firstName = displayProviderName.split(' ')[0]

  const bookingSummary = [
    selectedService?.name ?? 'Service',
    selectedDate || '',
    selectedTime || '',
  ]
    .filter(Boolean)
    .join(' · ')

  function handleBackToHome() {
    reset()
    router.replace('/(tabs)/')
  }

  // ITEM N: the primary action after sending is VIEW REQUEST.
  //
  // "Back to Home" was the only way off this screen, which dropped the client
  // back into discovery with nothing to act on and no route to the thing they
  // had just done. The request they just sent is the one place where its status,
  // the provider's answer and the option to withdraw all live, so that is where
  // the primary button goes. Home stays as the quiet secondary.
  //
  // `reset()` still runs: the booking-flow store is per-attempt scratch state,
  // and leaving it populated would make a later attempt resume this one's
  // service and date. The request itself is on the server and is what the next
  // screen reads.
  function handleViewRequest() {
    reset()
    if (bookingId) {
      // `/bookings/[id]`, NOT `/bookings/request/[id]`. The latter is the
      // PROVIDER's request screen: a client who lands on it is told "This view is
      // only available to the provider", and because this screen is replaced, the
      // only way back out of that dead end was into the completed send step —
      // which would have sent a second request. The client's own booking detail
      // is where the status, the provider's answer and the withdraw control live.
      router.replace({ pathname: '/bookings/[id]', params: { id: bookingId } })
      return
    }
    // No id to open — do not pretend there is a request to show.
    router.replace('/(tabs)/')
  }

  return (
    <TerminalStatement
      eyebrow="BOOKING REQUEST SENT"
      title="You're almost in."
      body={[
        // PRODUCT TRUTH: "You'll be notified as soon as they respond" promised a
        // push notification. There is no push channel in this beta (PD-059); a
        // response appears in the app.
        `Your booking request has been sent. ${firstName} will review it and accept or decline. You\u2019ll see their response in Third.`,
        // PD-071 / PD-077. The number is the server-authoritative one, and the
        // clause after it is the rest of the real rule:
        // expires_at = LEAST(submitted_at + 72 hours, appointment_time). The
        // calendar sells same-day slots, so the appointment is often the binding
        // term and a flat "72 hours" would overstate the window in the ordinary
        // case. The last sentence says where to LOOK rather than promising
        // something will arrive, because no push, email or SMS channel exists.
        'Your provider has up to 72 hours to respond, or until your requested time — whichever comes first. You can check this request anytime.',
      ]}
      steps={[
        {
          title: 'Provider reviews your request',
          detail: `${firstName} will review your profile and confirm or suggest an alternative time.`,
        },
        {
          // PRODUCT TRUTH: was "You get notified instantly". No push, device or
          // email notification exists.
          title: 'You see their answer in Third',
          detail: `When ${firstName} responds you will see it in your bookings — whether they accept, decline, or suggest another time.`,
        },
        {
          // PRODUCT TRUTH: was "No payment is taken until ... accepts", which
          // implied a later in-app charge.
          title: 'No in-app payment',
          detail: `Third does not take payment in this beta. You arrange payment directly with ${firstName}.`,
        },
      ]}
      testID="book-confirmed"
      actions={
        <>
          {bookingId ? (
            <Button label="View request" onPress={handleViewRequest} testID="confirmed-view-request" />
          ) : null}
          <Button label="Back to Discover" variant="tertiary" onPress={handleBackToHome} fullWidth />
        </>
      }
    >
      {bookingSummary.length > 0 ? (
        <View style={[styles.summary, { borderColor: colors.borderSubtle }]}>
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>{bookingSummary}</Text>
        </View>
      ) : null}
    </TerminalStatement>
  )
}

// Geometry only. The terminal layout itself lives in TerminalStatement.
const styles = StyleSheet.create({
  summary: {
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  summaryText: { fontSize: 13, lineHeight: 18, fontFamily: 'Manrope_400Regular' },
})
