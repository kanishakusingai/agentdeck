import { DockviewReact, themeDark, type DockviewReadyEvent, type DockviewTheme, type IDockviewHeaderActionsProps, type IDockviewPanelHeaderProps, type IDockviewPanelProps, type IWatermarkPanelProps } from 'dockview-react'
import { Globe, Maximize2, Minimize2, MoreHorizontal, SquareTerminal, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { agentById } from '@shared/agents'
import { accountName } from '../../lib/accounts'
import { tracker, useActivityClock } from '../../lib/activity'
import { closePanel, registerCanvas, restoreLayout, sessionOfApi, toggleMaximize, type PanelParams } from '../../lib/canvas'
import { cn } from '../../lib/cn'
import { useApp } from '../../lib/store'
import { ActivityDot, AgentIcon, ContextMenu, Menu, MenuContent, MenuTrigger, Tip } from '../ui'
import { BrowserView } from './BrowserView'
import { LaunchMenu } from './LaunchMenu'
import { NewPaneMenu } from './NewPaneMenu'
import { confirmClose, PaneMenuItems } from './PaneMenu'
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

/** Placeholder for pane kinds older versions saved (Thread mode's panes); restoreLayout removes them at once. */
function GonePanel() {
  return null
}

const components = { terminal: TerminalPanel, browser: BrowserPanel, thread: GonePanel }

/** A pane's name in its header: status dot, the agent's icon, the name (and the account it runs on). */
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
  const agent = agentById(agentId)
  return (
    <ContextMenu className="h-full" menu={<PaneMenuItems sessionId={sessionId} paneId={props.api.id} title={title} kind={params.kind ?? 'terminal'} />}>
      <div className="flex h-full items-center gap-2 pr-1 text-[13px]" data-testid="pane-tab" title={agent ? `${title} · ${agent.label}` : title}>
        {info ? <ActivityDot activity={tracker.activity(info, now)} /> : <span className="h-1.5 w-1.5 rounded-full bg-fg-faint/50" />}
        {params.kind === 'browser' ? <Globe size={14} className="text-fg-muted" /> : <AgentIcon agentId={agentId} size={14} />}
        <span className="max-w-[180px] truncate font-semibold tracking-[-0.01em]">{title}</span>
        {account && <span className="truncate rounded-md border border-line bg-surface px-1.5 py-px text-2xs font-normal text-fg-muted">{account}</span>}
      </div>
    </ContextMenu>
  )
}

const actionBtn = 'flex h-6 w-6 items-center justify-center rounded-md text-fg-faint transition-colors hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg'

/** The buttons on the right of a pane's header: ⋯ menu, fill the screen, + new pane, × close. */
function GroupActions(props: IDockviewHeaderActionsProps) {
  const panel = props.activePanel
  const params = panel?.params as unknown as PanelParams | undefined
  const info = useApp((s) => (params?.ptyId ? s.ptys[params.ptyId] : undefined))
  const [maximized, setMaximized] = useState(() => props.api.isMaximized())
  const [title, setTitle] = useState(panel?.api.title ?? '')
  useEffect(() => {
    const sub = props.containerApi.onDidMaximizedGroupChange(() => setMaximized(props.api.isMaximized()))
    return () => sub.dispose()
  }, [props.containerApi, props.api])
  useEffect(() => {
    if (!panel) return
    setTitle(panel.api.title ?? '')
    const sub = panel.api.onDidTitleChange((e) => setTitle(e.title))
    return () => sub.dispose()
  }, [panel])
  if (!panel || !params) return null
  const sessionId = sessionOfApi(props.containerApi) ?? params.workspaceId
  const kind = params.kind ?? 'terminal'
  const close = (): void => {
    // An agent's conversation is worth a question; a plain terminal or a browser just closes.
    if (info?.agentId && info.status !== 'exited') void confirmClose(sessionId, panel.id, title, kind)
    else closePanel(sessionId, panel.id)
  }
  return (
    <div className="flex h-full items-center gap-0.5 pl-1 pr-1.5">
      <Menu>
        <Tip label="More">
          <MenuTrigger asChild>
            <button aria-label={`${title} options`} className={actionBtn} data-testid="pane-options">
              <MoreHorizontal size={14} />
            </button>
          </MenuTrigger>
        </Tip>
        <MenuContent align="end">
          <PaneMenuItems sessionId={sessionId} paneId={panel.id} title={title} kind={kind} />
        </MenuContent>
      </Menu>
      <Tip label={maximized ? 'Show all panes · F11' : 'Fill the screen · F11'}>
        <button aria-label={maximized ? 'Show all panes' : 'Fill the screen'} onClick={() => toggleMaximize(sessionId, panel.id)} className={actionBtn} data-testid="maximize-pane">
          {maximized ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </button>
      </Tip>
      <NewPaneMenu workspaceId={params.workspaceId} sessionId={sessionId} paneId={panel.id} />
      <Tip label="Close">
        <button aria-label={`Close ${title}`} onClick={close} className={actionBtn} data-testid="close-pane">
          <X size={14} />
        </button>
      </Tip>
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
        <LaunchMenu workspaceId={workspaceId} sessionId={sessionId} />
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
