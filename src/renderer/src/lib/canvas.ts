import type { AddPanelPositionOptions, DockviewApi, IDockviewPanel } from 'dockview-react'
import type { PtyCreateOptions, PtyInfo } from '@shared/types'
import { buildGridLayout, isEvenGrid, planAdd, type GridShape, type PanelState } from './layout'
import { errorText, setActiveWorkspace, setMode, toast, useApp, type PanelKind, type PanelSummary } from './store'

/** Params stored on every panel (persisted with the layout). */
export interface PanelParams {
  kind: PanelKind
  workspaceId: string
  ptyId?: string
  agentId?: string
  accountId?: string
  url?: string
  threadId?: string
  /** Project this pane is filed under (see Workspace.projects). */
  projectId?: string
}

const canvases = new Map<string, DockviewApi>()
const waiters = new Map<string, ((api: DockviewApi) => void)[]>()
/** True while full screen is being left on purpose (the panels come back a moment later). */
let leavingZoom = false
/** The layout just before full screen, so leaving it puts every pane back at its exact size. */
const beforeZoom = new Map<string, ReturnType<DockviewApi['toJSON']>>()
const nextFrames = (fn: () => void): void => {
  requestAnimationFrame(() => requestAnimationFrame(fn))
}
/** While > 0, removed panels are being re-arranged, not closed: keep their processes. */
let rearranging = 0

const paramsOf = (p: IDockviewPanel): PanelParams => (p.params ?? {}) as unknown as PanelParams

function summarise(api: DockviewApi): PanelSummary[] {
  return api.panels.map((p) => {
    const params = paramsOf(p)
    return { id: p.id, kind: params.kind ?? 'terminal', title: p.api.title ?? p.title ?? '', ptyId: params.ptyId, projectId: params.projectId }
  })
}

function publish(workspaceId: string): void {
  const api = canvases.get(workspaceId)
  if (!api) return
  useApp.setState((s) => ({ panels: { ...s.panels, [workspaceId]: summarise(api) } }))
}

const gridOf = (api: DockviewApi): GridShape | undefined =>
  api.groups.length ? (api.toJSON().grid as unknown as GridShape) : undefined

export function registerCanvas(workspaceId: string, api: DockviewApi): () => void {
  canvases.set(workspaceId, api)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  /** Whether the tiles were an even grid before the latest change (closing a pane keeps it even). */
  let even = isEvenGridOf(api)
  const saveNow = (): void => {
    clearTimeout(saveTimer)
    even = isEvenGridOf(api)
    void window.api.app.setLayout(workspaceId, api.toJSON())
  }
  const subs = [
    api.onDidLayoutChange(() => {
      publish(workspaceId)
      // Resizes fire constantly: save them shortly after they settle.
      clearTimeout(saveTimer)
      saveTimer = setTimeout(saveNow, 400)
    }),
    api.onDidAddPanel((panel) => {
      publish(workspaceId)
      panel.api.onDidTitleChange(() => publish(workspaceId))
      if (!rearranging) saveNow()
    }),
    api.onDidRemovePanel((panel) => {
      publish(workspaceId)
      const params = paramsOf(panel)
      if (rearranging) return
      if (params.kind === 'terminal' && params.ptyId) void window.api.pty.dispose(params.ptyId)
      // Closing a tile of an even grid re-tiles the rest so they stay the same size.
      const wasEven = even
      setTimeout(() => {
        if (wasEven && api.panels.length > 0 && !isEvenGridOf(api)) arrange(workspaceId)
        else saveNow()
      }, 0)
    }),
    api.onDidMaximizedGroupChange(() => {
      // Dockview leaves the maximised view by itself when a pane is added: leave full screen too.
      if (!leavingZoom && !api.hasMaximizedGroup() && api.groups.length > 1 && useApp.getState().zoomed === workspaceId) useApp.setState({ zoomed: null })
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

function isEvenGridOf(api: DockviewApi): boolean {
  const grid = gridOf(api)
  return !grid || isEvenGrid(grid)
}

type Direction = 'right' | 'below' | 'within'

/** A new pane should be seen: leave full screen first. */
function leaveFullScreen(api: DockviewApi): void {
  if (api.hasMaximizedGroup()) api.exitMaximizedGroup()
  if (useApp.getState().zoomed) useApp.setState({ zoomed: null })
}

/**
 * Where a new pane goes so all tiles stay the same size. `retile` = add it
 * anywhere, then re-arrange everything into an even grid.
 */
function evenPlacement(api: DockviewApi): { position?: AddPanelPositionOptions; retile: boolean } {
  leaveFullScreen(api)
  const plan = planAdd(gridOf(api))
  switch (plan.kind) {
    case 'first':
      return { retile: false }
    case 'right':
      return { position: { referenceGroup: plan.groupId, direction: 'right' }, retile: false }
    case 'below':
      return { position: { direction: 'below' }, retile: false }
    case 'retile':
      return { position: api.activePanel ? { referencePanel: api.activePanel.id, direction: 'right' } : undefined, retile: true }
  }
}

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
  /** File the new pane under this project. */
  projectId?: string
}

export async function openTerminal(opts: OpenTerminalOptions): Promise<PtyInfo | null> {
  const { direction, referencePanel, projectId, ...create } = opts
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
  // An explicit split ("Split right / down") goes exactly there; anything else keeps the tiles even.
  if (direction || referencePanel) {
    leaveFullScreen(api)
    addTerminalPanel(api, info, placement(api, direction, referencePanel), projectId)
  } else {
    const { position, retile } = evenPlacement(api)
    addTerminalPanel(api, info, position, projectId)
    if (retile) arrange(opts.workspaceId)
  }
  return info
}

function terminalParams(info: PtyInfo): PanelParams {
  // agentId/accountId are kept so a restored layout can bring the agent back.
  return { kind: 'terminal', workspaceId: info.workspaceId, ptyId: info.id, agentId: info.agentId, accountId: info.accountId }
}

function addTerminalPanel(api: DockviewApi, info: PtyInfo, position: AddPanelPositionOptions | undefined, projectId?: string): void {
  api.addPanel({
    id: `term-${info.id}`,
    component: 'terminal',
    title: info.title,
    params: { ...terminalParams(info), ...(projectId ? { projectId } : {}) } as unknown as Record<string, unknown>,
    renderer: 'always',
    position
  })
}

/** Show a new terminal process right of an existing pane (account switch keeps the old one). */
export function openPtyBeside(existingPtyId: string, info: PtyInfo): void {
  rememberPty(info)
  const found = findPtyPanel(existingPtyId)
  const api = canvases.get(found?.workspaceId ?? info.workspaceId)
  if (!api) return
  addTerminalPanel(api, info, found ? { referencePanel: found.panel.id, direction: 'right' } : placement(api))
}

export async function openBrowserPane(workspaceId: string, url: string): Promise<void> {
  setMode('code')
  setActiveWorkspace(workspaceId)
  const api = await whenCanvas(workspaceId)
  const params: PanelParams = { kind: 'browser', workspaceId, url }
  const { position, retile } = evenPlacement(api)
  api.addPanel({
    id: `browser-${crypto.randomUUID()}`,
    component: 'browser',
    title: 'Browser',
    params: params as unknown as Record<string, unknown>,
    renderer: 'always',
    position
  })
  if (retile) arrange(workspaceId)
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

/** File a pane under a project (or take it out of one with undefined). */
export function moveToProject(workspaceId: string, panelId: string, projectId: string | undefined): void {
  const api = canvases.get(workspaceId)
  const panel = api?.getPanel(panelId)
  if (!api || !panel) return
  panel.api.updateParameters({ ...(panel.params ?? {}), projectId } as Record<string, unknown>)
  publish(workspaceId)
  void window.api.app.setLayout(workspaceId, api.toJSON())
}

/** A project was deleted: its panes stay open, loose in the workspace. */
export function clearProject(workspaceId: string, projectId: string): void {
  const api = canvases.get(workspaceId)
  if (!api) return
  for (const p of api.panels) if (paramsOf(p).projectId === projectId) p.api.updateParameters({ ...(p.params ?? {}), projectId: undefined } as Record<string, unknown>)
  publish(workspaceId)
  void window.api.app.setLayout(workspaceId, api.toJSON())
}

/** Close a pane (a terminal's process stops). */
export function closePanel(workspaceId: string, panelId: string): void {
  canvases.get(workspaceId)?.getPanel(panelId)?.api.close()
}

/** Record a new process locally so its pane can attach before the next broadcast. */
export function rememberPty(info: PtyInfo): void {
  useApp.setState((s) => ({ ptys: { ...s.ptys, [info.id]: info } }))
}

export function setPanelPty(panel: { api: { updateParameters(p: Record<string, unknown>): void; setTitle(t: string): void } }, info: PtyInfo): void {
  rememberPty(info)
  panel.api.updateParameters(terminalParams(info) as unknown as Record<string, unknown>)
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
  // Save right away: the app may be closed before the debounced save runs.
  void window.api.app.setLayout(workspaceId, api.toJSON())
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

/**
 * Show the active (or given) pane over the whole window, or go back to the normal view.
 * The canvas changes size when the side panels hide/show; that must happen while no
 * pane is maximised, or dockview scrambles the other panes' sizes. So: entering hides
 * the panels first and then maximises; leaving restores the panes first, then the panels.
 */
export function toggleZoom(workspaceId: string, panelId?: string): void {
  const api = canvases.get(workspaceId)
  if (!api) return
  if (useApp.getState().zoomed === workspaceId) {
    if (!api.hasMaximizedGroup()) return useApp.setState({ zoomed: null })
    leavingZoom = true
    api.exitMaximizedGroup()
    // Let the panes settle at full-window size before the canvas shrinks back.
    nextFrames(() => {
      leavingZoom = false
      useApp.setState({ zoomed: null })
      nextFrames(() => restoreSizes(workspaceId, api))
    })
    return
  }
  const panel = panelId ? api.getPanel(panelId) : api.activePanel
  if (!panel) return
  setMode('code')
  setActiveWorkspace(workspaceId)
  panel.api.setActive()
  if (api.groups.length > 1) beforeZoom.set(workspaceId, api.toJSON())
  useApp.setState({ zoomed: workspaceId })
  if (api.groups.length < 2) return
  // Wait until the canvas has grown to the full window before maximising.
  nextFrames(() => {
    if (useApp.getState().zoomed === workspaceId && !api.hasMaximizedGroup() && api.getPanel(panel.id)) api.maximizeGroup(panel)
  })
}
/**
 * Dockview keeps the pane sizes when un-maximising, but the window-size change that
 * follows full screen stretches them unevenly. Put the saved layout back if that happened
 * (and nothing was opened or closed meanwhile).
 */
function restoreSizes(workspaceId: string, api: DockviewApi): void {
  const saved = beforeZoom.get(workspaceId)
  beforeZoom.delete(workspaceId)
  if (!saved || api.hasMaximizedGroup()) return
  const now = api.toJSON()
  const ids = (l: typeof saved): string => Object.keys(l.panels).sort().join('|')
  if (ids(saved) !== ids(now) || JSON.stringify(saved.grid.root) === JSON.stringify(now.grid.root)) return
  const activeId = api.activePanel?.id
  rearranging++
  try {
    api.fromJSON({ ...saved, panels: now.panels })
  } finally {
    rearranging--
  }
  if (activeId) api.getPanel(activeId)?.api.setActive()
  void window.api.app.setLayout(workspaceId, api.toJSON())
}

export function activeTerminalPtyId(): string | undefined {
  const { activePanel, snapshot } = useApp.getState()
  const wsId = activePanel?.workspaceId ?? snapshot?.ui.activeWorkspaceId
  const api = wsId ? canvases.get(wsId) : undefined
  const panel = api?.activePanel
  return panel ? paramsOf(panel).ptyId : undefined
}
