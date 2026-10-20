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
    expect(store.get('ui').mode).toBe('code')
  })

  it('keeps values across a new instance on the same folder', () => {
    const dir = tempDir()
    const first = new JsonStore(dir)
    first.set('ui', { mode: 'thread', railOpen: false, sidebarOpen: false, sidebarTab: 'browser' })
    first.flush()

    const second = new JsonStore(dir)
    expect(second.get('ui')).toEqual({ mode: 'thread', railOpen: false, sidebarOpen: false, sidebarTab: 'browser' })
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
    expect(new JsonStore(dir).get('routines')).toEqual([])
  })
})
