import { afterEach, describe, expect, it } from 'vitest'
import { PtyManager } from './pty-manager'

const isWin = process.platform === 'win32'
const shell = isWin
  ? { file: 'powershell.exe', args: ['-NoLogo', '-NoProfile'] }
  : { file: 'bash', args: ['--norc'] }

/** Shell arithmetic expression, so the result differs from the typed text. */
const sum = (expr: string): string => (isWin ? `$(${expr})` : `$((${expr}))`)

function waitFor(check: () => boolean, ms = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const poll = setInterval(() => {
      if (check()) {
        clearInterval(poll)
        resolve()
      } else if (Date.now() - started > ms) {
        clearInterval(poll)
        reject(new Error('timed out'))
      }
    }, 50)
  })
}

describe('PtyManager', () => {
  const manager = new PtyManager()
  afterEach(() => manager.disposeAll())

  it('runs a real shell: typed commands produce output', async () => {
    const id = manager.create({ ...shell, cwd: process.cwd(), cols: 80, rows: 24 })
    // The arithmetic result only appears in output, never in the echoed command.
    manager.write(id, `echo agentdeck-${sum('20+3')}\r`)
    await waitFor(() => manager.getBuffer(id).includes('agentdeck-23'))
  })

  it('reports exit when a pane is killed and forgets the process', async () => {
    const exits: string[] = []
    manager.on('exit', (id: string) => exits.push(id))
    const id = manager.create({ ...shell, cwd: process.cwd(), cols: 80, rows: 24 })
    manager.kill(id)
    await waitFor(() => exits.includes(id))
    expect(manager.has(id)).toBe(false)
  })

  it('keeps only the most recent output in the replay buffer', async () => {
    const small = new PtyManager({ bufferLimit: 64 })
    const id = small.create({ ...shell, cwd: process.cwd(), cols: 80, rows: 24 })
    small.write(id, `echo ${'x'.repeat(10)}-end-${sum('1+1')}\r`)
    await waitFor(() => small.getBuffer(id).includes('-end-2'))
    expect(small.getBuffer(id).length).toBeLessThanOrEqual(64)
    small.disposeAll()
  })
})
