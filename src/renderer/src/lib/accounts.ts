import type { AppSnapshot } from '@shared/api'
import { SYSTEM_ACCOUNT_ID, type Provider } from '@shared/types'

/** Display name of the account a new agent in this workspace would use. */
export function resolveAccountName(snap: AppSnapshot, provider: Provider, workspaceId?: string): string {
  const ws = snap.workspaces.find((w) => w.id === workspaceId)
  const valid = (id?: string): boolean => !!id && (id === SYSTEM_ACCOUNT_ID || snap.accounts.some((a) => a.id === id && a.provider === provider))
  const id = [ws?.accountOverrides[provider], snap.defaults[provider]].find(valid) ?? SYSTEM_ACCOUNT_ID
  return accountName(snap, id)
}

export function accountName(snap: AppSnapshot, id: string | undefined): string {
  if (!id || id === SYSTEM_ACCOUNT_ID) return 'System login'
  return snap.accounts.find((a) => a.id === id)?.name ?? 'Removed account'
}
