/**
 * Pure helpers for the per-pane message box: spotting "/" and "@" triggers,
 * ranking suggestions, inserting the chosen one, and each agent's built-in
 * slash commands.
 */

export interface Trigger {
  /** `command` = "/" at the very start, `file` = "@" at the start or after whitespace. */
  kind: 'command' | 'file'
  /** What the user typed after the trigger character. */
  query: string
  /** Index of the trigger character in the text. */
  start: number
}

export interface SlashCommand {
  name: string
  description: string
  source: 'builtin' | 'custom' | 'skill'
}

/** Which suggestion list (if any) the text before the caret asks for. */
export function detectTrigger(text: string, caret: number): Trigger | null {
  const before = text.slice(0, caret)
  const command = /^\/([^\s/]*)$/.exec(before)
  if (command) return { kind: 'command', query: command[1], start: 0 }
  const file = /(^|\s)@([^\s@]*)$/.exec(before)
  if (file) return { kind: 'file', query: file[2], start: before.length - file[2].length - 1 }
  return null
}

/** Replace the trigger and its query with `insert`, followed by one space (unless `trailingSpace` is false). */
export function applySuggestion(
  text: string,
  caret: number,
  trigger: Trigger,
  insert: string,
  trailingSpace = true
): { text: string; caret: number } {
  const head = text.slice(0, trigger.start) + insert
  const tail = text.slice(caret)
  if (!trailingSpace) return { text: head + tail, caret: head.length }
  if (/^\s/.test(tail)) return { text: head + tail, caret: head.length + 1 }
  return { text: `${head} ${tail}`, caret: head.length + 1 }
}

/** File paths best-first: file name starts with the query, path starts with it, then anywhere. */
export function rankFiles(paths: readonly string[], query: string, limit = 50): string[] {
  const q = query.toLowerCase()
  if (!q) return paths.slice(0, limit)
  const buckets: string[][] = [[], [], [], []]
  for (const p of paths) {
    const lower = p.toLowerCase()
    const name = lower.replace(/\/$/, '').split('/').pop() ?? lower
    if (name.startsWith(q)) buckets[0].push(p)
    else if (lower.startsWith(q)) buckets[1].push(p)
    else if (name.includes(q)) buckets[2].push(p)
    else if (lower.includes(q)) buckets[3].push(p)
  }
  return buckets.flat().slice(0, limit)
}

/** Prefix matches first, then substring matches; original order within each group. */
export function rankSuggestions<T>(items: readonly T[], query: string, key: (item: T) => string): T[] {
  const q = query.toLowerCase()
  if (!q) return [...items]
  const prefix: T[] = []
  const inside: T[] = []
  for (const item of items) {
    const k = key(item).toLowerCase()
    if (k.startsWith(q)) prefix.push(item)
    else if (k.includes(q)) inside.push(item)
  }
  return [...prefix, ...inside]
}

type Spec = [name: string, description: string]

const CLAUDE: Spec[] = [
  ['add-dir', 'Add another working folder'],
  ['agents', 'Manage subagents'],
  ['btw', 'Ask a side question without interrupting'],
  ['clear', 'Clear the conversation and start fresh'],
  ['compact', 'Summarise the conversation to free up context'],
  ['config', 'Open settings'],
  ['context', 'Show how much context is used'],
  ['copy', 'Copy the last reply'],
  ['cost', 'Show token cost of this session'],
  ['diff', 'Show changes made in this session'],
  ['doctor', 'Check the installation'],
  ['exit', 'Quit Claude Code'],
  ['export', 'Export the conversation'],
  ['fast', 'Toggle fast mode'],
  ['feedback', 'Send feedback'],
  ['fork', 'Branch the conversation'],
  ['help', 'Show help'],
  ['hooks', 'Manage hooks'],
  ['ide', 'Connect to an IDE'],
  ['init', 'Create a CLAUDE.md for this project'],
  ['login', 'Sign in'],
  ['logout', 'Sign out'],
  ['mcp', 'Manage MCP servers'],
  ['memory', 'Edit memory files'],
  ['model', 'Choose the model'],
  ['output-style', 'Change the reply style'],
  ['permissions', 'Manage tool permissions'],
  ['plan', 'Switch to plan mode'],
  ['plugin', 'Manage plugins'],
  ['release-notes', 'What is new'],
  ['resume', 'Resume an earlier conversation'],
  ['review', 'Review a pull request'],
  ['rewind', 'Go back to an earlier point'],
  ['sandbox', 'Configure the sandbox'],
  ['security-review', 'Review changes for security issues'],
  ['skills', 'List skills'],
  ['status', 'Show account and session status'],
  ['statusline', 'Set up the status line'],
  ['tasks', 'Show background tasks'],
  ['theme', 'Change the colour theme'],
  ['usage', 'Show plan usage limits'],
  ['vim', 'Toggle vim editing']
]

const CODEX: Spec[] = [
  ['agents', 'Manage agents'],
  ['apps', 'Browse apps'],
  ['approve', 'Approve the pending action'],
  ['cd', 'Change the working folder'],
  ['clear', 'Clear the screen and start fresh'],
  ['compact', 'Summarise the conversation to free up context'],
  ['copy', 'Copy the last reply'],
  ['diff', 'Show the git diff'],
  ['exit', 'Quit Codex'],
  ['experimental', 'Toggle experimental features'],
  ['fast', 'Toggle fast mode'],
  ['feedback', 'Send feedback'],
  ['fork', 'Fork the conversation'],
  ['goal', 'Set a goal'],
  ['hooks', 'Manage hooks'],
  ['init', 'Create an AGENTS.md for this project'],
  ['logout', 'Sign out'],
  ['mcp', 'List MCP tools'],
  ['memories', 'Manage memories'],
  ['mention', 'Mention a file'],
  ['model', 'Choose the model and reasoning effort'],
  ['new', 'Start a new conversation'],
  ['permissions', 'Choose what Codex may do without asking'],
  ['plan', 'Switch to plan mode'],
  ['plugins', 'Manage plugins'],
  ['ps', 'List background terminals'],
  ['pwd', 'Show the working folder'],
  ['rename', 'Rename this conversation'],
  ['resume', 'Resume an earlier conversation'],
  ['review', 'Review current changes'],
  ['skills', 'List skills'],
  ['status', 'Show session configuration and usage'],
  ['statusline', 'Set up the status line'],
  ['stop', 'Stop background terminals'],
  ['theme', 'Change the colour theme'],
  ['usage', 'Show plan usage limits']
]

const GEMINI: Spec[] = [
  ['about', 'Version info'],
  ['auth', 'Change sign-in method'],
  ['chat', 'Save or resume conversations'],
  ['clear', 'Clear the screen'],
  ['compress', 'Summarise the conversation to free up context'],
  ['copy', 'Copy the last reply'],
  ['directory', 'Manage working folders'],
  ['extensions', 'List extensions'],
  ['help', 'Show help'],
  ['ide', 'Connect to an IDE'],
  ['init', 'Create a GEMINI.md for this project'],
  ['mcp', 'List MCP servers'],
  ['memory', 'Manage memory'],
  ['model', 'Choose the model'],
  ['quit', 'Quit Gemini CLI'],
  ['restore', 'Undo file changes'],
  ['settings', 'Open settings'],
  ['stats', 'Session statistics'],
  ['theme', 'Change the colour theme'],
  ['tools', 'List tools'],
  ['vim', 'Toggle vim mode']
]

const OPENCODE: Spec[] = [
  ['compact', 'Summarise the session'],
  ['editor', 'Write the message in your editor'],
  ['exit', 'Quit OpenCode'],
  ['export', 'Export the conversation'],
  ['help', 'Show help'],
  ['init', 'Create an AGENTS.md for this project'],
  ['models', 'Choose the model'],
  ['new', 'Start a new session'],
  ['redo', 'Redo the last undone change'],
  ['sessions', 'Switch session'],
  ['share', 'Share this session'],
  ['themes', 'Change the colour theme'],
  ['undo', 'Undo the last change']
]

const BUILTINS: Record<string, Spec[]> = { claude: CLAUDE, codex: CODEX, gemini: GEMINI, opencode: OPENCODE }

/** The built-in slash commands of an agent (none for a plain shell or unknown agents). */
export function commandsFor(agentId: string | undefined): SlashCommand[] {
  const specs = (agentId && BUILTINS[agentId]) || []
  return specs.map(([name, description]) => ({ name, description, source: 'builtin' }))
}
