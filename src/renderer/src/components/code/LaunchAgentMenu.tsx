import { ChevronDown, RefreshCw, Sparkles } from 'lucide-react'
import { SYSTEM_ACCOUNT_ID, type DetectedAgent } from '@shared/types'
import { resolveAccountName } from '../../lib/accounts'
import { openTerminal } from '../../lib/canvas'
import { refreshAgents, toast, useApp } from '../../lib/store'
import { AgentIcon, Button, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '../ui'

function AgentItem({ agent, workspaceId }: { agent: DetectedAgent; workspaceId: string }) {
  const allAccounts = useApp((s) => s.snapshot!.accounts)
  const accounts = allAccounts.filter((a) => a.provider === agent.provider)
  const launch = (accountId?: string): void => void openTerminal({ workspaceId, agentId: agent.id, accountId })
  const defaultName = useApp((s) => (agent.provider ? resolveAccountName(s.snapshot!, agent.provider, workspaceId) : ''))

  if (!agent.installed) {
    return (
      <MenuItem disabled hint="Not installed">
        <AgentIcon agentId={agent.id} size={13} />
        {agent.label}
      </MenuItem>
    )
  }
  if (!agent.provider || accounts.length === 0) {
    return (
      <MenuItem onSelect={() => launch()} hint={agent.provider ? defaultName : undefined}>
        <AgentIcon agentId={agent.id} size={13} />
        {agent.label}
      </MenuItem>
    )
  }
  return (
    <MenuSub>
      <MenuSubTrigger hint={defaultName}>
        <AgentIcon agentId={agent.id} size={13} />
        {agent.label}
      </MenuSubTrigger>
      <MenuSubContent>
        <MenuLabel>Run on account</MenuLabel>
        <MenuItem onSelect={() => launch()} hint="default">
          {defaultName}
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => launch(SYSTEM_ACCOUNT_ID)}>System login</MenuItem>
        {accounts.map((a) => (
          <MenuItem key={a.id} onSelect={() => launch(a.id)}>
            {a.name}
          </MenuItem>
        ))}
      </MenuSubContent>
    </MenuSub>
  )
}

export function LaunchAgentMenu({ workspaceId, compact }: { workspaceId: string; compact?: boolean }) {
  const agents = useApp((s) => s.agents)
  const installed = agents.filter((a) => a.installed)
  const missing = agents.filter((a) => !a.installed)
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" variant={compact ? 'secondary' : 'primary'} data-testid="launch-agent">
          <Sparkles size={13} />
          Launch agent
          <ChevronDown size={12} className="opacity-70" />
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>Installed on this PC</MenuLabel>
        {installed.length === 0 && <div className="px-2 py-1.5 text-xs text-fg-muted">No agents found on PATH yet.</div>}
        {installed.map((a) => (
          <AgentItem key={a.id} agent={a} workspaceId={workspaceId} />
        ))}
        {missing.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>Not installed</MenuLabel>
            {missing.map((a) => (
              <AgentItem key={a.id} agent={a} workspaceId={workspaceId} />
            ))}
          </>
        )}
        <MenuSeparator />
        <MenuItem
          onSelect={() =>
            void refreshAgents().then(() => toast('Checked again for installed agents.'))
          }
        >
          <RefreshCw size={13} className="text-fg-muted" /> Scan again
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
