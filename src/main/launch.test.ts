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

  it('passes fixed sub-commands such as login', () => {
    expect(buildShellLaunch({ shell: 'pwsh', command: 'C:\\npm\\codex.cmd', commandArgs: ['login'] })).toEqual({
      file: 'pwsh.exe',
      args: ['-NoLogo', '-NoExit', '-Command', "& 'C:\\npm\\codex.cmd' 'login'"]
    })
  })

  it('escapes every quote character PowerShell understands, including typographic ones', () => {
    const launch = buildShellLaunch({ shell: 'powershell', command: "C:\\Bob's \u2019tools\u2019\\agent.exe" })
    expect(launch.args.at(-1)).toBe("& 'C:\\Bob''s \u2019\u2019tools\u2019\u2019\\agent.exe'")
  })

  it('gives cmd.exe the path as its own argument so spaces survive', () => {
    expect(buildShellLaunch({ shell: 'cmd', command: 'C:\\Program Files\\Codex\\codex.exe', commandArgs: ['login'] })).toEqual({
      file: 'cmd.exe',
      args: ['/K', 'C:\\Program Files\\Codex\\codex.exe', 'login']
    })
  })
})
