import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal, type ITheme } from '@xterm/xterm'
import type { IDockviewPanelProps } from 'dockview-react'
import { useEffect, useRef, useState } from 'react'
import { setPanelPty, type PanelParams } from '../../lib/canvas'
import { subscribePty } from '../../lib/pty-bus'
import { errorText, toast, useApp } from '../../lib/store'
import { LimitBanner } from './LimitBanner'

export const TERMINAL_THEME: ITheme = {
  background: '#0b0d10',
  foreground: '#d8dde3',
  cursor: '#a9b0ff',
  cursorAccent: '#0b0d10',
  selectionBackground: '#8e97ff40',
  black: '#1a1f25',
  red: '#f47067',
  green: '#57c76a',
  yellow: '#e3b341',
  blue: '#6cb6ff',
  magenta: '#c49cff',
  cyan: '#56d4dd',
  white: '#c9d1d9',
  brightBlack: '#6e7781',
  brightRed: '#ff938a',
  brightGreen: '#7ee787',
  brightYellow: '#f2cc60',
  brightBlue: '#91cbff',
  brightMagenta: '#dcbdfb',
  brightCyan: '#87e8ee',
  brightWhite: '#f0f3f6'
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

  // Follow parameter changes (e.g. the pane moved to another account).
  useEffect(() => {
    const sub = props.api.onDidParametersChange((p) => setPtyId((p as unknown as PanelParams).ptyId))
    return () => sub.dispose()
  }, [props.api])

  // A restored layout points at a process from a previous session: start a fresh shell.
  useEffect(() => {
    if ((ptyId && useApp.getState().ptys[ptyId]) || creating.current) return
    creating.current = true
    window.api.pty
      .create({ workspaceId: params.workspaceId, cols: 100, rows: 30 })
      .then((info) => {
        setPanelPty(props, params, info)
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
    const input = term.onData((d) => window.api.pty.write(ptyId, d))
    const resize = term.onResize(({ cols, rows }) => window.api.pty.resize(ptyId, cols, rows))
    try {
      fitRef.current?.fit()
    } catch {
      /* hidden */
    }
    window.api.pty.resize(ptyId, term.cols, term.rows)
    const focus = props.api.onDidActiveChange((e) => e.isActive && term.focus())
    if (props.api.isActive) term.focus()
    return () => {
      cancelled = true
      unsubscribe()
      input.dispose()
      resize.dispose()
      focus.dispose()
    }
  }, [ptyId, alive, props.api])

  return (
    <div className="flex h-full flex-col bg-bg" data-pty-id={ptyId} onMouseDown={() => termRef.current?.focus()}>
      {ptyId && <LimitBanner ptyId={ptyId} />}
      <div ref={host} className="min-h-0 flex-1 overflow-hidden" />
    </div>
  )
}
