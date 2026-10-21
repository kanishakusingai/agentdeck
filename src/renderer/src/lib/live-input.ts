import { useEffect, useRef, useState } from 'react'
import { create } from 'zustand'
import { applyKeys, canMirror, EMPTY_LINE, keysToReach, splitKeys, type Line } from '@shared/live-line'
import { findPrompt, readInputLine, readSlashMenu, type TerminalMenu } from '@shared/terminal-screen'
import { subscribePty, writePty } from './pty-bus'
import { useApp } from './store'
import { onTypedInTerminal, screenRows, useTerminalReady } from './terminals'

/**
 * Live input: each pane's message box and its terminal's input line hold the same text.
 * Typing in the box types into the terminal as you go; typing in the terminal shows up
 * in the box. After keys only the agent understands (Tab, ↑/↓, Esc, Enter in a menu)
 * the line is read back from the screen.
 */

/** The message box text of each process. */
export const useBoxText = create<Record<string, string>>(() => ({}))

/** What each terminal's input line holds (as far as we can tell). */
const lines = new Map<string, Line>()
/** The prompt drawn in front of each terminal's input line, learned from the screen. */
const prompts = new Map<string, string>()

const lineOf = (id: string): Line => lines.get(id) ?? EMPTY_LINE
const length = (s: string): number => Array.from(s).length

// ---------- sending keys one at a time ----------

/** Pause between keys: agents read keys that arrive together as a paste (and ignore ⌫ in it). */
const KEY_GAP_MS = 12
const queues = new Map<string, string[]>()

/** Type `keys` into the terminal, one key per write, in order with everything sent before. */
function typeInto(id: string, keys: string): void {
  const parts = splitKeys(keys)
  if (!parts.length) return
  const queue = queues.get(id)
  if (queue) {
    queue.push(...parts)
    return
  }
  const pending = parts
  queues.set(id, pending)
  const next = (): void => {
    const part = pending.shift()
    if (part === undefined) {
      queues.delete(id)
      return
    }
    writePty(id, part)
    setTimeout(next, KEY_GAP_MS)
  }
  next()
}

function setBox(id: string, text: string): void {
  if ((useBoxText.getState()[id] ?? '') !== text) useBoxText.setState({ [id]: text })
}

// ---------- reading the screen once the terminal has gone quiet ----------

interface Pending {
  resync: boolean
  quiet?: ReturnType<typeof setTimeout>
  cap: ReturnType<typeof setTimeout>
  stop: () => void
}
const pending = new Map<string, Pending>()
const QUIET_MS = 120
const MAX_WAIT_MS = 1000

/** Read the screen when output stops (or after a second): learn the prompt, and re-read the line if asked. */
function checkScreen(id: string, resync: boolean): void {
  let p = pending.get(id)
  const run = (): void => {
    const job = pending.get(id)
    if (!job) return
    clearTimeout(job.quiet)
    clearTimeout(job.cap)
    job.stop()
    pending.delete(id)
    readBack(id, job.resync)
  }
  const wait = (): void => {
    clearTimeout(p!.quiet)
    p!.quiet = setTimeout(run, QUIET_MS)
  }
  if (!p) {
    p = { resync, cap: setTimeout(run, MAX_WAIT_MS), stop: () => undefined }
    pending.set(id, p)
    p.stop = subscribePty(id, wait)
  } else p.resync ||= resync
  wait()
}

function readBack(id: string, resync: boolean): void {
  const screen = screenRows(id)
  if (!screen) return
  const line = lineOf(id)
  if (resync) {
    const prompt = prompts.get(id)
    const shown = prompt === undefined ? null : readInputLine(screen.rows, prompt, screen.cols)
    if (shown !== null && shown !== line.text) {
      lines.set(id, { text: shown, cursor: length(shown) })
      setBox(id, shown)
    }
    return
  }
  if (!line.text) return
  const prompt = findPrompt(screen.rows, line.text)
  if (prompt) prompts.set(id, prompt)
}

// ---------- the two directions ----------

/** The user edited the box: make the terminal's line match. */
export function boxChanged(id: string, text: string): void {
  setBox(id, text)
  // Keys sent before the agent has drawn anything may be dropped; the text is sent once it's ready.
  if (!canMirror(text) || !useTerminalReady.getState()[id]) return
  const keys = keysToReach(lineOf(id), text)
  if (!keys) return
  typeInto(id, keys)
  lines.set(id, { text, cursor: length(text) })
  checkScreen(id, false)
}

/** Keys that went to the terminal (typed in it, or passed on from the box): follow them in the box. */
function followKeys(id: string, data: string): void {
  const { line, unsure } = applyKeys(lineOf(id), data)
  lines.set(id, line)
  setBox(id, line.text)
  checkScreen(id, unsure)
}

/** A key from the box that is meant for the agent itself (its menus, Esc, history). */
export function pressKey(id: string, seq: string): void {
  typeInto(id, seq)
  followKeys(id, seq)
}

/** Several keys in a row (each sent on its own). */
export function pressKeys(id: string, seqs: string[]): void {
  for (const seq of seqs) pressKey(id, seq)
}

/** Enter in the box: run what is in the terminal's line (the box's text). */
export function submit(id: string): void {
  const text = useBoxText.getState()[id] ?? ''
  if (canMirror(text)) {
    let line = lineOf(id)
    // If the agent dropped what was typed (it was busy starting up), type it again.
    const screen = screenRows(id)
    const prompt = prompts.get(id)
    if (screen && prompt !== undefined && line.text && readInputLine(screen.rows, prompt, screen.cols) === '') line = EMPTY_LINE
    typeInto(id, `${keysToReach(line, text)}\r`)
  } else {
    // Several lines: clear what was typed so far, paste the whole message, then Enter.
    typeInto(id, `${keysToReach(lineOf(id), '')}\u001b[200~${text}\u001b[201~\r`)
  }
  lines.set(id, EMPTY_LINE)
  setBox(id, '')
  checkScreen(id, true)
}

let installed = false
function install(): void {
  if (installed) return
  installed = true
  onTypedInTerminal(followKeys)
  // Text typed while the agent was starting goes in once it's ready.
  useTerminalReady.subscribe((ready, before) => {
    for (const id of Object.keys(ready)) {
      if (before[id]) continue
      const text = useBoxText.getState()[id]
      if (text) boxChanged(id, text)
    }
  })
  // Forget processes that are gone.
  useApp.subscribe((s, prev) => {
    if (s.ptys === prev.ptys) return
    const gone = Object.keys(useBoxText.getState()).filter((id) => !s.ptys[id])
    for (const id of gone) {
      lines.delete(id)
      prompts.delete(id)
    }
    if (gone.length) useBoxText.setState((all) => Object.fromEntries(Object.entries(all).filter(([id]) => !gone.includes(id))), true)
  })
}
install()

// ---------- the agent's slash-command menu ----------

/** How long to wait for an agent to draw its menu before saying there is none. */
const MENU_WAIT_MS = 1500

/**
 * The slash-command menu the terminal is showing while the box holds `typed`
 * (pass null when no "/" command is being typed). `reading` is true until the
 * terminal has had a moment to draw it.
 */
export function useTerminalMenu(id: string | undefined, typed: string | null): { menu: TerminalMenu | null; reading: boolean } {
  const [menu, setMenu] = useState<TerminalMenu | null>(null)
  const [reading, setReading] = useState(false)
  const typedRef = useRef(typed)
  typedRef.current = typed
  const active = Boolean(id) && typed !== null

  useEffect(() => {
    if (!id || !active) {
      setMenu(null)
      setReading(false)
      return
    }
    setReading(true)
    let timer: ReturnType<typeof setTimeout> | undefined
    const read = (): void => {
      const screen = screenRows(id)
      const now = typedRef.current
      if (!screen || now === null) return
      const found = readSlashMenu(screen.rows, now)
      setMenu(found)
      if (found) setReading(false)
    }
    const soon = (): void => {
      clearTimeout(timer)
      timer = setTimeout(read, 80)
    }
    const stop = subscribePty(id, soon)
    const giveUp = setTimeout(() => {
      read()
      setReading(false)
    }, MENU_WAIT_MS)
    soon()
    return () => {
      stop()
      clearTimeout(timer)
      clearTimeout(giveUp)
    }
  }, [id, active])

  // Typing changes the filter; read again even if the agent printed nothing new.
  useEffect(() => {
    if (!id || typed === null) return
    const t = setTimeout(() => {
      const screen = screenRows(id)
      if (screen) {
        const found = readSlashMenu(screen.rows, typed)
        setMenu(found)
        if (found) setReading(false)
      }
    }, 150)
    return () => clearTimeout(t)
  }, [id, typed])

  return { menu: active ? menu : null, reading: active && reading }
}
