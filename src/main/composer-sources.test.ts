import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listCustomCommands, listWorkspaceFiles } from './composer-sources'

let root: string
let home: string
let project: string

function put(path: string, content = ''): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content)
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'agentdeck-composer-'))
  home = join(root, 'home')
  project = join(root, 'project')
  mkdirSync(project, { recursive: true })
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('listCustomCommands', () => {
  it('finds Kiro skills in the project and the home folder', async () => {
    put(join(project, '.kiro', 'skills', 'deploy', 'SKILL.md'), '---\nname: deploy\ndescription: Ship to prod\n---\n')
    put(join(home, '.kiro', 'skills', 'review', 'SKILL.md'), '---\nname: review\ndescription: Review code\n---\n')
    expect(await listCustomCommands('kiro', project, home)).toEqual([
      { name: 'deploy', description: 'Ship to prod', source: 'skill' },
      { name: 'review', description: 'Review code', source: 'skill' }
    ])
  })

  it('finds Claude commands and skills in the home folder and the project', async () => {
    put(join(home, '.claude', 'commands', 'ship.md'), '---\ndescription: Ship it\n---\nbody')
    put(join(home, '.claude', 'commands', 'git', 'pr.md'), 'Open a pull request\nmore')
    put(join(project, '.claude', 'commands', 'test.md'), 'Run the tests')
    put(join(home, '.claude', 'skills', 'tdd', 'SKILL.md'), '---\nname: tdd\ndescription: "Test first"\n---\n')
    put(join(project, '.claude', 'skills', 'notes.txt'), 'not a skill')

    const found = await listCustomCommands('claude', project, home)
    expect(found).toEqual(
      expect.arrayContaining([
        { name: 'ship', description: 'Ship it', source: 'custom' },
        { name: 'git:pr', description: 'Open a pull request', source: 'custom' },
        { name: 'test', description: 'Run the tests', source: 'custom' },
        { name: 'tdd', description: 'Test first', source: 'skill' }
      ])
    )
    expect(found).toHaveLength(4)
  })

  it('finds Codex custom prompts', async () => {
    put(join(home, '.codex', 'prompts', 'fix.md'), '---\ndescription: Fix the bug\n---\n')
    expect(await listCustomCommands('codex', project, home)).toEqual([{ name: 'prompts:fix', description: 'Fix the bug', source: 'custom' }])
  })

  it('returns nothing for a plain shell or when folders are missing', async () => {
    expect(await listCustomCommands(undefined, project, home)).toEqual([])
    expect(await listCustomCommands('claude', join(root, 'missing'), join(root, 'nohome'))).toEqual([])
  })
})

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
