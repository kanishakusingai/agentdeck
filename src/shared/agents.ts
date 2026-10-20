import type { AgentDef, Provider } from './types'

/** Everything AgentDeck knows about each account provider, in one place. */
export const PROVIDERS: Record<
  Provider,
  {
    label: string
    agentLabel: string
    /** Env var that points the CLI at an account's own config folder. */
    homeEnv: 'CLAUDE_CONFIG_DIR' | 'CODEX_HOME'
    /** Default config folder name under the user's home directory. */
    defaultHome: string
    /** Sub-folder holding session transcripts, and how deep they're nested. */
    transcripts: { dir: string; depth: number }
    /** Arguments that start the provider's own sign-in flow. */
    loginArgs: string[]
  }
> = {
  claude: {
    label: 'Claude',
    agentLabel: 'Claude Code',
    homeEnv: 'CLAUDE_CONFIG_DIR',
    defaultHome: '.claude',
    transcripts: { dir: 'projects', depth: 1 },
    loginArgs: []
  },
  codex: {
    label: 'Codex',
    agentLabel: 'Codex',
    homeEnv: 'CODEX_HOME',
    defaultHome: '.codex',
    transcripts: { dir: 'sessions', depth: 4 },
    loginArgs: ['login']
  }
}

export const PROVIDER_LABEL: Record<Provider, string> = { claude: PROVIDERS.claude.label, codex: PROVIDERS.codex.label }

/** Every agent CLI AgentDeck knows how to launch. */
export const AGENT_CATALOG: AgentDef[] = [
  {
    id: 'claude',
    label: 'Claude Code',
    bins: ['claude'],
    provider: 'claude',
    acceptsPromptArg: true,
    resumeArgs: ['--continue'],
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
    resumeArgs: ['resume', '--last'],
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
