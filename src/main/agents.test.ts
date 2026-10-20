import { mkdirSync, mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { delimiter, join } from 'path'
import { describe, expect, it } from 'vitest'
import { detectAgents } from './agents'

function fakeBin(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'agentdeck-path-'))
  mkdirSync(dir, { recursive: true })
  for (const f of files) writeFileSync(join(dir, f), '')
  return dir
}

describe('detectAgents', () => {
  it('marks agents found on PATH as installed with their path', () => {
    const dir = fakeBin(['claude.cmd', 'codex.ps1', 'codex.cmd'])
    const agents = detectAgents({ PATH: dir, PATHEXT: '.EXE;.CMD;.BAT;.PS1' }, 'win32')

    const claude = agents.find((a) => a.id === 'claude')!
    expect(claude.installed).toBe(true)
    expect(claude.path).toBe(join(dir, 'claude.cmd'))
    // .cmd wins over .ps1 so PowerShell execution policy can't block it
    expect(agents.find((a) => a.id === 'codex')!.path).toBe(join(dir, 'codex.cmd'))
  })

  it('marks missing agents as not installed', () => {
    const dir = fakeBin(['claude.cmd'])
    const agents = detectAgents({ PATH: dir, PATHEXT: '.EXE;.CMD' }, 'win32')
    expect(agents.find((a) => a.id === 'aider')).toMatchObject({ installed: false, path: undefined })
  })

  it('searches every PATH entry and accepts alternative binary names', () => {
    const a = fakeBin([])
    const b = fakeBin(['agy.exe'])
    const agents = detectAgents({ PATH: [a, b].join(delimiter), PATHEXT: '.EXE' }, 'win32')
    expect(agents.find((x) => x.id === 'antigravity')!.path).toBe(join(b, 'agy.exe'))
  })

  it('finds extensionless executables on macOS/Linux', () => {
    const dir = fakeBin(['gemini'])
    const agents = detectAgents({ PATH: dir }, 'linux')
    expect(agents.find((x) => x.id === 'gemini')!.installed).toBe(true)
  })
})
