import type { DockviewApi, IDockviewPanel } from 'dockview-react'
import type { PtyCreateOptions, PtyInfo } from '@shared/types'
import { buildGridLayout, type PanelState } from './layout'
import { errorText, setActiveWorkspace, setMode, toast, useApp, type PanelKind, type PanelSummary } from './store'

/** Params stored on every panel (persisted with the layout). */
export interface PanelParams {
  kind: PanelKind
  workspaceId: string
  ptyId?: string
  url?: string
  threadId?: string
}

const canvases = new Map<string, DockviewApi>()
const waiters = new Map<string, ((api: DockviewApi) => void)[]>()
/** While > 0, removed panels are being re-arranged, not closed: keep their processes. */
let rearranging = 0

const paramsOf = (p: IDockviewPanel): PanelParams => (p.params ?? {}) as unknown as PanelParams

function summarise(api: DockviewApi): PanelSummary[] {
  return api.panels.map((p) => {
    const params = paramsOf(p)
    return { id: p.id, kind: params.kind ?? 'terminal', title: p.api.title ?? p.title ?? '', ptyId: params.ptyId }
  })
}

function publish(workspaceId: string): void {
  const api = canvases.get(workspaceId)
  if (!api) return
  useApp.setState((s) => ({ panels: { ...s.panels, [workspaceId]: summarise(api) } }))
}

export function registerCanvas(workspaceId: string, api: DockviewApi): () => void {
  canvases.set(workspaceId, api)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  const subs = [
    api.onDidLayoutChange(() => {
      publish(workspaceId)
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => void window.api.app.setLayout(workspaceId, api.toJSON()), 400)
    }),
    api.onDidAddPanel((panel) => {
      publish(workspaceId)
      panel.api.onDidTitleChange(() => publish(workspaceId))
    }),
    api.onDidRemovePanel((panel) => {
      publish(workspaceId)
      const params = paramsOf(panel)
      if (!rearranging && params.kind === 'terminal' && params.ptyId) void window.api.pty.dispose(params.ptyId)
    }),
    api.onDidActivePanelChange(({ panel }) => {
      if (panel) useApp.setState({ activePanel: { workspaceId, panelId: panel.id } })
    })
  ]
  publish(workspaceId)
  waiters.get(workspaceId)?.forEach((fn) => fn(api))
  waiters.delete(workspaceId)
  return () => {
    subs.forEach((s) => s.dispose())
    clearTimeout(saveTimer)
    if (canvases.get(workspaceId) === api) canvases.delete(workspaceId)
  }
}

function whenCanvas(workspaceId: string): Promise<DockviewApi> {
  const api = canvases.get(workspaceId)
  if (api) return Promise.resolve(api)
  return new Promise((resolve) => {
    const list = waiters.get(workspaceId) ?? []
    list.push(resolve)
    waiters.set(workspaceId, list)
  })
}

export function canvasFor(workspaceId: string): DockviewApi | undefined {
  return canvases.get(workspaceId)
}

type Direction = 'right' | 'below' | 'within'

/** Pick a sensible spot: split the active pane along its longer side. */
function placement(api: DockviewApi, direction?: Direction, referencePanel?: string) {
  const ref = referencePanel ? api.getPanel(referencePanel) : api.activePanel
  if (!ref) return undefined
  if (direction) return { referencePanel: ref.id, direction }
  const g = ref.group
  return { referencePanel: ref.id, direction: (g.width >= g.height * 1.3 ? 'right' : 'below') as Direction }
}

export interface OpenTerminalOptions extends Omit<PtyCreateOptions, 'cols' | 'rows'> {
  direction?: Direction
  referencePanel?: string
}

export async function openTerminal(opts: OpenTerminalOptions): Promise<PtyInfo | null> {
  const { direction, referencePanel, ...create } = opts
  setMode('code')
  setActiveWorkspace(opts.workspaceId)
  let info: PtyInfo
  try {
    info = await window.api.pty.create({ ...create, cols: 100, rows: 30 })
  } catch (err) {
    toast(errorText(err), 'error')
    return null
  }
  rememberPty(info)
  const api = await whenCanvas(opts.workspaceId)
  const params: PanelParams = { kind: 'terminal', workspaceId: opts.workspaceId, ptyId: info.id }
  api.addPanel({
    id: `term-${info.id}`,
    component: 'terminal',
    title: info.title,
    params: params as unknown as Record<string, unknown>,
    renderer: 'always',
    position: placement(api, direction, referencePanel)
  })
  return info
}

export async function openBrowserPane(workspaceId: string, url: string): Promise<void> {
  setMode('code')
  setActiveWorkspace(workspaceId)
  const api = await whenCanvas(workspaceId)
  const params: PanelParams = { kind: 'browser', workspaceId, url }
  api.addPanel({
    id: `browser-${crypto.randomUUID()}`,
    component: 'browser',
    title: 'Browser',
    params: params as unknown as Record<string, unknown>,
    renderer: 'always',
    position: placement(api)
  })
}

export async function openThreadPane(workspaceId: string, threadId: string, title: string): Promise<void> {
  setMode('code')
  setActiveWorkspace(workspaceId)
  const api = await whenCanvas(workspaceId)
  const existing = api.panels.find((p) => paramsOf(p).threadId === threadId)
  if (existing) return existing.api.setActive()
  const params: PanelParams = { kind: 'thread', workspaceId, threadId }
  api.addPanel({
    id: `thread-${crypto.randomUUID()}`,
    component: 'thread',
    title: title.length > 28 ? `${title.slice(0, 28)}…` : title,
    params: params as unknown as Record<string, unknown>,
    position: placement(api, 'right')
  })
}

function findPtyPanel(ptyId: string): { workspaceId: string; panel: IDockviewPanel } | undefined {
  for (const [workspaceId, api] of canvases) {
    const panel = api.panels.find((p) => paramsOf(p).ptyId === ptyId)
    if (panel) return { workspaceId, panel }
  }
  return undefined
}

export function focusPanel(workspaceId: string, panelId: string): void {
  setMode('code')
  setActiveWorkspace(workspaceId)
  // Wait a frame so a hidden canvas is visible before focusing.
  requestAnimationFrame(() => canvases.get(workspaceId)?.getPanel(panelId)?.api.setActive())
}

export function focusPty(ptyId: string): void {
  const found = findPtyPanel(ptyId)
  if (found) focusPanel(found.workspaceId, found.panel.id)
}

/** Record a new process locally so its pane can attach before the next broadcast. */
export function rememberPty(info: PtyInfo): void {
  useApp.setState((s) => ({ ptys: { ...s.ptys, [info.id]: info } }))
}

/** Point an existing pane at a new terminal process (account switch). */
export function swapPty(oldPtyId: string, next: PtyInfo): void {
  rememberPty(next)
  const found = findPtyPanel(oldPtyId)
  if (!found) return
  found.panel.api.updateParameters({ ...paramsOf(found.panel), ptyId: next.id })
  found.panel.api.setTitle(next.title)
  publish(found.workspaceId)
}

export function setPanelPty(panel: { api: { updateParameters(p: Record<string, unknown>): void; setTitle(t: string): void } }, params: PanelParams, info: PtyInfo): void {
  rememberPty(info)
  panel.api.updateParameters({ ...params, ptyId: info.id } as unknown as Record<string, unknown>)
  panel.api.setTitle(info.title)
}

/** Re-arrange the canvas: tiles = 1 (single), 2 (2-up), 4 (4-up) or undefined (Tidy: one tile per pane). */
export function arrange(workspaceId: string, tiles?: number): void {
  const api = canvases.get(workspaceId)
  if (!api || api.panels.length === 0) return
  const states: PanelState[] = api.panels.map((p) => {
    const params = paramsOf(p)
    return {
      id: p.id,
      contentComponent: params.kind ?? 'terminal',
      title: p.api.title ?? '',
      params: params as unknown as Record<string, unknown>,
      renderer: params.kind === 'thread' ? undefined : 'always'
    }
  })
  rearranging++
  try {
    api.fromJSON(buildGridLayout(states, { tiles, width: api.width, height: api.height }))
  } finally {
    rearranging--
  }
}

export async function restoreLayout(workspaceId: string, api: DockviewApi, layout: unknown): Promise<void> {
  if (!layout) return
  rearranging++
  try {
    api.fromJSON(layout as Parameters<DockviewApi['fromJSON']>[0])
  } catch {
    api.clear()
  } finally {
    rearranging--
  }
  publish(workspaceId)
}

export function activeTerminalPtyId(): string | undefined {
  const { activePanel, snapshot } = useApp.getState()
  const wsId = activePanel?.workspaceId ?? snapshot?.ui.activeWorkspaceId
  const api = wsId ? canvases.get(wsId) : undefined
  const panel = api?.activePanel
  return panel ? paramsOf(panel).ptyId : undefined
}
