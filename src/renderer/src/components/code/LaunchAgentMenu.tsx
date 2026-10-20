import * as RMenu from '@radix-ui/react-dropdown-menu'
import { ChevronDown, ChevronRight, RefreshCw, Sparkles } from 'lucide-react'
import { SYSTEM_ACCOUNT_ID, type DetectedAgent } from '@shared/types'
import { resolveAccountName } from '../../lib/accounts'
import { openTerminal } from '../../lib/canvas'
import { refreshAgents, toast, useApp } from '../../lib/store'
import { Button, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '../ui'

function AgentItem({ agent, workspaceId }: { agent: DetectedAgent; workspaceId: string }) {
  const allAccounts = useApp((s) => s.snapshot!.accounts)
  const accounts = allAccounts.filter((a) => a.provider === agent.provider)
  const launch = (accountId?: string): void => void openTerminal({ workspaceId, agentId: agent.id, accountId })
  const defaultName = useApp((s) => (agent.provider ? resolveAccountName(s.snapshot!, agent.provider, workspaceId) : ''))

  if (!agent.installed) {
    return (
      <MenuItem disabled hint="Not installed">
        {agent.label}
      </MenuItem>
    )
  }
  if (!agent.provider || accounts.length === 0) {
    return (
      <MenuItem onSelect={() => launch()} hint={agent.provider ? defaultName : undefined}>
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        {agent.label}
      </MenuItem>
    )
  }
  return (
    <RMenu.Sub>
      <RMenu.SubTrigger className="flex h-8 cursor-default select-none items-center gap-2 rounded-md px-2 text-fg outline-none data-[highlighted]:bg-hover data-[state=open]:bg-hover">
        <span className="h-1.5 w-1.5 rounded-full bg-ok" />
        <span className="flex-1">{agent.label}</span>
        <span className="text-xs text-fg-faint">{defaultName}</span>
        <ChevronRight size={13} className="text-fg-faint" />
      </RMenu.SubTrigger>
      <RMenu.Portal>
        <RMenu.SubContent sideOffset={6} className="z-50 min-w-[200px] rounded-lg border border-line-strong bg-raised p-1 text-sm shadow-[0_12px_32px_rgba(0,0,0,0.55)]">
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
        </RMenu.SubContent>
      </RMenu.Portal>
    </RMenu.Sub>
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
