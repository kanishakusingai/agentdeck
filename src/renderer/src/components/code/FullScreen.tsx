import { Minimize2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { agentById } from '@shared/agents'
import { useApp } from '../../lib/store'
import { borrowTerminal, fitTerminal, returnTerminal } from '../../lib/terminals'
import { AgentIcon, IconButton, Kbd } from '../ui'
import { PaneComposer, type PaneComposerHandle } from './PaneComposer'

/**
 * Full screen: the terminal moves into a large window (about 70% of the app) over a
 * see-through blue backdrop, then goes back to its pane — the pane grid never changes.
 */
export function FullScreenTerminal() {
  const zoomed = useApp((s) => s.zoomed)
  const info = useApp((s) => (s.zoomed ? s.ptys[s.zoomed.ptyId] : undefined))
  const host = useRef<HTMLDivElement>(null)
  const composer = useRef<PaneComposerHandle>(null)
  const ptyId = zoomed?.ptyId

  useEffect(() => {
    if (!ptyId || !host.current) return
    const el = host.current
    // Next frame: the window has its final size, so the terminal fits it.
    const raf = requestAnimationFrame(() => borrowTerminal(ptyId, el))
    const observer = new ResizeObserver(() => fitTerminal(ptyId, el))
    observer.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
      returnTerminal(ptyId)
    }
  }, [ptyId])

  // The process ended while shown full screen.
  useEffect(() => {
    if (zoomed && !info) useApp.setState({ zoomed: null })
  }, [zoomed, info])

  if (!zoomed || !info) return null
  const close = (): void => useApp.setState({ zoomed: null })
  const agent = agentById(info.agentId)

  return (
    <div className="fullscreen-fade fixed inset-x-0 bottom-0 top-12 z-[55] flex items-center justify-center p-6" data-testid="fullscreen">
      {/* See-through blue backdrop; clicking it goes back. */}
      <button aria-label="Exit full screen" tabIndex={-1} onClick={close} className="absolute inset-0 cursor-default bg-[radial-gradient(ellipse_at_center,rgba(37,99,235,0.28),rgba(8,12,28,0.72))] backdrop-blur-[6px]" />
      <div className="fullscreen-pop relative flex h-[78%] w-[72%] min-w-[640px] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-accent/60 bg-panel shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_40px_120px_-20px_rgba(0,0,0,0.9)]">
        <header className="flex h-11 shrink-0 items-center gap-2.5 border-b border-line px-3.5">
          <AgentIcon agentId={info.agentId} size={15} />
          <span className="truncate text-[13px] font-semibold text-fg">{info.title}</span>
          {agent && <span className="text-2xs text-fg-faint">{agent.label}</span>}
          <span className="flex-1" />
          <span className="hidden items-center gap-1 text-2xs text-fg-faint md:flex">
            <Kbd>F11</Kbd> or click outside to go back
          </span>
          <IconButton label="Exit full screen · F11" onClick={close} className="h-7 w-7 text-fg-muted" data-testid="exit-fullscreen">
            <Minimize2 size={14} />
          </IconButton>
        </header>
        <div ref={host} className="min-h-0 flex-1 overflow-hidden" data-pty-id={info.id} />
        <PaneComposer ref={composer} ptyId={info.id} workspaceId={info.workspaceId} agentId={info.agentId} active />
      </div>
    </div>
  )
}
