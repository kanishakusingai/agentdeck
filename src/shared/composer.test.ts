import { describe, expect, it } from 'vitest'
import { applySuggestion, commandsFor, detectTrigger, rankFiles, rankSuggestions } from './composer'

describe('detectTrigger', () => {
  it('opens the command list when the box starts with a slash', () => {
    expect(detectTrigger('/mo', 3)).toEqual({ kind: 'command', query: 'mo', start: 0 })
    expect(detectTrigger('/', 1)).toEqual({ kind: 'command', query: '', start: 0 })
  })

  it('closes the command list once a space is typed or the slash is mid-text', () => {
    expect(detectTrigger('/model opus', 11)).toBeNull()
    expect(detectTrigger('fix a/b', 7)).toBeNull()
  })

  it('opens the file list after an @ at the start or after a space', () => {
    expect(detectTrigger('@src/ma', 7)).toEqual({ kind: 'file', query: 'src/ma', start: 0 })
    expect(detectTrigger('look at @App', 12)).toEqual({ kind: 'file', query: 'App', start: 8 })
  })

  it('ignores @ inside words such as email addresses', () => {
    expect(detectTrigger('mail me@example.com', 19)).toBeNull()
  })

  it('only looks at the text before the caret', () => {
    expect(detectTrigger('@foo bar', 4)).toEqual({ kind: 'file', query: 'foo', start: 0 })
    expect(detectTrigger('@foo bar', 8)).toBeNull()
  })
})

describe('applySuggestion', () => {
  it('replaces the typed trigger with the chosen item, reusing a following space', () => {
    const trigger = detectTrigger('look at @Ap please', 11)!
    expect(applySuggestion('look at @Ap please', 11, trigger, '@src/App.tsx')).toEqual({
      text: 'look at @src/App.tsx please',
      caret: 21
    })
  })

  it('completes a command', () => {
    const trigger = detectTrigger('/mo', 3)!
    expect(applySuggestion('/mo', 3, trigger, '/model')).toEqual({ text: '/model ', caret: 7 })
  })

  it('can leave the caret right after a folder so the user keeps narrowing', () => {
    const trigger = detectTrigger('@sr', 3)!
    expect(applySuggestion('@sr', 3, trigger, '@src/', false)).toEqual({ text: '@src/', caret: 5 })
  })
})

describe('rankFiles', () => {
  const paths = ['README.md', 'src/', 'src/App.tsx', 'src/lib/app-state.ts', 'docs/mapping.md']

  it('prefers file names that start with the query, then paths, then anything containing it', () => {
    expect(rankFiles(paths, 'app')).toEqual(['src/App.tsx', 'src/lib/app-state.ts', 'docs/mapping.md'])
    expect(rankFiles(paths, 'src/')).toEqual(['src/', 'src/App.tsx', 'src/lib/app-state.ts'])
  })

  it('caps the list', () => {
    expect(rankFiles(paths, '', 2)).toEqual(['README.md', 'src/'])
  })
})

describe('rankSuggestions', () => {
  const items = [{ name: 'compact' }, { name: 'model' }, { name: 'memory' }, { name: 'permissions' }]

  it('puts prefix matches first, then other matches, and drops the rest', () => {
    expect(rankSuggestions(items, 'm', (i) => i.name).map((i) => i.name)).toEqual(['model', 'memory', 'compact', 'permissions'])
    expect(rankSuggestions(items, 'mem', (i) => i.name).map((i) => i.name)).toEqual(['memory'])
  })

  it('keeps the original order for an empty query', () => {
    expect(rankSuggestions(items, '', (i) => i.name)).toEqual(items)
  })
})

describe('commandsFor', () => {
  it('lists the built-in commands of each agent', () => {
    expect(commandsFor('claude').map((c) => c.name)).toContain('compact')
    expect(commandsFor('codex').map((c) => c.name)).toContain('permissions')
  })

  it('lists all of Kiro CLI’s commands, including sub-commands', () => {
    const kiro = commandsFor('kiro').map((c) => c.name)
    expect(kiro.length).toBeGreaterThan(80)
    expect(kiro).toEqual(expect.arrayContaining(['context add', 'spec new', 'tangent', 'plan', 'goal', 'workflow run', 'tools trust-all', 'chat resume']))
    expect(new Set(kiro).size).toBe(kiro.length)
  })

  it('has no built-ins for a plain shell', () => {
    expect(commandsFor(undefined)).toEqual([])
  })
})
