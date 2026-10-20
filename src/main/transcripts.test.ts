import { mkdirSync, mkdtempSync, writeFileSync, utimesSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { listThreads, parseClaudeTranscript, parseCodexTranscript, searchThreads } from './transcripts'

const lines = (...objs: unknown[]): string => objs.map((o) => JSON.stringify(o)).join('\n')

const claudeFixture = lines(
  { type: 'queue-operation', operation: 'enqueue' },
  { type: 'user', cwd: 'C:\\code\\site', isMeta: true, message: { role: 'user', content: '<command-name>/clear</command-name>' }, timestamp: '2026-10-20T08:00:00.000Z' },
  { type: 'user', cwd: 'C:\\code\\site', message: { role: 'user', content: [{ type: 'text', text: 'Add a dark mode toggle' }] }, timestamp: '2026-10-20T08:00:01.000Z' },
  { type: 'assistant', message: { role: 'assistant', content: [
    { type: 'thinking', thinking: 'private' },
    { type: 'text', text: "I'll add the toggle to the header." },
    { type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: 'src/Header.tsx' } }
  ] }, timestamp: '2026-10-20T08:00:05.000Z' },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'File updated' }] }, timestamp: '2026-10-20T08:00:06.000Z' },
  { type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: 'subagent chatter' }] } },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'Done — the toggle is in the header.' }] }, timestamp: '2026-10-20T08:00:09.000Z' },
  'not json at all'
)

const codexFixture = lines(
  { timestamp: '2026-10-20T09:00:00.000Z', type: 'session_meta', payload: { id: 'abc', cwd: 'C:\\code\\api' } },
  { timestamp: '2026-10-20T09:00:00.500Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: '<environment_context>cwd</environment_context>' }] } },
  { timestamp: '2026-10-20T09:00:01.000Z', type: 'response_item', payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Write an e2e test for login' }] } },
  { timestamp: '2026-10-20T09:00:03.000Z', type: 'response_item', payload: { type: 'function_call', name: 'shell', arguments: '{"command":["npm","test"]}' } },
  { timestamp: '2026-10-20T09:00:04.000Z', type: 'response_item', payload: { type: 'function_call_output', output: '1 passed' } },
  { timestamp: '2026-10-20T09:00:05.000Z', type: 'response_item', payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'Added tests/login.spec.ts.' }] } },
  { timestamp: '2026-10-20T09:00:06.000Z', type: 'event_msg', payload: { type: 'token_count' } }
)

describe('parseClaudeTranscript', () => {
  it('turns a Claude Code session into a readable conversation', () => {
    const t = parseClaudeTranscript(claudeFixture)
    expect(t.cwd).toBe('C:\\code\\site')
    expect(t.title).toBe('Add a dark mode toggle')
    expect(t.messages.map((m) => [m.role, m.toolName ?? '', m.text])).toEqual([
      ['user', '', 'Add a dark mode toggle'],
      ['assistant', '', "I'll add the toggle to the header."],
      ['tool', 'Edit', '{"file_path":"src/Header.tsx"}'],
      ['tool', 'result', 'File updated'],
      ['assistant', '', 'Done — the toggle is in the header.']
    ])
  })
})

describe('parseCodexTranscript', () => {
  it('turns a Codex session into a readable conversation', () => {
    const t = parseCodexTranscript(codexFixture)
    expect(t.cwd).toBe('C:\\code\\api')
    expect(t.title).toBe('Write an e2e test for login')
    expect(t.messages.map((m) => [m.role, m.toolName ?? '', m.text])).toEqual([
      ['user', '', 'Write an e2e test for login'],
      ['tool', 'shell', '{"command":["npm","test"]}'],
      ['tool', 'result', '1 passed'],
      ['assistant', '', 'Added tests/login.spec.ts.']
    ])
  })
})

describe('listThreads', () => {
  it('finds sessions for every account, newest first', () => {
    const claudeHome = mkdtempSync(join(tmpdir(), 'agentdeck-claude-'))
    const codexHome = mkdtempSync(join(tmpdir(), 'agentdeck-codex-'))
    mkdirSync(join(claudeHome, 'projects', 'C--code-site'), { recursive: true })
    mkdirSync(join(codexHome, 'sessions', '2026', '10', '20'), { recursive: true })
    const claudeFile = join(claudeHome, 'projects', 'C--code-site', 's1.jsonl')
    const codexFile = join(codexHome, 'sessions', '2026', '10', '20', 'rollout-1.jsonl')
    writeFileSync(claudeFile, claudeFixture)
    writeFileSync(codexFile, codexFixture)
    utimesSync(claudeFile, new Date(2026, 9, 20, 8), new Date(2026, 9, 20, 8))
    utimesSync(codexFile, new Date(2026, 9, 20, 9), new Date(2026, 9, 20, 9))

    const threads = listThreads([
      { agent: 'claude', accountId: 'system', home: claudeHome },
      { agent: 'codex', accountId: 'acct-2', home: codexHome }
    ])

    expect(threads.map((t) => [t.agent, t.accountId, t.title, t.cwd])).toEqual([
      ['codex', 'acct-2', 'Write an e2e test for login', 'C:\\code\\api'],
      ['claude', 'system', 'Add a dark mode toggle', 'C:\\code\\site']
    ])
  })

  it('skips missing folders quietly', () => {
    expect(listThreads([{ agent: 'claude', accountId: 'x', home: join(tmpdir(), 'does-not-exist-agentdeck') }])).toEqual([])
  })
})

describe('searchThreads', () => {
  it('finds threads by words anywhere in the conversation, not just the title', () => {
    const home = mkdtempSync(join(tmpdir(), 'agentdeck-search-'))
    mkdirSync(join(home, 'projects', 'p'), { recursive: true })
    writeFileSync(join(home, 'projects', 'p', 'a.jsonl'), claudeFixture)
    const threads = listThreads([{ agent: 'claude', accountId: 'system', home }])

    expect(searchThreads(threads, 'TOGGLE IS IN THE HEADER')).toEqual([threads[0].id])
    expect(searchThreads(threads, 'kubernetes')).toEqual([])
  })
})
