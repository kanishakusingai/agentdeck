import { SYSTEM_ACCOUNT_ID, type Account, type Provider, type Workspace } from '@shared/types'

interface ResolveInput {
  provider: Provider
  accounts: Account[]
  defaults: Partial<Record<Provider, string>>
  workspace?: Workspace
  explicit?: string
}

/**
 * Which account an agent should run on.
 * Order: pane choice → workspace override → provider default → System login.
 */
export function resolveAccount({ provider, accounts, defaults, workspace, explicit }: ResolveInput): string {
  const valid = (id: string | undefined): id is string =>
    id === SYSTEM_ACCOUNT_ID || accounts.some((a) => a.id === id && a.provider === provider)
  for (const candidate of [explicit, workspace?.accountOverrides?.[provider], defaults[provider]]) {
    if (candidate && valid(candidate)) return candidate
  }
  return SYSTEM_ACCOUNT_ID
}

/**
 * Environment variables that point the agent CLI at an account's own folder.
 * AgentDeck never reads what the CLI stores there.
 */
export function accountEnv(account: Account | undefined): Record<string, string> {
  if (!account) return {}
  return account.provider === 'claude'
    ? { CLAUDE_CONFIG_DIR: account.configDir }
    : { CODEX_HOME: account.configDir }
}
