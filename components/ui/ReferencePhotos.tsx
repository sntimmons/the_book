import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '@/context/ThemeContext'

// THE REFERENCE PHOTOS ON A BOOKING RECORD.
//
// A client attaches up to three of these when they send a request — "a style you
// like, or anything visual that helps your provider understand what you want".
// They really upload and really attach (lib/bookingPhotos.ts), and the provider
// sees them on the request screen. The client could not see them again anywhere.
// This renders that half of the record.
//
// PRESENTATION ONLY. It takes signed URLs someone else already obtained and has
// no idea what a booking is. Authorization happens two layers down, in the
// database — `booking_photos_participants_read` and `can_read_booking_photo`
// resolve through the booking and admit only its two parties. A URL that reaches
// this component was already authorized; a photo the viewer may not read never
// produces one. Keep it that way: this component must never learn to fetch.

export interface ReferencePhotosProps {
  /** Short-lived signed URLs, in attachment order. Empty renders nothing. */
  urls: string[]
  /**
   * Whose photos these are, from the viewer's side. The booking detail route is
   * shared, and the adjacent note card already labels itself this way.
   */
  viewerIsProvider?: boolean
}

export function referencePhotosLabel(count: number, viewerIsProvider: boolean): string {
  const noun = count === 1 ? 'REFERENCE PHOTO' : 'REFERENCE PHOTOS'
  return viewerIsProvider ? `CLIENT'S ${noun}` : `YOUR ${noun}`
}

export default function ReferencePhotos({
  urls,
  viewerIsProvider = false,
}: ReferencePhotosProps) {
  const { colors } = useTheme()

  // ABSENT, NOT EMPTY. There is no "no photos yet" state: a booking without
  // reference photos is not missing anything, and saying so would invent a gap
  // the client never left. This is also the failure state — if the signed URLs
  // could not be obtained, the section simply is not there, rather than showing
  // grey frames that imply a photo the viewer cannot open.
  if (urls.length === 0) return null

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.bgSurface, borderColor: colors.borderSubtle },
      ]}
    >
      <Text style={[styles.label, { color: colors.textSecondary }]}>
        {referencePhotosLabel(urls.length, viewerIsProvider)}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {urls.map((url, i) => (
          <Image
            key={url}
            source={{ uri: url }}
            style={[
              styles.thumb,
              // A themed fill under the image, so the moment before it decodes is
              // part of the surface rather than a white flash in Dark.
              { backgroundColor: colors.bgSubtle, borderColor: colors.borderSubtle },
            ]}
            resizeMode="cover"
            accessible
            accessibilityRole="image"
            // The content cannot be described — nobody captioned these — so the
            // label says what it truthfully can: which one of how many.
            accessibilityLabel={`Reference photo ${i + 1} of ${urls.length}`}
          />
        ))}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 14,
    borderCurve: 'continuous',
    padding: 20,
    marginBottom: 16,
  },
  label: {
    fontSize: 10,
    fontFamily: 'Manrope_500Medium',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  row: {
    gap: 10,
  },
  thumb: {
    width: 104,
    height: 104,
    borderRadius: 12,
    borderCurve: 'continuous',
    borderWidth: 1,
  },
})
