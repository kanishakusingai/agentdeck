import { spawn } from 'child_process'
import type { DetectedAgent } from '@shared/types'

export interface HeadlessInput {
  agent: DetectedAgent
  cwd: string
  env: Record<string, string>
  prompt: string
  allowEdits: boolean
  onOutput?: (chunk: string) => void
  timeoutMs?: number
}

export interface HeadlessResult {
  exitCode: number
  output: string
}

/**
 * Run an agent CLI non-interactively.
 * The command line contains only fixed, app-defined arguments; the user's
 * prompt is written to stdin so it can never be interpreted by a shell.
 */
export function runHeadless(input: HeadlessInput): Promise<HeadlessResult> {
  const { agent, cwd, env, prompt, allowEdits, onOutput, timeoutMs = 30 * 60000 } = input
  if (!agent.headless) return Promise.reject(new Error(`${agent.label} can't run in the background.`))
  if (!agent.installed || !agent.path) return Promise.reject(new Error(`${agent.label} isn't installed.`))

  const args = allowEdits ? agent.headless.editArgs : agent.headless.args
  const isWin = process.platform === 'win32'
  // .cmd/.bat shims need cmd.exe on Windows; quote the path because it can contain spaces.
  const needsShell = isWin && /\.(cmd|bat)$/i.test(agent.path)
  // .ps1-only installs go through PowerShell, which forwards stdin to the script.
  const isPs1 = isWin && /\.ps1$/i.test(agent.path)
  const command = isPs1 ? 'powershell.exe' : needsShell ? `"${agent.path}"` : agent.path
  const argv = isPs1 ? ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', agent.path, ...args] : args

  return new Promise((resolve) => {
    let output = ''
    const child = spawn(command, argv, {
      cwd,
      env: { ...process.env, ...env, NO_COLOR: '1', FORCE_COLOR: '0' },
      shell: needsShell,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    })
    const append = (buf: Buffer): void => {
      const chunk = buf.toString('utf8')
      output += chunk
      onOutput?.(chunk)
    }
    child.stdout.on('data', append)
    child.stderr.on('data', append)
    const timer = setTimeout(() => {
      output += '\n[AgentDeck] Stopped: the run took longer than allowed.'
      child.kill()
    }, timeoutMs)
    child.on('error', (err) => {
      clearTimeout(timer)
      resolve({ exitCode: -1, output: `${output}\n${err.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ exitCode: code ?? -1, output })
    })
    child.stdin.end(prompt, 'utf8')
  })
}

export const ENHANCE_INSTRUCTION = [
  'Rewrite the dictated request below into a clear, concise brief for an AI coding agent.',
  'Keep every requirement the speaker mentioned, remove filler words and repetition,',
  'use short bullet points when there are several steps, and do not add new requirements.',
  'Reply with the rewritten brief only — no preamble, no quotes.',
  '',
  'Dictated request:'
].join('\n')
