import { Bell, Loader2, Mic, PanelLeft, PanelRight } from 'lucide-react'
import { tracker, useActivityClock } from '../lib/activity'
import { cn } from '../lib/cn'
import { setSidebarTab, toggleRail, toggleSidebar, useApp } from '../lib/store'
import { toggleRecording, useVoice } from '../voice/dictation'
import { LayoutMenu } from './code/LayoutMenu'
import { IconButton, Tip } from './ui'

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

/** The bell: how many panes are waiting for you; click to see them on the dashboard. */
function Notifications() {
  const ptys = useApp((s) => s.ptys)
  const now = useActivityClock()
  const waiting = Object.values(ptys).filter((p) => tracker.activity(p, now) === 'needs').length
  const label = waiting === 0 ? 'Nothing needs you' : `${waiting} pane${waiting === 1 ? ' needs' : 's need'} you`
  return (
    <Tip label={label}>
      <button aria-label={label} onClick={() => setSidebarTab('dashboard')} className="no-drag relative flex h-7 w-7 items-center justify-center rounded-md text-fg-muted transition-colors hover:bg-hover hover:text-fg" data-testid="notifications">
        <Bell size={15} />
        {waiting > 0 && (
          <span className="tabular absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-solid px-1 text-[10px] font-semibold leading-none text-white" data-testid="notifications-count">
            {waiting}
          </span>
        )}
      </button>
    </Tip>
  )
}

export function TitleBar() {
  const sidebarOpen = useApp((s) => s.snapshot!.ui.sidebarOpen)
  const railOpen = useApp((s) => s.snapshot!.ui.railOpen)
  const hasWorkspaces = useApp((s) => s.snapshot!.workspaces.length > 0)
  const isMac = window.api.platform === 'darwin'

  return (
    // Windows draws its own minimise / maximise / close buttons over the right edge (titleBarOverlay).
    <header className="drag flex h-12 shrink-0 items-center justify-between gap-3" style={{ paddingLeft: isMac ? 84 : 14, paddingRight: isMac ? 10 : 150 }}>
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Logo size={20} />
          <span className="text-[15px] font-semibold tracking-[-0.015em] text-fg">AgentDeck</span>
        </div>
        <IconButton
          label={railOpen ? 'Hide the left panel · Ctrl+Shift+B' : 'Show the left panel · Ctrl+Shift+B'}
          onClick={() => toggleRail()}
          className={cn('no-drag ml-4 h-7 w-7', railOpen && 'text-fg')}
        >
          <PanelLeft size={15} />
        </IconButton>
      </div>

      {hasWorkspaces && (
        <div className="flex items-center gap-1">
          <LayoutMenu />
          <VoiceIndicator />
          <Notifications />
          <IconButton label={sidebarOpen ? 'Hide sidebar · Ctrl+B' : 'Show sidebar · Ctrl+B'} onClick={() => toggleSidebar()} className={cn('no-drag', sidebarOpen && 'text-fg')}>
            <PanelRight size={15} />
          </IconButton>
        </div>
      )}
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
