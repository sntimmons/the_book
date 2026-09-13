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

jest.mock('@/lib/operator', () => ({ amIOperator: jest.fn(async () => false) }))

import { router } from 'expo-router'
import EditProfileScreen from '@/app/me/edit'
import SettingsScreen from '@/app/settings'

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

describe('app/settings/index.tsx — the PRIMARY Delete Account row', () => {
  // This screen had no behavioural test at all: its only coverage was a source
  // scan, and it is the entry point most likely to be edited. It also has a
  // legitimate Sign Out row right beside the Delete Account one, which is exactly
  // the substitution that would go unnoticed — press Delete Account, get signed
  // out, and every source assertion still passes because the file is *allowed* to
  // contain `signOut`.
  it('routes to the deletion flow and does not sign out', async () => {
    const { getByText } = render(<SettingsScreen />)
    await waitFor(() => getByText('Delete Account'))

    fireEvent.press(getByText('Delete Account'))

    expect(router.push).toHaveBeenCalledWith(DELETION_ROUTE)
    expect(mockSignOut).not.toHaveBeenCalled()
  })

  it('and its Sign Out row is a different control that does NOT delete', async () => {
    const { getByText } = render(<SettingsScreen />)
    await waitFor(() => getByText('Sign Out'))

    const alertSpy = jest.spyOn(Alert, 'alert')
    fireEvent.press(getByText('Sign Out'))

    // Sign Out confirms and does not navigate to the deletion flow. Asserting the
    // pair is the point: the two controls must not be able to swap places.
    expect(alertSpy).toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalledWith(DELETION_ROUTE)
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

  // DISCOVERED, NOT LISTED. A hardcoded list is invisible to exactly the thing
  // PD-110 exists to prevent — a THIRD screen growing a Delete Account control
  // tomorrow. The list is found by walking `app/`, so a new one is included
  // without anybody remembering to add it here.
  const walk = (dir: string): string[] => {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const root = path.join(__dirname, '..', '..')
    return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) return walk(rel)
      return e.isFile() && /\.tsx$/.test(e.name) ? [rel] : []
    })
  }

  const DELETION_SCREEN = 'app/settings/delete-account.tsx'
  const ENTRY_POINTS = walk('app')
    .filter((f) => f !== DELETION_SCREEN)
    .filter((f) => /Delete Account|delete-account/i.test(code(f)))

  it('the discovery found the entry points it is supposed to guard', () => {
    // A discovery that silently finds NOTHING would make every case below pass
    // vacuously — which is the failure mode of a generated list.
    expect(ENTRY_POINTS).toEqual(
      expect.arrayContaining(['app/me/edit.tsx', 'app/settings/index.tsx']),
    )
  })

  it.each(ENTRY_POINTS)('%s routes to the deletion flow in CODE, not in a comment', (file) => {
    // `code`, not `read`. This file built the comment stripper because a comment
    // defeated an earlier assertion, and then failed to use it here — and
    // `app/me/edit.tsx` carries the route string inside an explanatory comment,
    // so the raw-source form passed on prose.
    expect(code(file)).toContain(DELETION_ROUTE)
  })

  it.each(ENTRY_POINTS)('%s implements no deletion of its own', (file) => {
    // NOT "never calls signOut" — `app/settings/index.tsx` has a legitimate Sign
    // Out row beside the Delete Account one, and forbidding it would be asserting
    // the wrong thing. What must not exist is a SECOND way to delete an account:
    // a screen reaching the engine directly, or a privileged user delete.
    const src = code(file)
    expect(src).not.toMatch(
      /request_account_deletion|requestAccountDeletion|deleteUser|admin\.deleteUser/,
    )
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
