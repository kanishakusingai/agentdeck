import { existsSync, statSync } from 'fs'
import { delimiter, join } from 'path'
import { AGENT_CATALOG } from '@shared/agents'
import type { DetectedAgent } from '@shared/types'

// Preferred order on Windows: real executables and .cmd shims before .ps1,
// so PowerShell's execution policy can never block a launch.
const WIN_PREFERENCE = ['.EXE', '.CMD', '.BAT', '.COM', '.PS1']

function isFile(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isFile()
  } catch {
    return false
  }
}

function findOnPath(bin: string, dirs: string[], exts: string[]): string | undefined {
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, bin + ext.toLowerCase())
      if (isFile(candidate)) return candidate
    }
  }
  return undefined
}

/** Check which agents from the catalog are installed, by scanning PATH. */
export function detectAgents(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform
): DetectedAgent[] {
  const pathValue = env.PATH ?? env.Path ?? ''
  const dirs = pathValue.split(delimiter).filter(Boolean)
  let exts = ['']
  if (platform === 'win32') {
    const available = (env.PATHEXT ?? '.EXE;.CMD;.BAT;.PS1').toUpperCase().split(';').filter(Boolean)
    exts = [
      ...WIN_PREFERENCE.filter((e) => available.includes(e) || e === '.PS1'),
      ...available.filter((e) => !WIN_PREFERENCE.includes(e))
    ]
  }
  return AGENT_CATALOG.map((agent) => {
    let path: string | undefined
    const skip = (agent.notIn ?? []).map((s) => s.toLowerCase())
    const searched = skip.length ? dirs.filter((d) => !skip.some((s) => d.toLowerCase().includes(s))) : dirs
    for (const bin of agent.bins) {
      path = findOnPath(bin, searched, exts)
      if (path) break
    }
    return { ...agent, installed: Boolean(path), path }
  })
}
