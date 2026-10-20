import { PROVIDERS } from '@shared/agents'
import type { Account } from '@shared/types'

export { resolveAccount } from '@shared/accounts'

/**
 * Environment variables that point the agent CLI at an account's own folder.
 * AgentDeck never reads what the CLI stores there.
 */
export function accountEnv(account: Account | undefined): Record<string, string> {
  if (!account) return {}
  return { [PROVIDERS[account.provider].homeEnv]: account.configDir }
}
