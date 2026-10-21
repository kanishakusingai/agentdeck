import { readdir } from 'fs/promises'
import { join, relative } from 'path'

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
