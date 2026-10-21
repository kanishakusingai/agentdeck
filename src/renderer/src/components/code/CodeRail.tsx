import { ChevronDown, FolderOpen, Globe, MessagesSquare, MoreHorizontal, Pencil, Plus, Settings2, Trash2, UserRound, Zap } from 'lucide-react'
import { useState } from 'react'
import type { Workspace } from '@shared/types'
import { tracker, useActivityClock } from '../../lib/activity'
import { focusPanel } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { errorText, setActiveWorkspace, toast, useApp } from '../../lib/store'
import { ActivityDot, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SectionLabel } from '../ui'
import { WorkspaceDialog } from './WorkspaceDialog'

export async function addWorkspace(): Promise<void> {
  try {
    const id = await window.api.workspaces.add()
    if (id) setActiveWorkspace(id)
  } catch (err) {
    toast(errorText(err), 'error')
  }
}

/** Skip choosing a folder: work in AgentDeck's own scratch folder. */
export async function continueWithoutFolder(): Promise<void> {
  try {
    setActiveWorkspace(await window.api.workspaces.addScratch())
  } catch (err) {
    toast(errorText(err), 'error')
  }
}

const NO_PANELS: never[] = []

function PaneRows({ workspaceId, now }: { workspaceId: string; now: number }) {
  const panels = useApp((s) => s.panels[workspaceId] ?? NO_PANELS)
  const ptys = useApp((s) => s.ptys)
  const active = useApp((s) => s.activePanel)
  if (panels.length === 0) return <div className="py-1 pl-7 text-xs text-fg-faint">No panes yet</div>
  return (
    <ul className="flex flex-col gap-px py-0.5">
      {panels.map((p) => {
        const info = p.ptyId ? ptys[p.ptyId] : undefined
        const Icon = p.kind === 'browser' ? Globe : MessagesSquare
        const isActive = active?.workspaceId === workspaceId && active.panelId === p.id
        return (
          <li key={p.id}>
            <button
              onClick={() => focusPanel(workspaceId, p.id)}
              className={cn(
                'flex h-7 w-full items-center gap-2.5 rounded-md pl-7 pr-2 text-left text-xs transition-colors',
                isActive ? 'bg-hover font-medium text-fg' : 'text-fg-muted hover:bg-hover/60 hover:text-fg'
              )}
            >
              {info ? <ActivityDot activity={tracker.activity(info, now)} /> : p.kind === 'terminal' ? <span className="h-1.5 w-1.5 rounded-full bg-fg-faint" /> : <Icon size={12} className="shrink-0 text-fg-faint" />}
              <span className="truncate">{p.title}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function WorkspaceRow({ ws, active, now, onEdit }: { ws: Workspace; active: boolean; now: number; onEdit: (mode: 'rename' | 'accounts') => void }) {
  const [open, setOpen] = useState(true)
  const panes = useApp((s) => s.panels[ws.id]?.length ?? 0)
  return (
    <li>
      <div className={cn('group flex h-8 items-center rounded-lg pl-2.5 pr-1 transition-colors', active ? 'bg-raised' : 'hover:bg-hover/60')}>
        <button onClick={() => setActiveWorkspace(ws.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={ws.path} data-testid="workspace-row">
          {(ws.name === 'Home' || ws.name === 'Scratchpad') && <Zap size={12} className="shrink-0 text-warn" />}
          <span className={cn('truncate text-[13px]', active ? 'font-semibold text-fg' : 'text-fg-muted')}>{ws.name}</span>
        </button>
        <Menu>
          <MenuTrigger asChild>
            <button aria-label={`${ws.name} options`} className="rounded p-1 text-fg-faint opacity-0 hover:bg-hover hover:text-fg focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100">
              <MoreHorizontal size={14} />
            </button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => onEdit('rename')}>
              <Pencil size={13} className="text-fg-muted" /> Rename
            </MenuItem>
            <MenuItem onSelect={() => onEdit('accounts')}>
              <UserRound size={13} className="text-fg-muted" /> Accounts for this workspace
            </MenuItem>
            <MenuItem onSelect={() => void window.api.workspaces.reveal(ws.id)}>
              <FolderOpen size={13} className="text-fg-muted" /> Open folder
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              danger
              onSelect={() => {
                if (confirm(`Remove "${ws.name}" from AgentDeck?\n\nIts panes will close. Your files stay where they are.`)) {
                  void window.api.workspaces.remove(ws.id)
                }
              }}
            >
              <Trash2 size={13} /> Remove from AgentDeck
            </MenuItem>
          </MenuContent>
        </Menu>
        <button aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)} className="flex h-7 w-6 items-center justify-center text-fg-faint hover:text-fg">
          <ChevronDown size={13} className={cn('transition-transform', !open && '-rotate-90')} />
        </button>
        {panes > 0 && <span className="tabular min-w-[20px] rounded-md bg-hover px-1.5 text-center text-2xs font-medium leading-5 text-fg-muted">{panes}</span>}
      </div>
      {open && <PaneRows workspaceId={ws.id} now={now} />}
    </li>
  )
}

function RailFooter() {
  const ptys = useApp((s) => s.ptys)
  const agents = Object.values(ptys).filter((p) => p.agentId && p.status !== 'exited').length
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-t border-line px-3 py-2.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-linear-to-br from-accent-strong to-accent-solid text-white">
        <UserRound size={13} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="text-xs font-medium text-fg">Personal</div>
        <div className="tabular text-2xs text-fg-faint">
          {agents} agent{agents === 1 ? '' : 's'} running
        </div>
      </div>
      <IconButton label="Settings · Ctrl+," onClick={() => useApp.setState({ settingsOpen: 'agents' })} className="h-6 w-6" tipSide="top">
        <Settings2 size={14} />
      </IconButton>
    </div>
  )
}

export function CodeRail() {
  const workspaces = useApp((s) => s.snapshot!.workspaces)
  const activeId = useApp((s) => s.snapshot!.ui.activeWorkspaceId)
  const [editing, setEditing] = useState<{ id: string; mode: 'rename' | 'accounts' } | null>(null)
  const now = useActivityClock()
  return (
    <nav aria-label="Workspaces" className="flex h-full flex-col">
      <SectionLabel
        action={
          <Menu>
            <MenuTrigger asChild>
              <button aria-label="Add a workspace" data-testid="add-workspace" className="flex h-6 w-6 items-center justify-center rounded-md text-fg-faint hover:bg-hover hover:text-fg">
                <Plus size={14} />
              </button>
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem onSelect={() => void addWorkspace()} hint="Ctrl+O">
                <FolderOpen size={13} className="text-fg-muted" /> Open a folder…
              </MenuItem>
              <MenuItem onSelect={() => void continueWithoutFolder()}>
                <Zap size={13} className="text-warn" /> Continue without a folder
              </MenuItem>
            </MenuContent>
          </Menu>
        }
      >
        Workspaces
      </SectionLabel>
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
        {workspaces.map((ws) => (
          <WorkspaceRow key={ws.id} ws={ws} active={ws.id === activeId} now={now} onEdit={(mode) => setEditing({ id: ws.id, mode })} />
        ))}
      </ul>
      <RailFooter />
      {editing && <WorkspaceDialog workspaceId={editing.id} mode={editing.mode} onClose={() => setEditing(null)} />}
    </nav>
  )
}
