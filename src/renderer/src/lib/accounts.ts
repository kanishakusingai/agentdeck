import type { AppSnapshot } from '@shared/api'
import { accountLabel, resolveAccount } from '@shared/accounts'
import type { Provider } from '@shared/types'

/** Display name of the account a new agent in this workspace would use. */
export function resolveAccountName(snap: AppSnapshot, provider: Provider, workspaceId?: string): string {
  const workspace = snap.workspaces.find((w) => w.id === workspaceId)
  return accountName(snap, resolveAccount({ provider, accounts: snap.accounts, defaults: snap.defaults, workspace }))
}

export function accountName(snap: AppSnapshot, id: string | undefined): string {
  return accountLabel(snap.accounts, id)
}
