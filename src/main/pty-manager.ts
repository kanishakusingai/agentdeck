import { EventEmitter } from 'events'
import { randomUUID } from 'crypto'
import * as pty from '@lydell/node-pty'

export interface SpawnSpec {
  id?: string
  file: string
  args: string[]
  cwd: string
  env?: Record<string, string>
  cols: number
  rows: number
}

interface Entry {
  proc: pty.IPty
  buffer: string
  /** Total characters ever emitted; lets a view de-duplicate replay vs. live data. */
  end: number
}

export interface PtySnapshot {
  data: string
  end: number
}

/**
 * Owns every live terminal process. Emits:
 *  - 'data' (id, chunk, end)  — `end` is the running character offset after this chunk
 *  - 'exit' (id, exitCode)
 * Keeps a capped scrollback per terminal so a remounted view can replay it.
 */
export class PtyManager extends EventEmitter {
  private readonly entries = new Map<string, Entry>()
  private readonly bufferLimit: number

  constructor(opts: { bufferLimit?: number } = {}) {
    super()
    this.bufferLimit = opts.bufferLimit ?? 256 * 1024
  }

  create(spec: SpawnSpec): string {
    const id = spec.id ?? randomUUID()
    const proc = pty.spawn(spec.file, spec.args, {
      name: 'xterm-256color',
      cols: Math.max(2, spec.cols),
      rows: Math.max(2, spec.rows),
      cwd: spec.cwd,
      env: { ...process.env, ...(spec.env ?? {}) } as Record<string, string>
    })
    const entry: Entry = { proc, buffer: '', end: 0 }
    this.entries.set(id, entry)

    proc.onData((chunk) => {
      entry.buffer += chunk
      entry.end += chunk.length
      if (entry.buffer.length > this.bufferLimit) {
        entry.buffer = entry.buffer.slice(entry.buffer.length - this.bufferLimit)
      }
      this.emit('data', id, chunk, entry.end)
    })
    proc.onExit(({ exitCode }) => {
      this.entries.delete(id)
      this.emit('exit', id, exitCode)
    })
    return id
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  write(id: string, data: string): void {
    this.entries.get(id)?.proc.write(data)
  }

  resize(id: string, cols: number, rows: number): void {
    const entry = this.entries.get(id)
    if (!entry || cols < 2 || rows < 2) return
    try {
      entry.proc.resize(Math.floor(cols), Math.floor(rows))
    } catch {
      /* process may have just exited */
    }
  }

  getBuffer(id: string): string {
    return this.entries.get(id)?.buffer ?? ''
  }

  snapshot(id: string): PtySnapshot {
    const entry = this.entries.get(id)
    return { data: entry?.buffer ?? '', end: entry?.end ?? 0 }
  }

  kill(id: string): void {
    const entry = this.entries.get(id)
    if (!entry) return
    try {
      entry.proc.kill()
    } catch {
      /* already gone */
    }
  }

  disposeAll(): void {
    for (const id of [...this.entries.keys()]) this.kill(id)
  }
}
