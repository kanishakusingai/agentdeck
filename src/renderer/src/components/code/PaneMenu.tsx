import { Check, EyeOff, Layers, Maximize2, MonitorUp, Pencil, Plus, X } from 'lucide-react'
import { sessionsOf, type Session } from '@shared/types'
import { canvasFor, closeHiddenPane, closePanel, hidePanel, moveToSession, showHiddenPane, toggleMaximize, workspaceOfSession } from '../../lib/canvas'
import { newSession } from '../../lib/sessions'
import { useApp } from '../../lib/store'
import { askConfirm, askText } from '../Ask'
import { MenuItem, MenuSeparator, MenuSub, MenuSubContent, MenuSubTrigger } from '../ui'

const NO_SESSIONS: Session[] = []

/** Ask before stopping a pane for good. */
export async function confirmClose(sessionId: string, paneId: string, title: string, kind: string, offScreen = false): Promise<void> {
  const ok = await askConfirm({
    title: `Close “${title}”?`,
    body:
      kind === 'terminal'
        ? 'The program running in this terminal stops and it leaves the project. Your files are not touched. (To only take it off the screen, use '
        : 'The pane closes. You can open it again any time.',
    confirmLabel: kind === 'terminal' ? 'Close terminal' : 'Close pane'
  })
  if (!ok) return
  if (offScreen) closeHiddenPane(sessionId, paneId)
  else closePanel(sessionId, paneId)
}

async function renamePane(sessionId: string, paneId: string, title: string, offScreen: boolean): Promise<void> {
  const name = await askText({ title: 'Rename pane', label: 'Name', initial: title, confirmLabel: 'Rename', icon: 'rename' })
  if (!name) return
  if (!offScreen) return void canvasFor(sessionId)?.getPanel(paneId)?.api.setTitle(name)
  useApp.setState((s) => ({ hidden: { ...s.hidden, [sessionId]: (s.hidden[sessionId] ?? []).map((h) => (h.id === paneId ? { ...h, title: name } : h)) } }))
}

/** The right-click menu of a pane — used by the side panel rows and the pane tabs. */
export function PaneMenuItems({ sessionId, paneId, title, kind, offScreen = false }: { sessionId: string; paneId: string; title: string; kind: string; offScreen?: boolean }) {
  const workspaceId = workspaceOfSession(sessionId)
  // Select the workspace itself (a stable object); sessionsOf may build a new array.
  const ws = useApp((s) => s.snapshot!.workspaces.find((w) => w.id === workspaceId))
  const sessions = ws ? sessionsOf(ws) : NO_SESSIONS
  return (
    <>
      {offScreen ? (
        <MenuItem onSelect={() => void showHiddenPane(sessionId, paneId)}>
          <MonitorUp size={13} className="text-fg-muted" /> Show on screen
        </MenuItem>
      ) : (
        <MenuItem onSelect={() => hidePanel(sessionId, paneId)}>
          <EyeOff size={13} className="text-fg-muted" /> Remove from screen
        </MenuItem>
      )}
      <MenuSub>
        <MenuSubTrigger>
          <Layers size={13} className="text-fg-muted" /> Move to session
        </MenuSubTrigger>
        <MenuSubContent>
          {sessions.map((s) => (
            <MenuItem key={s.id} disabled={s.id === sessionId} onSelect={() => void moveToSession(sessionId, paneId, s.id)}>
              <Layers size={13} className="text-fg-muted" />
              <span className="truncate">{s.name}</span>
              {s.id === sessionId && <Check size={13} className="ml-auto text-accent-strong" />}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            onSelect={() =>
              void (async () => {
                if (!workspaceId) return
                const id = await newSession(workspaceId)
                if (id) await moveToSession(sessionId, paneId, id)
              })()
            }
          >
            <Plus size={13} className="text-fg-muted" /> New session
          </MenuItem>
        </MenuSubContent>
      </MenuSub>
      <MenuItem onSelect={() => void renamePane(sessionId, paneId, title, offScreen)}>
        <Pencil size={13} className="text-fg-muted" /> Rename
      </MenuItem>
      {!offScreen && (
        <MenuItem onSelect={() => toggleMaximize(sessionId, paneId)} hint="F11">
          <Maximize2 size={13} className="text-fg-muted" /> Fill the screen / show all
        </MenuItem>
      )}
      <MenuSeparator />
      <MenuItem danger onSelect={() => void confirmClose(sessionId, paneId, title, kind, offScreen)}>
        <X size={13} /> {kind === 'terminal' ? 'Close terminal' : 'Close pane'}
      </MenuItem>
    </>
  )
}
