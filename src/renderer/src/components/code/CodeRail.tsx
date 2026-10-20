import { ChevronRight, Folder, FolderOpen, FolderPlus, Globe, MessagesSquare, MoreHorizontal, Pencil, SquareTerminal, Trash2, UserRound } from 'lucide-react'
import { useState } from 'react'
import type { Workspace } from '@shared/types'
import { focusPanel } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { errorText, setActiveWorkspace, toast, useApp } from '../../lib/store'
import { IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SectionLabel, StatusDot } from '../ui'
import { WorkspaceDialog } from './WorkspaceDialog'

export async function addWorkspace(): Promise<void> {
  try {
    const id = await window.api.workspaces.add()
    if (id) setActiveWorkspace(id)
  } catch (err) {
    toast(errorText(err), 'error')
  }
}

const NO_PANELS: never[] = []

function PaneRows({ workspaceId }: { workspaceId: string }) {
  const panels = useApp((s) => s.panels[workspaceId] ?? NO_PANELS)
  const ptys = useApp((s) => s.ptys)
  const active = useApp((s) => s.activePanel)
  if (panels.length === 0) return <div className="py-1 pl-9 text-xs text-fg-faint">No panes</div>
  return (
    <ul className="flex flex-col py-0.5">
      {panels.map((p) => {
        const info = p.ptyId ? ptys[p.ptyId] : undefined
        const Icon = p.kind === 'browser' ? Globe : p.kind === 'thread' ? MessagesSquare : SquareTerminal
        const isActive = active?.workspaceId === workspaceId && active.panelId === p.id
        return (
          <li key={p.id}>
            <button
              onClick={() => focusPanel(workspaceId, p.id)}
              className={cn(
                'flex h-7 w-full items-center gap-2 rounded-md pl-8 pr-2 text-left text-xs transition-colors',
                isActive ? 'bg-hover text-fg' : 'text-fg-muted hover:bg-hover/60 hover:text-fg'
              )}
            >
              {info ? <StatusDot status={info.status} /> : <Icon size={12} className="shrink-0 text-fg-faint" />}
              <span className="truncate">{p.title}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function WorkspaceRow({ ws, active, onEdit }: { ws: Workspace; active: boolean; onEdit: (mode: 'rename' | 'accounts') => void }) {
  const [open, setOpen] = useState(true)
  const running = useApp((s) => Object.values(s.ptys).filter((p) => p.workspaceId === ws.id && p.status !== 'exited').length)
  return (
    <li>
      <div className={cn('group flex h-8 items-center rounded-md pr-1 transition-colors', active ? 'bg-raised' : 'hover:bg-hover/60')}>
        <button aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)} className="flex h-8 w-6 items-center justify-center text-fg-faint hover:text-fg">
          <ChevronRight size={13} className={cn('transition-transform', open && 'rotate-90')} />
        </button>
        <button onClick={() => setActiveWorkspace(ws.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={ws.path} data-testid="workspace-row">
          {active ? <FolderOpen size={14} className="shrink-0 text-accent" /> : <Folder size={14} className="shrink-0 text-fg-muted" />}
          <span className={cn('truncate text-sm', active ? 'font-medium text-fg' : 'text-fg-muted')}>{ws.name}</span>
          {running > 0 && <span className="tabular ml-auto rounded bg-ok/12 px-1.5 text-2xs font-medium text-ok">{running}</span>}
        </button>
        <Menu>
          <MenuTrigger asChild>
            <button aria-label={`${ws.name} options`} className="ml-1 rounded p-1 text-fg-faint opacity-0 hover:bg-hover hover:text-fg focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100">
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
      </div>
      {open && <PaneRows workspaceId={ws.id} />}
    </li>
  )
}

export function CodeRail() {
  const workspaces = useApp((s) => s.snapshot!.workspaces)
  const activeId = useApp((s) => s.snapshot!.ui.activeWorkspaceId)
  const [editing, setEditing] = useState<{ id: string; mode: 'rename' | 'accounts' } | null>(null)
  return (
    <nav aria-label="Workspaces" className="flex h-full flex-col">
      <SectionLabel
        action={
          <IconButton label="Add a workspace folder" onClick={() => void addWorkspace()} className="h-6 w-6" data-testid="add-workspace">
            <FolderPlus size={14} />
          </IconButton>
        }
      >
        Workspaces
      </SectionLabel>
      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-1.5 pb-3">
        {workspaces.map((ws) => (
          <WorkspaceRow key={ws.id} ws={ws} active={ws.id === activeId} onEdit={(mode) => setEditing({ id: ws.id, mode })} />
        ))}
        {workspaces.length === 0 && (
          <li className="px-2 py-3 text-xs leading-relaxed text-fg-faint">Add a folder to start. Agents will work on the files inside it.</li>
        )}
      </ul>
      {editing && <WorkspaceDialog workspaceId={editing.id} mode={editing.mode} onClose={() => setEditing(null)} />}
    </nav>
  )
}
