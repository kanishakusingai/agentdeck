import type { Terminal } from '@xterm/xterm'
import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import { setPanelPty, type PanelParams } from '../../lib/canvas'
import { errorText, toast, useApp } from '../../lib/store'
import { attachTerminal, fitTerminal, setTerminalFontSize, useTerminalReady } from '../../lib/terminals'
import { agentById } from '@shared/agents'
import { AgentIcon } from '../ui'
import { LimitBanner } from './LimitBanner'

export function TerminalPanel(props: IDockviewPanelProps) {
  const params = props.params as unknown as PanelParams
  const [ptyId, setPtyId] = useState<string | undefined>(params.ptyId)
  const alive = useApp((s) => (ptyId ? Boolean(s.ptys[ptyId]) : false))
  const info = useApp((s) => (ptyId ? s.ptys[ptyId] : undefined))
  const fontSize = useApp((s) => s.snapshot!.settings.terminalFontSize)
  const host = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const creating = useRef(false)

  // Follow parameter changes (e.g. the pane moved to another account).
  useEffect(() => {
    const sub = props.api.onDidParametersChange((p) => setPtyId((p as unknown as PanelParams).ptyId))
    return () => sub.dispose()
  }, [props.api])

  // A restored layout points at a process from a previous session: start it again.
  // Agent panes reopen the agent's latest conversation in this folder.
  useEffect(() => {
    if ((ptyId && useApp.getState().ptys[ptyId]) || creating.current) return
    creating.current = true
    // Merge what the panel was created with and any later updates (restored panes only have the former).
    const current = { ...(props.params as unknown as PanelParams), ...(props.api.getParameters<PanelParams>() ?? {}) }
    const agent = useApp.getState().agents.find((a) => a.id === current.agentId && a.installed)
    window.api.pty
      .create({
        workspaceId: current.workspaceId,
        agentId: agent?.id,
        accountId: agent ? current.accountId : undefined,
        resume: Boolean(agent),
        // Keep the pane's name (a person's name for agents, or what the user renamed it to).
        title: props.api.title,
        cols: 100,
        rows: 30
      })
      .then((created) => {
        setPanelPty(props, created)
        setPtyId(created.id)
      })
      .catch((err) => toast(errorText(err), 'error'))
      .finally(() => (creating.current = false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId])

  // Show this process's terminal here. The xterm itself lives as long as the process
  // (lib/terminals.ts), so re-arranging panes moves it instead of rebuilding and replaying it.
  useEffect(() => {
    if (!ptyId || !alive || !host.current) return
    const el = host.current
    const view = attachTerminal(ptyId, el)
    termRef.current = view.term
    const observer = new ResizeObserver(() => fitTerminal(ptyId, el))
    observer.observe(el)
    // A pane that becomes active (new pane, keyboard, side panel click) puts the cursor in its terminal.
    const focusTerm = (): void => {
      requestAnimationFrame(() => {
        if (!panelRef.current?.contains(document.activeElement)) view.term.focus()
      })
    }
    const focus = props.api.onDidActiveChange((e) => e.isActive && focusTerm())
    if (props.api.isActive) focusTerm()
    return () => {
      observer.disconnect()
      focus.dispose()
      if (termRef.current === view.term) termRef.current = null
    }
  }, [ptyId, alive, props.api])

  useEffect(() => setTerminalFontSize(fontSize), [fontSize])

  const ready = useTerminalReady((s) => (ptyId ? Boolean(s[ptyId]) : false))

  return (
    <div ref={panelRef} className="flex h-full min-h-0 flex-col bg-panel" data-pty-id={ptyId}>
      {ptyId && <LimitBanner ptyId={ptyId} />}
      <div className="relative min-h-0 flex-1">
        <div ref={host} className="absolute inset-0 overflow-hidden" onMouseDown={() => termRef.current?.focus()} />
        {!ready && <Starting agentId={info?.agentId ?? params.agentId} />}
      </div>
    </div>
  )
}

/** Shown until the process prints something, so a slow agent doesn't look broken. */
function Starting({ agentId }: { agentId?: string }) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 12_000)
    return () => clearTimeout(t)
  }, [])
  const label = agentById(agentId)?.label ?? 'terminal'
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-panel" data-testid="pane-starting">
      <div className="flex w-[240px] flex-col items-center gap-3 text-center">
        <AgentIcon agentId={agentId} size={22} tile />
        <div className="text-[13px] font-medium text-fg">Starting {label}…</div>
        <div className="h-1 w-full overflow-hidden rounded-full bg-hover">
          <div className="boot-bar h-full w-2/5 rounded-full bg-linear-to-r from-transparent via-accent to-transparent" />
        </div>
        <div className="text-2xs leading-relaxed text-fg-faint">
          {slow ? 'Still starting — the first launch can take up to a minute. It will appear here on its own.' : 'It will appear here in a moment.'}
        </div>
      </div>
    </div>
  )
}