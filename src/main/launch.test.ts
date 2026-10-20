import { describe, expect, it } from 'vitest'
import { buildShellLaunch } from './launch'

describe('buildShellLaunch', () => {
  it('opens a plain PowerShell when no agent is chosen', () => {
    expect(buildShellLaunch({ shell: 'powershell' })).toEqual({ file: 'powershell.exe', args: ['-NoLogo'] })
  })

  it('runs the agent inside PowerShell and keeps the shell open afterwards', () => {
    expect(buildShellLaunch({ shell: 'powershell', command: 'C:\\npm\\claude.cmd' })).toEqual({
      file: 'powershell.exe',
      args: ['-NoLogo', '-NoExit', '-Command', "& 'C:\\npm\\claude.cmd'"]
    })
  })

  it('quotes an initial prompt safely for PowerShell', () => {
    const launch = buildShellLaunch({ shell: 'pwsh', command: 'claude', promptArg: "Read 'notes.md' then continue" })
    expect(launch.args.at(-1)).toBe("& 'claude' 'Read ''notes.md'' then continue'")
    expect(launch.file).toBe('pwsh.exe')
  })

  it('supports cmd.exe', () => {
    expect(buildShellLaunch({ shell: 'cmd', command: 'C:\\npm\\codex.cmd' })).toEqual({
      file: 'cmd.exe',
      args: ['/K', '"C:\\npm\\codex.cmd"']
    })
  })
})
