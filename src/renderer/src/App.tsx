import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import { useEffect } from 'react'
import type { Mode } from '@shared/types'
import { AgentMain, RoutineRail } from './components/agent/AgentMode'
import { Canvas, CanvasToolbar } from './components/code/Canvas'
import { addWorkspace, CodeRail } from './components/code/CodeRail'
import { Sidebar } from './components/code/Sidebar'
import { Welcome } from './components/code/Welcome'
import { AskHost } from './components/Ask'
import { SettingsDialog } from './components/SettingsDialog'
import { ThreadMain, ThreadRail } from './components/thread/ThreadMode'
import { TitleBar } from './components/TitleBar'
import { TooltipProvider } from './components/ui'
import { arrange, canvasFor, openTerminal, toggleZoom } from './lib/canvas'
import { cn } from './lib/cn'
import { boot, setMode, toggleRail, toggleSidebar, useApp } from './lib/store'
import { installPushToTalk } from './voice/dictation'

function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
      // F11: show the active pane over the whole window (again to go back).
      if (e.key === 'F11' && !ctrl && !e.shiftKey && !e.altKey) {
        const { snapshot, zoomed } = useApp.getState()
        const wsId = zoomed ?? snapshot?.ui.activeWorkspaceId
        if (!wsId || (snapshot?.ui.mode !== 'code' && !zoomed)) return
        e.preventDefault()
        e.stopPropagation()
        return toggleZoom(wsId)
      }
      if (!ctrl) return
      const { snapshot } = useApp.getState()
      if (!snapshot) return
      const wsId = snapshot.ui.activeWorkspaceId
      const k = e.key.toLowerCase()
      const run = (fn: () => void): void => {
        e.preventDefault()
        e.stopPropagation()
        fn()
      }
      if (!e.shiftKey && ['1', '2', '3'].includes(k)) return run(() => setMode((['agent', 'code', 'thread'] as Mode[])[Number(k) - 1]))
      if (!e.shiftKey && k === 'b') return run(() => toggleSidebar())
      if (e.shiftKey && k === 'b') return run(() => toggleRail())
      if (!e.shiftKey && k === ',') return run(() => useApp.setState({ settingsOpen: 'agents' }))
      if (!e.shiftKey && k === 'o') return run(() => void addWorkspace())
      if (!e.shiftKey || !wsId) return
      if (k === 't') return run(() => void openTerminal({ workspaceId: wsId }))
      if (k === 'a') return run(() => void openTerminal({ workspaceId: wsId, agentId: 'claude' }))
      if (k === 'l') return run(() => arrange(wsId))
      if (k === '|' || k === '\\' || k === '_' || k === '-') {
        const ref = canvasFor(wsId)?.activePanel?.id
        return run(() => void openTerminal({ workspaceId: wsId, referencePanel: ref, direction: k === '_' || k === '-' ? 'below' : 'right' }))
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

function CodeMain() {
  const workspaces = useApp((s) => s.snapshot!.workspaces)
  const activeId = useApp((s) => s.snapshot!.ui.activeWorkspaceId)
  const zoomed = useApp((s) => s.zoomed !== null && s.zoomed === activeId)
  if (workspaces.length === 0) return <Welcome />
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {activeId && !zoomed && <CanvasToolbar workspaceId={activeId} />}
      <div className="relative min-h-0 flex-1">
        {/* Every workspace keeps its canvas mounted so terminals keep running and stay intact. */}
        {workspaces.map((w) => (
          <Canvas key={w.id} workspaceId={w.id} visible={w.id === activeId} />
        ))}
      </div>
    </div>
  )
}

export function App() {
  const ready = useApp((s) => s.ready)
  const mode = useApp((s) => s.snapshot?.ui.mode)
  const hasWorkspaces = useApp((s) => (s.snapshot?.workspaces.length ?? 0) > 0)
  const railOpen = useApp((s) => s.snapshot?.ui.railOpen !== false)
  const sidebarOpen = useApp((s) => Boolean(s.snapshot?.ui.sidebarOpen))
  // A pane shown full screen hides everything else in Code mode.
  const zoomed = useApp((s) => s.zoomed !== null && s.zoomed === s.snapshot?.ui.activeWorkspaceId && s.snapshot?.ui.mode === 'code')
  useShortcuts()

  useEffect(() => {
    void boot()
    return installPushToTalk()
  }, [])

  if (!ready || !mode) return <div className="h-full bg-bg" />

  // With no workspace yet, Code mode is a full-width welcome screen.
  const showRail = railOpen && (mode !== 'code' || hasWorkspaces) && !zoomed
  const showSidebar = mode === 'code' && sidebarOpen && hasWorkspaces && !zoomed

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col bg-bg" data-mode={mode}>
        <TitleBar />
        <div className="flex min-h-0 flex-1 gap-2 px-2 pb-2">
          {showRail && (
            <aside className="card w-[244px] shrink-0 overflow-hidden" data-testid={`rail-${mode}`}>
              {mode === 'code' && <CodeRail />}
              {mode === 'thread' && <ThreadRail />}
              {mode === 'agent' && <RoutineRail />}
            </aside>
          )}
          <main className="relative min-w-0 flex-1" data-testid={`main-${mode}`}>
            {/* Code mode stays mounted (hidden) so terminals survive mode switches. */}
            <div className={cn('absolute inset-0', mode !== 'code' && 'keep-hidden')} aria-hidden={mode !== 'code'}>
              <CodeMain />
            </div>
            {mode === 'thread' && (
              <div className="card absolute inset-0 z-20 overflow-hidden">
                <ThreadMain />
              </div>
            )}
            {mode === 'agent' && (
              <div className="card absolute inset-0 z-20 overflow-hidden">
                <AgentMain />
              </div>
            )}
          </main>
          {showSidebar && (
            <div className="card w-[340px] shrink-0 overflow-hidden">
              <Sidebar />
            </div>
          )}
        </div>
      </div>
      <SettingsDialog />
      <AskHost />
      <Toasts />
    </TooltipProvider>
  )
}
