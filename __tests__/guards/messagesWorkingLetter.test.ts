import { readFileSync } from 'fs'
import { join } from 'path'

// MESSAGES AFTER THE SESSION 7B "WORKING LETTER" MIGRATION.
//
// Source-level, because these are structural properties that render perfectly
// happily when wrong: a re-introduced hex still paints, a relocated safety
// notice still draws, and a filter whose predicate quietly changed still shows
// a list. None of it throws.

const code = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8')

function stripComments(src: string): string {
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

const INBOX = 'app/(tabs)/messages.tsx'
const THREAD = 'app/messages/[id].tsx'
const SURFACES = [INBOX, THREAD] as const

describe('Messages resolves every colour from the theme', () => {
  it.each(SURFACES)('%s carries no colour literal', (rel) => {
    const src = stripComments(code(rel))
    const hits = (src.match(/#[0-9A-Fa-f]{3,8}\b|rgba?\(/g) ?? []).filter(
      (m) => m !== 'rgba(' && m !== 'rgb(',
    )
    expect(hits).toEqual([])
  })

  it.each(SURFACES)('%s reads the theme rather than a scheme flag', (rel) => {
    const src = stripComments(code(rel))
    expect(src).toMatch(/useTheme\(\)/)
    // A scheme-driven COLOUR choice would mean a missing token. The one
    // legitimate use is the status-bar content style, which is not a colour.
    expect(src).not.toMatch(/scheme === ['"]dark['"] \? colors/)
  })

  it.each(SURFACES)('%s keeps no retired The Book palette value', (rel) => {
    const raw = code(rel)
    for (const legacy of ['C8922A', 'F0E8D5', '080808', '1A1410', '111111']) {
      expect(raw).not.toContain(legacy)
    }
  })

  it('the status bar follows the scheme instead of being pinned light', () => {
    const src = stripComments(code(INBOX))
    expect(src).toMatch(/StatusBar style=\{scheme === 'dark' \? 'light' : 'dark'\}/)
  })

  it('the iOS input accessory takes a token background', () => {
    const src = stripComments(code(THREAD))
    expect(src).toMatch(/backgroundColor=\{colors\.bgElevated\}/)
  })
})

describe('the inbox filters keep their exact prior behaviour', () => {
  it('only the LABEL of All changed, not its predicate', () => {
    const src = stripComments(code(INBOX))
    expect(src).toMatch(/all: 'Conversations'/)
    // The three predicates, unchanged.
    expect(src).toMatch(/inboxSection\(c\.request_status\) === 'requests'/)
    expect(src).toMatch(
      /c\.booking_id !== null && inboxSection\(c\.request_status\) !== 'hidden'/,
    )
    expect(src).toMatch(/inboxSection\(c\.request_status\) === 'active'/)
  })

  it('the filter keys are still all / requests / bookings', () => {
    const src = stripComments(code(INBOX))
    expect(src).toMatch(/type Filter = 'all' \| 'requests' \| 'bookings'/)
  })

  it('remains text + underline, not segmented pills', () => {
    const src = stripComments(code(INBOX))
    expect(src).toMatch(/tabUnderline/)
    expect(src).not.toMatch(/segment|pill/i)
  })

  it('the Requests count is truthful and lives only in the filter', () => {
    const src = stripComments(code(INBOX))
    expect(src).toMatch(
      /requestCount = conversations\.filter\(\s*\(c\) => inboxSection\(c\.request_status\) === 'requests',\s*\)\.length/,
    )
    expect(src).toMatch(/tab === 'requests' && requestCount > 0/)
  })
})

describe('the inbox states nothing it cannot do', () => {
  it('no empty state instructs an action this screen cannot perform', () => {
    const src = stripComments(code(INBOX))
    expect(src).not.toMatch(/Message a provider to get started/)
    expect(src).toMatch(/No conversations yet/)
    expect(src).toMatch(/No message requests/)
    expect(src).toMatch(/No booking conversations/)
  })

  it('there is still no compose control', () => {
    const src = stripComments(code(INBOX))
    expect(src).not.toMatch(/messages\/new|compose|Compose/)
  })

  it('shows no numeric unread count on a row', () => {
    const src = stripComments(code(INBOX))
    expect(src).not.toMatch(/\{convo\.unread_count\}/)
    expect(src).toMatch(/unread = convo\.unread_count > 0/)
  })

  it('unread is carried by weight as well as by the dot', () => {
    const src = stripComments(code(INBOX))
    expect(src).toMatch(/unread \? FONT\.extrabold : FONT\.semibold/)
    expect(src).toMatch(/styles\.unreadDot/)
  })

  it('fetches no avatar image — the data layer has none', () => {
    const src = stripComments(code(INBOX))
    expect(src).not.toMatch(/profile_photo_url|<Image/)
  })
})

describe('the thread preserves messaging product behaviour', () => {
  it('gating still comes from composerState, unchanged', () => {
    const src = stripComments(code(THREAD))
    expect(src).toMatch(/const gate = composerState\(requestStatus, viewerRole\)/)
    expect(src).toMatch(/gate\.canCompose/)
    expect(src).toMatch(/gate\.showAcceptDecline/)
    expect(src).toMatch(/gate\.notice/)
  })

  it('the neutral unavailable copy is still the library copy, never inlined', () => {
    const src = stripComments(code(THREAD))
    expect(src).toMatch(/BLOCKED_THREAD_COPY\.notice/)
    expect(src).toMatch(/BLOCKED_THREAD_COPY\.action/)
    // PD-082: the screen must not author a cause-naming sentence of its own.
    expect(src).not.toMatch(/blocked you|has blocked|because you were blocked/i)
  })

  it('THE BLOCKER NOTICE WAS NOT MOVED INTO THE CONTEXT BAND', () => {
    // Relocating a safety notice is a safety change, not a visual one. It stays
    // paired with the composer it does not close and with its Unblock action.
    const src = stripComments(code(THREAD))
    const bandStart = src.indexOf('styles.contextBand')
    const bandEnd = src.indexOf('styles.list')
    expect(bandStart).toBeGreaterThan(-1)
    expect(bandEnd).toBeGreaterThan(bandStart)
    const band = src.slice(bandStart, bandEnd)
    expect(band).not.toMatch(/BLOCKED_THREAD_COPY|blockedByMe/)
    expect(src).toMatch(/blockedByMe === true \?/)
  })

  it('the blocker notice still does not close the composer', () => {
    const src = stripComments(code(THREAD))
    // The composer's only condition is the request gate.
    expect(src).toMatch(/\{gate\.canCompose \?/)
    expect(src).not.toMatch(/canCompose && !blockedByMe|blockedByMe \?\s*null/)
  })

  it('the safety menu is still reachable and still withheld on an unknown party', () => {
    const src = stripComments(code(THREAD))
    expect(src).toMatch(/otherUserId && otherUserId !== user\?\.id \?/)
    expect(src).toMatch(/onPress=\{safetyMenu\}/)
  })

  it('Accept is the one Mulberry action and Decline is an outline', () => {
    const src = stripComments(code(THREAD))
    expect(src).toMatch(/styles\.acceptBtn,\s*\{ backgroundColor: colors\.actionPrimary/)
    expect(src).toMatch(/styles\.declineBtn,\s*\{ borderColor: colors\.borderSubtle/)
  })

  it('no message slab takes the primary action colour', () => {
    // Mulberry belongs to Send and Accept. A Mulberry outgoing bubble would
    // spend the action colour on every sentence the viewer typed.
    const src = stripComments(code(THREAD))
    // Anchor on CODE, not on a comment: stripComments removes the comments, so a
    // comment-worded anchor returns -1 and silently slices to end-of-file —
    // which swept in the composer's entirely legitimate Mulberry.
    const start = src.indexOf('renderItem')
    const end = src.indexOf('styles.blockedNotice')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(src.slice(start, end)).not.toMatch(/actionPrimary/)
  })

  it('grouping semantics are untouched', () => {
    const src = stripComments(code(THREAD))
    expect(src).toMatch(/GROUP_WINDOW_MS = 5 \* 60 \* 1000/)
    expect(src).toMatch(/sameSenderAsPrev/)
    expect(src).toMatch(/sameSenderAsNext/)
  })

  it('system notices are still unattributed and centred', () => {
    const src = stripComments(code(THREAD))
    expect(src).toMatch(/if \(item\.is_system\)/)
    expect(src).toMatch(/styles\.systemWrap/)
  })

  it('introduces no capability the product does not have', () => {
    const src = stripComments(code(THREAD))
    for (const absent of [
      'typing', 'isTyping', 'presence', 'online', 'lastSeen',
      'read receipt', 'readReceipt', 'seenAt', 'reaction', 'attachment', 'voice',
    ]) {
      expect(src.toLowerCase()).not.toContain(absent.toLowerCase())
    }
  })
})

describe('day separators are derived, not stored', () => {
  it('come only from message timestamps', () => {
    const src = stripComments(code(THREAD))
    expect(src).toMatch(/function dayKey\(dateStr: string\)/)
    expect(src).toMatch(/dayKey\(prev\.created_at\) !== dayKey\(item\.created_at\)/)
  })

  it('write nothing and change no message data', () => {
    const src = stripComments(code(THREAD))
    const helpers = src.slice(src.indexOf('function dayKey'), src.indexOf('export default'))
    expect(helpers).not.toMatch(/supabase|insert|update|\.from\(/)
  })
})

describe('navigation is untouched', () => {
  it('the inbox still opens a thread by conversation id', () => {
    expect(stripComments(code(INBOX))).toMatch(/router\.push\(`\/messages\/\$\{convo\.id\}`/)
  })

  it('neither screen redefines the tab bar', () => {
    for (const rel of SURFACES) {
      expect(stripComments(code(rel))).not.toMatch(/tabBar|<Tabs\b/)
    }
  })
})
