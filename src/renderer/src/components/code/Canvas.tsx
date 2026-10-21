import { DockviewReact, themeDark, type DockviewReadyEvent, type DockviewTheme, type IDockviewHeaderActionsProps, type IDockviewPanelHeaderProps, type IDockviewPanelProps, type IWatermarkPanelProps } from 'dockview-react'
import { Columns2, Globe, Grid2x2, LayoutGrid, Maximize2, MessagesSquare, Minimize2, Plus, Rows2, Square, SquareTerminal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { agentById } from '@shared/agents'
import { accountName } from '../../lib/accounts'
import { tracker, useActivityClock } from '../../lib/activity'
import { arrange, openBrowserPane, openTerminal, openThreadPane, registerCanvas, restoreLayout, toggleZoom, type PanelParams } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { toast, useApp } from '../../lib/store'
import { ThreadView } from '../thread/ThreadView'
import { ActivityDot, AgentIcon, Button, ContextMenu, IconButton } from '../ui'
import { PaneMenuItems } from './PaneMenu'
import { BrowserView } from './BrowserView'
import { LaunchAgentMenu } from './LaunchAgentMenu'
import { TerminalPanel } from './TerminalPanel'

// Each pane group is drawn as its own card with a gap between them.
const THEME: DockviewTheme = { ...themeDark, name: 'agentdeck', className: 'dockview-theme-agentdeck', gap: 8, dndOverlayMounting: 'relative', dndPanelOverlay: 'group' }

function BrowserPanel(props: IDockviewPanelProps) {
  const params = props.params as unknown as PanelParams
  return (
    <BrowserView
      initialUrl={params.url ?? 'http://localhost:3000'}
      onUrlChange={(url) => props.api.updateParameters({ ...params, url } as unknown as Record<string, unknown>)}
    />
  )
}

function ThreadPanel(props: IDockviewPanelProps) {
  const params = props.params as unknown as PanelParams
  return params.threadId ? <ThreadView threadId={params.threadId} /> : null
}

const components = { terminal: TerminalPanel, browser: BrowserPanel, thread: ThreadPanel }

function PaneTab(props: IDockviewPanelHeaderProps) {
  const params = props.params as unknown as PanelParams
  const [title, setTitle] = useState(props.api.title ?? '')
  const info = useApp((s) => (params.ptyId ? s.ptys[params.ptyId] : undefined))
  const account = useApp((s) => (info?.accountId && agentById(info.agentId)?.provider ? accountName(s.snapshot!, info.accountId) : null))
  const now = useActivityClock()
  useEffect(() => {
    const sub = props.api.onDidTitleChange((e) => setTitle(e.title))
    return () => sub.dispose()
  }, [props.api])
  const agentId = info?.agentId ?? params.agentId
  return (
    <ContextMenu
      className="h-full"
      menu={<PaneMenuItems workspaceId={params.workspaceId} panelId={props.api.id} title={title} kind={params.kind ?? 'terminal'} projectId={params.projectId} />}
    >
    <div className="group flex h-full items-center gap-2 pr-0.5 text-xs" data-testid="pane-tab">
      {info && <ActivityDot activity={tracker.activity(info, now)} />}
      {params.kind === 'browser' ? (
        <Globe size={13} className="text-accent" />
      ) : params.kind === 'thread' ? (
        <MessagesSquare size={13} className="text-fg-muted" />
      ) : (
        <AgentIcon agentId={agentId} size={13} />
      )}
      <span className="max-w-[200px] truncate font-medium">{title}</span>
      {account && <span className="rounded-md border border-line bg-surface px-1.5 py-px text-2xs text-fg-muted">{account}</span>}
      <button
        aria-label={`Close ${title}`}
        onClick={(e) => {
          e.stopPropagation()
          props.api.close()
        }}
        className="ml-0.5 rounded p-0.5 text-fg-faint opacity-0 hover:bg-hover hover:text-fg group-hover:opacity-100 focus:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
    </ContextMenu>
  )
}

function GroupActions(props: IDockviewHeaderActionsProps) {
  const params = props.activePanel?.params as unknown as PanelParams | undefined
  const info = useApp((s) => (params?.ptyId ? s.ptys[params.ptyId] : undefined))
  const [maximized, setMaximized] = useState(() => props.api.isMaximized())
  useEffect(() => {
    const sub = props.containerApi.onDidMaximizedGroupChange(() => setMaximized(props.api.isMaximized()))
    return () => sub.dispose()
  }, [props.api, props.containerApi])
  const zoomedHere = useApp((s) => Boolean(params) && s.zoomed === params!.workspaceId)
  if (!params) return null
  // Full screen = this pane over the whole window (with one pane there is nothing to maximise).
  const fullScreen = zoomedHere && (maximized || props.containerApi.groups.length === 1)
  const split = (direction: 'right' | 'below'): void =>
    void openTerminal({ workspaceId: params.workspaceId, direction, referencePanel: props.activePanel!.id })
  const readThread = async (): Promise<void> => {
    const thread = info && (await window.api.threads.forPty(info.id))
    if (thread) void openThreadPane(params.workspaceId, thread.id, thread.title)
    else toast('No conversation saved yet — send the agent a message first.')
  }
  const btn = 'h-6 w-6 text-fg-faint'
  return (
    <div className="flex h-full items-center gap-0.5 px-1.5">
      {info && agentById(info.agentId)?.provider && (
        <IconButton label="Read this conversation as a thread" onClick={() => void readThread()} className={btn}>
          <MessagesSquare size={13} />
        </IconButton>
      )}
      <IconButton label="Split right" onClick={() => split('right')} className={btn}>
        <Columns2 size={13} />
      </IconButton>
      <IconButton label="Split down" onClick={() => split('below')} className={btn}>
        <Rows2 size={13} />
      </IconButton>
      <IconButton
        label={fullScreen ? 'Exit full screen · F11' : 'Full screen · F11'}
        onClick={() => toggleZoom(params.workspaceId, fullScreen ? undefined : props.activePanel!.id)}
        className={cn(btn, fullScreen && 'text-accent-strong')}
        data-testid="zoom-pane"
      >
        {fullScreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
      </IconButton>
    </div>
  )
}

function makeWatermark(workspaceId: string) {
  return function Watermark(_props: IWatermarkPanelProps) {
    return (
      <div className="card flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-surface text-fg-muted">
          <SquareTerminal size={22} />
        </div>
        <div>
          <div className="text-lg font-semibold tracking-tight text-fg">No panes open</div>
          <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-muted">Launch an agent to start working in this folder, or open a plain terminal.</div>
        </div>
        <div className="flex gap-2">
          <LaunchAgentMenu workspaceId={workspaceId} />
          <Button size="sm" onClick={() => void openTerminal({ workspaceId })}>
            <Plus size={13} /> Terminal
          </Button>
        </div>
      </div>
    )
  }
}

export function Canvas({ workspaceId, visible }: { workspaceId: string; visible: boolean }) {
  const watermark = useRef(makeWatermark(workspaceId)).current
  const cleanup = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanup.current?.(), [])

  const onReady = (e: DockviewReadyEvent): void => {
    void window.api.app.getLayouts().then(async (layouts) => {
      await restoreLayout(workspaceId, e.api, layouts[workspaceId])
      cleanup.current = registerCanvas(workspaceId, e.api)
    })
  }

  return (
    <div className={cn('absolute inset-0', !visible && 'keep-hidden')} aria-hidden={!visible} data-canvas={workspaceId}>
      <DockviewReact
        theme={THEME}
        components={components}
        defaultTabComponent={PaneTab}
        rightHeaderActionsComponent={GroupActions}
        watermarkComponent={watermark}
        onReady={onReady}
        disableFloatingGroups
      />
    </div>
  )
}

export function CanvasToolbar({ workspaceId }: { workspaceId: string }) {
  const browserHome = useApp((s) => s.snapshot!.settings.browserHomeUrl)
  const count = useApp((s) => s.panels[workspaceId]?.length ?? 0)
  const ws = useApp((s) => s.snapshot!.workspaces.find((w) => w.id === workspaceId))
  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 pl-1">
      <div className="mr-2 flex min-w-0 flex-1 items-baseline gap-2">
        <span className="max-w-[60%] shrink-0 truncate text-sm font-semibold text-fg">{ws?.name}</span>
        <span className="hidden min-w-0 truncate font-mono text-2xs text-fg-faint xl:inline" title={ws?.path}>
          {ws?.path}
        </span>
      </div>
      <div className="flex-1" />
      <div className={cn('flex items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5', count === 0 && 'pointer-events-none opacity-40')}>
        <IconButton label="Single pane" onClick={() => arrange(workspaceId, 1)} className="h-6 w-6">
          <Square size={13} />
        </IconButton>
        <IconButton label="Two side by side" onClick={() => arrange(workspaceId, 2)} className="h-6 w-6">
          <Columns2 size={13} />
        </IconButton>
        <IconButton label="Four in a grid" onClick={() => arrange(workspaceId, 4)} className="h-6 w-6">
          <Grid2x2 size={13} />
        </IconButton>
        <IconButton label="Tidy — one tile per pane · Ctrl+Shift+L" onClick={() => arrange(workspaceId)} className="h-6 w-6" data-testid="tidy">
          <LayoutGrid size={13} />
        </IconButton>
      </div>
      <Button size="sm" variant="secondary" onClick={() => void openBrowserPane(workspaceId, browserHome)}>
        <Globe size={13} /> Browser
      </Button>
      <Button size="sm" variant="secondary" onClick={() => void openTerminal({ workspaceId })} data-testid="new-terminal">
        <SquareTerminal size={13} /> Terminal
      </Button>
      <LaunchAgentMenu workspaceId={workspaceId} />
    </div>
  )
}
