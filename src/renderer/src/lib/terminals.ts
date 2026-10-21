import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal, type ITheme } from '@xterm/xterm'
import { create as createStore } from 'zustand'
import { subscribePty, writePty } from './pty-bus'
import { useApp } from './store'

export const TERMINAL_THEME: ITheme = {
  background: '#0e0e11',
  foreground: '#e4e4e7',
  cursor: '#f4f4f5',
  cursorAccent: '#0e0e11',
  selectionBackground: '#ffffff2e',
  black: '#1b1b1f',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#d4d4d8',
  brightBlack: '#71717a',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa'
}

export interface TerminalView {
  term: Terminal
  fit: FitAddon
}

/**
 * Processes that have printed something visible. Until then the pane shows a
 * "Starting Claude Code…" screen, so a slow agent doesn't look broken.
 */
export const useTerminalReady = createStore<Record<string, true>>(() => ({}))

const VISIBLE_TEXT = /[\p{L}\p{N}\p{S}\p{P}]/u
/** Drop escape sequences, keep the text a person would see. */
const visible = (chunk: string): boolean =>
  // eslint-disable-next-line no-control-regex
  VISIBLE_TEXT.test(chunk.replace(/\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)|\u001b[@-Z\\-_]/g, ''))

interface Entry extends TerminalView {
  started: boolean
  /** The pane's own spot; the full-screen view borrows the terminal and gives it back. */
  home?: HTMLElement
  /** Begin streaming output (once the view has its real size). */
  start: () => void
  dispose: () => void
}

/**
 * One xterm per process, kept alive for as long as the process runs.
 *
 * Re-arranging the canvas (Tidy, presets, re-tiling, leaving full screen) remounts
 * the pane components. If each remount built a fresh xterm and replayed the raw
 * output, that output — drawn by ConPTY for the *old* width — would put the cursor
 * in the wrong place, and typed text would land in the middle of the prompt. So the
 * same xterm is simply moved into the new pane.
 */
const entries = new Map<string, Entry>()

function create(ptyId: string): Entry {
  const term = new Terminal({
    fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'JetBrains Mono', monospace",
    fontSize: useApp.getState().snapshot!.settings.terminalFontSize,
    lineHeight: 1.15,
    cursorBlink: true,
    cursorStyle: 'bar',
    scrollback: 8000,
    allowProposedApi: true,
    theme: TERMINAL_THEME,
    // Windows shells run behind ConPTY, which wraps and redraws lines itself; xterm must
    // not re-wrap old lines differently on resize.
    ...(window.api.platform === 'win32' ? { windowsPty: { backend: 'conpty' as const, buildNumber: window.api.osBuild } } : {})
  })
  const fit = new FitAddon()
  term.loadAddon(fit)
  term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.app.openExternal(uri)))

  // Copy with a selection, paste with Ctrl+V.
  term.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true
    const ctrl = e.ctrlKey || e.metaKey
    if (ctrl && e.key.toLowerCase() === 'c' && term.hasSelection()) {
      void navigator.clipboard.writeText(term.getSelection())
      term.clearSelection()
      return false
    }
    if (ctrl && e.key.toLowerCase() === 'v') {
      void navigator.clipboard.readText().then((t) => t && term.paste(t))
      e.preventDefault()
      return false
    }
    return true
  })

  const input = term.onData((d) => writePty(ptyId, d))
  // Send the size once it settles: every resize makes ConPTY redraw the screen.
  let resizeTimer: ReturnType<typeof setTimeout> | undefined
  const resize = term.onResize(({ cols, rows }) => {
    clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => window.api.pty.resize(ptyId, cols, rows), 80)
  })
  let unsubscribe = (): void => {}

  const entry: Entry = {
    term,
    fit,
    started: false,
    start: () => {
      entry.started = true
      startStreaming()
    },
    dispose: () => {
      unsubscribe()
      input.dispose()
      resize.dispose()
      clearTimeout(resizeTimer)
      term.dispose()
    }
  }

  const startStreaming = (): void => {
    let replayEnd = -1
    const queued: [string, number][] = []
    const markReady = (chunk: string): void => {
      if (!useTerminalReady.getState()[ptyId] && visible(chunk)) useTerminalReady.setState({ [ptyId]: true })
    }
    unsubscribe = subscribePty(ptyId, (chunk, end) => {
      markReady(chunk)
      if (replayEnd < 0) queued.push([chunk, end])
      else if (end > replayEnd) term.write(chunk)
    })
    // Output from before this view existed (e.g. a process started by a routine or a restore).
    void window.api.pty.snapshot(ptyId).then((snap) => {
      if (!entries.has(ptyId)) return
      markReady(snap.data)
      term.write(snap.data)
      replayEnd = snap.end
      for (const [chunk, end] of queued) if (end > replayEnd) term.write(chunk)
      queued.length = 0
    })
    window.api.pty.resize(ptyId, term.cols, term.rows)
  }
  return entry
}

function fitSafely(view: TerminalView, host: HTMLElement): void {
  if (host.clientWidth < 20 || host.clientHeight < 20) return
  try {
    view.fit.fit()
  } catch {
    /* not visible */
  }
}

function mount(entry: Entry, host: HTMLElement): void {
  if (!entry.term.element) entry.term.open(host)
  else if (entry.term.element.parentElement !== host) host.appendChild(entry.term.element)
  fitSafely(entry, host)
}

/** Show the process's terminal in its pane (`host`), creating it the first time. */
export function attachTerminal(ptyId: string, host: HTMLElement): TerminalView {
  let entry = entries.get(ptyId)
  if (!entry) {
    entry = create(ptyId)
    entries.set(ptyId, entry)
  }
  entry.home = host
  // While shown full screen the terminal stays there; it comes home when that closes.
  if (!borrowed.has(ptyId)) mount(entry, host)
  if (!entry.started) entry.start()
  return entry
}

const borrowed = new Set<string>()

/** Move the terminal into the full-screen view. */
export function borrowTerminal(ptyId: string, host: HTMLElement): TerminalView | undefined {
  const entry = entries.get(ptyId)
  if (!entry) return undefined
  borrowed.add(ptyId)
  mount(entry, host)
  entry.term.focus()
  return entry
}

/** Give the terminal back to its pane. */
export function returnTerminal(ptyId: string): void {
  borrowed.delete(ptyId)
  const entry = entries.get(ptyId)
  if (entry?.home?.isConnected) mount(entry, entry.home)
}

export function fitTerminal(ptyId: string, host: HTMLElement): void {
  const entry = entries.get(ptyId)
  if (entry && entry.term.element?.parentElement === host) fitSafely(entry, host)
}

/** The pane is gone for good (closed, or its process ended). */
export function disposeTerminal(ptyId: string): void {
  const entry = entries.get(ptyId)
  if (!entry) return
  entries.delete(ptyId)
  borrowed.delete(ptyId)
  entry.dispose()
  useTerminalReady.setState((s) => {
    const { [ptyId]: _gone, ...rest } = s
    return rest
  }, true)
}

export function setTerminalFontSize(size: number): void {
  for (const entry of entries.values()) {
    if (entry.term.options.fontSize === size) continue
    entry.term.options.fontSize = size
    const host = entry.term.element?.parentElement
    if (host) fitSafely(entry, host)
  }
}

// Processes that no longer exist don't need a view.
useApp.subscribe((s, prev) => {
  if (s.ptys === prev.ptys) return
  for (const id of [...entries.keys()]) if (!s.ptys[id]) disposeTerminal(id)
})
