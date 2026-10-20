import type { AgentDef } from './types'

/** Every agent CLI AgentDeck knows how to launch. */
export const AGENT_CATALOG: AgentDef[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    bins: ['claude'],
    provider: 'claude',
    acceptsPromptArg: true,
    headless: {
      args: ['-p', '--output-format', 'text'],
      editArgs: ['-p', '--output-format', 'text', '--permission-mode', 'acceptEdits']
    }
  },
  {
    id: 'codex',
    label: 'Codex',
    bins: ['codex'],
    provider: 'codex',
    acceptsPromptArg: true,
    headless: {
      args: ['exec', '--skip-git-repo-check', '-'],
      editArgs: ['exec', '--skip-git-repo-check', '--full-auto', '-']
    }
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    bins: ['gemini'],
    headless: { args: [], editArgs: ['--yolo'] }
  },
  { id: 'cursor-agent', label: 'Cursor Agent', bins: ['cursor-agent'] },
  { id: 'copilot', label: 'GitHub Copilot', bins: ['copilot'] },
  { id: 'grok', label: 'Grok Build', bins: ['grok'] },
  { id: 'droid', label: 'Droid', bins: ['droid'] },
  { id: 'opencode', label: 'OpenCode', bins: ['opencode'] },
  { id: 'kimi', label: 'Kimi Code', bins: ['kimi'] },
  { id: 'amp', label: 'Amp', bins: ['amp'] },
  { id: 'antigravity', label: 'Antigravity', bins: ['antigravity', 'agy'] },
  { id: 'aider', label: 'Aider', bins: ['aider'] }
]

export function agentById(id: string | undefined): AgentDef | undefined {
  return AGENT_CATALOG.find((a) => a.id === id)
}

export const PROVIDER_LABEL = { claude: 'Claude', codex: 'Codex' } as const
