// Pure UI-state logic for pre-booking message requests. No I/O — the server
// (RLS + triggers, migration 20260901000000) is the authority; these helpers only
// decide what the UI shows so behavior stays consistent and testable.
//
// request_status on a conversation:
//   null       -> open conversation (booking-linked or legacy/normal chat)
//   'pending'  -> client sent ONE initial request, awaiting the provider
//   'accepted' -> provider accepted; normal two-way conversation
//   'declined' -> provider declined; no further messages (client may re-request)

export type RequestStatus = 'pending' | 'accepted' | 'declined' | null | undefined
export type ViewerRole = 'client' | 'provider'

export const REQUEST_DECLINED_CLIENT_COPY = "This provider isn't available to chat right now."
export const REQUEST_PENDING_CLIENT_COPY =
  "Message request sent. You'll be able to keep chatting once they accept."
export const REQUEST_PENDING_PROVIDER_COPY = 'wants to connect. Accept to start chatting.'

export interface ComposerState {
  // Whether the normal message composer is available.
  canCompose: boolean
  // Provider-only accept/decline controls (a pending incoming request).
  showAcceptDecline: boolean
  // A status notice to show in place of the composer, or null.
  notice: string | null
}

// What the thread screen should render for a given request status + viewer role.
export function composerState(status: RequestStatus, role: ViewerRole): ComposerState {
  if (status === 'pending') {
    return role === 'provider'
      ? { canCompose: false, showAcceptDecline: true, notice: null }
      : { canCompose: false, showAcceptDecline: false, notice: REQUEST_PENDING_CLIENT_COPY }
  }
  if (status === 'declined') {
    return {
      canCompose: false,
      showAcceptDecline: false,
      notice: role === 'client' ? REQUEST_DECLINED_CLIENT_COPY : 'You declined this request.',
    }
  }
  // null / 'accepted' -> open conversation.
  return { canCompose: true, showAcceptDecline: false, notice: null }
}

// A pending request is the only "active request" state (shown in the Requests
// filter). Declined is closed; null/accepted are normal conversations.
export function isActiveRequest(status: RequestStatus): boolean {
  return status === 'pending'
}

// Where a conversation belongs in the inbox:
//  - 'requests' : a pending request (incoming for a provider, sent for a client)
//  - 'active'   : an open conversation (null/accepted, incl. booking-linked)
//  - 'hidden'   : a declined request is not shown in the active list
export function inboxSection(status: RequestStatus): 'requests' | 'active' | 'hidden' {
  if (status === 'pending') return 'requests'
  if (status === 'declined') return 'hidden'
  return 'active'
}

// Given an existing conversation's request status (or none), decide what tapping
// "Message" on a provider profile should do:
//  - 'open'    : open the existing thread (null/accepted/pending all viewable)
//  - 'compose' : no conversation, or a declined one -> compose a new request
export function messageEntryAction(status: RequestStatus, exists: boolean): 'open' | 'compose' {
  if (!exists) return 'compose'
  if (status === 'declined') return 'compose'
  return 'open'
}
