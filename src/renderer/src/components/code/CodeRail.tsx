import { ChevronDown, EyeOff, FolderOpen, FolderPlus, Globe, Layers, MessagesSquare, MoreHorizontal, Pencil, Plus, Settings2, SquareTerminal, Trash2, UserRound } from 'lucide-react'
import { useState, type DragEvent } from 'react'
import { sessionsOf, type Session, type Workspace } from '@shared/types'
import { tracker, useActivityClock } from '../../lib/activity'
import { activeSessionId, focusPanel, moveToSession, openTerminal, showHiddenPane, showSession } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { deleteSession, newSession, removeProject, renameProject, renameSession } from '../../lib/sessions'
import { errorText, setActiveWorkspace, toast, toggleSessionCollapsed, useApp, type HiddenPane, type PanelSummary } from '../../lib/store'
import { ActivityDot, AgentIcon, ContextMenu, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SectionLabel, Tip } from '../ui'
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

/** Start in the user's own folder without naming anything (Agent mode's quick start). */
export async function continueWithoutFolder(): Promise<void> {
  try {
    setActiveWorkspace(await window.api.workspaces.addScratch())
  } catch (err) {
    toast(errorText(err), 'error')
  }
}

const NO_PANELS: PanelSummary[] = []
const NO_HIDDEN: HiddenPane[] = []
const DRAG_TYPE = 'application/x-agentdeck-pane'

function startDrag(e: DragEvent, sessionId: string, paneId: string): void {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ sessionId, paneId }))
  e.dataTransfer.effectAllowed = 'move'
}

function PaneRow({ sessionId, pane, now, offScreen }: { sessionId: string; pane: { id: string; title: string; kind: string; ptyId?: string; agentId?: string }; now: number; offScreen: boolean }) {
  const info = useApp((s) => (pane.ptyId ? s.ptys[pane.ptyId] : undefined))
  const isActive = useApp((s) => !offScreen && s.activePanel?.sessionId === sessionId && s.activePanel.panelId === pane.id)
  const Icon = pane.kind === 'browser' ? Globe : pane.kind === 'thread' ? MessagesSquare : null
  return (
    <li>
      <ContextMenu menu={<PaneMenuItems sessionId={sessionId} paneId={pane.id} title={pane.title} kind={pane.kind} offScreen={offScreen} />}>
        <button
          draggable
          onDragStart={(e) => startDrag(e, sessionId, pane.id)}
          onClick={() => (offScreen ? void showHiddenPane(sessionId, pane.id) : focusPanel(sessionId, pane.id))}
          data-testid={offScreen ? 'pane-row-offscreen' : 'pane-row'}
          title={offScreen ? 'Off screen — still running. Click to show it again.' : undefined}
          className={cn(
            'flex h-7 w-full cursor-default items-center gap-2 rounded-md pl-9 pr-2 text-left text-xs transition-colors',
            isActive ? 'bg-hover font-medium text-fg' : offScreen ? 'text-fg-faint hover:bg-hover/60 hover:text-fg-muted' : 'text-fg-muted hover:bg-hover/60 hover:text-fg'
          )}
        >
          {Icon ? <Icon size={12} className="shrink-0 text-fg-faint" /> : <AgentIcon agentId={info?.agentId ?? pane.agentId} size={12} className={offScreen ? 'opacity-50' : undefined} />}
          <span className="min-w-0 flex-1 truncate">{pane.title}</span>
          {offScreen ? <EyeOff size={11} className="shrink-0 text-fg-faint" /> : info && <ActivityDot activity={tracker.activity(info, now)} />}
        </button>
      </ContextMenu>
    </li>
  )
}

function SessionBlock({ ws, session, now, showHeader }: { ws: Workspace; session: Session; now: number; showHeader: boolean }) {
  const panes = useApp((s) => s.panels[session.id] ?? NO_PANELS)
  const hidden = useApp((s) => s.hidden[session.id] ?? NO_HIDDEN)
  const active = useApp((s) => {
    void s.snapshot!.ui.activeSessions
    return s.snapshot!.ui.activeWorkspaceId === ws.id && activeSessionId(ws.id) === session.id
  })
  const [over, setOver] = useState(false)
  const open = useApp((s) => !s.snapshot!.ui.collapsedSessions?.includes(session.id))
  const count = panes.length + hidden.length

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
      className={cn('rounded-lg transition-[background-color,box-shadow]', over && 'bg-accent/10 shadow-[inset_0_0_0_1px_rgba(255,122,61,0.55)]')}
    >
      {showHeader && (
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
          <div className={cn('group flex h-7 items-center rounded-md pl-1.5 pr-1 text-xs', active ? 'text-fg' : 'text-fg-muted hover:bg-hover/60 hover:text-fg')}>
            <button
              aria-label={open ? `Collapse ${session.name}` : `Expand ${session.name}`}
              aria-expanded={open}
              onClick={() => toggleSessionCollapsed(session.id)}
              className="flex h-6 w-5 shrink-0 items-center justify-center rounded text-fg-faint hover:text-fg"
              data-testid="session-toggle"
            >
              <ChevronDown size={12} className={cn('transition-transform', !open && '-rotate-90')} />
            </button>
            <button onClick={() => showSession(session.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left" data-testid="session-name">
              <Layers size={12} className={cn('shrink-0', active ? 'text-accent-strong' : 'text-fg-faint')} />
              <span className={cn('truncate', active && 'font-semibold')}>{session.name}</span>
              <span className="tabular text-2xs text-fg-faint">{count}</span>
            </button>
            <Tip label="New terminal in this session">
              <button
                aria-label={`New terminal in ${session.name}`}
                onClick={() => void openTerminal({ workspaceId: ws.id, sessionId: session.id })}
                className="rounded p-1 text-fg-faint opacity-0 hover:bg-hover hover:text-fg focus:opacity-100 group-hover:opacity-100"
              >
                <Plus size={12} />
              </button>
            </Tip>
          </div>
        </ContextMenu>
      )}
      {showHeader && !open ? (
        over && <div className="py-1 pl-9 text-2xs text-accent">Drop to move here</div>
      ) : count === 0 ? (
        <div className="py-1 pl-9 text-2xs text-fg-faint">{over ? 'Drop to move here' : 'Empty'}</div>
      ) : (
        <ul className="flex flex-col gap-px pb-0.5">
          {panes.map((p) => (
            <PaneRow key={p.id} sessionId={session.id} pane={p} now={now} offScreen={false} />
          ))}
          {hidden.map((h) => (
            <PaneRow key={h.id} sessionId={session.id} pane={{ id: h.id, title: h.title, kind: h.params.kind, ptyId: h.params.ptyId, agentId: h.params.agentId }} now={now} offScreen />
          ))}
        </ul>
      )}
    </li>
  )
}

function ProjectRow({ ws, active, now, onEdit }: { ws: Workspace; active: boolean; now: number; onEdit: () => void }) {
  const [open, setOpen] = useState(true)
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
    <li className="pb-1">
      <ContextMenu menu={menu}>
        <div className={cn('group flex items-center rounded-lg py-1 pl-2 pr-1 transition-colors', active ? 'bg-raised' : 'hover:bg-hover/60')}>
          <button aria-label={open ? 'Collapse' : 'Expand'} onClick={() => setOpen(!open)} className="flex h-6 w-5 shrink-0 items-center justify-center text-fg-faint hover:text-fg">
            <ChevronDown size={13} className={cn('transition-transform', !open && '-rotate-90')} />
          </button>
          <button onClick={() => showSession(activeSessionId(ws.id))} className="min-w-0 flex-1 text-left" title={ws.path} data-testid="workspace-row">
            <div className={cn('truncate text-[13px] leading-tight', active ? 'font-semibold text-fg' : 'font-medium text-fg-muted')}>{ws.name}</div>
            <div className="truncate font-mono text-[10.5px] leading-tight text-fg-faint [direction:rtl]">
              <bdi>{ws.path}</bdi>
            </div>
          </button>
          <Menu>
            <MenuTrigger asChild>
              <button aria-label={`${ws.name} options`} className="rounded p-1 text-fg-faint opacity-0 hover:bg-hover hover:text-fg focus:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100">
                <MoreHorizontal size={14} />
              </button>
            </MenuTrigger>
            <MenuContent>{menu}</MenuContent>
          </Menu>
        </div>
      </ContextMenu>
      {open && (
        <ul className="mt-0.5 flex flex-col gap-0.5">
          {sessions.map((s) => (
            <SessionBlock key={s.id} ws={ws} session={s} now={now} showHeader={sessions.length > 1} />
          ))}
          <li>
            <button onClick={() => void newSession(ws.id)} className="flex h-7 w-full items-center gap-2 rounded-md pl-4 text-xs text-fg-faint transition-colors hover:bg-hover/60 hover:text-fg" data-testid="rail-new-session">
              <Plus size={12} /> New session
            </button>
          </li>
        </ul>
      )}
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
  const [editing, setEditing] = useState<string | null>(null)
  const now = useActivityClock()
  return (
    <nav aria-label="Projects" className="flex h-full flex-col">
      <SectionLabel
        action={
          <Tip label="New project">
            <button aria-label="New project" data-testid="add-workspace" onClick={openNewProject} className="flex h-6 w-6 items-center justify-center rounded-md text-fg-faint hover:bg-hover hover:text-fg">
              <FolderPlus size={14} />
            </button>
          </Tip>
        }
      >
        Projects
      </SectionLabel>
      <ul className="flex flex-1 flex-col overflow-y-auto px-2 pb-3">
        {workspaces.map((ws) => (
          <ProjectRow key={ws.id} ws={ws} active={ws.id === activeId} now={now} onEdit={() => setEditing(ws.id)} />
        ))}
      </ul>
      <RailFooter />
      {editing && <WorkspaceDialog workspaceId={editing} mode="accounts" onClose={() => setEditing(null)} />}
    </nav>
  )
}
