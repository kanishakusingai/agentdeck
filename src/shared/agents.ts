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

/**
 * Every agent CLI AgentDeck knows how to launch, with what the agents directory shows
 * about each (install commands checked against each tool's own docs, October 2026).
 * `top` orders the Launch menu's short list of the best-known agents.
 */
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
    },
    maker: 'Anthropic',
    blurb: "Anthropic's coding agent for the terminal",
    install: 'npm install -g @anthropic-ai/claude-code',
    url: 'https://code.claude.com/docs/en/setup',
    top: 1
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
    },
    maker: 'OpenAI',
    blurb: "OpenAI's local coding agent, works with ChatGPT plans",
    install: 'npm install -g @openai/codex',
    url: 'https://github.com/openai/codex',
    top: 2
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    bins: ['gemini'],
    headless: { args: [], editArgs: ['--yolo'] },
    maker: 'Google',
    blurb: 'Open-source Gemini agent (needs a paid plan or API key)',
    install: 'npm install -g @google/gemini-cli',
    url: 'https://github.com/google-gemini/gemini-cli',
    top: 4
  },
  {
    id: 'kiro',
    label: 'Kiro CLI',
    bins: ['kiro-cli'],
    maker: 'Amazon Web Services',
    blurb: 'Spec-driven coding agent from the makers of Kiro',
    install: "irm 'https://cli.kiro.dev/install.ps1' | iex",
    url: 'https://kiro.dev/docs/cli/',
    top: 3
  },
  {
    id: 'cursor-agent',
    label: 'Cursor Agent',
    bins: ['cursor-agent'],
    maker: 'Cursor',
    blurb: "Cursor's coding agent, run from the terminal",
    install: "irm 'https://cursor.com/install?win32=true' | iex",
    url: 'https://cursor.com/docs/cli/overview',
    top: 6
  },
  {
    id: 'copilot',
    label: 'GitHub Copilot',
    bins: ['copilot'],
    maker: 'GitHub',
    blurb: 'Copilot coding agent with built-in GitHub tools',
    install: 'npm install -g @github/copilot',
    url: 'https://github.com/github/copilot-cli',
    top: 5
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    // Only the CLI: "antigravity" on PATH opens Google's editor instead.
    bins: ['agy'],
    maker: 'Google',
    blurb: "Google's Gemini coding agent, replacing Gemini CLI",
    install: 'irm https://antigravity.google/cli/install.ps1 | iex',
    url: 'https://antigravity.google/docs/cli/overview',
    top: 7
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    bins: ['opencode'],
    maker: 'Anomaly',
    blurb: 'Open-source agent that works with any model provider',
    install: 'npm install -g @opencode/cli',
    url: 'https://opencode.ai',
    top: 8
  },
  {
    id: 'droid',
    label: 'Droid',
    bins: ['droid'],
    maker: 'Factory',
    blurb: 'Software-engineering agent built for teams',
    install: 'npm install -g droid',
    url: 'https://docs.factory.ai',
    top: 9
  },
  {
    id: 'amp',
    label: 'Amp',
    bins: ['amp'],
    maker: 'Amp',
    blurb: 'Frontier coding agent, spun out of Sourcegraph',
    install: 'npm install -g @ampcode/cli',
    url: 'https://ampcode.com',
    top: 10
  },
  {
    id: 'grok',
    label: 'Grok Build',
    bins: ['grok'],
    maker: 'xAI',
    blurb: "xAI's Grok-powered terminal coding agent",
    install: 'irm https://x.ai/cli/install.ps1 | iex',
    url: 'https://docs.x.ai/build/overview'
  },
  {
    id: 'qwen',
    label: 'Qwen Code',
    bins: ['qwen'],
    maker: 'Alibaba',
    blurb: 'Coding agent tuned for Qwen coder models',
    install: 'npm install -g @qwen-code/qwen-code',
    url: 'https://github.com/QwenLM/qwen-code'
  },
  {
    id: 'kimi',
    label: 'Kimi Code',
    bins: ['kimi'],
    maker: 'Moonshot AI',
    blurb: 'Open-source terminal agent for Kimi models',
    install: 'npm install -g @moonshot-ai/kimi-code',
    url: 'https://moonshotai.github.io/kimi-code/'
  },
  {
    id: 'cline',
    label: 'Cline',
    bins: ['cline'],
    maker: 'Cline',
    blurb: 'The autonomous Cline agent, in the terminal',
    install: 'npm install -g cline',
    url: 'https://cline.bot'
  },
  {
    id: 'kilocode',
    label: 'Kilo Code',
    bins: ['kilo', 'kilocode'],
    maker: 'Kilo Code',
    blurb: 'Terminal agent that supports 500+ models',
    install: 'npm install -g @kilocode/cli',
    url: 'https://github.com/Kilo-Org/kilocode'
  },
  {
    id: 'crush',
    label: 'Crush',
    bins: ['crush'],
    maker: 'Charm',
    blurb: 'Polished multi-model agent with code intelligence',
    install: 'npm install -g @charmland/crush',
    url: 'https://github.com/charmbracelet/crush'
  },
  {
    id: 'auggie',
    label: 'Auggie',
    bins: ['auggie'],
    maker: 'Augment Code',
    blurb: 'Codebase-aware agent from Augment',
    install: 'npm install -g @augmentcode/auggie',
    url: 'https://docs.augmentcode.com'
  },
  {
    id: 'goose',
    label: 'Goose',
    bins: ['goose'],
    maker: 'Agentic AI Foundation',
    blurb: 'Extensible open-source agent built on MCP',
    url: 'https://goose-docs.ai'
  },
  {
    id: 'qoder',
    label: 'Qoder CLI',
    bins: ['qoder', 'qodercli'],
    // The Qoder editor puts its own "qoder" launcher on PATH too.
    notIn: ['Qoder IDE'],
    maker: 'Qoder',
    blurb: "Qoder's agentic coding assistant",
    install: 'irm https://qoder.com/install.ps1 | iex',
    url: 'https://docs.qoder.com/cli/installation'
  },
  {
    id: 'vibe',
    label: 'Mistral Vibe',
    bins: ['vibe'],
    maker: 'Mistral AI',
    blurb: "Mistral's open-source coding assistant",
    install: 'uv tool install mistral-vibe',
    url: 'https://docs.mistral.ai/mistral-vibe/introduction/quickstart'
  },
  {
    id: 'continue',
    label: 'Continue',
    bins: ['cn'],
    maker: 'Continue',
    blurb: "Continue's open-source agent for the terminal",
    install: 'npm install -g @continuedev/cli',
    url: 'https://continue.dev'
  },
  {
    id: 'letta',
    label: 'Letta Code',
    bins: ['letta'],
    maker: 'Letta',
    blurb: 'Memory-first agent that learns as you work',
    install: 'npm install -g @letta-ai/letta-code',
    url: 'https://github.com/letta-ai/letta-code'
  },
  {
    id: 'codebuff',
    label: 'Codebuff',
    bins: ['codebuff'],
    maker: 'Codebuff',
    blurb: 'Multi-agent coding assistant',
    install: 'npm install -g codebuff',
    url: 'https://codebuff.com'
  },
  {
    id: 'forge',
    label: 'ForgeCode',
    bins: ['forge'],
    maker: 'Antinomy',
    blurb: 'Open-source pair programmer for 300+ models',
    install: 'npm install -g forgecode',
    url: 'https://forgecode.dev'
  },
  {
    id: 'interpreter',
    label: 'Open Interpreter',
    bins: ['interpreter'],
    maker: 'Open Interpreter',
    blurb: 'Coding agent tuned for low-cost models',
    install: 'irm https://www.openinterpreter.com/install.ps1 | iex',
    url: 'https://www.openinterpreter.com'
  },
  {
    id: 'pi',
    label: 'Pi',
    bins: ['pi'],
    maker: 'Earendil',
    blurb: 'Minimal, extensible coding agent',
    install: 'npm install -g @earendil-works/pi-coding-agent',
    url: 'https://github.com/earendil-works/pi'
  },
  {
    id: 'aider',
    label: 'Aider',
    bins: ['aider'],
    maker: 'Aider',
    blurb: 'Git-aware AI pair programmer',
    install: 'python -m pip install aider-install; aider-install',
    url: 'https://aider.chat'
  }
]

/** How many agents the Launch menu lists before "All agents…". */
export const LAUNCH_MENU_AGENTS = 10

/** Sort key: the best-known agents in their 	op order, then the rest in catalog order. */
export function agentRank(agent: AgentDef): number {
  return agent.top ?? 100 + AGENT_CATALOG.findIndex((c) => c.id === agent.id)
}

/**
 * The Launch menu's short list: every installed agent first (best-known first), then the
 * best-known ones that aren't installed yet, up to `limit` in total.
 */
export function launchMenuAgents<T extends AgentDef & { installed: boolean }>(agents: readonly T[], limit = LAUNCH_MENU_AGENTS): T[] {
  const byRank = [...agents].sort((a, b) => agentRank(a) - agentRank(b))
  return [...byRank.filter((a) => a.installed), ...byRank.filter((a) => !a.installed && a.top)].slice(0, limit)
}
export function agentById(id: string | undefined): AgentDef | undefined {
  return AGENT_CATALOG.find((a) => a.id === id)
}
