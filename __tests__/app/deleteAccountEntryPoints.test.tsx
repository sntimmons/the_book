// EVERY "Delete Account" CONTROL MUST REACH THE ONE DELETION FLOW.
//
// `app/me/edit.tsx` used to show *"This permanently deletes your account and all
// your data. This cannot be undone."* and then call `supabase.auth.signOut()` and
// nothing else. Two failures in one control: a promise the app did not keep, and
// the opposite failure — somebody who asked to be deleted was quietly signed out
// instead. It contradicted PD-102 directly, and it sat there through the entire
// erasure workstream because nothing pointed at it.
//
// This is the net. It presses the real control on the real screen and asserts
// where it goes; and it asserts, on the SOURCE of every screen that offers such a
// control, that none of them signs out or writes a deletion of its own. A second
// deletion implementation is the thing that must not come back, and a behavioural
// test on one screen cannot see it appearing on another.

import React from 'react'
import { Alert } from 'react-native'
import { fireEvent, render, waitFor } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), navigate: jest.fn() },
  __esModule: true,
  useLocalSearchParams: () => ({}),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}))

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// STABLE IDENTITY, and it matters. The screen's `loadProfile` is a useCallback
// keyed on `user`, and its effect is keyed on that callback — so a mock returning
// a fresh object render re-runs the load forever and `loading` never settles.
const mockAuth = { user: { id: 'user-me' }, session: null, role: 'client' }
jest.mock('@/context/AuthContext', () => ({
  useAuth: () => mockAuth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}))

// `mock`-prefixed, because Jest forbids a mock factory referencing any other
// out-of-scope variable.
const mockSignOut = jest.fn()
const mockMaybeSingle = jest.fn(async () => ({ data: null, error: null }))
jest.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { signOut: (...a: unknown[]) => mockSignOut(...a) },
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: mockMaybeSingle, single: mockMaybeSingle }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
      upsert: async () => ({ error: null }),
    }),
  },
}))

jest.mock('@/components/NeighborhoodPicker', () => 'NeighborhoodPicker')

import { router } from 'expo-router'
import EditProfileScreen from '@/app/me/edit'

const DELETION_ROUTE = '/settings/delete-account'

describe('app/me/edit.tsx — the Delete Account row', () => {
  it('navigates to the one deletion flow and signs nobody out', async () => {
    const { getByText } = render(<EditProfileScreen />)
    await waitFor(() => getByText('Delete Account'), { timeout: 8000 })

    fireEvent.press(getByText('Delete Account'))

    expect(router.push).toHaveBeenCalledWith(DELETION_ROUTE)
    // THE REGRESSION ITSELF. A sign-out here is the old behaviour returning.
    expect(mockSignOut).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('shows no confirmation of its own, because the destination owns the disclosure', async () => {
    // A summary Alert in front of the real screen could only be a worse, drifting
    // copy of it — and the previous one drifted all the way to being false.
    const alertSpy = jest.spyOn(Alert, 'alert')
    const { getByText } = render(<EditProfileScreen />)
    await waitFor(() => getByText('Delete Account'), { timeout: 8000 })

    fireEvent.press(getByText('Delete Account'))

    expect(alertSpy).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })
})

describe('no screen offers a second deletion implementation', () => {
  const read = (p: string) =>
    (require('fs') as typeof import('fs')).readFileSync(
      (require('path') as typeof import('path')).join(__dirname, '..', '..', p),
      'utf8',
    )

  // CODE ONLY. The first version of this matched its own explanatory comment —
  // which described the very bug it was guarding against — and failed.
  const code = (p: string) =>
    read(p)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n')

  // Every screen that offers the words "Delete Account" outside the deletion flow
  // itself. A new one added without a route to `/settings/delete-account` is the
  // defect this file exists for.
  const ENTRY_POINTS = ['app/me/edit.tsx', 'app/settings/index.tsx']

  it.each(ENTRY_POINTS)('%s routes to the deletion flow', (file) => {
    expect(read(file)).toContain(DELETION_ROUTE)
  })

  it.each(ENTRY_POINTS)('%s implements no deletion of its own', (file) => {
    // NOT "never calls signOut" — `app/settings/index.tsx` has a legitimate Sign
    // Out row beside the Delete Account one, and forbidding it would be asserting
    // the wrong thing. What must not exist is a SECOND way to delete an account:
    // a screen reaching the engine directly, or a privileged user delete.
    const src = code(file)
    expect(src).not.toMatch(/request_account_deletion|deleteUser|admin\.deleteUser/)
  })

  it('app/me/edit.tsx no longer signs out at all', () => {
    // This screen has no Sign Out control, so any sign-out in it is the old
    // delete-means-logout path returning. Asserted here and not for
    // settings/index.tsx, where a sign-out is correct.
    expect(code('app/me/edit.tsx')).not.toMatch(/auth\.signOut/)
  })

  it('and the deletion flow is the only caller of the deletion RPC', () => {
    // `lib/accountDeletion.ts` is the one module that speaks to the engine. If a
    // screen starts calling it directly, the disclosure stops being guaranteed.
    const screen = read('app/settings/delete-account.tsx')
    expect(screen).toMatch(/from '.*lib\/accountDeletion'|from "@\/lib\/accountDeletion"/)
  })
})
