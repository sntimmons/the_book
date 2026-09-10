import { Alert } from 'react-native'
import {
  BLOCK_COPY,
  BLOCK_DONE_COPY,
  BLOCK_FAILED_COPY,
  SAFETY_UNAVAILABLE_COPY,
  UNBLOCK_COPY,
  UNBLOCK_FAILED_COPY,
  blockUser,
  iBlocked,
  unblockUser,
} from './safety'

// ── ONE BLOCK FLOW, BECAUSE TWO DRIFTED ───────────────────────────────────
//
// `lib/safety.ts` says its own purpose is that "every surface asks the same
// question the same way". The API was shared; the INTERACTION was not. The
// provider profile and the message thread each carried their own ~90-line copy
// of open-menu / confirm / report-result, and each re-implemented the same three
// product rules independently:
//
//   1. an unknown block state WITHHOLDS the menu rather than guessing;
//   2. the menu is exactly three buttons, because Android draws no more;
//   3. a successful block updates the caller's state, then confirms.
//
// A change to any of those was two edits in two files with nothing linking
// them — and the safety copy had already drifted once that way (QA-TRUTH-001).
//
// Deliberately NOT a dialog framework. It is one function with the one shape
// both screens need; a third surface that needs a different shape should get its
// own, not a configuration flag on this.

export interface SafetyMenuOptions {
  /** The acting user. */
  userId: string
  /** The person being acted on — a USER id, never a provider row id. */
  otherUserId: string
  /** Names the person in the menu title. */
  title: string
  /**
   * The block state the caller already knows, or `null` when it has not been
   * read. `undefined` means "never read it", and this will read it.
   */
  blocked: boolean | null | undefined
  /** Called whenever the block state changes, so the screen can re-render. */
  onBlockedChange: (blocked: boolean) => void
  /** Opens the caller's report sheet. */
  onReport: () => void
}

export async function openSafetyMenu(o: SafetyMenuOptions): Promise<void> {
  // Prefer what the screen already loaded; only pay for a round trip when that
  // read failed or never happened.
  const mine = o.blocked ?? (await iBlocked(o.userId, o.otherUserId))
  if (mine === null) {
    Alert.alert(SAFETY_UNAVAILABLE_COPY.title, SAFETY_UNAVAILABLE_COPY.body)
    return
  }
  o.onBlockedChange(mine)

  // THREE BUTTONS, WHICH IS ANDROID'S HARD MAXIMUM. A fourth would not render
  // and would not warn — see __tests__/lib/alertButtonLimit.test.ts.
  Alert.alert(o.title, undefined, [
    {
      text: mine ? UNBLOCK_COPY.confirmLabel : BLOCK_COPY.confirmLabel,
      style: mine ? 'default' : 'destructive',
      onPress: () => (mine ? confirmUnblock(o) : confirmBlock(o)),
    },
    { text: 'Report', style: 'destructive', onPress: o.onReport },
    { text: 'Cancel', style: 'cancel' },
  ])
}

export function confirmBlock(o: SafetyMenuOptions): void {
  Alert.alert(BLOCK_COPY.title, BLOCK_COPY.body, [
    { text: BLOCK_COPY.cancelLabel, style: 'cancel' },
    {
      text: BLOCK_COPY.confirmLabel,
      style: 'destructive',
      onPress: async () => {
        const ok = await blockUser(o.userId, o.otherUserId)
        if (ok) o.onBlockedChange(true)
        const copy = ok ? BLOCK_DONE_COPY : BLOCK_FAILED_COPY
        Alert.alert(copy.title, copy.body)
      },
    },
  ])
}

export function confirmUnblock(o: SafetyMenuOptions): void {
  Alert.alert(UNBLOCK_COPY.title, UNBLOCK_COPY.body, [
    { text: UNBLOCK_COPY.cancelLabel, style: 'cancel' },
    {
      text: UNBLOCK_COPY.confirmLabel,
      onPress: async () => {
        const ok = await unblockUser(o.userId, o.otherUserId)
        if (ok) {
          o.onBlockedChange(false)
          return
        }
        Alert.alert(UNBLOCK_FAILED_COPY.title, UNBLOCK_FAILED_COPY.body)
      },
    },
  ])
}
