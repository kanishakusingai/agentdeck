import { readdir, readFile } from 'fs/promises'
import { join, relative } from 'path'
import type { SlashCommand } from '@shared/composer'

/** Folders never worth offering in the @ file picker. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.hg',
  '.svn',
  'dist',
  'out',
  'build',
  'release',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  'coverage',
  'target',
  '__pycache__',
  '.venv',
  'venv',
  '.idea',
  '.vs',
  'graphify-out'
])

async function entries(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true })
  } catch {
    return []
  }
}

async function text(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf8')
  } catch {
    return ''
  }
}

/** `description:` from YAML front matter, else the first line of the body. */
function describe(content: string): string {
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content)
  if (front) {
    const line = /^description:\s*(.+)$/m.exec(front[1])
    if (line) return line[1].trim().replace(/^["']|["']$/g, '')
  }
  const body = front ? content.slice(front[0].length) : content
  const first = body.split(/\r?\n/).find((l) => l.trim())
  return (first ?? '').replace(/^#+\s*/, '').trim().slice(0, 120)
}

/** `*.md` files under `dir`, named by path with ":" between folders (Claude's convention). */
async function markdownCommands(dir: string, prefix = ''): Promise<SlashCommand[]> {
  const out: SlashCommand[] = []
  for (const e of await entries(dir)) {
    const path = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await markdownCommands(path, `${prefix}${e.name}:`)))
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      out.push({ name: prefix + e.name.slice(0, -3), description: describe(await text(path)), source: 'custom' })
    }
  }
  return out
}

/** Folders that contain a SKILL.md. */
async function skills(dir: string): Promise<SlashCommand[]> {
  const out: SlashCommand[] = []
  for (const e of await entries(dir)) {
    if (!e.isDirectory()) continue
    const content = await text(join(dir, e.name, 'SKILL.md'))
    if (!content) continue
    const name = /^name:\s*(.+)$/m.exec(content)?.[1].trim().replace(/^["']|["']$/g, '') || e.name
    out.push({ name, description: describe(content), source: 'skill' })
  }
  return out
}

/** Gemini CLI custom commands are `*.toml` files with a `description = "..."` line. */
async function tomlCommands(dir: string, prefix = ''): Promise<SlashCommand[]> {
  const out: SlashCommand[] = []
  for (const e of await entries(dir)) {
    const path = join(dir, e.name)
    if (e.isDirectory()) out.push(...(await tomlCommands(path, `${prefix}${e.name}:`)))
    else if (e.isFile() && e.name.toLowerCase().endsWith('.toml')) {
      const description = /^description\s*=\s*["'](.*)["']\s*$/m.exec(await text(path))?.[1] ?? ''
      out.push({ name: prefix + e.name.slice(0, -5), description, source: 'custom' })
    }
  }
  return out
}

/** The user's own slash commands and skills for an agent, from its home and project folders. */
export async function listCustomCommands(agentId: string | undefined, projectDir: string, homeDir: string): Promise<SlashCommand[]> {
  let found: SlashCommand[][] = []
  switch (agentId) {
    case 'claude':
      found = await Promise.all([
        markdownCommands(join(projectDir, '.claude', 'commands')),
        markdownCommands(join(homeDir, '.claude', 'commands')),
        skills(join(projectDir, '.claude', 'skills')),
        skills(join(homeDir, '.claude', 'skills'))
      ])
      break
    case 'codex': {
      const prompts = await markdownCommands(join(homeDir, '.codex', 'prompts'))
      found = [prompts.map((p) => ({ ...p, name: `prompts:${p.name}` }))]
      break
    }
    case 'gemini':
      found = await Promise.all([tomlCommands(join(projectDir, '.gemini', 'commands')), tomlCommands(join(homeDir, '.gemini', 'commands'))])
      break
    case 'opencode':
      found = await Promise.all([
        markdownCommands(join(projectDir, '.opencode', 'command')),
        markdownCommands(join(projectDir, '.opencode', 'commands')),
        markdownCommands(join(homeDir, '.config', 'opencode', 'command')),
        markdownCommands(join(homeDir, '.config', 'opencode', 'commands'))
      ])
      break
    case 'kiro':
      // Kiro runs installed skills as /<skill-name>.
      found = await Promise.all([skills(join(projectDir, '.kiro', 'skills')), skills(join(homeDir, '.kiro', 'skills'))])
      break
    default:
      return []
  }
  // Project entries come first and win over home entries with the same name.
  const seen = new Set<string>()
  return found.flat().filter((c) => !seen.has(c.name) && Boolean(seen.add(c.name)))
}

/**
 * Files and folders (folders end with "/") under `root`, relative and with
 * forward slashes, breadth-first so shallow paths come first.
 */
export async function listWorkspaceFiles(root: string, limit = 5000): Promise<string[]> {
  const out: string[] = []
  let level = [root]
  for (let depth = 0; depth < 12 && level.length && out.length < limit; depth++) {
    const next: string[] = []
    for (const dir of level) {
      const list = (await entries(dir)).sort((a, b) => a.name.localeCompare(b.name))
      for (const e of list) {
        if (out.length >= limit) break
        const path = join(dir, e.name)
        const rel = relative(root, path).split('\\').join('/')
        if (e.isDirectory()) {
          if (SKIP_DIRS.has(e.name)) continue
          out.push(`${rel}/`)
          next.push(path)
        } else if (e.isFile()) out.push(rel)
      }
    }
    level = next
  }
  return out
}
