import { ChevronDown, Folder, FolderOpen, FolderPlus, Globe, MessagesSquare, MoreHorizontal, Pencil, Plus, Settings2, SquareTerminal, Trash2, UserRound, Zap } from 'lucide-react'
import { useState } from 'react'
import type { Project, Workspace } from '@shared/types'
import { tracker, useActivityClock } from '../../lib/activity'
import { focusPanel, openTerminal } from '../../lib/canvas'
import { createProject, deleteProject, renameProject } from '../../lib/projects'
import { cn } from '../../lib/cn'
import { errorText, setActiveWorkspace, toast, useApp, type PanelSummary } from '../../lib/store'
import { askConfirm } from '../Ask'
import { ActivityDot, ContextMenu, IconButton, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SectionLabel, Tip } from '../ui'
import { PaneMenuItems } from './PaneMenu'
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

const NO_PANELS: PanelSummary[] = []
const NO_PROJECTS: Project[] = []

function PaneRow({ workspaceId, p, now, indent }: { workspaceId: string; p: PanelSummary; now: number; indent: boolean }) {
  const info = useApp((s) => (p.ptyId ? s.ptys[p.ptyId] : undefined))
  const isActive = useApp((s) => s.activePanel?.workspaceId === workspaceId && s.activePanel.panelId === p.id)
  const Icon = p.kind === 'browser' ? Globe : MessagesSquare
  return (
    <li>
      <ContextMenu menu={<PaneMenuItems workspaceId={workspaceId} panelId={p.id} title={p.title} kind={p.kind} projectId={p.projectId} />}>
        <button
          onClick={() => focusPanel(workspaceId, p.id)}
          data-testid="pane-row"
          className={cn(
            'flex h-7 w-full items-center gap-2.5 rounded-md pr-2 text-left text-xs transition-colors',
            indent ? 'pl-11' : 'pl-7',
            isActive ? 'bg-hover font-medium text-fg' : 'text-fg-muted hover:bg-hover/60 hover:text-fg'
          )}
        >
          {info ? <ActivityDot activity={tracker.activity(info, now)} /> : p.kind === 'terminal' ? <span className="h-1.5 w-1.5 rounded-full bg-fg-faint" /> : <Icon size={12} className="shrink-0 text-fg-faint" />}
          <span className="truncate">{p.title}</span>
        </button>
      </ContextMenu>
    </li>
  )
}

function ProjectSection({ workspaceId, project, panes, now }: { workspaceId: string; project: Project; panes: PanelSummary[]; now: number }) {
  const [open, setOpen] = useState(true)
  return (
    <li data-testid="project-row">
      <ContextMenu
        menu={
          <>
            <MenuItem onSelect={() => void openTerminal({ workspaceId, projectId: project.id })}>
              <SquareTerminal size={13} className="text-fg-muted" /> New terminal here
            </MenuItem>
            <MenuItem onSelect={() => void renameProject(workspaceId, project.id)}>
              <Pencil size={13} className="text-fg-muted" /> Rename
            </MenuItem>
            <MenuSeparator />
            <MenuItem danger onSelect={() => void deleteProject(workspaceId, project.id)}>
              <Trash2 size={13} /> Delete project
            </MenuItem>
          </>
        }
      >
        <div className="group flex h-7 items-center rounded-md pl-5 pr-1 text-xs text-fg-muted hover:bg-hover/60 hover:text-fg">
          <button onClick={() => setOpen(!open)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open}>
            <ChevronDown size={12} className={cn('shrink-0 text-fg-faint transition-transform', !open && '-rotate-90')} />
            {open ? <FolderOpen size={13} className="shrink-0 text-accent-strong" /> : <Folder size={13} className="shrink-0 text-accent-strong" />}
            <span className="truncate font-medium">{project.name}</span>
            <span className="tabular ml-1 text-2xs text-fg-faint">{panes.length}</span>
          </button>
          <Tip label="New terminal in this project">
            <button
              aria-label={`New terminal in ${project.name}`}
              onClick={() => void openTerminal({ workspaceId, projectId: project.id })}
              className="rounded p-1 text-fg-faint opacity-0 hover:bg-hover hover:text-fg focus:opacity-100 group-hover:opacity-100"
            >
              <Plus size={12} />
            </button>
          </Tip>
        </div>
      </ContextMenu>
      {open &&
        (panes.length ? (
          <ul className="flex flex-col gap-px">
            {panes.map((p) => (
              <PaneRow key={p.id} workspaceId={workspaceId} p={p} now={now} indent />
            ))}
          </ul>
        ) : (
          <div className="py-1 pl-11 text-2xs text-fg-faint">Empty — right-click a terminal › Move to project</div>
        ))}
    </li>
  )
}

function PaneRows({ workspaceId, now }: { workspaceId: string; now: number }) {
  const panels = useApp((s) => s.panels[workspaceId] ?? NO_PANELS)
  const projects = useApp((s) => s.snapshot!.workspaces.find((w) => w.id === workspaceId)?.projects ?? NO_PROJECTS)
  const known = new Set(projects.map((p) => p.id))
  const loose = panels.filter((p) => !p.projectId || !known.has(p.projectId))
  if (panels.length === 0 && projects.length === 0) return <div className="py-1 pl-7 text-xs text-fg-faint">No panes yet</div>
  return (
    <ul className="flex flex-col gap-px py-0.5">
      {projects.map((project) => (
        <ProjectSection key={project.id} workspaceId={workspaceId} project={project} panes={panels.filter((p) => p.projectId === project.id)} now={now} />
      ))}
      {loose.map((p) => (
        <PaneRow key={p.id} workspaceId={workspaceId} p={p} now={now} indent={false} />
      ))}
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
            <MenuItem onSelect={() => void createProject(ws.id)}>
              <FolderPlus size={13} className="text-fg-muted" /> New project…
            </MenuItem>
            <MenuSeparator />
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
              onSelect={() =>
                void askConfirm({
                  title: `Remove “${ws.name}” from AgentDeck?`,
                  body: (
                    <>
                      Its panes and projects close. <span className="text-fg">Your files stay where they are</span> — you can add the folder again any time.
                    </>
                  ),
                  confirmLabel: 'Remove workspace'
                }).then((ok) => {
                  if (ok) void window.api.workspaces.remove(ws.id)
                })
              }
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
              {activeId && (
                <>
                  <MenuSeparator />
                  <MenuItem onSelect={() => void createProject(activeId)}>
                    <FolderPlus size={13} className="text-fg-muted" /> New project…
                  </MenuItem>
                </>
              )}
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
