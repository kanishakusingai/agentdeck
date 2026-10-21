import { sessionsOf, type Session } from '@shared/types'
import { askConfirm, askText } from '../components/Ask'
import { activeSessionId, disposeSession, showSession } from './canvas'
import { errorText, toast, useApp } from './store'

/*
 * A project (stored as a workspace) has sessions: separate screens of panes in the same
 * folder — e.g. Claude Code in one session and Codex in another. The first session's id
 * is the project id; later ones are "<projectId>:<uuid>".
 */

const workspaceOf = (workspaceId: string) => useApp.getState().snapshot?.workspaces.find((w) => w.id === workspaceId)

async function saveSessions(workspaceId: string, sessions: Session[]): Promise<boolean> {
  try {
    await window.api.workspaces.setSessions(workspaceId, sessions)
    return true
  } catch (err) {
    toast(errorText(err), 'error')
    return false
  }
}

/** Add a session to a project and show it. Returns its id. */
export async function newSession(workspaceId: string, name?: string): Promise<string | null> {
  const ws = workspaceOf(workspaceId)
  if (!ws) return null
  const sessions = sessionsOf(ws)
  const session: Session = { id: `${workspaceId}:${crypto.randomUUID()}`, name: name ?? `Session ${sessions.length + 1}` }
  if (!(await saveSessions(workspaceId, [...sessions, session]))) return null
  showSession(session.id)
  return session.id
}

export async function renameSession(workspaceId: string, sessionId: string): Promise<void> {
  const ws = workspaceOf(workspaceId)
  const current = ws && sessionsOf(ws).find((s) => s.id === sessionId)
  if (!ws || !current) return
  const name = await askText({ title: 'Rename session', label: 'Session name', initial: current.name, confirmLabel: 'Rename', icon: 'rename' })
  if (!name || name === current.name) return
  await saveSessions(
    workspaceId,
    sessionsOf(ws).map((s) => (s.id === sessionId ? { ...s, name } : s))
  )
}

export async function deleteSession(workspaceId: string, sessionId: string): Promise<void> {
  const ws = workspaceOf(workspaceId)
  const sessions = ws ? sessionsOf(ws) : []
  const current = sessions.find((s) => s.id === sessionId)
  if (!ws || !current) return
  if (sessions.length === 1) {
    toast('A project always keeps at least one session.')
    return
  }
  const ok = await askConfirm({
    title: `Delete the session “${current.name}”?`,
    body: 'Every terminal and agent in it stops. Your files are not touched.',
    confirmLabel: 'Delete session'
  })
  if (!ok) return
  const wasActive = activeSessionId(workspaceId) === sessionId
  disposeSession(sessionId)
  const rest = sessions.filter((s) => s.id !== sessionId)
  if (await saveSessions(workspaceId, rest)) {
    if (wasActive) showSession(rest[0].id)
  }
}

export async function renameProject(workspaceId: string): Promise<void> {
  const ws = workspaceOf(workspaceId)
  if (!ws) return
  const name = await askText({ title: 'Rename project', label: 'Project name', initial: ws.name, confirmLabel: 'Rename', icon: 'rename' })
  if (name && name !== ws.name) await window.api.workspaces.rename(workspaceId, name)
}

export async function removeProject(workspaceId: string): Promise<void> {
  const ws = workspaceOf(workspaceId)
  if (!ws) return
  const ok = await askConfirm({
    title: `Remove the project “${ws.name}”?`,
    body: 'All its sessions, terminals and agents close. Your files stay where they are — you can add the folder again any time.',
    confirmLabel: 'Remove project'
  })
  if (ok) await window.api.workspaces.remove(workspaceId)
}
