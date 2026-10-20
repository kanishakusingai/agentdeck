import type { ShellKind } from '@shared/types'

export interface ShellLaunchInput {
  shell: ShellKind
  /** Executable to run inside the shell (agent path or name). */
  command?: string
  /** Extra arguments for the command, e.g. a login sub-command. */
  commandArgs?: string[]
  /** Optional first prompt passed as a single argument. */
  promptArg?: string
}

export interface ShellLaunch {
  file: string
  args: string[]
}

/** Quote a value as a PowerShell single-quoted literal. */
export const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`

/** Quote for cmd.exe (strip characters that would break out of quotes). */
const cmdQuote = (s: string): string => `"${s.replace(/["%^&|<>]/g, '')}"`

/** POSIX shell single-quote. */
const shQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

/**
 * Build the process to spawn for a terminal pane.
 * With a command, the shell runs it and stays open after it exits.
 */
export function buildShellLaunch({ shell, command, commandArgs = [], promptArg }: ShellLaunchInput): ShellLaunch {
  const parts = command ? [command, ...commandArgs, ...(promptArg ? [promptArg] : [])] : []

  if (shell === 'powershell' || shell === 'pwsh') {
    const file = shell === 'pwsh' ? 'pwsh.exe' : 'powershell.exe'
    if (!command) return { file, args: ['-NoLogo'] }
    return { file, args: ['-NoLogo', '-NoExit', '-Command', `& ${parts.map(psQuote).join(' ')}`] }
  }
  if (shell === 'cmd') {
    if (!command) return { file: 'cmd.exe', args: [] }
    return { file: 'cmd.exe', args: ['/K', parts.map(cmdQuote).join(' ')] }
  }
  const file = process.env.SHELL || 'bash'
  if (!command) return { file, args: ['-l'] }
  return { file, args: ['-l', '-c', `${parts.map(shQuote).join(' ')}; exec ${file} -l`] }
}

export function defaultShell(): ShellKind {
  return process.platform === 'win32' ? 'powershell' : 'bash'
}
