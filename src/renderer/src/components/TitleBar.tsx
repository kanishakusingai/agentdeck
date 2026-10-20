import { Bot, Loader2, Mic, MessagesSquare, PanelRight, Settings2, SquareTerminal } from 'lucide-react'
import type { Mode } from '@shared/types'
import { cn } from '../lib/cn'
import { setMode, toggleSidebar, useApp } from '../lib/store'
import { toggleRecording, useVoice } from '../voice/dictation'
import { IconButton, Tip } from './ui'

const MODES: { id: Mode; label: string; icon: typeof Bot; key: string }[] = [
  { id: 'agent', label: 'Agent', icon: Bot, key: '1' },
  { id: 'code', label: 'Code', icon: SquareTerminal, key: '2' },
  { id: 'thread', label: 'Thread', icon: MessagesSquare, key: '3' }
]

function ModeSwitch({ mode }: { mode: Mode }) {
  return (
    <div role="tablist" aria-label="Mode" className="no-drag flex h-7 items-center gap-0.5 rounded-md border border-line bg-surface p-0.5">
      {MODES.map((m) => (
        <Tip key={m.id} label={<>{m.label} mode · Ctrl+{m.key}</>}>
          <button
            role="tab"
            aria-selected={mode === m.id}
            data-mode={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              'no-drag flex h-full w-[84px] items-center justify-center gap-1.5 rounded-[5px] border text-xs font-medium transition-colors',
              mode === m.id ? 'border-line-strong bg-raised text-fg' : 'border-transparent text-fg-muted hover:text-fg'
            )}
          >
            <m.icon size={14} strokeWidth={2} className={mode === m.id ? 'text-accent' : undefined} />
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
  const workspace = useApp((s) => s.snapshot!.workspaces.find((w) => w.id === s.snapshot!.ui.activeWorkspaceId))
  const isMac = window.api.platform === 'darwin'

  return (
    // Three-column grid keeps the mode switch centred without CSS transforms:
    // Electron computes the title bar's clickable (no-drag) areas without transforms,
    // so a translated switch would sit in the wrong place and swallow clicks.
    <header
      className="drag grid h-10 shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 border-b border-line bg-bg"
      style={{ paddingLeft: isMac ? 80 : 12, paddingRight: isMac ? 8 : 146 }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo />
        <span className="text-sm font-semibold tracking-tight text-fg">AgentDeck</span>
        {mode === 'code' && workspace && (
          <>
            <span className="text-fg-faint">/</span>
            <span className="truncate text-sm text-fg-muted">{workspace.name}</span>
          </>
        )}
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

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="2" y="3" width="20" height="18" rx="5" fill="#8e97ff" />
      <path d="M7 9.5l3 2.5-3 2.5" fill="none" stroke="#0b0d10" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 15h4.5" stroke="#0b0d10" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
