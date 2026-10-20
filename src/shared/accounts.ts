import { SYSTEM_ACCOUNT_ID, type Account, type Provider, type Workspace } from './types'

export const SYSTEM_ACCOUNT_LABEL = 'System login'
export const MISSING_ACCOUNT_LABEL = 'Removed account'

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

export function accountLabel(accounts: Account[], id: string | undefined): string {
  if (!id || id === SYSTEM_ACCOUNT_ID) return SYSTEM_ACCOUNT_LABEL
  return accounts.find((a) => a.id === id)?.name ?? MISSING_ACCOUNT_LABEL
}
