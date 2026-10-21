import { describe, expect, it } from 'vitest'
import { findPrompt, readInputLine, readSlashMenu, type ScreenRow } from './terminal-screen'

/** A screen: plain strings, or [text, style] for a row drawn differently (the highlighted item). */
function screen(lines: (string | [string, string] | ScreenRow)[]): ScreenRow[] {
  return lines.map((l) => (typeof l === 'string' ? { text: l, solid: l, style: 'plain' } : Array.isArray(l) ? { text: l[0], solid: l[0], style: l[1] } : l))
}

// Captured from Kiro CLI 2.32 (V3 UI) after typing "/".
const KIRO = screen([
  'Default · claude-sonnet-5.5 · medium · ◔ 1%                                               ~\\agentdeck · (main)',
  '',
  '› / ',
  ['/agent                            List or switch agents (tab for sub-commands)', 'bold-magenta'],
  '/autonomous                       Turn autonomous mode on or off (tab for sub-commands)',
  '/changelog                        Show recent release notes',
  '/chat                             Load a previous session, save, or start a new one (tab for sub-commands)    ',
  '/clear                            Clear the conversation and start a fresh session',
  '/code                             Code intelligence status, initialization, and codebase overview (tab for... ',
  '/compact                          Compact conversation history to reduce context usage',
  '/config                           View configured agents, MCP servers, powers, steering, skills, and hooks... ',
  '(+75 more)',
  '──────────────────────────────────────────────────────────────────────────────────────────────────────────────',
  ' esc to cancel · ↑↓ to navigate · ↵ to select'
])

// Captured from Codex 0.163 after typing "/co" and pressing ↓ (the menu sits above the input).
const CODEX = screen([
  '  >_ OpenAI Codex (v0.163.0)',
  '',
  '  /compact  summarize conversation to prevent hitting the context limit                                       ',
  ['› /config   configure Codex preferences                                                                       ', 'inverse'],
  '  /copy     copy the last response or part of it',
  '',
  '› /co',
  '',
  '  GPT-6-Luna medium · ~'
])

// Captured from Claude Code 2.1 after typing "/co" and pressing ↓ (long descriptions wrap).
const CLAUDE = screen([
  '──────────────────────────────────────────────────────────────────────────────────────────────────────────────',
  '❯ /co ',
  '──────────────────────────────────────────────────────────────────────────────────────────────────────────────',
  ['  /copy                             Copy Claude\'s last response to clipboard (or /copy N for the Nth-latest)', 'grey'],
  ['  /color                            Set the prompt bar color for this session', 'lavender'],
  ['  /config                           Open settings', 'grey'],
  ['  /code-review                      Review the current diff, or a PR number/branch/path target, for', 'grey'],
  '                                    correctness bugs and reuse/simplification/efficiency cleanups at the gi…',
  ['  /usage (cost)                     Show session cost, plan usage, and activity stats', 'grey'],
  ['  /claude-mem:Agent Cost Report     (claude-mem) Believable agent cost report for any period, default the     ', 'grey']
])

describe('readSlashMenu (the commands the terminal is showing)', () => {
  it("reads Kiro's menu, how many more it has, and the highlighted row", () => {
    const menu = readSlashMenu(KIRO, '/')!
    expect(menu.items.map((i) => i.name)).toEqual(['/agent', '/autonomous', '/changelog', '/chat', '/clear', '/code', '/compact', '/config'])
    expect(menu.items[1].description).toBe('Turn autonomous mode on or off (tab for sub-commands)')
    expect(menu.more).toBe(75)
    expect(menu.highlighted).toBe(0)
  })

  it("reads Codex's menu above the input, highlighted by its marker", () => {
    const menu = readSlashMenu(CODEX, '/co')!
    expect(menu.items.map((i) => i.name)).toEqual(['/compact', '/config', '/copy'])
    expect(menu.items[1].description).toBe('configure Codex preferences')
    expect(menu.highlighted).toBe(1)
    expect(menu.more).toBe(0)
  })

  it("reads Claude's menu: wrapped descriptions, aliases, names with spaces, highlight by colour", () => {
    const menu = readSlashMenu(CLAUDE, '/co')!
    expect(menu.items.map((i) => i.name)).toEqual(['/copy', '/color', '/config', '/code-review', '/usage', '/claude-mem:Agent Cost Report'])
    expect(menu.items[3].description).toBe('Review the current diff, or a PR number/branch/path target, for correctness bugs and reuse/simplification/efficiency cleanups at the gi…')
    expect(menu.items[4]).toEqual({ name: '/usage', alias: 'cost', description: 'Show session cost, plan usage, and activity stats' })
    expect(menu.highlighted).toBe(1)
  })

  it("reads Kiro's sub-command list (after Tab) as full commands", () => {
    const rows = screen(['› /code', ['❯ status      Show code intelligence status', 'marker'], '  init        Initialize code intelligence for the workspace', '  overview    Generate a codebase overview', '────', ' esc to close'])
    const menu = readSlashMenu(rows, '/code')!
    expect(menu.items.map((i) => i.name)).toEqual(['/code status', '/code init', '/code overview'])
    expect(menu.highlighted).toBe(0)
  })

  it('is null when the terminal shows no menu', () => {
    expect(readSlashMenu(screen(['PS C:\\Users\\me> /', '']), '/')).toBeNull()
  })

  it('ignores paths and other text that only looks like a command', () => {
    expect(readSlashMenu(screen(['  /usr/bin/node   is the runtime', '› /']), '/')).toBeNull()
  })
})

describe('findPrompt / readInputLine (reading what the input line holds)', () => {
  it('finds the prompt in front of the typed text', () => {
    expect(findPrompt(KIRO, '/')).toBe('› ')
    expect(findPrompt(CODEX, '/co')).toBe('› ')
    expect(findPrompt(CLAUDE, '/co')).toBe('❯ ')
    expect(findPrompt(screen(['PS C:\\Users\\me> echo hi']), 'echo hi')).toBe('PS C:\\Users\\me> ')
  })

  it('does not take text that merely ends the same way as a prompt', () => {
    expect(findPrompt(screen(['  https://kiro.dev/docs/cli/v3/']), '/')).toBeNull()
  })

  it('reads the line after the prompt, skipping faint placeholder text', () => {
    expect(readInputLine(screen(['› /code', '❯ status   Show']), '› ', 110)).toBe('/code')
    const placeholder = { text: '›  ask a question or describe a task ↵', solid: '›                                     ', style: 'plain' }
    expect(readInputLine([placeholder], '› ', 110)).toBe('')
    // An empty line whose trailing space was trimmed off the screen row.
    expect(readInputLine(screen(['ran: x', '›']), '› ', 110)).toBe('')
    // The live input is the lowest matching row (Codex's highlighted item also starts with "› ").
    expect(readInputLine(CODEX, '› ', 110)).toBe('/co')
  })

  it('reads the line when only faint hint text fills the rest of the row', () => {
    const row = { text: `› /color  ${'[red|blue|green]'.padEnd(40, '.')}`, solid: '› /color', style: 'plain' }
    expect(readInputLine([row], '› ', 50)).toBe('/color')
  })

  it('gives up when the line may wrap onto the next row, or the prompt is gone', () => {
    expect(readInputLine(screen([`› ${'x'.repeat(30)}`]), '› ', 32)).toBeNull()
    expect(readInputLine(screen(['something else']), '› ', 110)).toBeNull()
  })
})
