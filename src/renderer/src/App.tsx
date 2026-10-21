import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useEffect } from 'react'
import { sessionsOf } from '@shared/types'
import { AgentsDirectory } from './components/code/AgentsDirectory'
import { Canvas } from './components/code/Canvas'
import { addWorkspace, CodeRail } from './components/code/CodeRail'
import { NewProjectDialog, openNewProject } from './components/code/NewProject'
import { ResizableSidebar } from './components/code/ResizableSidebar'
import { Welcome } from './components/code/Welcome'
import { AskHost } from './components/Ask'
import { SettingsDialog } from './components/SettingsDialog'
import { TitleBar } from './components/TitleBar'
import { TooltipProvider } from './components/ui'
import { activeSessionId, arrange, canvasFor, openTerminal, toggleMaximize } from './lib/canvas'
import { RAIL_WIDTH } from './lib/sidebar'
import { boot, toggleRail, toggleSidebar, useApp } from './lib/store'
import { installPushToTalk } from './voice/dictation'

function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      const { snapshot } = useApp.getState()
      if (!snapshot) return
      const wsId = snapshot.ui.activeWorkspaceId
      const run = (fn: () => void): void => {
        e.preventDefault()
        e.stopPropagation()
        fn()
      }
      // F11: the active pane fills the screen (again to show all panes).
      if (e.key === 'F11' && !ctrl && !e.shiftKey && !e.altKey) {
        if (wsId) run(() => toggleMaximize(activeSessionId(wsId)))
        return
      }
      if (!ctrl) return
      const k = e.key.toLowerCase()
      if (!e.shiftKey && k === 'b') return run(() => toggleSidebar())
      if (e.shiftKey && k === 'b') return run(() => toggleRail())
      if (!e.shiftKey && k === ',') return run(() => useApp.setState({ settingsOpen: 'agents' }))
      if (!e.shiftKey && k === 'o') return run(() => void addWorkspace())
      if (!e.shiftKey && k === 'n') return run(() => openNewProject())
      if (!e.shiftKey || !wsId) return
      if (k === 't') return run(() => void openTerminal({ workspaceId: wsId }))
      if (k === 'a') return run(() => void openTerminal({ workspaceId: wsId, agentId: 'claude' }))
      if (k === 'l') return run(() => arrange(activeSessionId(wsId)))
      const down = k === 'd' || k === '_' || k === '-'
      if (down || k === '|' || k === '\\') {
        const ref = canvasFor(activeSessionId(wsId))?.activePanel?.id
        return run(() => void openTerminal({ workspaceId: wsId, referencePanel: ref, direction: down ? 'below' : 'right' }))
      }
    }
    // Capture so shortcuts work even while a terminal has focus.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])
}

function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div aria-live="polite" className="pointer-events-none fixed bottom-5 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex max-w-lg items-start gap-2.5 rounded-xl border border-line-strong bg-raised/95 px-4 py-3 text-sm text-fg shadow-[0_16px_40px_rgba(0,0,0,0.55)] backdrop-blur"
        >
          {t.kind === 'error' ? <AlertCircle size={15} className="mt-px shrink-0 text-err" /> : t.kind === 'success' ? <CheckCircle2 size={15} className="mt-px shrink-0 text-ok" /> : <Info size={15} className="mt-px shrink-0 text-accent" />}
          <span className="leading-snug">{t.text}</span>
        </div>
      ))}
    </div>
  )
}

/** The panes: every session of every project keeps its canvas mounted so terminals keep running. */
function Panes() {
  const workspaces = useApp((s) => s.snapshot!.workspaces)
  const activeId = useApp((s) => s.snapshot!.ui.activeWorkspaceId)
  // Re-render when the shown session changes (activeSessionId reads it).
  useApp((s) => s.snapshot!.ui.activeSessions)
  return (
    <div className="relative h-full min-h-0">
      {workspaces.flatMap((w) => {
        const shown = activeSessionId(w.id)
        return sessionsOf(w).map((s) => <Canvas key={s.id} workspaceId={w.id} sessionId={s.id} visible={w.id === activeId && s.id === shown} />)
      })}
    </div>
  )
}

export function App() {
  const ready = useApp((s) => s.ready)
  const hasWorkspaces = useApp((s) => (s.snapshot?.workspaces.length ?? 0) > 0)
  const railOpen = useApp((s) => s.snapshot?.ui.railOpen !== false)
  const sidebarOpen = useApp((s) => Boolean(s.snapshot?.ui.sidebarOpen))
  useShortcuts()

  useEffect(() => {
    void boot()
    return installPushToTalk()
  }, [])

  if (!ready) return <div className="h-full bg-bg" />

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-bg">
        <TitleBar />
        <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
          {/* With no project yet, the welcome screen takes the whole window. */}
          {railOpen && hasWorkspaces && (
            <aside className="card shrink-0 overflow-hidden" style={{ width: RAIL_WIDTH }} data-testid="rail">
              <CodeRail />
            </aside>
          )}
          <main className="relative min-w-0 flex-1" data-testid="main">
            {hasWorkspaces ? <Panes /> : <Welcome />}
          </main>
          {sidebarOpen && hasWorkspaces && <ResizableSidebar />}
        </div>
      </div>
      <SettingsDialog />
      <AskHost />
      <NewProjectDialog />
      <AgentsDirectory />
      <Toasts />
    </TooltipProvider>
  )
}
