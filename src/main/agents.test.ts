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

  it('ignores an editor’s launcher that has the same name as a CLI', () => {
    const root = mkdtempSync(join(tmpdir(), 'agentdeck-path-'))
    const ide = join(root, 'Qoder IDE', 'bin')
    mkdirSync(ide, { recursive: true })
    writeFileSync(join(ide, 'qoder.cmd'), '')
    const env = { PATH: ide, PATHEXT: '.EXE;.CMD' }
    expect(detectAgents(env, 'win32').find((a) => a.id === 'qoder')!.installed).toBe(false)
    // The real CLI elsewhere on PATH is still found
    const cli = fakeBin(['qoder.cmd'])
    const found = detectAgents({ ...env, PATH: [ide, cli].join(delimiter) }, 'win32').find((a) => a.id === 'qoder')!
    expect(found.path).toBe(join(cli, 'qoder.cmd'))
  })

  it('marks missing agents as not installed', () => {
    const dir = fakeBin(['claude.cmd'])
    const agents = detectAgents({ PATH: dir, PATHEXT: '.EXE;.CMD' }, 'win32')
    expect(agents.find((a) => a.id === 'aider')).toMatchObject({ installed: false, path: undefined })
  })

  it('finds Kiro CLI and the other newer agents', () => {
    const dir = fakeBin(['kiro-cli.exe', 'qwen.cmd', 'goose.exe'])
    const agents = detectAgents({ PATH: dir, PATHEXT: '.EXE;.CMD' }, 'win32')
    expect(agents.filter((a) => a.installed).map((a) => a.label)).toEqual(expect.arrayContaining(['Kiro CLI', 'Qwen Code', 'Goose']))
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
