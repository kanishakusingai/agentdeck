import { describe, expect, it } from 'vitest'
import { SYSTEM_ACCOUNT_ID, type Account, type Workspace } from '@shared/types'
import { accountEnv, resolveAccount } from './accounts'

const work: Account = { id: 'a-work', provider: 'claude', name: 'Work', configDir: 'C:\\data\\accounts\\a-work', createdAt: 0 }
const personal: Account = { id: 'a-me', provider: 'claude', name: 'Personal', configDir: 'C:\\data\\accounts\\a-me', createdAt: 0 }
const codexClient: Account = { id: 'c-client', provider: 'codex', name: 'Client', configDir: 'C:\\data\\accounts\\c-client', createdAt: 0 }
const accounts = [work, personal, codexClient]

const ws = (overrides: Workspace['accountOverrides'] = {}): Workspace => ({
  id: 'w1', name: 'site', path: 'C:\\code\\site', accountOverrides: overrides, createdAt: 0
})

describe('resolveAccount', () => {
  it('uses the System login when nothing is configured', () => {
    expect(resolveAccount({ provider: 'claude', accounts, defaults: {}, workspace: ws() })).toBe(SYSTEM_ACCOUNT_ID)
  })

  it('uses the provider default', () => {
    expect(resolveAccount({ provider: 'claude', accounts, defaults: { claude: 'a-me' }, workspace: ws() })).toBe('a-me')
  })

  it('lets a workspace override the default', () => {
    expect(
      resolveAccount({ provider: 'claude', accounts, defaults: { claude: 'a-me' }, workspace: ws({ claude: 'a-work' }) })
    ).toBe('a-work')
  })

  it('lets the pane choice win over everything', () => {
    expect(
      resolveAccount({
        provider: 'claude', accounts, defaults: { claude: 'a-me' }, workspace: ws({ claude: 'a-work' }), explicit: 'a-me'
      })
    ).toBe('a-me')
  })

  it('ignores an account that was deleted or belongs to another provider', () => {
    expect(resolveAccount({ provider: 'claude', accounts, defaults: { claude: 'gone' }, workspace: ws() })).toBe(SYSTEM_ACCOUNT_ID)
    expect(resolveAccount({ provider: 'claude', accounts, defaults: {}, workspace: ws(), explicit: 'c-client' })).toBe(SYSTEM_ACCOUNT_ID)
  })
})

describe('accountEnv', () => {
  it('points Claude Code at the account folder', () => {
    expect(accountEnv(work)).toEqual({ CLAUDE_CONFIG_DIR: 'C:\\data\\accounts\\a-work' })
  })

  it('points Codex at the account folder', () => {
    expect(accountEnv(codexClient)).toEqual({ CODEX_HOME: 'C:\\data\\accounts\\c-client' })
  })

  it('adds nothing for the System login', () => {
    expect(accountEnv(undefined)).toEqual({})
  })
})
