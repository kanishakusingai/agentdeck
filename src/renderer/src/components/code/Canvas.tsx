import { DockviewReact, themeDark, type DockviewReadyEvent, type IDockviewHeaderActionsProps, type IDockviewPanelHeaderProps, type IDockviewPanelProps, type IWatermarkPanelProps } from 'dockview-react'
import { Columns2, Globe, Grid2x2, LayoutGrid, MessagesSquare, Plus, Rows2, Square, SquareTerminal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { agentById } from '@shared/agents'
import { accountName } from '../../lib/accounts'
import { arrange, openBrowserPane, openTerminal, openThreadPane, registerCanvas, restoreLayout, type PanelParams } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { toast, useApp } from '../../lib/store'
import { ThreadView } from '../thread/ThreadView'
import { Button, IconButton, StatusDot } from '../ui'
import { BrowserView } from './BrowserView'
import { LaunchAgentMenu } from './LaunchAgentMenu'
import { TerminalPanel } from './TerminalPanel'

const THEME = { ...themeDark, name: 'agentdeck', className: 'dockview-theme-agentdeck' }

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
  useEffect(() => {
    const sub = props.api.onDidTitleChange((e) => setTitle(e.title))
    return () => sub.dispose()
  }, [props.api])
  const Icon = params.kind === 'browser' ? Globe : params.kind === 'thread' ? MessagesSquare : SquareTerminal
  return (
    <div className="group flex h-full items-center gap-1.5 pr-0.5 text-xs" data-testid="pane-tab">
      {info ? <StatusDot status={info.status} /> : <Icon size={12} className="text-fg-faint" />}
      <span className="max-w-[180px] truncate">{title}</span>
      {account && <span className="rounded bg-raised px-1 py-px text-2xs text-fg-muted">{account}</span>}
      <button
        aria-label={`Close ${title}`}
        onClick={(e) => {
          e.stopPropagation()
          props.api.close()
        }}
        className="ml-0.5 rounded p-0.5 text-fg-faint opacity-60 hover:bg-hover hover:text-fg group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  )
}

function GroupActions(props: IDockviewHeaderActionsProps) {
  const params = props.activePanel?.params as unknown as PanelParams | undefined
  const info = useApp((s) => (params?.ptyId ? s.ptys[params.ptyId] : undefined))
  if (!params) return null
  const split = (direction: 'right' | 'below'): void =>
    void openTerminal({ workspaceId: params.workspaceId, direction, referencePanel: props.activePanel!.id })
  const readThread = async (): Promise<void> => {
    const thread = info && (await window.api.threads.forPty(info.id))
    if (thread) void openThreadPane(params.workspaceId, thread.id, thread.title)
    else toast('No conversation saved yet — send the agent a message first.')
  }
  return (
    <div className="flex h-full items-center gap-0.5 px-1">
      {info && agentById(info.agentId)?.provider && (
        <IconButton label="Read this conversation as a thread" onClick={() => void readThread()} className="h-6 w-6">
          <MessagesSquare size={13} />
        </IconButton>
      )}
      <IconButton label="Split right" onClick={() => split('right')} className="h-6 w-6">
        <Columns2 size={13} />
      </IconButton>
      <IconButton label="Split down" onClick={() => split('below')} className="h-6 w-6">
        <Rows2 size={13} />
      </IconButton>
    </div>
  )
}

function makeWatermark(workspaceId: string) {
  return function Watermark(_props: IWatermarkPanelProps) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg border border-line bg-surface text-fg-muted">
          <SquareTerminal size={20} />
        </div>
        <div>
          <div className="text-base font-semibold text-fg">No panes open</div>
          <div className="mt-1 max-w-sm text-sm text-fg-muted">Launch an agent to start working in this folder, or open a plain terminal.</div>
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
  return (
    <div className="flex h-10 shrink-0 items-center gap-1.5 border-b border-line px-2.5">
      <LaunchAgentMenu workspaceId={workspaceId} />
      <Button size="sm" variant="ghost" onClick={() => void openTerminal({ workspaceId })} data-testid="new-terminal">
        <Plus size={13} /> Terminal
      </Button>
      <Button size="sm" variant="ghost" onClick={() => void openBrowserPane(workspaceId, browserHome)}>
        <Globe size={13} /> Browser
      </Button>
      <div className="flex-1" />
      <div className={cn('flex items-center gap-0.5', count === 0 && 'opacity-40 pointer-events-none')}>
        <IconButton label="Single pane" onClick={() => arrange(workspaceId, 1)}>
          <Square size={14} />
        </IconButton>
        <IconButton label="Two side by side" onClick={() => arrange(workspaceId, 2)}>
          <Columns2 size={14} />
        </IconButton>
        <IconButton label="Four in a grid" onClick={() => arrange(workspaceId, 4)}>
          <Grid2x2 size={14} />
        </IconButton>
        <Button size="sm" variant="ghost" onClick={() => arrange(workspaceId)} data-testid="tidy">
          <LayoutGrid size={13} /> Tidy
        </Button>
      </div>
    </div>
  )
}
