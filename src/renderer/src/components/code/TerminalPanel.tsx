import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal, type ITheme } from '@xterm/xterm'
import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import { setPanelPty, type PanelParams } from '../../lib/canvas'
import { subscribePty, writePty } from '../../lib/pty-bus'
import { errorText, toast, useApp } from '../../lib/store'
import { LimitBanner } from './LimitBanner'
import { PaneComposer, type PaneComposerHandle } from './PaneComposer'

export const TERMINAL_THEME: ITheme = {
  background: '#0e0e11',
  foreground: '#e4e4e7',
  cursor: '#60a5fa',
  cursorAccent: '#0e0e11',
  selectionBackground: '#3b82f64d',
  black: '#1b1b1f',
  red: '#f87171',
  green: '#4ade80',
  yellow: '#fbbf24',
  blue: '#60a5fa',
  magenta: '#c084fc',
  cyan: '#22d3ee',
  white: '#d4d4d8',
  brightBlack: '#71717a',
  brightRed: '#fca5a5',
  brightGreen: '#86efac',
  brightYellow: '#fde68a',
  brightBlue: '#93c5fd',
  brightMagenta: '#d8b4fe',
  brightCyan: '#67e8f9',
  brightWhite: '#fafafa'
}

export function TerminalPanel(props: IDockviewPanelProps) {
  const params = props.params as unknown as PanelParams
  const [ptyId, setPtyId] = useState<string | undefined>(params.ptyId)
  const alive = useApp((s) => (ptyId ? Boolean(s.ptys[ptyId]) : false))
  const fontSize = useApp((s) => s.snapshot!.settings.terminalFontSize)
  const host = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const creating = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<PaneComposerHandle>(null)
  const [active, setActive] = useState(props.api.isActive)
  const info = useApp((s) => (ptyId ? s.ptys[ptyId] : undefined))

  useEffect(() => {
    const sub = props.api.onDidActiveChange((e) => setActive(e.isActive))
    return () => sub.dispose()
  }, [props.api])

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
        cols: 100,
        rows: 30
      })
      .then((info) => {
        setPanelPty(props, info)
        setPtyId(info.id)
      })
      .catch((err) => toast(errorText(err), 'error'))
      .finally(() => (creating.current = false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId])

  // Create the xterm view once.
  useEffect(() => {
    const term = new Terminal({
      fontFamily: "'Cascadia Code', 'Cascadia Mono', Consolas, 'JetBrains Mono', monospace",
      fontSize: useApp.getState().snapshot!.settings.terminalFontSize,
      lineHeight: 1.15,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 8000,
      allowProposedApi: true,
      theme: TERMINAL_THEME
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.loadAddon(new WebLinksAddon((_e, uri) => void window.api.app.openExternal(uri)))
    term.open(host.current!)
    termRef.current = term
    fitRef.current = fit

    // Copy with a selection, paste with Ctrl+V.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown') return true
      const ctrl = e.ctrlKey || e.metaKey
      if (ctrl && e.key.toLowerCase() === 'c' && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection())
        term.clearSelection()
        return false
      }
      if (ctrl && e.key.toLowerCase() === 'v') {
        void navigator.clipboard.readText().then((t) => t && term.paste(t))
        e.preventDefault()
        return false
      }
      return true
    })

    const observer = new ResizeObserver(() => {
      if (!host.current || host.current.clientWidth < 20 || host.current.clientHeight < 20) return
      try {
        fit.fit()
      } catch {
        /* not visible */
      }
    })
    observer.observe(host.current!)
    return () => {
      observer.disconnect()
      term.dispose()
      termRef.current = null
    }
  }, [])

  useEffect(() => {
    const term = termRef.current
    if (term && term.options.fontSize !== fontSize) {
      term.options.fontSize = fontSize
      fitRef.current?.fit()
    }
  }, [fontSize])

  // Attach the view to its process: replay scrollback, then stream live output.
  useEffect(() => {
    const term = termRef.current
    if (!term || !ptyId || !alive) return
    term.reset()
    let replayEnd = -1
    const queued: [string, number][] = []
    const unsubscribe = subscribePty(ptyId, (chunk, end) => {
      if (replayEnd < 0) queued.push([chunk, end])
      else if (end > replayEnd) term.write(chunk)
    })
    let cancelled = false
    void window.api.pty.snapshot(ptyId).then((snap) => {
      if (cancelled) return
      term.write(snap.data)
      replayEnd = snap.end
      for (const [chunk, end] of queued) if (end > replayEnd) term.write(chunk)
      queued.length = 0
    })
    const input = term.onData((d) => writePty(ptyId, d))
    const resize = term.onResize(({ cols, rows }) => window.api.pty.resize(ptyId, cols, rows))
    try {
      fitRef.current?.fit()
    } catch {
      /* hidden */
    }
    window.api.pty.resize(ptyId, term.cols, term.rows)
    // A pane that becomes active (new pane, keyboard, rail click) puts the cursor in its message box,
    // unless the user clicked straight into the terminal.
    const focusBox = (): void => {
      requestAnimationFrame(() => {
        if (!panelRef.current?.contains(document.activeElement)) composerRef.current?.focus()
      })
    }
    const focus = props.api.onDidActiveChange((e) => e.isActive && focusBox())
    if (props.api.isActive) focusBox()
    return () => {
      cancelled = true
      unsubscribe()
      input.dispose()
      resize.dispose()
      focus.dispose()
    }
  }, [ptyId, alive, props.api])

  return (
    <div ref={panelRef} className="flex h-full min-h-0 flex-col bg-panel" data-pty-id={ptyId}>
      {ptyId && <LimitBanner ptyId={ptyId} />}
      <div ref={host} className="min-h-0 flex-1 overflow-hidden" onMouseDown={() => termRef.current?.focus()} />
      <PaneComposer
        ref={composerRef}
        ptyId={ptyId}
        workspaceId={info?.workspaceId ?? params.workspaceId}
        agentId={info?.agentId ?? params.agentId}
        active={active}
      />
    </div>
  )
}
