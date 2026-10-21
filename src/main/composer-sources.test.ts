import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listWorkspaceFiles } from './composer-sources'

let root: string
let project: string

function put(path: string, content = ''): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentdeck-composer-'))
  project = join(root, 'project')
  mkdirSync(project, { recursive: true })
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('listWorkspaceFiles', () => {
  it('lists files and folders with forward slashes, skipping heavy folders', async () => {
    put(join(project, 'src', 'App.tsx'))
    put(join(project, 'README.md'))
    put(join(project, 'node_modules', 'x', 'index.js'))
    put(join(project, '.git', 'HEAD'))

    const files = await listWorkspaceFiles(project)
    expect(files).toEqual(expect.arrayContaining(['README.md', 'src/', 'src/App.tsx']))
    expect(files.some((f) => f.includes('node_modules') || f.startsWith('.git'))).toBe(false)
  })

  it('stops at the limit', async () => {
    for (let i = 0; i < 20; i++) put(join(project, `f${i}.txt`))
    expect(await listWorkspaceFiles(project, 5)).toHaveLength(5)
  })
})
