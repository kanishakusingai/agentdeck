import { DockviewReact, themeDark, type DockviewReadyEvent, type DockviewTheme, type IDockviewHeaderActionsProps, type IDockviewPanelHeaderProps, type IDockviewPanelProps, type IWatermarkPanelProps } from 'dockview-react'
import { ChevronDown, Columns2, FolderOpen, Globe, Grid2x2, LayoutGrid, Maximize2, MessagesSquare, Plus, Rows2, Square, SquareTerminal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { agentById } from '@shared/agents'
import { MAX_PANES_PER_SESSION, sessionsOf } from '@shared/types'
import { accountName } from '../../lib/accounts'
import { tracker, useActivityClock } from '../../lib/activity'
import { activeSessionId, arrange, hidePanel, openTerminal, openThreadPane, registerCanvas, restoreLayout, sessionOfApi, showSession, toggleZoom, type PanelParams } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { newSession } from '../../lib/sessions'
import { toast, useApp } from '../../lib/store'
import { ThreadView } from '../thread/ThreadView'
import { ActivityDot, AgentIcon, ContextMenu, IconButton, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, Tip } from '../ui'
import { BrowserView } from './BrowserView'
import { LaunchAgentMenu } from './LaunchAgentMenu'
import { PaneMenuItems } from './PaneMenu'
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
  const sessionId = sessionOfApi(props.containerApi) ?? params.workspaceId
  const agentId = info?.agentId ?? params.agentId
  return (
    <ContextMenu className="h-full" menu={<PaneMenuItems sessionId={sessionId} paneId={props.api.id} title={title} kind={params.kind ?? 'terminal'} />}>
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
        <Tip label="Remove from screen — it keeps running in the side panel">
          <button
            aria-label={`Remove ${title} from screen`}
            onClick={(e) => {
              e.stopPropagation()
              hidePanel(sessionId, props.api.id)
            }}
            className="ml-0.5 rounded p-0.5 text-fg-faint opacity-0 hover:bg-hover hover:text-fg group-hover:opacity-100 focus:opacity-100"
          >
            <X size={12} />
          </button>
        </Tip>
      </div>
    </ContextMenu>
  )
}

function GroupActions(props: IDockviewHeaderActionsProps) {
  const params = props.activePanel?.params as unknown as PanelParams | undefined
  const info = useApp((s) => (params?.ptyId ? s.ptys[params.ptyId] : undefined))
  if (!params) return null
  const sessionId = sessionOfApi(props.containerApi) ?? params.workspaceId
  const split = (direction: 'right' | 'below'): void =>
    void openTerminal({ workspaceId: params.workspaceId, sessionId, direction, referencePanel: props.activePanel!.id })
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
      {params.kind === 'terminal' && (
        <IconButton label="Full screen · F11" onClick={() => toggleZoom(sessionId, props.activePanel!.id)} className={btn} data-testid="zoom-pane">
          <Maximize2 size={13} />
        </IconButton>
      )}
    </div>
  )
}

function makeWatermark(workspaceId: string, sessionId: string) {
  return function Watermark(_props: IWatermarkPanelProps) {
    const hidden = useApp((s) => s.hidden[sessionId]?.length ?? 0)
    return (
      <div className="card flex h-full flex-col items-center justify-center gap-5 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-line-strong bg-surface text-fg-muted">
          <SquareTerminal size={22} />
        </div>
        <div>
          <div className="text-lg font-semibold tracking-tight text-fg">Nothing on screen in this session</div>
          <div className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-muted">
            {hidden > 0
              ? `${hidden} pane${hidden === 1 ? ' is' : 's are'} still running — click one in the side panel to bring it back, or start something new.`
              : 'Use Launch to open a terminal or start an agent in this folder.'}
          </div>
        </div>
        <LaunchAgentMenu workspaceId={workspaceId} sessionId={sessionId} />
      </div>
    )
  }
}

export function Canvas({ workspaceId, sessionId, visible }: { workspaceId: string; sessionId: string; visible: boolean }) {
  const watermark = useRef(makeWatermark(workspaceId, sessionId)).current
  const cleanup = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanup.current?.(), [])

  const onReady = (e: DockviewReadyEvent): void => {
    void window.api.app.getLayouts().then(async (layouts) => {
      await restoreLayout(sessionId, e.api, layouts[sessionId])
      cleanup.current = registerCanvas(sessionId, e.api)
    })
  }

  return (
    <div className={cn('absolute inset-0', !visible && 'keep-hidden')} aria-hidden={!visible} data-canvas={sessionId}>
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

/** Session switcher above the canvas (each session is its own screen of panes). */
function SessionTabs({ workspaceId }: { workspaceId: string }) {
  const ws = useApp((s) => s.snapshot!.workspaces.find((w) => w.id === workspaceId))
  const active = useApp((s) => {
    void s.snapshot!.ui.activeSessions
    return activeSessionId(workspaceId)
  })
  if (!ws) return null
  const sessions = sessionsOf(ws)
  return (
    <div role="tablist" aria-label="Sessions" className="flex min-w-0 items-center gap-0.5 rounded-lg border border-line bg-panel p-0.5">
      {sessions.map((s) => (
        <button
          key={s.id}
          role="tab"
          aria-selected={s.id === active}
          onClick={() => showSession(s.id)}
          data-testid="session-tab"
          className={cn(
            'h-6 max-w-[140px] truncate rounded-md px-2.5 text-xs font-medium transition-colors',
            s.id === active ? 'bg-hover text-fg shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]' : 'text-fg-faint hover:text-fg'
          )}
        >
          {s.name}
        </button>
      ))}
      <Tip label="New session — a separate screen in this project">
        <button aria-label="New session" onClick={() => void newSession(workspaceId)} className="flex h-6 w-6 items-center justify-center rounded-md text-fg-faint hover:bg-hover hover:text-fg" data-testid="new-session">
          <Plus size={13} />
        </button>
      </Tip>
    </div>
  )
}

/** One small dropdown for arranging the panes (instead of four buttons in the header). */
function LayoutMenu({ sessionId, count }: { sessionId: string; count: number }) {
  return (
    <Menu>
      <MenuTrigger asChild>
        <button
          disabled={count === 0}
          title={`Layout · ${count} of ${MAX_PANES_PER_SESSION} panes in this session`}
          data-testid="layout-menu"
          className="flex h-7 items-center gap-1.5 rounded-lg border border-line bg-panel px-2 text-xs font-medium text-fg-muted transition-colors hover:bg-hover hover:text-fg disabled:opacity-40 data-[state=open]:bg-hover data-[state=open]:text-fg"
        >
          <LayoutGrid size={13} />
          <span className="tabular">
            {count}/{MAX_PANES_PER_SESSION}
          </span>
          <ChevronDown size={12} className="opacity-60" />
        </button>
      </MenuTrigger>
      <MenuContent align="end">
        <MenuLabel>Arrange panes</MenuLabel>
        <MenuItem onSelect={() => arrange(sessionId, 1)}>
          <Square size={13} className="text-fg-muted" /> One at a time
        </MenuItem>
        <MenuItem onSelect={() => arrange(sessionId, 2)}>
          <Columns2 size={13} className="text-fg-muted" /> Two side by side
        </MenuItem>
        <MenuItem onSelect={() => arrange(sessionId, 4)}>
          <Grid2x2 size={13} className="text-fg-muted" /> Four in a grid
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => arrange(sessionId)} hint="Ctrl+Shift+L" data-testid="tidy">
          <LayoutGrid size={13} className="text-fg-muted" /> Tidy — all panes, equal tiles
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

export function CanvasToolbar({ workspaceId }: { workspaceId: string }) {
  const sessionId = useApp((s) => {
    void s.snapshot!.ui.activeSessions
    return activeSessionId(workspaceId)
  })
  const count = useApp((s) => s.panels[sessionId]?.length ?? 0)
  const ws = useApp((s) => s.snapshot!.workspaces.find((w) => w.id === workspaceId))
  return (
    <div className="flex h-9 shrink-0 items-center gap-2 pl-1">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className="shrink-0 truncate text-sm font-semibold text-fg">{ws?.name}</span>
        <button
          onClick={() => void window.api.workspaces.reveal(workspaceId)}
          title="Open this folder in File Explorer"
          className="flex min-w-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-2xs text-fg-faint transition-colors hover:bg-hover hover:text-fg-muted"
          data-testid="project-path"
        >
          <FolderOpen size={12} className="shrink-0" />
          {/* Full path, trimmed from the left so the folder name stays visible. */}
          <span className="truncate [direction:rtl]">
            <bdi>{ws?.path}</bdi>
          </span>
        </button>
      </div>
      <SessionTabs workspaceId={workspaceId} />
      <LayoutMenu sessionId={sessionId} count={count} />
      <LaunchAgentMenu workspaceId={workspaceId} sessionId={sessionId} />
    </div>
  )
}
