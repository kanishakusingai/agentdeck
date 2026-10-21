/**
 * The message box and the terminal's own input line show the same text, live.
 *
 * Typing in the box sends the keys that turn the terminal's line into the box's text;
 * typing in the terminal is replayed onto a copy of its line so the box can show it.
 * Keys whose effect only the agent knows (Tab completion, history, menus) are flagged
 * "unsure", and the caller re-reads the line from the screen.
 */

/** A one-line text and where the cursor is in it (both counted in characters, not UTF-16 units). */
export interface Line {
  text: string
  cursor: number
}

export const EMPTY_LINE: Line = { text: '', cursor: 0 }

const BACKSPACE = '\u007f'
const RIGHT = '\u001b[C'

const chars = (s: string): string[] => Array.from(s)

/** True when a terminal's single input line can hold the text exactly. */
export function canMirror(text: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[\u0000-\u001f\u007f]/.test(text)
}

/** Keys that turn the terminal's line into `next`: go to the end, backspace to where they differ, type the rest. */
export function keysToReach(line: Line, next: string): string {
  const from = chars(line.text)
  const to = chars(next)
  let same = 0
  while (same < from.length && same < to.length && from[same] === to[same]) same++
  if (same === from.length && same === to.length) return ''
  return RIGHT.repeat(Math.max(0, from.length - line.cursor)) + BACKSPACE.repeat(from.length - same) + to.slice(same).join('')
}

// One key or escape sequence at a time: bracketed paste, CSI, SS3, Alt+key, or a single character.
// eslint-disable-next-line no-control-regex
const TOKEN = /\u001b\[200~([\s\S]*?)\u001b\[201~|\u001b\[[0-?]*[ -/]*[@-~]|\u001bO.|\u001b[\s\S]?|[\s\S]/gu

/**
 * Keys to send one write at a time. Agent UIs (Ink, crossterm) read several keys that
 * arrive together as a paste, so "⌫⌫⌫" in one write would not delete anything.
 * Runs of ordinary letters stay together; every control key or sequence is on its own.
 */
export function splitKeys(keys: string): string[] {
  const out: string[] = []
  for (const [key] of keys.matchAll(TOKEN)) {
    // eslint-disable-next-line no-control-regex
    const plain = !/[\u0000-\u001f\u007f]/.test(key)
    // eslint-disable-next-line no-control-regex
    if (plain && out.length && !/[\u0000-\u001f\u007f]/.test(out[out.length - 1])) out[out.length - 1] += key
    else out.push(key)
  }
  return out
}

/** Replay keys typed into the terminal onto its line. */
export function applyKeys(start: Line, data: string): { line: Line; unsure: boolean } {
  let text = chars(start.text)
  let cursor = Math.min(start.cursor, text.length)
  let unsure = false
  const insert = (s: string): void => {
    const add = chars(s)
    text = [...text.slice(0, cursor), ...add, ...text.slice(cursor)]
    cursor += add.length
  }
  for (const match of data.matchAll(TOKEN)) {
    const key = match[0]
    if (match[1] !== undefined) {
      insert(match[1].replace(/\r\n?/g, '\n'))
      continue
    }
    switch (key) {
      case '\r':
        text = []
        cursor = 0
        unsure = true
        break
      case '\u0003':
        text = []
        cursor = 0
        break
      case BACKSPACE:
      case '\b':
        if (cursor > 0) {
          text.splice(cursor - 1, 1)
          cursor--
        }
        break
      case '\u001b[3~':
        text.splice(cursor, 1)
        break
      case '\u001b[D':
      case '\u001bOD':
        cursor = Math.max(0, cursor - 1)
        break
      case '\u001b[C':
      case '\u001bOC':
        cursor = Math.min(text.length, cursor + 1)
        break
      case '\u001b[H':
      case '\u001bOH':
      case '\u001b[1~':
      case '\u0001':
        cursor = 0
        break
      case '\u001b[F':
      case '\u001bOF':
      case '\u001b[4~':
      case '\u0005':
        cursor = text.length
        break
      case '\u0015':
        text = text.slice(cursor)
        cursor = 0
        break
      case '\u000b':
        text = text.slice(0, cursor)
        break
      case '\u0017': {
        let to = cursor
        while (to > 0 && text[to - 1] === ' ') to--
        while (to > 0 && text[to - 1] !== ' ') to--
        text.splice(to, cursor - to)
        cursor = to
        break
      }
      // Focus in/out and mouse reports aren't typing.
      case '\u001b[I':
      case '\u001b[O':
        break
      default:
        // eslint-disable-next-line no-control-regex
        if (/^\u001b\[<[\d;]*[Mm]$/.test(key)) break
        // eslint-disable-next-line no-control-regex
        if (/[\u0000-\u001f\u007f]/.test(key)) unsure = true
        else insert(key)
    }
  }
  return { line: { text: text.join(''), cursor }, unsure }
}
