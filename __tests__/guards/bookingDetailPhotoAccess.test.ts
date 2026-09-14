import { readFileSync } from 'fs'
import { join } from 'path'

// THE ACCESS BOUNDARY AROUND BOOKING REFERENCE PHOTOS.
//
// Showing a client their own reference photos required NO database change: the
// policies already name both parties to the booking. That is exactly why this
// guard exists. The safety of this feature rests on the screen going through one
// helper that scopes to one booking, and on the database — not on the screen —
// deciding who may read an object. Both are easy to erode with an edit that
// looks like a convenience: a direct query "to save a round trip", a signed-URL
// call moved inline, a component taught to fetch its own data.
//
// Source-level because the property is structural. A widened query renders
// perfectly happily and returns exactly what it should for the developer testing
// it, who owns the booking they are looking at.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

// These files EXPLAIN the boundary in prose, naming the very policies, tables and
// modules the assertions below forbid in code. Reading the raw source would fail on
// the explanation and push the next person to delete the reasoning rather than fix a
// defect — the same trap `bookingFlowPhase2c.test.ts` documents. So: code only.
function codeOnly(src: string): string {
  let inBlock = false
  return src
    .split('\n')
    .map((line) => {
      let out = ''
      let i = 0
      while (i < line.length) {
        if (inBlock) {
          const close = line.indexOf('*/', i)
          if (close === -1) return out
          inBlock = false
          i = close + 2
          continue
        }
        const block = line.indexOf('/*', i)
        const lineComment = line.indexOf('//', i)
        if (lineComment !== -1 && (block === -1 || lineComment < block)) {
          return out + line.slice(i, lineComment)
        }
        if (block !== -1) {
          out += line.slice(i, block)
          inBlock = true
          i = block + 2
          continue
        }
        return out + line.slice(i)
      }
      return out
    })
    .join('\n')
}

/** Only the `import` lines, which is where a data dependency would have to appear. */
const importsOf = (src: string) =>
  src.split('\n').filter((l) => /^\s*import\b/.test(l)).join('\n')

const DETAIL = 'app/bookings/[id].tsx'
const COMPONENT = 'components/ui/ReferencePhotos.tsx'
const HELPER = 'lib/bookingPhotos.ts'

describe('the client booking detail reads photos through the one helper', () => {
  const src = codeOnly(read(DETAIL))

  it('calls bookingPhotoUrls, and with this route’s booking id', () => {
    expect(src).toContain("import { bookingPhotoUrls }")
    expect(src).toContain('bookingPhotoUrls(id as string)')
  })

  it('never reaches around the helper to the table or the bucket', () => {
    // The helper scopes to one booking and signs one object at a time. A direct
    // query here would be a second access path with none of that.
    expect(src).not.toContain('booking_reference_photos')
    expect(src).not.toContain('booking-photos')
    expect(src).not.toContain('createSignedUrl')
    expect(src).not.toContain('supabase.storage')
  })

  it('does not upload, replace or delete from the detail screen', () => {
    // Reference photos settle on send (PD ruling recorded in lib/bookingPhotos.ts).
    // The detail screen shows the record; it does not edit it.
    expect(src).not.toContain('attachBookingPhotos')
    expect(src).not.toContain('MAX_BOOKING_PHOTOS')
  })
})

describe('the presentation component cannot fetch', () => {
  const src = codeOnly(read(COMPONENT))

  it('imports no data layer at all', () => {
    // If this component could fetch, the authorization boundary would move from
    // "the screen asked for one booking" to "a component asks for whatever it is
    // handed", which is how a photo from another booking eventually renders.
    const imports = importsOf(read(COMPONENT))
    expect(imports).not.toContain('supabase')
    expect(imports).not.toContain('bookingPhotos')
    expect(imports).not.toContain('useEffect')
    expect(src).not.toContain('useEffect')
    expect(src).not.toContain('await ')
  })

  it('takes already-signed URLs and nothing that identifies a booking', () => {
    expect(src).toContain('urls: string[]')
    expect(src).not.toContain('bookingId')
    expect(src).not.toContain('storage_path')
  })
})

describe('the helper still scopes a read to one booking', () => {
  const src = codeOnly(read(HELPER))

  it('filters booking_reference_photos by the requested booking id', () => {
    // Without this the signed-URL loop would fan out across every photo row the
    // caller can see, which for a provider is every client who ever booked them.
    expect(src).toContain("export async function bookingPhotoUrls(bookingId: string)")
    const fn = src.slice(src.indexOf('export async function bookingPhotoUrls'))
    expect(fn).toContain(".from('booking_reference_photos')")
    expect(fn).toContain(".eq('booking_id', bookingId)")
  })

  it('drops any object it could not obtain a URL for, rather than rendering a gap', () => {
    // A viewer who may not read an object gets no signed URL for it. Filtering
    // here is what makes the storage policy the real boundary and makes the whole
    // path fail closed.
    const fn = src.slice(src.indexOf('export async function bookingPhotoUrls'))
    expect(fn).toContain('s?.signedUrl ?? null')
    expect(fn).toContain('filter((u): u is string => !!u)')
  })

  it('was already written to serve either party, and was not widened for this', () => {
    // The read side of this module predates the booking detail entirely — it was
    // written for the provider's request screen, and its own contract already said
    // it served whoever was reading. Adding the client's view needed nothing from
    // it. If a future edit to this file turns up alongside a booking-detail change,
    // that is the thing to look at.
    expect(read(HELPER)).toContain('for whichever party is reading')
  })
})
