import { ChevronDown, EyeOff, FolderOpen, Globe, Layers, MoreHorizontal, Pencil, Plus, Settings, SquareTerminal, Trash2, UserRound } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { sessionsOf, type Session, type Workspace } from '@shared/types'
import { activeSessionId, moveToSession, openTerminal, showHiddenPane, showSession } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { deleteSession, newSession, removeProject, renameProject, renameSession } from '../../lib/sessions'
import { errorText, setActiveWorkspace, toast, toggleProjectCollapsed, useApp, type HiddenPane, type PanelSummary } from '../../lib/store'
import { AgentIcon, ContextMenu, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SectionLabel, Tip } from '../ui'
import { openNewProject } from './NewProject'
import { PaneMenuItems } from './PaneMenu'
import { WorkspaceDialog } from './WorkspaceDialog'

/** Ctrl+O: pick a folder; it becomes a project named after the folder. */
export async function addWorkspace(): Promise<void> {
  try {
    const id = await window.api.workspaces.add()
    if (id) setActiveWorkspace(id)
  } catch (err) {
    toast(errorText(err), 'error')
  }
}

const NO_PANELS: PanelSummary[] = []
const NO_HIDDEN: HiddenPane[] = []
const DRAG_TYPE = 'application/x-agentdeck-pane'

/** A pane taken off the screen (still running): click to put it back, drag it onto another session. */
function OffScreenRow({ sessionId, pane }: { sessionId: string; pane: HiddenPane }) {
  const info = useApp((s) => (pane.params.ptyId ? s.ptys[pane.params.ptyId] : undefined))
  return (
    <li>
      <ContextMenu menu={<PaneMenuItems sessionId={sessionId} paneId={pane.id} title={pane.title} kind={pane.params.kind} offScreen />}>
        <button
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ sessionId, paneId: pane.id }))
            e.dataTransfer.effectAllowed = 'move'
          }}
          onClick={() => void showHiddenPane(sessionId, pane.id)}
          data-testid="pane-row-offscreen"
          title="Off screen — still running. Click to show it again."
          className="flex h-7 w-full cursor-default items-center gap-2 rounded-md pl-10 pr-2 text-left text-xs text-fg-faint transition-colors hover:bg-hover/60 hover:text-fg-muted"
        >
          {pane.params.kind === 'browser' ? <Globe size={12} className="shrink-0" /> : <AgentIcon agentId={info?.agentId ?? pane.params.agentId} size={12} className="opacity-60" />}
          <span className="min-w-0 flex-1 truncate">{pane.title}</span>
          <EyeOff size={11} className="shrink-0" />
        </button>
      </ContextMenu>
    </li>
  )
}

/** A session under its project: a dot (green while something runs in it), its name and how many panes it has. */
function SessionRow({ ws, session }: { ws: Workspace; session: Session }) {
  const panes = useApp((s) => s.panels[session.id] ?? NO_PANELS)
  const hidden = useApp((s) => s.hidden[session.id] ?? NO_HIDDEN)
  const ptys = useApp((s) => s.ptys)
  const active = useApp((s) => {
    void s.snapshot!.ui.activeSessions
    return s.snapshot!.ui.activeWorkspaceId === ws.id && activeSessionId(ws.id) === session.id
  })
  const [over, setOver] = useState(false)
  const count = panes.length + hidden.length
  const running = [...panes.map((p) => p.ptyId), ...hidden.map((h) => h.params.ptyId)].some((id) => id && ptys[id]?.status === 'running')

  const onDrop = (e: DragEvent): void => {
    setOver(false)
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw) return
    e.preventDefault()
    const { sessionId, paneId } = JSON.parse(raw) as { sessionId: string; paneId: string }
    void moveToSession(sessionId, paneId, session.id)
  }

  return (
    <li
      data-testid="session-row"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setOver(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false)
      }}
      onDrop={onDrop}
      className={cn('rounded-lg transition-[background-color,box-shadow]', over && 'bg-accent/10 shadow-[inset_0_0_0_1px_rgba(59,130,246,0.55)]')}
    >
      <ContextMenu
        menu={
          <>
            <MenuItem onSelect={() => void openTerminal({ workspaceId: ws.id, sessionId: session.id })}>
              <SquareTerminal size={13} className="text-fg-muted" /> New terminal here
            </MenuItem>
            <MenuItem onSelect={() => void renameSession(ws.id, session.id)}>
              <Pencil size={13} className="text-fg-muted" /> Rename session
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => void deleteSession(ws.id, session.id)}>
              <Trash2 size={13} /> Delete session
            </MenuItem>
          </>
        }
      >
        <button
          onClick={() => showSession(session.id)}
          data-testid="session-name"
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex h-9 w-full cursor-default items-center gap-3 rounded-lg pl-6 pr-3 text-left text-[14px] transition-colors',
            active ? 'bg-raised font-semibold text-fg' : 'text-fg-muted hover:bg-hover/60 hover:text-fg'
          )}
        >
          <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', running ? 'bg-ok' : 'bg-fg-faint/60')} aria-hidden />
          <span className="min-w-0 flex-1 truncate" data-testid="session-current-name">
            {session.name}
          </span>
          {count > 0 && <span className="tabular text-2xs font-medium text-fg-faint">{count}</span>}
        </button>
      </ContextMenu>
      {over && <div className="py-1 pl-10 text-2xs text-accent">Drop to move here</div>}
      {hidden.length > 0 && (
        <ul className="flex flex-col gap-px pb-0.5">
          {hidden.map((h) => (
            <OffScreenRow key={h.id} sessionId={session.id} pane={h} />
          ))}
        </ul>
      )}
    </li>
  )
}

/** A project in the side panel: its name, and when open, its sessions. */
function WorkspaceRow({ ws, active, onEdit }: { ws: Workspace; active: boolean; onEdit: () => void }) {
  // Open unless folded shut (the fold is remembered per project).
  const open = useApp((s) => !s.snapshot!.ui.collapsedSessions?.includes(ws.id))
  const sessions = sessionsOf(ws)
  const menu = (
    <>
      <MenuItem onSelect={() => void newSession(ws.id)}>
        <Layers size={13} className="text-fg-muted" /> New session
      </MenuItem>
      <MenuItem onSelect={() => void renameProject(ws.id)}>
        <Pencil size={13} className="text-fg-muted" /> Rename project
      </MenuItem>
      <MenuItem onSelect={onEdit}>
        <UserRound size={13} className="text-fg-muted" /> Accounts for this project
      </MenuItem>
      <MenuItem onSelect={() => void window.api.workspaces.reveal(ws.id)}>
        <FolderOpen size={13} className="text-fg-muted" /> Open folder
      </MenuItem>
      <MenuSeparator />
      <MenuItem danger onSelect={() => void removeProject(ws.id)}>
        <Trash2 size={13} /> Remove project
      </MenuItem>
    </>
  )
  return (
    <li className="pb-0.5">
      <ContextMenu menu={menu}>
        <div className="group flex h-9 items-center rounded-lg pr-1 transition-colors hover:bg-hover/50">
          <button
            aria-label={open ? `Collapse ${ws.name}` : `Expand ${ws.name}`}
            aria-expanded={open}
            onClick={() => toggleProjectCollapsed(ws.id)}
            className="flex h-7 w-6 shrink-0 items-center justify-center text-fg-faint hover:text-fg"
            data-testid="workspace-toggle"
          >
            <ChevronDown size={14} className={cn('transition-[transform,opacity]', !open && '-rotate-90 opacity-0 group-hover:opacity-100')} />
          </button>
          <button onClick={() => showSession(activeSessionId(ws.id))} className="min-w-0 flex-1 truncate text-left" title={ws.path} data-testid="workspace-row">
            <span className={cn('text-[14px] tracking-[-0.01em]', active ? 'font-semibold text-fg' : 'font-medium text-fg-muted group-hover:text-fg')}>{ws.name}</span>
          </button>
          {open && <span className="tabular px-1.5 text-2xs font-medium text-fg-faint group-hover:hidden">{sessions.length}</span>}
          <span className="hidden items-center group-hover:flex group-focus-within:flex">
            <Tip label="New session">
              <button aria-label={`New session in ${ws.name}`} onClick={() => void newSession(ws.id)} className="rounded p-1 text-fg-faint hover:bg-hover hover:text-fg">
                <Plus size={13} />
              </button>
            </Tip>
            <Menu>
              <MenuTrigger asChild>
                <button aria-label={`${ws.name} options`} className="rounded p-1 text-fg-faint hover:bg-hover hover:text-fg">
                  <MoreHorizontal size={14} />
                </button>
              </MenuTrigger>
              <MenuContent>{menu}</MenuContent>
            </Menu>
          </span>
        </div>
      </ContextMenu>
      {open && (
        <ul className="mt-0.5 flex flex-col gap-0.5 pb-1">
          {sessions.map((s) => (
            <SessionRow key={s.id} ws={ws} session={s} />
          ))}
        </ul>
      )}
    </li>
  )
}

function RailFooter() {
  const ptys = useApp((s) => s.ptys)
  const agents = Object.values(ptys).filter((p) => p.agentId && p.status !== 'exited').length
  return (
    <div className="mx-3 flex shrink-0 items-center gap-2.5 border-t border-line py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-solid text-[12px] font-semibold text-white">
        <UserRound size={14} />
      </span>
      <div className="min-w-0 flex-1 truncate text-xs">
        <span className="font-semibold uppercase tracking-[0.08em] text-accent-strong">Personal</span>
        <span className="tabular text-fg-muted">
          {' '}
          · {agents} agent{agents === 1 ? '' : 's'} running
        </span>
      </div>
      <IconButton label="Settings · Ctrl+," onClick={() => useApp.setState({ settingsOpen: 'agents' })} className="h-7 w-7" tipSide="top">
        <Settings size={15} />
      </IconButton>
    </div>
  )
}

export function CodeRail() {
  const workspaces = useApp((s) => s.snapshot!.workspaces)
  const activeId = useApp((s) => s.snapshot!.ui.activeWorkspaceId)
  const [editing, setEditing] = useState<string | null>(null)
  return (
    <nav aria-label="Workspaces" className="flex h-full flex-col">
      <SectionLabel
        action={
          <Tip label="New project">
            <button aria-label="New project" data-testid="add-workspace" onClick={openNewProject} className="flex h-6 w-6 items-center justify-center rounded-md text-fg-muted hover:bg-hover hover:text-fg">
              <Plus size={16} />
            </button>
          </Tip>
        }
      >
        Workspaces
      </SectionLabel>
      <ul className="flex flex-1 flex-col overflow-y-auto px-2 pb-3">
        {workspaces.map((ws) => (
          <WorkspaceRow key={ws.id} ws={ws} active={ws.id === activeId} onEdit={() => setEditing(ws.id)} />
        ))}
      </ul>
      <RailFooter />
      {editing && <WorkspaceDialog workspaceId={editing} mode="accounts" onClose={() => setEditing(null)} />}
    </nav>
  )
}
