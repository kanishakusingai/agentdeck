import { ChevronDown, LayoutGrid, RefreshCw, Sparkles, SquareTerminal } from 'lucide-react'
import { launchMenuAgents } from '@shared/agents'
import { SYSTEM_ACCOUNT_ID, type DetectedAgent } from '@shared/types'
import { resolveAccountName } from '../../lib/accounts'
import { openTerminal } from '../../lib/canvas'
import { refreshAgents, toast, useApp } from '../../lib/store'
import { openAgentsDirectory } from './AgentsDirectory'
import { AgentIcon, Button, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger, MenuTrigger } from '../ui'

/** One agent in a menu: starts it in a new pane (a side menu picks the account when there are several). */
export function AgentItem({ agent, workspaceId, sessionId }: { agent: DetectedAgent; workspaceId: string; sessionId?: string }) {
  const allAccounts = useApp((s) => s.snapshot!.accounts)
  const accounts = allAccounts.filter((a) => a.provider === agent.provider)
  const launch = (accountId?: string): void => void openTerminal({ workspaceId, sessionId, agentId: agent.id, accountId })
  const defaultName = useApp((s) => (agent.provider ? resolveAccountName(s.snapshot!, agent.provider, workspaceId) : ''))

  if (!agent.installed) {
    // Not on this PC yet: open the agents page, which shows how to install it.
    return (
      <MenuItem onSelect={() => openAgentsDirectory({ workspaceId, sessionId })} hint="Get it">
        <AgentIcon agentId={agent.id} size={13} className="opacity-50" />
        <span className="text-fg-muted">{agent.label}</span>
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

/** The one "Launch" button: a plain terminal at the top, then the 10 agents that matter most here, then "All agents…". */
export function LaunchMenu({ workspaceId, sessionId, compact }: { workspaceId: string; sessionId?: string; compact?: boolean }) {
  const agents = useApp((s) => s.agents)
  const short = launchMenuAgents(agents)
  const installed = short.filter((a) => a.installed)
  const missing = short.filter((a) => !a.installed)
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button size="sm" variant={compact ? 'secondary' : 'primary'} data-testid="launch">
          <Sparkles size={13} />
          Launch
          <ChevronDown size={12} className="opacity-70" />
        </Button>
      </MenuTrigger>
      <MenuContent className="min-w-[240px]">
        <MenuItem onSelect={() => void openTerminal({ workspaceId, sessionId })} hint="Ctrl+Shift+T" data-testid="new-terminal">
          <SquareTerminal size={13} className="text-fg-muted" /> Terminal
        </MenuItem>
        <MenuSeparator />
        <MenuLabel>Agents on this PC</MenuLabel>
        {installed.length === 0 && <div className="px-2 py-1.5 text-xs text-fg-muted">No agents found on PATH yet.</div>}
        {installed.map((a) => (
          <AgentItem key={a.id} agent={a} workspaceId={workspaceId} sessionId={sessionId} />
        ))}
        {missing.length > 0 && (
          <>
            <MenuSeparator />
            <MenuLabel>Popular — not installed</MenuLabel>
            {missing.map((a) => (
              <AgentItem key={a.id} agent={a} workspaceId={workspaceId} sessionId={sessionId} />
            ))}
          </>
        )}
        <MenuSeparator />
        <MenuItem onSelect={() => openAgentsDirectory({ workspaceId, sessionId })} hint={``} data-testid="all-agents">
          <LayoutGrid size={13} className="text-fg-muted" /> All agents…
        </MenuItem>
        <MenuItem onSelect={() => void refreshAgents().then(() => toast('Checked again for installed agents.'))}>
          <RefreshCw size={13} className="text-fg-muted" /> Scan again
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
