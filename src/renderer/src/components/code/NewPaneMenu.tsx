import { LayoutGrid, Layers, PanelBottom, Plus, SquareTerminal, SquareStack } from 'lucide-react'
import { launchMenuAgents } from '@shared/agents'
import { openTerminal } from '../../lib/canvas'
import { newSession } from '../../lib/sessions'
import { useApp } from '../../lib/store'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, Tip } from '../ui'
import { openAgentsDirectory } from './AgentsDirectory'
import { AgentItem } from './LaunchMenu'

/**
 * The + in a pane's header: a new terminal or agent next to the others, this pane split
 * down, a tab behind this pane, or a new session.
 */
export function NewPaneMenu({ workspaceId, sessionId, paneId }: { workspaceId: string; sessionId: string; paneId: string }) {
  const agents = useApp((s) => s.agents)
  const ws = useApp((s) => s.snapshot!.workspaces.find((w) => w.id === workspaceId))
  const installed = launchMenuAgents(agents).filter((a) => a.installed)
  return (
    <Menu>
      <Tip label="New pane">
        <MenuTrigger asChild>
          <button aria-label="New pane" className="flex h-6 w-6 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg" data-testid="new-pane">
            <Plus size={14} />
          </button>
        </MenuTrigger>
      </Tip>
      <MenuContent align="end" className="min-w-[300px]">
        <div className="px-2.5 pb-2 pt-1.5">
          <div className="text-[13px] font-semibold text-fg">New pane</div>
          <div className="truncate text-2xs text-fg-faint">{ws?.name}</div>
        </div>
        <MenuSeparator />
        <MenuItem onSelect={() => void openTerminal({ workspaceId, sessionId })} hint="Ctrl+Shift+T" data-testid="new-pane-terminal">
          <SquareTerminal size={14} className="text-fg-muted" /> Terminal
        </MenuItem>
        <MenuSeparator />
        {installed.length === 0 && <div className="px-2.5 py-1.5 text-xs text-fg-muted">No agents found on this PC yet.</div>}
        {installed.map((a) => (
          <AgentItem key={a.id} agent={a} workspaceId={workspaceId} sessionId={sessionId} />
        ))}
        <MenuItem onSelect={() => openAgentsDirectory({ workspaceId, sessionId })} data-testid="new-pane-more-agents">
          <LayoutGrid size={14} className="text-fg-muted" /> More agents…
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => void openTerminal({ workspaceId, sessionId, referencePanel: paneId, direction: 'below' })} hint="Ctrl+Shift+D" data-testid="new-pane-split-down">
          <PanelBottom size={14} className="text-fg-muted" /> Split Down
        </MenuItem>
        <MenuItem onSelect={() => void openTerminal({ workspaceId, sessionId, referencePanel: paneId, direction: 'within' })} data-testid="new-pane-tab">
          <SquareStack size={14} className="text-fg-muted" /> New Tab
        </MenuItem>
        <MenuItem onSelect={() => void newSession(workspaceId)} data-testid="new-pane-session">
          <Layers size={14} className="text-fg-muted" /> New Session…
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}
