import { Check, Folder, FolderInput, FolderMinus, FolderPlus, Maximize2, Pencil, X } from 'lucide-react'
import type { Project } from '@shared/types'
import { canvasFor, closePanel, focusPanel, moveToProject, toggleZoom } from '../../lib/canvas'
import { createProject } from '../../lib/projects'
import { useApp } from '../../lib/store'
import { askConfirm, askText } from '../Ask'
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from '../ui'

const NO_PROJECTS: Project[] = []

/** Ask before closing a pane (a terminal's process stops). */
export async function confirmClose(workspaceId: string, panelId: string, title: string, kind: string): Promise<void> {
  const ok = await askConfirm({
    title: `Close “${title}”?`,
    body:
      kind === 'terminal'
        ? 'The program running in this terminal stops. Your files are not touched.'
        : 'The pane closes. You can open it again any time.',
    confirmLabel: kind === 'terminal' ? 'Close terminal' : 'Close pane'
  })
  if (ok) closePanel(workspaceId, panelId)
}

async function renamePane(workspaceId: string, panelId: string, title: string): Promise<void> {
  const name = await askText({ title: 'Rename pane', label: 'Name', initial: title, confirmLabel: 'Rename', icon: 'rename' })
  if (name) canvasFor(workspaceId)?.getPanel(panelId)?.api.setTitle(name)

}

/** The right-click menu of a pane — used by the side panel rows and the pane tabs. */
export function PaneMenuItems({
  workspaceId,
  panelId,
  title,
  kind,
  projectId,
  showFocus
}: {
  workspaceId: string
  panelId: string
  title: string
  kind: string
  projectId?: string
  showFocus?: boolean
}) {
  const projects = useApp((s) => s.snapshot!.workspaces.find((w) => w.id === workspaceId)?.projects ?? NO_PROJECTS)
  return (
    <>
      {showFocus && (
        <MenuItem onSelect={() => focusPanel(workspaceId, panelId)}>
          <FolderInput size={13} className="text-fg-muted" /> Go to pane
        </MenuItem>
      )}
      <MenuSub>
        <MenuSubTrigger>
          <Folder size={13} className="text-fg-muted" /> Move to project
        </MenuSubTrigger>
        <MenuSubContent>
          {projects.map((p) => (
            <MenuItem key={p.id} onSelect={() => moveToProject(workspaceId, panelId, p.id)}>
              <Folder size={13} className="text-fg-muted" />
              <span className="truncate">{p.name}</span>
              {p.id === projectId && <Check size={13} className="ml-auto text-accent-strong" />}
            </MenuItem>
          ))}
          {projects.length > 0 && <MenuSeparator />}
          <MenuItem onSelect={() => void createProject(workspaceId, panelId)}>
            <FolderPlus size={13} className="text-fg-muted" /> New project…
          </MenuItem>
          {projectId && (
            <MenuItem onSelect={() => moveToProject(workspaceId, panelId, undefined)}>
              <FolderMinus size={13} className="text-fg-muted" /> Remove from project
            </MenuItem>
          )}
        </MenuSubContent>
      </MenuSub>
      <MenuItem onSelect={() => void renamePane(workspaceId, panelId, title)}>
        <Pencil size={13} className="text-fg-muted" /> Rename
      </MenuItem>
      <MenuItem onSelect={() => toggleZoom(workspaceId, panelId)} hint="F11">
        <Maximize2 size={13} className="text-fg-muted" /> Full screen
      </MenuItem>
      <MenuSeparator />
      <MenuItem danger onSelect={() => void confirmClose(workspaceId, panelId, title, kind)}>
        <X size={13} /> {kind === 'terminal' ? 'Close terminal' : 'Close pane'}
      </MenuItem>
    </>
  )
}
