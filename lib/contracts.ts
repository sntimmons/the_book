import { File } from 'expo-file-system'
import { supabase } from './supabase'

// Contracts data layer. A provider has at most one active contract (unique on
// provider_id); clients sign it per booking (one contract_signatures row per
// booking). Signature images live in the private contract-signatures bucket —
// for now signatures are placeholders with a null signature_url.
//
// A contract is either typed terms (contract_type 'text', body filled) or an
// uploaded PDF (contract_type 'pdf', pdf_url set, body empty). PDFs live in the
// private contract-pdfs bucket and are viewed through short-lived signed URLs.

export const CONTRACT_PDF_BUCKET = 'contract-pdfs'

export type ContractType = 'text' | 'pdf'

export interface Contract {
  id: string
  providerId: string
  title: string
  body: string
  contractType: ContractType
  pdfUrl: string | null
  pdfFilename: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string | null
  /**
   * The version whose content this object is carrying.
   *
   * Set only by `contract_for_booking`, which is the booking-time read. It is
   * what the acceptance BINDS to, so the record names the document the client
   * actually saw rather than whatever is newest when the row is written.
   */
  currentVersionId?: string | null
  currentVersionNo?: number | null
}

export interface ContractSignature {
  id: string
  contractId: string
  bookingId: string
  clientUserId: string
  signatureUrl: string | null
  signedAt: string | null
  status: 'pending' | 'signed' | 'declined'
}

// A signed contract enriched for the provider's list view.
export interface SignedContractRow {
  signature: ContractSignature
  clientName: string
  bookingDate: string | null
  serviceName: string | null
}

// A signed contract enriched for the read-only viewer.
export interface SignedContractDetail {
  signature: ContractSignature
  contract: Contract | null
  clientName: string
  providerName: string
  /**
   * True when the provider has edited their agreement SINCE this acceptance.
   * Surfaced so neither party has to diff two documents to notice.
   */
  providerChangedSince: boolean
}

interface RawContractRow {
  id: string
  provider_id: string
  title: string
  body: string
  contract_type: ContractType | null
  pdf_url: string | null
  current_version_id?: string | null
  current_version_no?: number | null
  pdf_filename: string | null
  is_active: boolean
  created_at: string
  updated_at: string | null
}

interface RawSignatureRow {
  id: string
  contract_id: string
  booking_id: string
  client_user_id: string
  signature_url: string | null
  signed_at: string | null
  status: 'pending' | 'signed' | 'declined'
}

const CONTRACT_COLUMNS =
  'id, provider_id, title, body, contract_type, pdf_url, pdf_filename, is_active, created_at, updated_at'
const SIGNATURE_COLUMNS =
  'id, contract_id, booking_id, client_user_id, signature_url, signed_at, status'

function mapContract(r: RawContractRow): Contract {
  return {
    id: r.id,
    providerId: r.provider_id,
    title: r.title,
    body: r.body,
    contractType: r.contract_type === 'pdf' ? 'pdf' : 'text',
    pdfUrl: r.pdf_url,
    currentVersionId: (r.current_version_id as string | null) ?? null,
    currentVersionNo: (r.current_version_no as number | null) ?? null,
    pdfFilename: r.pdf_filename,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapSignature(r: RawSignatureRow): ContractSignature {
  return {
    id: r.id,
    contractId: r.contract_id,
    bookingId: r.booking_id,
    clientUserId: r.client_user_id,
    signatureUrl: r.signature_url,
    signedAt: r.signed_at,
    status: r.status,
  }
}

// The provider's active contract, or null if they have not created one.
export async function fetchProviderContract(providerId: string): Promise<Contract | null> {
  if (!providerId) return null
  const { data, error } = await supabase
    .from('contracts')
    .select(CONTRACT_COLUMNS)
    .eq('provider_id', providerId)
    .eq('is_active', true)
    .maybeSingle()
  // Distinguish a genuine "no contract exists" (data null, no error) from a
  // technical failure (network/query/RLS). A real error must NOT be collapsed to
  // null, or a caller could treat a failed lookup as "no contract required".
  if (error) {
    console.log('Fetch provider contract error:', error)
    throw error
  }
  if (!data) return null
  return mapContract(data as RawContractRow)
}

// The contract a client is about to be asked to sign, for ONE BOOKING.
//
// WHY THIS IS NOT `fetchProviderContract`. That function reads `contracts`
// directly, and the table's RLS is `auth.uid() = user_id OR is_contract_signer(id)`
// — owner, or someone who has ALREADY signed. A first-time client is neither, so
// the read returned ZERO ROWS AND NO ERROR (reproduced against non-production),
// this module correctly reported "no contract exists", and the booking flow
// skipped the signing gate entirely for every client, every provider, always.
//
// WHY IT IS SCOPED TO A BOOKING (Correction 3, item J). The first fix was a
// `SECURITY DEFINER` read keyed on the PROVIDER, which meant any authenticated
// user could pull any approved provider's contract text at any time, whether or
// not they were transacting with them. Now the row exists before this step (see
// lib/bookingDraft.ts), so access is keyed on the BOOKING instead:
// `contract_for_booking` returns the active contract only to the client who
// holds that booking with that provider. Nobody has a standing read path into
// other people's contract terms.
//
// A technical failure still THROWS rather than reporting absence — the Batch 4A
// rule — because a failed lookup must never be mistaken for "no contract
// required" and skip the gate a second way.
export async function fetchContractForBooking(bookingId: string): Promise<Contract | null> {
  if (!bookingId) return null
  const { data, error } = await supabase.rpc('contract_for_booking', {
    p_booking_id: bookingId,
  })
  if (error) {
    console.log('Fetch contract for booking error:', error)
    throw error
  }
  const rows = (data as RawContractRow[] | null) ?? []
  if (rows.length === 0) return null
  return mapContract(rows[0])
}

// NOTE: `fetchContractSignature(bookingId)` used to sit here. It had zero callers
// anywhere in the repo, and it was the one function in this module that swallowed
// a technical error and returned null for an existence question — the fail-open
// shape Batch 4A hardened `fetchProviderContract` against. A helper with exactly
// the right name that answers "not signed" when the network is down is a trap for
// whoever next wires "has this booking been signed?", so it is removed rather than
// left. Reinstate it with the throw-on-error contract its siblings have.

// Recent signed contracts for a provider (client name + booking date), newest
// first. Empty if the provider has no contract.
export async function fetchProviderSignatures(
  providerId: string,
): Promise<SignedContractRow[]> {
  // Provider's own list view; a contract-lookup failure degrades to an empty
  // list here (not a booking gate), so swallow it rather than crashing the list.
  let contract: Contract | null
  try {
    contract = await fetchProviderContract(providerId)
  } catch (e) {
    console.log('Fetch provider signatures (contract lookup) error:', e)
    return []
  }
  if (!contract) return []

  const { data, error } = await supabase
    .from('contract_signatures')
    .select(SIGNATURE_COLUMNS)
    .eq('contract_id', contract.id)
    .eq('status', 'signed')
    .order('signed_at', { ascending: false })
    .limit(10)
  if (error) {
    console.log('Fetch provider signatures error:', error)
    return []
  }
  const sigs = ((data as RawSignatureRow[] | null) ?? []).map(mapSignature)
  if (sigs.length === 0) return []

  const bookingIds = Array.from(new Set(sigs.map((s) => s.bookingId).filter(Boolean)))
  const clientIds = Array.from(new Set(sigs.map((s) => s.clientUserId).filter(Boolean)))

  // ── ONLY SIGNATURES ON A SENT REQUEST ───────────────────────────────────
  //
  // The signature is written against the booking BEFORE it is submitted, and
  // deliberately so: a request the provider can see is never one whose signature
  // failed to save. The cost is that an abandoned flow can leave a signature
  // pointing at a DRAFT — and the provider cannot read that booking at all
  // (their SELECT policy requires `submitted_at is not null`), so it rendered
  // here as "someone signed my contract" with a blank date and no service name.
  //
  // The booking lookup already runs as the provider, so RLS has ALREADY answered
  // the question: a signature whose booking is absent from this map is one the
  // provider has no sent request for. `bookingsReadFailed` keeps that inference
  // honest — a failed query also produces an empty map, and dropping every
  // signature on a connection error would tell a provider nobody had ever signed
  // anything.
  const bookingMap = new Map<string, { date: string | null; service: string | null }>()
  let bookingsReadFailed = false
  if (bookingIds.length > 0) {
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id, requested_date, service_name')
      .in('id', bookingIds)
    if (bookingsError) bookingsReadFailed = true
    for (const b of (bookings as
      | { id: string; requested_date: string | null; service_name: string | null }[]
      | null) ?? []) {
      bookingMap.set(b.id, { date: b.requested_date, service: b.service_name })
    }
  }
  const visible = bookingsReadFailed ? sigs : sigs.filter((s) => bookingMap.has(s.bookingId))
  if (visible.length === 0) return []

  const clientMap = new Map<string, string>()
  if (clientIds.length > 0) {
    const { data: clients } = await supabase
      .from('clients_provider')
      .select('id, name')
      .in('id', clientIds)
    for (const c of (clients as { id: string; name: string | null }[] | null) ?? []) {
      clientMap.set(c.id, c.name || 'Client')
    }
  }

  return visible.map((s) => ({
    signature: s,
    clientName: clientMap.get(s.clientUserId) ?? 'Client',
    bookingDate: bookingMap.get(s.bookingId)?.date ?? null,
    serviceName: bookingMap.get(s.bookingId)?.service ?? null,
  }))
}

// A single signed contract with its contract text, client, and provider, for
// the read-only viewer. `signatureId` is a contract_signatures.id.
export async function fetchSignedContract(
  signatureId: string,
): Promise<SignedContractDetail | null> {
  if (!signatureId) return null
  const { data, error } = await supabase
    .from('contract_signatures')
    .select(SIGNATURE_COLUMNS)
    .eq('id', signatureId)
    .maybeSingle()
  if (error || !data) {
    if (error) console.log('Fetch signed contract error:', error)
    return null
  }
  const signature = mapSignature(data as RawSignatureRow)

  // THE ACCEPTED VERSION, NOT TODAY'S CONTRACT.
  //
  // This read `public.contracts` — the MUTABLE row — so a provider who edited
  // their agreement had this screen show the NEW terms under the original
  // acceptance timestamp and a "Signed" check. That is the exact defect
  // 20261068000000 was written to fix, and it survived on the one screen in the
  // product that displays a past acceptance.
  //
  // `booking_contract_record` returns what was actually accepted, to both
  // parties, and reports whether the provider has changed their agreement since.
  const { data: recordRows } = await supabase.rpc('booking_contract_record', {
    p_booking_id: signature.bookingId,
  })
  const rec = ((recordRows as Record<string, unknown>[] | null) ?? [])[0] ?? null
  const contract = rec
    ? {
        id: rec.contract_id as string,
        providerId: '',
        title: (rec.title as string) ?? 'Service Agreement',
        body: (rec.body as string) ?? '',
        contractType: (rec.contract_type as ContractType) ?? 'text',
        pdfUrl: (rec.pdf_url as string | null) ?? null,
        pdfFilename: (rec.pdf_filename as string | null) ?? null,
        isActive: true,
        createdAt: '',
        updatedAt: null,
        currentVersionId: (rec.contract_version_id as string | null) ?? null,
        currentVersionNo: (rec.version_no as number | null) ?? null,
      }
    : null
  const providerChangedSince = rec ? rec.provider_contract_changed_since === true : false

  let clientName = 'Client'
  if (signature.clientUserId) {
    const { data: client } = await supabase
      .from('clients_provider')
      .select('name')
      .eq('id', signature.clientUserId)
      .maybeSingle()
    clientName = (client as { name: string | null } | null)?.name || 'Client'
  }

  let providerName = 'Provider'
  if (contract?.providerId) {
    const { data: provider } = await supabase
      .from('providers')
      .select('display_name')
      .eq('id', contract.providerId)
      .maybeSingle()
    providerName = (provider as { display_name: string | null } | null)?.display_name || 'Provider'
  }

  return { signature, contract, clientName, providerName, providerChangedSince }
}

// ── PDF upload + viewing ────────────────────────────────────────────────────

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Decode a base64 string to an ArrayBuffer (no external dependency). Supabase
// storage uploads an ArrayBuffer reliably in React Native, whereas a base64
// string or a fetch() blob of a file:// URI are not dependable across SDKs.
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const lookup = new Uint8Array(256)
  for (let i = 0; i < B64_ALPHABET.length; i++) lookup[B64_ALPHABET.charCodeAt(i)] = i

  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '')
  let len = clean.length
  let bufferLength = Math.floor(len * 0.75)
  if (clean[len - 1] === '=') {
    bufferLength--
    if (clean[len - 2] === '=') bufferLength--
  }
  const bytes = new Uint8Array(bufferLength)
  let p = 0
  for (let i = 0; i < len; i += 4) {
    const e1 = lookup[clean.charCodeAt(i)]
    const e2 = lookup[clean.charCodeAt(i + 1)]
    const e3 = lookup[clean.charCodeAt(i + 2)]
    const e4 = lookup[clean.charCodeAt(i + 3)]
    if (p < bufferLength) bytes[p++] = (e1 << 2) | (e2 >> 4)
    if (p < bufferLength) bytes[p++] = ((e2 & 15) << 4) | (e3 >> 2)
    if (p < bufferLength) bytes[p++] = ((e3 & 3) << 6) | (e4 & 63)
  }
  return bytes.buffer
}

export interface PdfUploadResult {
  url: string | null
  error: string | null
}

// Read a picked PDF (file:// URI) and upload it to the private contract-pdfs
// bucket at `userId/contract_<timestamp>.pdf`. Returns the stored (non-public)
// URL, which encodes the storage path for later signing. Never throws.
export async function uploadContractPdf(
  userId: string,
  fileUri: string,
): Promise<PdfUploadResult> {
  try {
    if (!userId || !fileUri) return { url: null, error: 'Missing file' }
    const base64 = await new File(fileUri).base64()
    const buffer = base64ToArrayBuffer(base64)
    const path = `${userId}/contract_${Date.now()}.pdf`

    const { error } = await supabase.storage
      .from(CONTRACT_PDF_BUCKET)
      .upload(path, buffer, { contentType: 'application/pdf', upsert: true })
    if (error) {
      console.log('Contract PDF upload error:', error)
      return { url: null, error: error.message }
    }

    // Stored URL encodes the path (…/contract-pdfs/<path>); the bucket is
    // private, so this URL is signed on demand for viewing.
    const { data } = supabase.storage.from(CONTRACT_PDF_BUCKET).getPublicUrl(path)
    return { url: data.publicUrl, error: null }
  } catch (err: any) {
    console.log('Contract PDF upload exception:', err)
    return { url: null, error: err?.message ?? 'Upload failed' }
  }
}

// Extract the storage path (everything after the bucket segment) from a stored
// contract-pdfs URL.
export function storagePathFromUrl(pdfUrl: string): string | null {
  const marker = `/${CONTRACT_PDF_BUCKET}/`
  const idx = pdfUrl.indexOf(marker)
  if (idx === -1) return null
  return pdfUrl.slice(idx + marker.length).split('?')[0]
}

// Generate a signed URL (valid 1 hour) for a stored contract PDF so a WebView
// can load it from the private bucket. Returns null if it cannot be signed.
export async function getSignedPdfUrl(pdfUrl: string): Promise<string | null> {
  const path = storagePathFromUrl(pdfUrl)
  if (!path) return null
  const { data, error } = await supabase.storage
    .from(CONTRACT_PDF_BUCKET)
    .createSignedUrl(path, 3600)
  if (error || !data) {
    if (error) console.log('Signed PDF URL error:', error)
    return null
  }
  return data.signedUrl
}
