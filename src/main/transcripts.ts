import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import type { Thread, ThreadAgent, ThreadMessage, ThreadSummary } from '@shared/types'

interface Parsed {
  cwd: string
  title: string
  messages: ThreadMessage[]
}

const MAX_TOOL_TEXT = 4000

const clip = (s: string, n = MAX_TOOL_TEXT): string => (s.length > n ? `${s.slice(0, n)}…` : s)
const toTime = (t: unknown): number | undefined => (typeof t === 'string' ? Date.parse(t) || undefined : undefined)
const titleFrom = (messages: ThreadMessage[]): string => {
  const first = messages.find((m) => m.role === 'user')?.text ?? 'Untitled session'
  const line = first.split('\n')[0].trim()
  return line.length > 90 ? `${line.slice(0, 90)}…` : line
}

function eachJson(raw: string, fn: (obj: Record<string, unknown>) => void): void {
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    try {
      const obj = JSON.parse(line)
      if (obj && typeof obj === 'object') fn(obj)
    } catch {
      /* skip partial or foreign lines */
    }
  }
}

function blockText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => (typeof b === 'string' ? b : b && typeof b === 'object' && 'text' in b ? String(b.text) : ''))
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

// Claude Code wraps slash commands and hook output in pseudo-XML user messages.
const isClaudeNoise = (text: string): boolean =>
  /^\s*<(command-|local-command|system-reminder|user-prompt-submit-hook|bash-)/.test(text)

/** Parse a Claude Code session file (~/.claude/projects/<project>/<id>.jsonl). */
export function parseClaudeTranscript(raw: string): Parsed {
  let cwd = ''
  const messages: ThreadMessage[] = []
  eachJson(raw, (o) => {
    if (!cwd && typeof o.cwd === 'string') cwd = o.cwd
    if ((o.type !== 'user' && o.type !== 'assistant') || o.isMeta || o.isSidechain) return
    const msg = o.message as { content?: unknown } | undefined
    const timestamp = toTime(o.timestamp)
    const content = msg?.content
    const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : Array.isArray(content) ? content : []
    for (const b of blocks as Record<string, unknown>[]) {
      if (b.type === 'text' && typeof b.text === 'string') {
        if (o.type === 'user' && isClaudeNoise(b.text)) continue
        if (!b.text.trim()) continue
        messages.push({ role: o.type, text: b.text, timestamp })
      } else if (b.type === 'tool_use') {
        messages.push({ role: 'tool', toolName: String(b.name ?? 'tool'), text: clip(JSON.stringify(b.input ?? {})), timestamp })
      } else if (b.type === 'tool_result') {
        messages.push({ role: 'tool', toolName: 'result', text: clip(blockText(b.content)), timestamp })
      }
    }
  })
  return { cwd, title: titleFrom(messages), messages }
}

const isCodexNoise = (text: string): boolean =>
  /^\s*<(environment_context|user_instructions|permissions|turn_aborted)/.test(text)

/** Parse a Codex session file (~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl). */
export function parseCodexTranscript(raw: string): Parsed {
  let cwd = ''
  const messages: ThreadMessage[] = []
  eachJson(raw, (o) => {
    const timestamp = toTime(o.timestamp)
    const p = ((o.type === 'response_item' || o.type === 'session_meta') && o.payload ? o.payload : o) as Record<string, unknown>
    if (o.type === 'session_meta' || o.type === 'turn_context') {
      if (!cwd && typeof p.cwd === 'string') cwd = p.cwd
      return
    }
    if (p.type === 'message' && (p.role === 'user' || p.role === 'assistant')) {
      const text = blockText(p.content)
      if (!text.trim() || (p.role === 'user' && isCodexNoise(text))) return
      messages.push({ role: p.role, text, timestamp })
    } else if (p.type === 'function_call' || p.type === 'custom_tool_call' || p.type === 'local_shell_call') {
      const args = typeof p.arguments === 'string' ? p.arguments : JSON.stringify(p.arguments ?? p.input ?? p.action ?? {})
      messages.push({ role: 'tool', toolName: String(p.name ?? 'shell'), text: clip(args), timestamp })
    } else if (p.type === 'function_call_output' || p.type === 'custom_tool_call_output') {
      const out = typeof p.output === 'string' ? p.output : JSON.stringify(p.output ?? '')
      messages.push({ role: 'tool', toolName: 'result', text: clip(out), timestamp })
    }
  })
  return { cwd, title: titleFrom(messages), messages }
}

export interface TranscriptRoot {
  agent: ThreadAgent
  accountId: string
  /** CLAUDE_CONFIG_DIR / CODEX_HOME (or the default ~/.claude, ~/.codex). */
  home: string
}

function walkJsonl(dir: string, depth: number, out: string[]): void {
  let entries: import('fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    const p = join(dir, e.name)
    if (e.isDirectory() && depth > 0) walkJsonl(p, depth - 1, out)
    else if (e.isFile() && e.name.endsWith('.jsonl')) out.push(p)
  }
}

export const parserFor = (agent: ThreadAgent): ((raw: string) => Parsed) =>
  agent === 'claude' ? parseClaudeTranscript : parseCodexTranscript

/** Read just enough of a file to find its title and folder. */
function readHead(file: string, bytes = 256 * 1024): string {
  const raw = readFileSync(file, 'utf8')
  return raw.length > bytes ? raw.slice(0, raw.lastIndexOf('\n', bytes)) : raw
}

export interface ThreadIndexEntry extends ThreadSummary {
  file: string
}

// Parsed heads keyed by file; reused while the file's mtime and size are unchanged.
const headCache = new Map<string, { mtime: number; size: number; cwd: string; title: string; hasUser: boolean }>()

function summarise(file: string, agent: ThreadAgent, mtime: number, size: number) {
  const cached = headCache.get(file)
  if (cached && cached.mtime === mtime && cached.size === size) return cached
  const parsed = parserFor(agent)(readHead(file))
  const entry = { mtime, size, cwd: parsed.cwd, title: parsed.title, hasUser: parsed.messages.some((m) => m.role === 'user') }
  headCache.set(file, entry)
  return entry
}

/** Find sessions under every root, newest first. */
export function listThreads(roots: TranscriptRoot[], limit = 300): ThreadIndexEntry[] {
  const found: { file: string; root: TranscriptRoot; mtime: number; size: number }[] = []
  for (const root of roots) {
    const base = join(root.home, root.agent === 'claude' ? 'projects' : 'sessions')
    if (!existsSync(base)) continue
    const files: string[] = []
    walkJsonl(base, root.agent === 'claude' ? 1 : 4, files)
    for (const file of files) {
      try {
        const st = statSync(file)
        found.push({ file, root, mtime: st.mtimeMs, size: st.size })
      } catch {
        /* vanished */
      }
    }
  }
  found.sort((a, b) => b.mtime - a.mtime)

  const result: ThreadIndexEntry[] = []
  for (const f of found) {
    if (result.length >= limit) break
    try {
      const head = summarise(f.file, f.root.agent, f.mtime, f.size)
      if (!head.hasUser) continue
      result.push({
        id: Buffer.from(f.file).toString('base64url'),
        file: f.file,
        agent: f.root.agent,
        accountId: f.root.accountId,
        cwd: head.cwd,
        title: head.title,
        updatedAt: f.mtime,
        sizeBytes: f.size
      })
    } catch {
      /* unreadable file */
    }
  }
  return result
}

export function readThread(entry: ThreadIndexEntry): Thread {
  const parsed = parserFor(entry.agent)(readFileSync(entry.file, 'utf8'))
  const { file: _file, ...summary } = entry
  return { ...summary, cwd: parsed.cwd || entry.cwd, title: parsed.title, messages: parsed.messages }
}
