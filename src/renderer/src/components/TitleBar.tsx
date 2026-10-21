import { Loader2, Mic, PanelLeft, PanelRight, Settings2 } from 'lucide-react'
import type { Mode } from '@shared/types'
import { cn } from '../lib/cn'
import { setMode, toggleRail, toggleSidebar, useApp } from '../lib/store'
import { toggleRecording, useVoice } from '../voice/dictation'
import { IconButton, Tip } from './ui'

const MODES: { id: Mode; label: string; key: string }[] = [
  { id: 'agent', label: 'Agent', key: '1' },
  { id: 'code', label: 'Code', key: '2' },
  { id: 'thread', label: 'Thread', key: '3' }
]

function ModeSwitch({ mode }: { mode: Mode }) {
  return (
    <div role="tablist" aria-label="Mode" className="no-drag flex h-7 items-center gap-0.5 rounded-lg border border-line bg-panel p-[3px]">
      {MODES.map((m) => (
        <Tip key={m.id} label={<>{m.label} mode · Ctrl+{m.key}</>}>
          <button
            role="tab"
            aria-selected={mode === m.id}
            data-mode={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              'no-drag flex h-full min-w-[64px] items-center justify-center rounded-md px-3 text-xs font-medium',
              mode === m.id ? 'bg-hover text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-fg-faint hover:text-fg'
            )}
          >
            {m.label}
          </button>
        </Tip>
      ))}
    </div>
  )
}

function VoiceIndicator() {
  const { ptt, modelProgress } = useVoice()
  const key = useApp((s) => s.snapshot?.settings.pushToTalkKey ?? 'F9')
  const recording = ptt.phase === 'recording'
  const busy = ptt.phase === 'transcribing'
  const label = recording
    ? 'Listening… release to transcribe'
    : busy
      ? modelProgress !== null
        ? `Downloading speech model ${modelProgress}%`
        : 'Transcribing…'
      : ptt.phase === 'error'
        ? ptt.message
        : `Hold ${key} to dictate (or click)`
  return (
    <Tip label={label}>
      <button
        onClick={toggleRecording}
        aria-label={label}
        className={cn(
          'no-drag flex h-7 items-center gap-1.5 rounded-md px-2 text-xs transition-colors',
          recording ? 'bg-err/15 text-err' : busy ? 'text-accent' : ptt.phase === 'error' ? 'text-warn hover:bg-hover' : 'text-fg-muted hover:bg-hover hover:text-fg'
        )}
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Mic size={14} className={recording ? 'pulse-dot' : undefined} />}
        {recording && <span>Listening</span>}
        {busy && <span className="tabular">{modelProgress !== null ? `${modelProgress}%` : 'Transcribing'}</span>}
      </button>
    </Tip>
  )
}

export function TitleBar() {
  const mode = useApp((s) => s.snapshot!.ui.mode)
  const sidebarOpen = useApp((s) => s.snapshot!.ui.sidebarOpen)
  const railOpen = useApp((s) => s.snapshot!.ui.railOpen)
  const isMac = window.api.platform === 'darwin'

  return (
    // Three-column grid keeps the mode switch centred without CSS transforms:
    // Electron computes the title bar's clickable (no-drag) areas without transforms,
    // so a translated switch would sit in the wrong place and swallow clicks.
    // Windows draws its own minimise / maximise / close buttons over the right edge (titleBarOverlay).
    <header
      className="drag grid h-12 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3"
      style={{ paddingLeft: isMac ? 84 : 12, paddingRight: isMac ? 8 : 150 }}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Logo />
          <span className="text-[13px] font-semibold tracking-tight text-fg">AgentDeck</span>
        </div>
        <IconButton
          label={railOpen ? 'Hide the left panel · Ctrl+Shift+B' : 'Show the left panel · Ctrl+Shift+B'}
          onClick={() => toggleRail()}
          className={cn('h-6 w-6', railOpen && 'text-fg')}
        >
          <PanelLeft size={14} />
        </IconButton>
      </div>

      <ModeSwitch mode={mode} />

      <div className="flex items-center justify-end gap-0.5">
        <VoiceIndicator />
        {mode === 'code' && (
          <IconButton label={sidebarOpen ? 'Hide sidebar · Ctrl+B' : 'Show sidebar · Ctrl+B'} onClick={() => toggleSidebar()} className={sidebarOpen ? 'text-fg' : undefined}>
            <PanelRight size={15} />
          </IconButton>
        )}
        <IconButton label="Settings · Ctrl+," onClick={() => useApp.setState({ settingsOpen: 'agents' })}>
          <Settings2 size={15} />
        </IconButton>
      </div>
    </header>
  )
}

/** The AgentDeck mark: a blue tile with a terminal prompt. */
export function Logo({ size = 18 }: { size?: number }) {
  const id = `logo-g-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#60a5fa" />
          <stop offset="1" stopColor="#2563eb" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="2.5" width="21" height="19" rx="5.5" fill={`url(#${id})`} />
      <path d="M7 9.5l3 2.5-3 2.5" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 15h4.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
