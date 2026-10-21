import { describe, expect, it } from 'vitest'
import { PANE_NAMES, paneTitle } from './pane-names'

describe('paneTitle', () => {
  it('gives agent panes the first free person name', () => {
    expect(paneTitle({ base: 'Claude Code', agent: true, taken: [] })).toBe('Matthew')
    expect(paneTitle({ base: 'Codex', agent: true, taken: ['Matthew', 'Terminal'] })).toBe('John')
  })

  it('numbers plain terminals', () => {
    expect(paneTitle({ base: 'Terminal', agent: false, taken: ['Matthew'] })).toBe('Terminal')
    expect(paneTitle({ base: 'Terminal', agent: false, taken: ['Terminal', 'Terminal 2'] })).toBe('Terminal 3')
  })

  it('keeps a name the pane already had', () => {
    expect(paneTitle({ base: 'Claude Code', agent: true, taken: ['Sarah'], wanted: ' Sarah ' })).toBe('Sarah')
  })

  it('falls back to the agent name when every person name is taken', () => {
    expect(paneTitle({ base: 'Codex', agent: true, taken: PANE_NAMES })).toBe('Codex')
    expect(paneTitle({ base: 'Codex', agent: true, taken: [...PANE_NAMES, 'Codex'] })).toBe('Codex 2')
  })
})
