import { AlertCircle, CheckCircle2, FolderPlus, Info } from 'lucide-react'
import { useEffect } from 'react'
import type { Mode } from '@shared/types'
import { AgentMain, RoutineRail } from './components/agent/AgentMode'
import { Canvas, CanvasToolbar } from './components/code/Canvas'
import { addWorkspace, CodeRail } from './components/code/CodeRail'
import { Composer } from './components/code/Composer'
import { Sidebar } from './components/code/Sidebar'
import { SettingsDialog } from './components/SettingsDialog'
import { ThreadMain, ThreadRail } from './components/thread/ThreadMode'
import { Logo, TitleBar } from './components/TitleBar'
import { Button, EmptyState, TooltipProvider } from './components/ui'
import { arrange, openTerminal, canvasFor } from './lib/canvas'
import { cn } from './lib/cn'
import { boot, setMode, toggleSidebar, useApp } from './lib/store'
import { installPushToTalk } from './voice/dictation'

function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const ctrl = e.ctrlKey || e.metaKey
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
    <div aria-live="polite" className="pointer-events-none fixed bottom-4 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.kind === 'error' ? 'alert' : 'status'}
          className="pointer-events-auto flex max-w-lg items-start gap-2 rounded-lg border border-line-strong bg-raised px-3.5 py-2.5 text-sm text-fg shadow-[0_12px_32px_rgba(0,0,0,0.5)]"
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
  if (workspaces.length === 0) {
    return (
      <EmptyState
        icon={<Logo size={34} />}
        title="Add your first workspace"
        body="A workspace is a folder on your computer. Agents you launch here read and change the files inside it, and you watch them work side by side."
      >
        <Button variant="primary" onClick={() => void addWorkspace()} data-testid="add-first-workspace">
          <FolderPlus size={14} /> Choose a folder
        </Button>
      </EmptyState>
    )
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      {activeId && <CanvasToolbar workspaceId={activeId} />}
      <div className="relative min-h-0 flex-1">
        {/* Every workspace keeps its canvas mounted so terminals keep running and stay intact. */}
        {workspaces.map((w) => (
          <Canvas key={w.id} workspaceId={w.id} visible={w.id === activeId} />
        ))}
      </div>
      <Composer />
    </div>
  )
}

export function App() {
  const ready = useApp((s) => s.ready)
  const mode = useApp((s) => s.snapshot?.ui.mode)
  const sidebarOpen = useApp((s) => s.snapshot?.ui.sidebarOpen && s.snapshot.workspaces.length > 0)
  useShortcuts()

  useEffect(() => {
    void boot()
    return installPushToTalk()
  }, [])

  if (!ready || !mode) return <div className="h-full bg-bg" />

  return (
    <TooltipProvider>
      <div className="flex h-full flex-col" data-mode={mode}>
        <TitleBar />
        <div className="flex min-h-0 flex-1">
          <aside className="w-[248px] shrink-0 border-r border-line bg-panel" data-testid={`rail-${mode}`}>
            {mode === 'code' && <CodeRail />}
            {mode === 'thread' && <ThreadRail />}
            {mode === 'agent' && <RoutineRail />}
          </aside>
          <main className="relative min-w-0 flex-1" data-testid={`main-${mode}`}>
            {/* Code mode stays mounted (hidden) so terminals survive mode switches. */}
            <div className={cn('absolute inset-0', mode !== 'code' && 'keep-hidden')} aria-hidden={mode !== 'code'}>
              <CodeMain />
            </div>
            {mode === 'thread' && (
              <div className="absolute inset-0 z-20 bg-bg">
                <ThreadMain />
              </div>
            )}
            {mode === 'agent' && (
              <div className="absolute inset-0 z-20 bg-bg">
                <AgentMain />
              </div>
            )}
          </main>
          {mode === 'code' && sidebarOpen && (
            <div className="w-[360px] shrink-0 border-l border-line bg-panel">
              <Sidebar />
            </div>
          )}
        </div>
      </div>
      <SettingsDialog />
      <Toasts />
    </TooltipProvider>
  )
}
