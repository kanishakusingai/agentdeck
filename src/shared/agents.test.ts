import { describe, expect, it } from 'vitest'
import { AGENT_CATALOG, agentRank, LAUNCH_MENU_AGENTS, launchMenuAgents } from './agents'

const detected = (installed: string[]) => AGENT_CATALOG.map((a) => ({ ...a, installed: installed.includes(a.id) }))

describe('agent catalog', () => {
  it('knows the major agents, each with a description and a website', () => {
    expect(AGENT_CATALOG.length).toBeGreaterThanOrEqual(27)
    expect(new Set(AGENT_CATALOG.map((a) => a.id)).size).toBe(AGENT_CATALOG.length)
    for (const a of AGENT_CATALOG) {
      expect(a.maker, a.id).toBeTruthy()
      expect(a.blurb, a.id).toBeTruthy()
      expect(a.url, a.id).toMatch(/^https:\/\//)
    }
  })

  it('has exactly ten best-known agents, numbered 1 to 10', () => {
    const tops = AGENT_CATALOG.flatMap((a) => (a.top ? [a.top] : [])).sort((a, b) => a - b)
    expect(tops).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })
})

describe('launchMenuAgents', () => {
  it('shows ten: installed ones first, then the best-known missing ones', () => {
    const list = launchMenuAgents(detected(['cline', 'codex']))
    expect(list).toHaveLength(LAUNCH_MENU_AGENTS)
    expect(list.slice(0, 2).map((a) => a.id)).toEqual(['codex', 'cline'])
    expect(list[2].id).toBe('claude')
    expect(list.every((a, i) => i < 2 || (!a.installed && a.top))).toBe(true)
  })

  it('never lists more than ten, even with many installed', () => {
    const all = detected(AGENT_CATALOG.map((a) => a.id))
    expect(launchMenuAgents(all)).toHaveLength(10)
    expect(launchMenuAgents(all).map((a) => a.id)).toEqual([...AGENT_CATALOG].sort((a, b) => agentRank(a) - agentRank(b)).slice(0, 10).map((a) => a.id))
  })
})