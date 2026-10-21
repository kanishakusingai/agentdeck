import type { Project } from '@shared/types'
import { askConfirm, askText } from '../components/Ask'
import { clearProject, moveToProject } from './canvas'
import { errorText, toast, useApp } from './store'

const projectsOf = (workspaceId: string): Project[] =>
  useApp.getState().snapshot?.workspaces.find((w) => w.id === workspaceId)?.projects ?? []

async function save(workspaceId: string, projects: Project[]): Promise<boolean> {
  try {
    await window.api.workspaces.setProjects(workspaceId, projects)
    return true
  } catch (err) {
    toast(errorText(err), 'error')
    return false
  }
}

/** Ask for a name, create the project, and (optionally) file a pane under it. Returns its id. */
export async function createProject(workspaceId: string, movePanelId?: string): Promise<string | null> {
  const name = await askText({
    title: 'New project',
    body: 'Group terminals and agents the way you like. You can move panes in and out any time.',
    label: 'Project name',
    placeholder: 'e.g. Backend, Landing page, Bug fixes',
    confirmLabel: 'Create project',
    icon: 'folder'
  })
  if (!name) return null
  const project: Project = { id: crypto.randomUUID(), name }
  if (!(await save(workspaceId, [...projectsOf(workspaceId), project]))) return null
  if (movePanelId) moveToProject(workspaceId, movePanelId, project.id)
  toast(`Project “${name}” created.`, 'success')
  return project.id
}

export async function renameProject(workspaceId: string, projectId: string): Promise<void> {
  const current = projectsOf(workspaceId).find((p) => p.id === projectId)
  if (!current) return
  const name = await askText({ title: 'Rename project', label: 'Project name', initial: current.name, confirmLabel: 'Rename', icon: 'rename' })
  if (!name || name === current.name) return
  await save(
    workspaceId,
    projectsOf(workspaceId).map((p) => (p.id === projectId ? { ...p, name } : p))
  )
}

export async function deleteProject(workspaceId: string, projectId: string): Promise<void> {
  const current = projectsOf(workspaceId).find((p) => p.id === projectId)
  if (!current) return
  const ok = await askConfirm({
    title: `Delete the project “${current.name}”?`,
    body: 'Only the group goes away — its terminals stay open and move back to the workspace.',
    confirmLabel: 'Delete project'
  })
  if (!ok) return
  if (await save(workspaceId, projectsOf(workspaceId).filter((p) => p.id !== projectId))) clearProject(workspaceId, projectId)
}
