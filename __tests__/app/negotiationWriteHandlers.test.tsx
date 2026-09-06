// app/community/negotiation/[id].tsx — the six write handlers, driven through the real screen.
//
// This is the regression net for the write-handler consolidation. Every case below presses the
// real control, asserts the RPC the screen called and the exact payload it sent, and asserts
// what the screen did afterwards: the alert copy on a refusal, whether it re-read authoritative
// state, and whether the control was left enabled. The point is that all of it is unchanged.
//
// Two per-operation differences are deliberate and are asserted as such, because averaging them
// away would change what the screen does:
//   • accept and confirm re-read on ANY refusal, not only a terminal or stale one;
//   • accept and counter re-read WITHOUT the blocking load state.
//
// The write layer is mocked at the lib boundary, so no Supabase client is constructed. Copy and
// state rules come from the real lib modules, so a change to either fails here.

import React from 'react'
import { Alert } from 'react-native'
import { act, fireEvent, render, waitFor } from '@testing-library/react-native'

jest.mock('@/lib/negotiation', () => ({
  fetchNegotiationForInterest: jest.fn(),
  fetchInterestContext: jest.fn(),
  fetchNegotiation: jest.fn(),
  acceptVersion: jest.fn(),
  createProposal: jest.fn(),
  submitCounter: jest.fn(),
  finalizeAgreement: jest.fn(),
  markObligationDelivered: jest.fn(),
  confirmObligationReceived: jest.fn(),
  reportObligationNotReceived: jest.fn(),
  cancelTrade: jest.fn(),
}))

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  __esModule: true,
  useLocalSearchParams: () => ({ id: 'interest-1' }),
  // The real hook runs its callback when the screen gains focus; under test, once on mount and
  // again whenever `load` changes identity — which is what the screen relies on.
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}))

const ME = 'user-me'
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-me' }, session: null, role: 'provider' }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

import * as negotiation from '@/lib/negotiation'
import type { BarterObligation, NegotiationRow, ProposalVersion } from '@/lib/negotiation'
import { router } from 'expo-router'
import NegotiationScreen from '@/app/community/negotiation/[id]'
import { CONFIRM_TRADE_COPY, TERMS_PLACEHOLDERS } from '@/lib/negotiationState'
import {
  CONFIRM_RECEIVED_COPY,
  MARK_DELIVERED_COPY,
  NOT_RECEIVED_COPY,
} from '@/lib/obligationState'
import {
  AGREE_TO_CANCEL_COPY,
  CANCEL_REASON_PLACEHOLDER,
  CANCEL_TRADE_COPY,
} from '@/lib/tradeCancellation'

const mocked = negotiation as jest.Mocked<typeof negotiation>

// ── Fixtures ────────────────────────────────────────────────────────────────
// Far enough out that `termsTimingStillValid` holds without pinning a fake clock.
const FUTURE_DUE = new Date(Date.now() + 30 * 86_400_000).toISOString()
const FUTURE_SCHEDULED = new Date(Date.now() + 20 * 86_400_000).toISOString()

function makeRow(over: Partial<NegotiationRow> = {}): NegotiationRow {
  return {
    proposalId: 'proposal-1',
    interestId: 'interest-1',
    offerId: 'offer-1',
    currentVersionNo: 1,
    currentVersionId: 'version-1',
    currentVersionAuthorId: 'user-them',
    currentVersionAt: FUTURE_SCHEDULED,
    interestStatus: 'accepted',
    offerIsActive: true,
    myRole: 'owner',
    counterpartyUserId: 'user-them',
    iAcceptedCurrent: false,
    theyAcceptedCurrent: false,
    bothAccepted: false,
    agreementId: null,
    officializedAt: null,
    iCancelled: false,
    theyCancelled: false,
    cancelledAt: null,
    myCancelReason: null,
    theirCancelReason: null,
    ...over,
  }
}

function makeVersion(over: Partial<ProposalVersion> = {}): ProposalVersion {
  return {
    id: 'version-1',
    versionNo: 1,
    authorUserId: 'user-them',
    createdAt: '2026-09-01T12:00:00.000Z',
    acceptedBy: [],
    terms: [
      {
        id: 'term-owner',
        versionId: 'version-1',
        providedBy: 'offer_owner',
        serviceDescription: 'A haircut',
        dueAt: FUTURE_DUE,
        scheduledAt: FUTURE_SCHEDULED,
      },
      {
        id: 'term-responder',
        versionId: 'version-1',
        providedBy: 'responder',
        serviceDescription: 'A photo session',
        dueAt: FUTURE_DUE,
        scheduledAt: FUTURE_SCHEDULED,
      },
    ],
    ...over,
  }
}

function makeObligation(
  side: BarterObligation['side'],
  over: Partial<BarterObligation> = {},
): BarterObligation {
  return {
    id: `obligation-${side}`,
    agreementId: 'agreement-1',
    side,
    agreedDescription: side === 'offer_owner' ? 'A haircut' : 'A photo session',
    dueAt: FUTURE_DUE,
    scheduledAt: null,
    status: 'pending',
    deliveredAt: null,
    receiptRespondedAt: null,
    ...over,
  }
}

/** The load path the screen runs on focus, for a negotiation that exists. */
function loads(row: NegotiationRow, versions: ProposalVersion[], obligations: BarterObligation[]) {
  mocked.fetchNegotiationForInterest.mockResolvedValue({
    ok: true,
    row: { proposalId: row.proposalId },
    error: null,
  } as never)
  mocked.fetchNegotiation.mockResolvedValue({ row, versions, obligations, ok: true } as never)
}

/** The load path for an accepted response with no terms proposed yet. */
function loadsEmpty() {
  mocked.fetchNegotiationForInterest.mockResolvedValue({
    ok: true,
    row: null,
    error: null,
  } as never)
  mocked.fetchInterestContext.mockResolvedValue({
    ok: true,
    status: 'accepted',
    myRole: 'owner',
    error: null,
  } as never)
}

type AlertButton = { text?: string; onPress?: () => void; style?: string }

let alertSpy: jest.SpyInstance

beforeEach(() => {
  // `clearMocks` in jest.config.js is mockClear, which does NOT drain a queued
  // `mockImplementationOnce`. One left unconsumed by a test that never reached that read would
  // hand the NEXT test a promise that never resolves, and it would fail somewhere unrelated.
  jest.resetAllMocks()
  alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
})

afterEach(() => {
  alertSpy.mockRestore()
})

/** Every (title, body) the screen has said, in order. */
function alerts(): { title: string; body: string; buttons: AlertButton[] }[] {
  return alertSpy.mock.calls.map((c) => ({
    title: c[0] as string,
    body: c[1] as string,
    buttons: (c[2] ?? []) as AlertButton[],
  }))
}

/** Press the confirm button on the most recent confirmation dialog. */
async function pressDialogButton(label: string) {
  const shown = alerts()
  const dialog = shown[shown.length - 1]
  const button = dialog.buttons.find((b) => b.text === label)
  if (!button?.onPress) throw new Error(`No "${label}" button on "${dialog.title}"`)
  await act(async () => {
    button.onPress!()
  })
}

async function renderScreen() {
  const utils = render(<NegotiationScreen />)
  await waitFor(() => expect(mocked.fetchNegotiationForInterest).toHaveBeenCalled())
  return utils
}

/** How many times the screen has re-read authoritative state. */
function reads() {
  return mocked.fetchNegotiationForInterest.mock.calls.length
}

/**
 * No write on this screen navigates, and none of them speaks on success — the re-read is the
 * whole feedback. Asserted per successful write because the shared helper gives `onSuccess` no
 * payload and no router access, so a lost success alert or a lost navigation would be
 * structurally invisible rather than merely absent.
 */
function expectSilentSuccess() {
  expect(alerts()).toHaveLength(0)
  expect(router.push).not.toHaveBeenCalled()
  expect(router.replace).not.toHaveBeenCalled()
  expect(router.navigate).not.toHaveBeenCalled()
  expect(router.back).not.toHaveBeenCalled()
}

/**
 * Hold the re-read open and report whether the screen went blank behind it. `true` means the
 * blocking load state replaced the content; `false` means the re-read was quiet.
 */
function holdReload(row: NegotiationRow, versions: ProposalVersion[], obligations: BarterObligation[]) {
  let release: () => void = () => {}
  mocked.fetchNegotiation.mockImplementationOnce(
    () => new Promise((resolve) => {
      release = () => resolve({ row, versions, obligations, ok: true } as never)
    }),
  )
  return () => release()
}

function fillComposer(utils: ReturnType<typeof render>) {
  const gives = utils.getAllByPlaceholderText(TERMS_PLACEHOLDERS.gives)
  const dues = utils.getAllByPlaceholderText(TERMS_PLACEHOLDERS.dueAt)
  fireEvent.changeText(gives[0], 'A haircut')
  fireEvent.changeText(dues[0], FUTURE_DUE)
  fireEvent.changeText(gives[1], 'A photo session')
  fireEvent.changeText(dues[1], FUTURE_DUE)
}

// ── 1. Accept ───────────────────────────────────────────────────────────────

describe('accept these terms', () => {
  beforeEach(() => {
    loads(makeRow(), [makeVersion()], [])
  })

  it('sends only the current version id, then re-reads', async () => {
    mocked.acceptVersion.mockResolvedValue({ ok: true, bothAccepted: false, error: null } as never)
    const utils = await renderScreen()
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText('Accept these terms'))
    })
    expect(mocked.acceptVersion).toHaveBeenCalledTimes(1)
    expect(mocked.acceptVersion).toHaveBeenCalledWith('version-1')
    await waitFor(() => expect(reads()).toBe(before + 1))
    expectSilentSuccess()
  })

  it('re-reads on a NON-terminal, non-stale refusal — the accept-only gate', async () => {
    mocked.acceptVersion.mockResolvedValue({
      ok: false,
      bothAccepted: false,
      error: { code: '08006' },
    } as never)
    const utils = await renderScreen()
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText('Accept these terms'))
    })
    expect(alerts()).toEqual([
      { title: 'Could not accept', body: 'Please try again.', buttons: [{ text: 'OK' }] },
    ])
    await waitFor(() => expect(reads()).toBe(before + 1))
  })

  it('re-reads QUIETLY — the terms stay on screen rather than a spinner', async () => {
    mocked.acceptVersion.mockResolvedValue({ ok: true, bothAccepted: false, error: null } as never)
    const utils = await renderScreen()
    // Hold the re-read open so the screen is observed mid-refresh.
    let release: () => void = () => {}
    mocked.fetchNegotiation.mockImplementationOnce(
      () => new Promise((resolve) => {
        release = () =>
          resolve({ row: makeRow(), versions: [makeVersion()], obligations: [], ok: true } as never)
      }),
    )
    await act(async () => {
      fireEvent.press(await utils.findByText('Accept these terms'))
    })
    expect(utils.getByText('A haircut')).toBeTruthy()
    await act(async () => {
      release()
    })
  })

  // PT410 is the expired-timing refusal: NOT terminal, but stale. It re-reads either way here
  // because accept's gate is 'always' — what matters is that the copy is unchanged.
  it('re-reads on PT410 with the expired-timing copy', async () => {
    mocked.acceptVersion.mockResolvedValue({
      ok: false,
      bothAccepted: false,
      error: { code: 'PT410' },
    } as never)
    const utils = await renderScreen()
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText('Accept these terms'))
    })
    expect(alerts()[0].buttons).toEqual([{ text: 'OK' }])
    expect(alerts()[0].title).toBe('The timing expired')
    await waitFor(() => expect(reads()).toBe(before + 1))
  })

  it('re-reads QUIETLY on a refusal as well, not only on success', async () => {
    mocked.acceptVersion.mockResolvedValue({
      ok: false,
      bothAccepted: false,
      error: { code: '08006' },
    } as never)
    const utils = await renderScreen()
    const release = holdReload(makeRow(), [makeVersion()], [])
    await act(async () => {
      fireEvent.press(await utils.findByText('Accept these terms'))
    })
    // The refused terms stay readable behind the alert rather than being replaced by a spinner.
    expect(utils.getByText('A haircut')).toBeTruthy()
    await act(async () => {
      release()
    })
  })

  it('re-enables the control after a refusal', async () => {
    mocked.acceptVersion.mockResolvedValue({
      ok: false,
      bothAccepted: false,
      error: { code: '08006' },
    } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Accept these terms'))
    })
    const button = await utils.findByText('Accept these terms')
    await act(async () => {
      fireEvent.press(button)
    })
    expect(mocked.acceptVersion).toHaveBeenCalledTimes(2)
  })
})

// ── 2. Open (first proposal) ────────────────────────────────────────────────

describe('propose terms on a negotiation with none', () => {
  beforeEach(loadsEmpty)

  it('sends the interest id and the trimmed draft payload', async () => {
    mocked.createProposal.mockResolvedValue({ ok: true, proposalId: 'p', error: null } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Propose terms'))
    })
    fillComposer(utils)
    await act(async () => {
      fireEvent.press(utils.getByText('Send terms'))
    })
    expect(mocked.createProposal).toHaveBeenCalledTimes(1)
    expect(mocked.createProposal).toHaveBeenCalledWith('interest-1', {
      ownerGives: 'A haircut',
      ownerDueAt: FUTURE_DUE,
      ownerScheduledAt: '',
      responderGives: 'A photo session',
      responderDueAt: FUTURE_DUE,
      responderScheduledAt: '',
    })
    expectSilentSuccess()
  })

  // The counterpart to the counter's quiet re-read: opening a negotiation DOES block. The two
  // differ on main and the difference is preserved, so both halves are pinned.
  it('BLOCKS the screen while re-reading, unlike a counter', async () => {
    mocked.createProposal.mockResolvedValue({ ok: true, proposalId: 'p', error: null } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Propose terms'))
    })
    fillComposer(utils)
    // On this path `load` stops at fetchNegotiationForInterest → fetchInterestContext, so that
    // is the read to hold open — fetchNegotiation is never reached.
    let release: () => void = () => {}
    mocked.fetchInterestContext.mockImplementationOnce(
      () => new Promise((resolve) => {
        release = () => resolve({ ok: true, status: 'accepted', myRole: 'owner' } as never)
      }),
    )
    await act(async () => {
      fireEvent.press(utils.getByText('Send terms'))
    })
    expect(utils.queryByText('No terms yet')).toBeNull()
    expect(utils.queryByText('Send terms')).toBeNull()
    await act(async () => {
      release()
    })
  })

  it('refuses an incomplete draft locally, with no RPC and the same copy', async () => {
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Propose terms'))
    })
    await act(async () => {
      fireEvent.press(utils.getByText('Send terms'))
    })
    expect(mocked.createProposal).not.toHaveBeenCalled()
    expect(alerts()).toEqual([
      {
        title: 'Check these terms',
        body: 'Say what each of you is giving.',
        buttons: [{ text: 'OK' }],
      },
    ])
  })

  it('does NOT re-read on a transient refusal, and leaves the composer open', async () => {
    mocked.createProposal.mockResolvedValue({
      ok: false,
      proposalId: null,
      error: { code: '08006' },
    } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Propose terms'))
    })
    fillComposer(utils)
    const before = reads()
    await act(async () => {
      fireEvent.press(utils.getByText('Send terms'))
    })
    expect(alerts()).toEqual([
      {
        title: 'Could not send these terms',
        body: 'Please try again.',
        buttons: [{ text: 'OK' }],
      },
    ])
    expect(reads()).toBe(before)
    expect(utils.getByText('Send terms')).toBeTruthy()
  })

  it('closes the composer and re-reads on a terminal refusal', async () => {
    mocked.createProposal.mockResolvedValue({
      ok: false,
      proposalId: null,
      error: { barterClientCode: 'no_rows' },
    } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Propose terms'))
    })
    fillComposer(utils)
    const before = reads()
    await act(async () => {
      fireEvent.press(utils.getByText('Send terms'))
    })
    expect(alerts()[0].title).toBe('That negotiation is no longer available')
    await waitFor(() => expect(reads()).toBe(before + 1))
    expect(utils.queryByText('Send terms')).toBeNull()
  })
})

// ── 3. Confirm (finalize) ───────────────────────────────────────────────────

describe('confirm trade', () => {
  beforeEach(() => {
    loads(
      makeRow({ iAcceptedCurrent: true, theyAcceptedCurrent: true, bothAccepted: true }),
      [makeVersion({ acceptedBy: [ME, 'user-them'] })],
      [],
    )
  })

  it('asks first with unchanged copy, and does not write until confirmed', async () => {
    mocked.finalizeAgreement.mockResolvedValue({ ok: true, agreementId: 'a', error: null } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Confirm trade'))
    })
    expect(alerts()).toEqual([
      {
        title: CONFIRM_TRADE_COPY.title,
        body: CONFIRM_TRADE_COPY.body,
        buttons: [
          { text: CONFIRM_TRADE_COPY.cancelLabel, style: 'cancel' },
          { text: CONFIRM_TRADE_COPY.confirmLabel, onPress: expect.any(Function) },
        ],
      },
    ])
    expect(mocked.finalizeAgreement).not.toHaveBeenCalled()
    await pressDialogButton(CONFIRM_TRADE_COPY.confirmLabel)
    expect(mocked.finalizeAgreement).toHaveBeenCalledWith('proposal-1')
    expect(router.push).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
    expect(router.navigate).not.toHaveBeenCalled()
    expect(router.back).not.toHaveBeenCalled()
    // Confirming a trade says nothing beyond its own dialog — the re-read is the feedback.
    expect(alerts()).toHaveLength(1)
  })

  it('BLOCKS the screen while re-reading', async () => {
    mocked.finalizeAgreement.mockResolvedValue({ ok: true, agreementId: 'a', error: null } as never)
    const utils = await renderScreen()
    const release = holdReload(makeRow(), [makeVersion()], [])
    await act(async () => {
      fireEvent.press(await utils.findByText('Confirm trade'))
    })
    await pressDialogButton(CONFIRM_TRADE_COPY.confirmLabel)
    expect(utils.queryByText('A haircut')).toBeNull()
    await act(async () => {
      release()
    })
  })

  it('re-reads on a NON-terminal, non-stale refusal — the confirm-only gate', async () => {
    mocked.finalizeAgreement.mockResolvedValue({
      ok: false,
      agreementId: null,
      error: { code: '08006' },
    } as never)
    const utils = await renderScreen()
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText('Confirm trade'))
    })
    await pressDialogButton(CONFIRM_TRADE_COPY.confirmLabel)
    expect(alerts()[1]).toEqual({
      title: 'Could not confirm',
      body: 'Please try again.',
      buttons: [{ text: 'OK' }],
    })
    await waitFor(() => expect(reads()).toBe(before + 1))
  })
})

// ── 4. Obligation writes ────────────────────────────────────────────────────

describe('obligation writes', () => {
  it('marks MY obligation delivered, sending only its id', async () => {
    loads(
      makeRow({ agreementId: 'agreement-1', bothAccepted: true, iAcceptedCurrent: true }),
      [makeVersion({ acceptedBy: [ME, 'user-them'] })],
      [makeObligation('offer_owner'), makeObligation('responder')],
    )
    mocked.markObligationDelivered.mockResolvedValue({
      ok: true,
      status: 'delivered',
      error: null,
    } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText(MARK_DELIVERED_COPY.confirmLabel))
    })
    expect(alerts()[0]).toEqual({
      title: MARK_DELIVERED_COPY.title,
      body: MARK_DELIVERED_COPY.body,
      buttons: [
        { text: MARK_DELIVERED_COPY.cancelLabel, style: 'cancel' },
        { text: MARK_DELIVERED_COPY.confirmLabel, onPress: expect.any(Function) },
      ],
    })
    expect(mocked.markObligationDelivered).not.toHaveBeenCalled()
    await pressDialogButton(MARK_DELIVERED_COPY.confirmLabel)
    expect(mocked.markObligationDelivered).toHaveBeenCalledWith('obligation-offer_owner')
    expect(router.push).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('confirms receipt on THEIR obligation only', async () => {
    loads(
      makeRow({ agreementId: 'agreement-1', bothAccepted: true, iAcceptedCurrent: true }),
      [makeVersion({ acceptedBy: [ME, 'user-them'] })],
      [
        makeObligation('offer_owner'),
        makeObligation('responder', { status: 'delivered', deliveredAt: FUTURE_SCHEDULED }),
      ],
    )
    mocked.confirmObligationReceived.mockResolvedValue({
      ok: true,
      status: 'received',
      error: null,
    } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText(CONFIRM_RECEIVED_COPY.confirmLabel))
    })
    expect(alerts()[0]).toEqual({
      title: CONFIRM_RECEIVED_COPY.title,
      body: CONFIRM_RECEIVED_COPY.body,
      buttons: [
        { text: CONFIRM_RECEIVED_COPY.cancelLabel, style: 'cancel' },
        { text: CONFIRM_RECEIVED_COPY.confirmLabel, onPress: expect.any(Function) },
      ],
    })
    await pressDialogButton(CONFIRM_RECEIVED_COPY.confirmLabel)
    expect(mocked.confirmObligationReceived).toHaveBeenCalledWith('obligation-responder')
    // The receiver's answer cannot be routed to the wrong RPC or the wrong obligation.
    expect(mocked.markObligationDelivered).not.toHaveBeenCalled()
    expect(mocked.reportObligationNotReceived).not.toHaveBeenCalled()
  })

  it('records "did not receive" and re-reads on a PT412 second answer', async () => {
    loads(
      makeRow({ agreementId: 'agreement-1', bothAccepted: true, iAcceptedCurrent: true }),
      [makeVersion({ acceptedBy: [ME, 'user-them'] })],
      [
        makeObligation('offer_owner'),
        makeObligation('responder', { status: 'delivered', deliveredAt: FUTURE_SCHEDULED }),
      ],
    )
    mocked.reportObligationNotReceived.mockResolvedValue({
      ok: false,
      status: null,
      error: { code: 'PT412' },
    } as never)
    const utils = await renderScreen()
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText(NOT_RECEIVED_COPY.confirmLabel))
    })
    expect(alerts()[0]).toEqual({
      title: NOT_RECEIVED_COPY.title,
      body: NOT_RECEIVED_COPY.body,
      buttons: [
        { text: NOT_RECEIVED_COPY.cancelLabel, style: 'cancel' },
        { text: NOT_RECEIVED_COPY.confirmLabel, onPress: expect.any(Function) },
      ],
    })
    await pressDialogButton(NOT_RECEIVED_COPY.confirmLabel)
    expect(mocked.reportObligationNotReceived).toHaveBeenCalledWith('obligation-responder')
    expect(mocked.confirmObligationReceived).not.toHaveBeenCalled()
    await waitFor(() => expect(reads()).toBe(before + 1))
  })

  // PT409 is "the trade was cancelled under you": terminal and stale, so the delivery control
  // must go away.
  it('re-reads on PT409 — the trade was cancelled under the delivery button', async () => {
    loads(
      makeRow({ agreementId: 'agreement-1', bothAccepted: true, iAcceptedCurrent: true }),
      [makeVersion({ acceptedBy: [ME, 'user-them'] })],
      [makeObligation('offer_owner'), makeObligation('responder')],
    )
    mocked.markObligationDelivered.mockResolvedValue({
      ok: false,
      status: null,
      error: { code: 'PT409' },
    } as never)
    const utils = await renderScreen()
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText(MARK_DELIVERED_COPY.confirmLabel))
    })
    await pressDialogButton(MARK_DELIVERED_COPY.confirmLabel)
    expect(mocked.markObligationDelivered).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(reads()).toBe(before + 1))
  })

  it('does NOT re-read a transient obligation refusal', async () => {
    loads(
      makeRow({ agreementId: 'agreement-1', bothAccepted: true, iAcceptedCurrent: true }),
      [makeVersion({ acceptedBy: [ME, 'user-them'] })],
      [makeObligation('offer_owner'), makeObligation('responder')],
    )
    mocked.markObligationDelivered.mockResolvedValue({
      ok: false,
      status: null,
      error: { code: '08006' },
    } as never)
    const utils = await renderScreen()
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText(MARK_DELIVERED_COPY.confirmLabel))
    })
    await pressDialogButton(MARK_DELIVERED_COPY.confirmLabel)
    expect(alerts()[1].title).toBe('Could not mark this delivered')
    expect(reads()).toBe(before)
  })
})

// ── 5. Cancellation ─────────────────────────────────────────────────────────

describe('cancel trade', () => {
  function loadPreDelivery() {
    loads(
      makeRow({ agreementId: 'agreement-1', bothAccepted: true, iAcceptedCurrent: true }),
      [makeVersion({ acceptedBy: [ME, 'user-them'] })],
      [makeObligation('offer_owner'), makeObligation('responder')],
    )
  }

  it('sends the agreement id and a null reason when none was typed', async () => {
    loadPreDelivery()
    mocked.cancelTrade.mockResolvedValue({
      ok: true,
      state: 'cancelled_by_participant',
      error: null,
    } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText(CANCEL_TRADE_COPY.confirmLabel))
    })
    expect(alerts()[0]).toEqual({
      title: CANCEL_TRADE_COPY.title,
      body: CANCEL_TRADE_COPY.body,
      buttons: [
        { text: CANCEL_TRADE_COPY.cancelLabel, style: 'cancel' },
        {
          text: CANCEL_TRADE_COPY.confirmLabel,
          style: 'destructive',
          onPress: expect.any(Function),
        },
      ],
    })
    expect(mocked.cancelTrade).not.toHaveBeenCalled()
    await pressDialogButton(CANCEL_TRADE_COPY.confirmLabel)
    expect(mocked.cancelTrade).toHaveBeenCalledWith('agreement-1', null)
  })

  it('sends a typed reason and clears the field on success', async () => {
    loadPreDelivery()
    mocked.cancelTrade.mockResolvedValue({
      ok: true,
      state: 'cancelled_by_participant',
      error: null,
    } as never)
    const utils = await renderScreen()
    const field = utils.getByPlaceholderText(CANCEL_REASON_PLACEHOLDER)
    fireEvent.changeText(field, '  Something came up  ')
    await act(async () => {
      fireEvent.press(await utils.findByText(CANCEL_TRADE_COPY.confirmLabel))
    })
    await pressDialogButton(CANCEL_TRADE_COPY.confirmLabel)
    expect(mocked.cancelTrade).toHaveBeenCalledWith('agreement-1', 'Something came up')
  })

  // PD-046: `55000` is "something was already delivered, so the ordinary exit is gone". It is
  // terminal AND stale, so the control must disappear rather than stay on screen inviting the
  // same impossible tap.
  // PD-061: "Agree to cancel" is the ONE place the word "agree" is accurate, because this
  // participant has seen the other's cancellation and is assenting to it. It is the same act on
  // the server — the same RPC, the same payload — and only the copy differs.
  it('offers "Agree to cancel" when the counterparty cancelled first', async () => {
    loads(
      makeRow({
        agreementId: 'agreement-1',
        bothAccepted: true,
        iAcceptedCurrent: true,
        theyCancelled: true,
        cancelledAt: '2026-09-05T12:00:00.000Z',
        theirCancelReason: 'scheduling clash',
      }),
      [makeVersion({ acceptedBy: [ME, 'user-them'] })],
      [makeObligation('offer_owner'), makeObligation('responder')],
    )
    mocked.cancelTrade.mockResolvedValue({
      ok: true,
      state: 'mutually_cancelled',
      error: null,
    } as never)
    const utils = await renderScreen()
    // The unilateral wording must NOT be what a responding participant is shown.
    expect(utils.queryByText(CANCEL_TRADE_COPY.confirmLabel)).toBeNull()
    // Their stated reason is visible to this viewer, attributed to them (PD-060).
    expect(utils.getByText('The other provider said: scheduling clash')).toBeTruthy()
    await act(async () => {
      fireEvent.press(await utils.findByText(AGREE_TO_CANCEL_COPY.confirmLabel))
    })
    expect(alerts()[0]).toEqual({
      title: AGREE_TO_CANCEL_COPY.title,
      body: AGREE_TO_CANCEL_COPY.body,
      buttons: [
        { text: AGREE_TO_CANCEL_COPY.cancelLabel, style: 'cancel' },
        {
          text: AGREE_TO_CANCEL_COPY.confirmLabel,
          style: 'destructive',
          onPress: expect.any(Function),
        },
      ],
    })
    await pressDialogButton(AGREE_TO_CANCEL_COPY.confirmLabel)
    // Same RPC, same payload shape as a first cancellation: the client cannot name the actor,
    // the time, or whether the result is mutual.
    expect(mocked.cancelTrade).toHaveBeenCalledWith('agreement-1', null)
  })

  it('re-reads on 55000 — the counterparty delivered under the button', async () => {
    loadPreDelivery()
    mocked.cancelTrade.mockResolvedValue({
      ok: false,
      state: null,
      error: { code: '55000' },
    } as never)
    const utils = await renderScreen()
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText(CANCEL_TRADE_COPY.confirmLabel))
    })
    await pressDialogButton(CANCEL_TRADE_COPY.confirmLabel)
    expect(mocked.cancelTrade).toHaveBeenCalledTimes(1)
    expect(alerts()[1]).toEqual({
      title: 'This trade can no longer be cancelled',
      body:
        'Something has already been delivered, so cancelling is no longer available. The'
        + ' details have been updated.',
      buttons: [{ text: 'OK' }],
    })
    await waitFor(() => expect(reads()).toBe(before + 1))
  })

  // `22023` is the server refusing an over-long reason: not terminal, not stale, and the reason
  // the user typed must survive so they can shorten it.
  it('does not re-read a rejected reason, and keeps what was typed', async () => {
    loadPreDelivery()
    mocked.cancelTrade.mockResolvedValue({
      ok: false,
      state: null,
      error: { code: '22023' },
    } as never)
    const utils = await renderScreen()
    fireEvent.changeText(
      utils.getByPlaceholderText(CANCEL_REASON_PLACEHOLDER), 'Something came up',
    )
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText(CANCEL_TRADE_COPY.confirmLabel))
    })
    await pressDialogButton(CANCEL_TRADE_COPY.confirmLabel)
    expect(alerts()[1].title).toBe('Check that reason')
    expect(reads()).toBe(before)
    expect(utils.getByPlaceholderText(CANCEL_REASON_PLACEHOLDER).props.value).toBe(
      'Something came up',
    )
  })

  it('does NOT re-read a transient cancellation refusal', async () => {
    loadPreDelivery()
    mocked.cancelTrade.mockResolvedValue({
      ok: false,
      state: null,
      error: { code: '08006' },
    } as never)
    const utils = await renderScreen()
    const before = reads()
    await act(async () => {
      fireEvent.press(await utils.findByText(CANCEL_TRADE_COPY.confirmLabel))
    })
    await pressDialogButton(CANCEL_TRADE_COPY.confirmLabel)
    expect(alerts()[1]).toEqual({
      title: 'Could not cancel',
      body: 'Please try again.',
      buttons: [{ text: 'OK' }],
    })
    expect(reads()).toBe(before)
  })
})

// ── 6. Counter (send different terms) ───────────────────────────────────────

describe('send different terms', () => {
  beforeEach(() => {
    loads(makeRow(), [makeVersion()], [])
  })

  it('sends the proposal id and the draft payload', async () => {
    mocked.submitCounter.mockResolvedValue({ ok: true, versionNo: 2, error: null } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Send different terms'))
    })
    fillComposer(utils)
    await act(async () => {
      fireEvent.press(utils.getByText('Send terms'))
    })
    expect(mocked.submitCounter).toHaveBeenCalledTimes(1)
    expect(mocked.submitCounter).toHaveBeenCalledWith('proposal-1', {
      ownerGives: 'A haircut',
      ownerDueAt: FUTURE_DUE,
      ownerScheduledAt: '',
      responderGives: 'A photo session',
      responderDueAt: FUTURE_DUE,
      responderScheduledAt: '',
    })
  })

  it('re-reads QUIETLY on success — no blocking spinner', async () => {
    mocked.submitCounter.mockResolvedValue({ ok: true, versionNo: 2, error: null } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Send different terms'))
    })
    fillComposer(utils)
    let release: () => void = () => {}
    mocked.fetchNegotiation.mockImplementationOnce(
      () => new Promise((resolve) => {
        release = () =>
          resolve({ row: makeRow(), versions: [makeVersion()], obligations: [], ok: true } as never)
      }),
    )
    await act(async () => {
      fireEvent.press(utils.getByText('Send terms'))
    })
    // The previous terms are still on screen while the re-read is in flight.
    expect(utils.getByText('A haircut')).toBeTruthy()
    await act(async () => {
      release()
    })
  })

  it('does NOT re-read a transient counter refusal, and keeps the draft', async () => {
    mocked.submitCounter.mockResolvedValue({
      ok: false,
      versionNo: null,
      error: { code: '08006' },
    } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Send different terms'))
    })
    fillComposer(utils)
    const before = reads()
    await act(async () => {
      fireEvent.press(utils.getByText('Send terms'))
    })
    expect(alerts()).toEqual([
      {
        title: 'Could not send these terms',
        body: 'Please try again.',
        buttons: [{ text: 'OK' }],
      },
    ])
    expect(reads()).toBe(before)
    expect(utils.getAllByPlaceholderText(TERMS_PLACEHOLDERS.gives)[0].props.value).toBe('A haircut')
  })

  it('closes the composer and re-reads on a stale, non-terminal refusal', async () => {
    mocked.submitCounter.mockResolvedValue({
      ok: false,
      versionNo: null,
      error: { code: '23505' },
    } as never)
    const utils = await renderScreen()
    await act(async () => {
      fireEvent.press(await utils.findByText('Send different terms'))
    })
    fillComposer(utils)
    const before = reads()
    await act(async () => {
      fireEvent.press(utils.getByText('Send terms'))
    })
    await waitFor(() => expect(reads()).toBe(before + 1))
    expect(utils.queryByText('Send terms')).toBeNull()
  })
})

// ── The surface itself ──────────────────────────────────────────────────────

describe('no write action beyond the six', () => {
  it('a confirmed pre-delivery trade offers exactly the expected controls', async () => {
    loads(
      makeRow({ agreementId: 'agreement-1', bothAccepted: true, iAcceptedCurrent: true }),
      [makeVersion({ acceptedBy: [ME, 'user-them'] })],
      [makeObligation('offer_owner'), makeObligation('responder')],
    )
    const utils = await renderScreen()
    expect(utils.getByText(MARK_DELIVERED_COPY.confirmLabel)).toBeTruthy()
    expect(utils.getByText(CANCEL_TRADE_COPY.confirmLabel)).toBeTruthy()
    // Nothing this slice does not have.
    expect(utils.queryByText('Accept these terms')).toBeNull()
    expect(utils.queryByText('Confirm trade')).toBeNull()
    expect(utils.queryByText('Send different terms')).toBeNull()
    expect(utils.queryByText(CONFIRM_RECEIVED_COPY.confirmLabel)).toBeNull()
    expect(utils.queryByText(NOT_RECEIVED_COPY.confirmLabel)).toBeNull()
  })

  // NOT a proof that no seventh write path exists — a render cannot establish that. It pins the
  // narrower, still-useful fact: opening this screen performs no write of any kind.
  it('opening the screen performs no write at all', async () => {
    loads(makeRow(), [makeVersion()], [])
    await renderScreen()
    expect(mocked.acceptVersion).not.toHaveBeenCalled()
    expect(mocked.createProposal).not.toHaveBeenCalled()
    expect(mocked.submitCounter).not.toHaveBeenCalled()
    expect(mocked.finalizeAgreement).not.toHaveBeenCalled()
    expect(mocked.markObligationDelivered).not.toHaveBeenCalled()
    expect(mocked.confirmObligationReceived).not.toHaveBeenCalled()
    expect(mocked.reportObligationNotReceived).not.toHaveBeenCalled()
    expect(mocked.cancelTrade).not.toHaveBeenCalled()
  })
})
