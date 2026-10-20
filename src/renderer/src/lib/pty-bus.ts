// One IPC listener for all terminal output, fanned out to the pane that owns it.

type Listener = (chunk: string, end: number) => void

const listeners = new Map<string, Set<Listener>>()
let wired = false

function wire(): void {
  if (wired) return
  wired = true
  window.api.pty.onData((id, chunk, end) => {
    listeners.get(id)?.forEach((fn) => fn(chunk, end))
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
