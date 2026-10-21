import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { JsonStore } from './store'

const tempDir = (): string => mkdtempSync(join(tmpdir(), 'agentdeck-store-'))

describe('JsonStore', () => {
  it('starts with defaults when no file exists', () => {
    const store = new JsonStore(tempDir())
    expect(store.get('workspaces')).toEqual([])
    expect(store.get('settings').pushToTalkKey).toBe('F9')
    expect(store.get('ui').railOpen).toBe(true)
  })

  it('keeps values across a new instance on the same folder', () => {
    const dir = tempDir()
    const first = new JsonStore(dir)
    first.set('ui', { railOpen: false, sidebarOpen: false, sidebarTab: 'browser' })
    first.flush()

    const second = new JsonStore(dir)
    expect(second.get('ui')).toEqual({ railOpen: false, sidebarOpen: false, sidebarTab: 'browser' })
  })

  it('fills settings added in a newer version into an older file', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'agentdeck-data.json'), JSON.stringify({ settings: { shell: 'cmd' } }))
    const store = new JsonStore(dir)
    expect(store.get('settings').shell).toBe('cmd')
    expect(store.get('settings').terminalFontSize).toBe(13)
  })

  it('recovers from a corrupt file instead of crashing', () => {
    const dir = tempDir()
    writeFileSync(join(dir, 'agentdeck-data.json'), '{not json')
    expect(new JsonStore(dir).get('workspaces')).toEqual([])
  })

  it('drops what older versions saved for Agent and Thread modes', () => {
    const dir = tempDir()
    writeFileSync(
      join(dir, 'agentdeck-data.json'),
      JSON.stringify({ routines: [{ id: 'r1' }], runs: [{ id: 'x' }], ui: { mode: 'agent', railOpen: false } })
    )
    const data = new JsonStore(dir).snapshot()
    expect(data).not.toHaveProperty('routines')
    expect(data).not.toHaveProperty('runs')
    expect(data.ui).toEqual({ railOpen: false, sidebarOpen: true, sidebarTab: 'dashboard' })
  })
})
