import type { ThreadMessage } from '@shared/types'
import { stripAnsi } from './usage-limit'

export interface HandoffInput {
  workspaceName: string
  workspacePath: string
  agentLabel: string
  fromAccount: string
  messages?: ThreadMessage[]
  terminalTail?: string
}

const clip = (s: string, n: number): string => (s.length > n ? `${s.slice(0, n)}…` : s)

/** Markdown summary that lets an agent on another account carry on. */
export function buildHandoffSummary(input: HandoffInput): string {
  const out: string[] = [
    '# Handoff summary',
    '',
    `This conversation was moved from the "${input.fromAccount}" account because it hit a usage limit.`,
    `Workspace: ${input.workspaceName} (${input.workspacePath})`,
    `Agent: ${input.agentLabel}`,
    ''
  ]
  const convo = (input.messages ?? []).filter((m) => m.role !== 'tool' || m.toolName !== 'result')
  if (convo.length) {
    const firstAsk = convo.find((m) => m.role === 'user')
    if (firstAsk) out.push('## Original request', '', clip(firstAsk.text, 3000), '')
    out.push('## Most recent conversation', '')
    for (const m of convo.slice(-24)) {
      const who = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Agent' : `Tool (${m.toolName})`
      out.push(`**${who}:** ${clip(m.text, m.role === 'tool' ? 300 : 1500)}`, '')
    }
  } else if (input.terminalTail) {
    out.push('## Last terminal output', '', '```', clip(stripAnsi(input.terminalTail).slice(-8000), 8000), '```', '')
  }
  out.push(
    '## What to do',
    '',
    'Check the current state of the files in the workspace, then continue the unfinished work above.'
  )
  return out.join('\n')
}

export const handoffPrompt = (file: string): string =>
  `Continue the previous conversation. First read the handoff summary at ${file}, check the current state of the files, then carry on with the remaining work.`
