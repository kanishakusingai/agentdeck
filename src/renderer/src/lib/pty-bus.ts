// One IPC listener for all terminal output, fanned out to the pane that owns it.

type Listener = (chunk: string, end: number) => void
type AnyListener = (id: string) => void

const listeners = new Map<string, Set<Listener>>()
const anyListeners = new Set<AnyListener>()
const inputListeners = new Set<AnyListener>()
let wired = false

function wire(): void {
  if (wired) return
  wired = true
  window.api.pty.onData((id, chunk, end) => {
    listeners.get(id)?.forEach((fn) => fn(chunk, end))
    anyListeners.forEach((fn) => fn(id))
  })
}

export function subscribePty(id: string, fn: Listener): () => void {
  wire()
  let set = listeners.get(id)
  if (!set) listeners.set(id, (set = new Set()))
  set.add(fn)
  return () => {
    set!.delete(fn)
    if (set!.size === 0) listeners.delete(id)
  }
}

/** Called for output from every terminal (used to tell working panes from idle ones). */
export function onAnyOutput(fn: AnyListener): () => void {
  wire()
  anyListeners.add(fn)
  return () => anyListeners.delete(fn)
}

/** Called whenever the user sends input to a terminal. */
export function onAnyInput(fn: AnyListener): () => void {
  inputListeners.add(fn)
  return () => inputListeners.delete(fn)
}

/** Send keystrokes / text to a terminal. Always use this instead of window.api.pty.write. */
export function writePty(id: string, data: string): void {
  inputListeners.forEach((fn) => fn(id))
  window.api.pty.write(id, data)
}
