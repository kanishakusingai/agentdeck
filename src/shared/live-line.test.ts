import { describe, expect, it } from 'vitest'
import { applyKeys, canMirror, EMPTY_LINE, keysToReach, splitKeys } from './live-line'

const BS = '\u007f'
const RIGHT = '\u001b[C'

describe('keysToReach (the message box → the terminal)', () => {
  it('types only the new letters when the text grows', () => {
    expect(keysToReach({ text: 'hel', cursor: 3 }, 'hello')).toBe('lo')
  })

  it('backspaces to where the texts differ, then types the rest', () => {
    expect(keysToReach({ text: 'hello', cursor: 5 }, 'help')).toBe(`${BS}${BS}p`)
    expect(keysToReach({ text: 'abc', cursor: 3 }, '')).toBe(BS.repeat(3))
  })

  it('moves to the end first when the terminal cursor is further left', () => {
    expect(keysToReach({ text: 'abc', cursor: 1 }, 'abcd')).toBe(`${RIGHT}${RIGHT}d`)
  })

  it('counts an emoji as one character', () => {
    expect(keysToReach({ text: 'hi 👋', cursor: 4 }, 'hi ')).toBe(BS)
  })

  it('sends nothing when nothing changed', () => {
    expect(keysToReach({ text: 'same', cursor: 4 }, 'same')).toBe('')
  })
})

describe('applyKeys (typing straight into the terminal → the message box)', () => {
  it('adds typed letters at the cursor', () => {
    expect(applyKeys(EMPTY_LINE, 'hi')).toEqual({ line: { text: 'hi', cursor: 2 }, unsure: false })
    expect(applyKeys({ text: 'hlo', cursor: 1 }, 'el').line).toEqual({ text: 'hello', cursor: 3 })
  })

  it('follows backspace, delete, arrows, Home and End', () => {
    expect(applyKeys({ text: 'hello', cursor: 5 }, BS).line).toEqual({ text: 'hell', cursor: 4 })
    expect(applyKeys({ text: 'hello', cursor: 5 }, '\u001b[D\u001b[D\u001b[3~').line).toEqual({ text: 'helo', cursor: 3 })
    expect(applyKeys({ text: 'hello', cursor: 5 }, '\u001b[HX').line).toEqual({ text: 'Xhello', cursor: 1 })
    expect(applyKeys({ text: 'hello', cursor: 0 }, '\u001b[F!').line).toEqual({ text: 'hello!', cursor: 6 })
  })

  it('empties on Enter and Ctrl+C, and says the screen should be checked after Enter', () => {
    expect(applyKeys({ text: 'run it', cursor: 6 }, '\r')).toEqual({ line: EMPTY_LINE, unsure: true })
    expect(applyKeys({ text: 'oops', cursor: 4 }, '\u0003').line).toEqual(EMPTY_LINE)
  })

  it('follows Ctrl+U, Ctrl+K and Ctrl+W', () => {
    expect(applyKeys({ text: 'one two', cursor: 4 }, '\u0015').line).toEqual({ text: 'two', cursor: 0 })
    expect(applyKeys({ text: 'one two', cursor: 3 }, '\u000b').line).toEqual({ text: 'one', cursor: 3 })
    expect(applyKeys({ text: 'one two ', cursor: 8 }, '\u0017').line).toEqual({ text: 'one ', cursor: 4 })
  })

  it('inserts pasted text', () => {
    expect(applyKeys({ text: 'a ', cursor: 2 }, '\u001b[200~pasted\u001b[201~').line).toEqual({ text: 'a pasted', cursor: 8 })
  })

  it('keeps the text but asks for a screen check after keys the agent decides (Tab, ↑, ↓, Esc)', () => {
    for (const key of ['\t', '\u001b[A', '\u001b[B', '\u001b', '\u001b[Z']) {
      expect(applyKeys({ text: '/co', cursor: 3 }, key)).toEqual({ line: { text: '/co', cursor: 3 }, unsure: true })
    }
  })

  it('ignores focus and mouse reports', () => {
    expect(applyKeys({ text: 'x', cursor: 1 }, '\u001b[I\u001b[O\u001b[<0;10;5M')).toEqual({ line: { text: 'x', cursor: 1 }, unsure: false })
  })
})

describe('splitKeys (each key on its own, so agents do not read a burst as a paste)', () => {
  it('splits control keys and escape sequences apart, keeping runs of letters together', () => {
    expect(splitKeys(`${RIGHT}${RIGHT}${BS}${BS}lo`)).toEqual([RIGHT, RIGHT, BS, BS, 'lo'])
    expect(splitKeys('hi\r')).toEqual(['hi', '\r'])
    expect(splitKeys('')).toEqual([])
  })
})

describe('canMirror', () => {
  it('is false for text a terminal line cannot hold (several lines, tabs)', () => {
    expect(canMirror('one line')).toBe(true)
    expect(canMirror('two\nlines')).toBe(false)
    expect(canMirror('a\tb')).toBe(false)
  })
})
