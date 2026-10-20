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
  const index = MODES.findIndex((m) => m.id === mode)
  return (
    <div role="tablist" aria-label="Mode" className="no-drag relative grid h-7 grid-cols-3 rounded-md border border-line bg-surface p-0.5">
      {/* Sliding indicator */}
      <span
        aria-hidden
        className="absolute bottom-0.5 top-0.5 w-[calc((100%-4px)/3)] rounded-[5px] border border-line-strong bg-raised transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${index * 100}%)`, left: 2 }}
      />
      {MODES.map((m) => (
        <Tip key={m.id} label={<>{m.label} mode · Ctrl+{m.key}</>}>
          <button
            role="tab"
            aria-selected={mode === m.id}
            data-mode={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              'relative z-10 flex w-[84px] items-center justify-center gap-1.5 rounded-[5px] text-xs font-medium transition-colors',
              mode === m.id ? 'text-fg' : 'text-fg-muted hover:text-fg'
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
    <header className="drag relative flex h-10 shrink-0 items-center border-b border-line bg-bg" style={{ paddingLeft: isMac ? 80 : 12, paddingRight: isMac ? 8 : 146 }}>
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <Logo />
        <span className="text-sm font-semibold tracking-tight text-fg">AgentDeck</span>
        {mode === 'code' && workspace && (
          <>
            <span className="text-fg-faint">/</span>
            <span className="truncate text-sm text-fg-muted">{workspace.name}</span>
          </>
        )}
      </div>

      <div className="absolute left-1/2 -translate-x-1/2">
        <ModeSwitch mode={mode} />
      </div>

      <div className="flex flex-1 items-center justify-end gap-0.5">
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
