import type { ShellKind } from '@shared/types'

export interface ShellLaunchInput {
  shell: ShellKind
  /** Executable to run inside the shell (detected agent path). */
  command?: string
  /** Fixed, app-defined arguments (login / resume sub-commands). Never user text. */
  commandArgs?: string[]
}

export interface ShellLaunch {
  file: string
  args: string[]
}

/**
 * PowerShell single-quoted literal. PowerShell treats the typographic quotes
 * ‘ ’ ‚ ‛ as single quotes too, so every one of them is doubled.
 */
export const psQuote = (s: string): string => `'${s.replace(/['\u2018\u2019\u201A\u201B]/g, '$&$&')}'`

/** POSIX shell single-quote. */
const shQuote = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`

/**
 * Build the process to spawn for a terminal pane.
 * With a command, the shell runs it and stays open after it exits.
 */
export function buildShellLaunch({ shell, command, commandArgs = [] }: ShellLaunchInput): ShellLaunch {
  const parts = command ? [command, ...commandArgs] : []

  if (shell === 'powershell' || shell === 'pwsh') {
    const file = shell === 'pwsh' ? 'pwsh.exe' : 'powershell.exe'
    if (!command) return { file, args: ['-NoLogo'] }
    return { file, args: ['-NoLogo', '-NoExit', '-Command', `& ${parts.map(psQuote).join(' ')}`] }
  }
  if (shell === 'cmd') {
    // Separate argv entries: node-pty quotes paths with spaces correctly for cmd /K.
    return { file: 'cmd.exe', args: command ? ['/K', ...parts] : [] }
  }
  const file = process.env.SHELL || 'bash'
  if (!command) return { file, args: ['-l'] }
  return { file, args: ['-l', '-c', `${parts.map(shQuote).join(' ')}; exec ${file} -l`] }
}
