import type { AddPanelPositionOptions, DockviewApi, IDockviewPanel } from 'dockview-react'
import { MAX_PANES_PER_SESSION, sessionsOf, type PtyCreateOptions, type PtyInfo } from '@shared/types'
import { buildGridLayout, isEvenGrid, planAdd, type GridShape, type PanelState } from './layout'
import { errorText, setActiveSession, setActiveWorkspace, toast, useApp, type HiddenPane, type PanelKind, type PanelSummary } from './store'

/*
 * Every project (workspace) has one or more sessions; every session is its own canvas
 * (a dockview grid) keyed by the session id. The first session's id is the workspace id,
 * so layouts saved before sessions existed still load.
 */

/** Params stored on every panel (persisted with the layout). */
export interface PanelParams {
  kind: PanelKind
  workspaceId: string
  ptyId?: string
  agentId?: string
  accountId?: string
  url?: string
}

/** What is saved per session: the grid, plus panes taken off the screen (still running). */
interface SavedSession {
  v: 2
  dock: unknown
  hidden: HiddenPane[]
}

const canvases = new Map<string, DockviewApi>()
const waiters = new Map<string, ((api: DockviewApi) => void)[]>()
/** While > 0, removed panels are being re-arranged or moved, not closed: keep their processes. */
let rearranging = 0

const paramsOf = (p: IDockviewPanel): PanelParams => (p.params ?? {}) as unknown as PanelParams
const snapshot = () => useApp.getState().snapshot

// ---------- sessions ----------

export function workspaceOfSession(sessionId: string): string | undefined {
  return snapshot()?.workspaces.find((w) => sessionsOf(w).some((s) => s.id === sessionId))?.id
}

/** The session shown for a project (its first one unless the user picked another). */
export function activeSessionId(workspaceId: string): string {
  const ws = snapshot()?.workspaces.find((w) => w.id === workspaceId)
  const sessions = ws ? sessionsOf(ws) : [{ id: workspaceId }]
  const chosen = snapshot()?.ui.activeSessions?.[workspaceId]
  return sessions.some((s) => s.id === chosen) ? chosen! : sessions[0].id
}

export function showSession(sessionId: string): void {
  const workspaceId = workspaceOfSession(sessionId)
  if (!workspaceId) return
  setActiveWorkspace(workspaceId)
  setActiveSession(workspaceId, sessionId)
}

// ---------- registry ----------

function summarise(api: DockviewApi): PanelSummary[] {
  return api.panels.map((p) => {
    const params = paramsOf(p)
    return { id: p.id, kind: params.kind ?? 'terminal', title: p.api.title ?? p.title ?? '', ptyId: params.ptyId, agentId: params.agentId }
  })
}

function publish(sessionId: string): void {
  const api = canvases.get(sessionId)
  if (!api) return
  useApp.setState((s) => ({ panels: { ...s.panels, [sessionId]: summarise(api) } }))
}

function setHidden(sessionId: string, hidden: HiddenPane[]): void {
  useApp.setState((s) => ({ hidden: { ...s.hidden, [sessionId]: hidden } }))
}

const hiddenOf = (sessionId: string): HiddenPane[] => useApp.getState().hidden[sessionId] ?? []

function save(sessionId: string): void {
  const api = canvases.get(sessionId)
  if (!api) return
  const data: SavedSession = { v: 2, dock: api.toJSON(), hidden: hiddenOf(sessionId) }
  void window.api.app.setLayout(sessionId, data)
}

const gridOf = (api: DockviewApi): GridShape | undefined =>
  api.groups.length ? (api.toJSON().grid as unknown as GridShape) : undefined

function isEvenGridOf(api: DockviewApi): boolean {
  const grid = gridOf(api)
  return !grid || isEvenGrid(grid)
}

export function registerCanvas(sessionId: string, api: DockviewApi): () => void {
  canvases.set(sessionId, api)
  let saveTimer: ReturnType<typeof setTimeout> | undefined
  /** Whether the tiles were an even grid before the latest change (removing a pane keeps it even). */
  let even = isEvenGridOf(api)
  const saveNow = (): void => {
    clearTimeout(saveTimer)
    even = isEvenGridOf(api)
    save(sessionId)
  }
  const subs = [
    api.onDidLayoutChange(() => {
      publish(sessionId)
      // Resizes fire constantly: save them shortly after they settle.
      clearTimeout(saveTimer)
      saveTimer = setTimeout(saveNow, 400)
    }),
    api.onDidAddPanel((panel) => {
      publish(sessionId)
      panel.api.onDidTitleChange(() => publish(sessionId))
      if (!rearranging) saveNow()
    }),
    api.onDidRemovePanel((panel) => {
      publish(sessionId)
      const params = paramsOf(panel)
      if (rearranging) return
      if (params.kind === 'terminal' && params.ptyId) void window.api.pty.dispose(params.ptyId)
      retileAfterRemove(sessionId, api, even, saveNow)
    }),
    api.onDidActivePanelChange(({ panel }) => {
      const workspaceId = workspaceOfSession(sessionId)
      if (panel && workspaceId) useApp.setState({ activePanel: { workspaceId, sessionId, panelId: panel.id } })
    })
  ]
  publish(sessionId)
  waiters.get(sessionId)?.forEach((fn) => fn(api))
  waiters.delete(sessionId)
  return () => {
    subs.forEach((s) => s.dispose())
    clearTimeout(saveTimer)
    if (canvases.get(sessionId) === api) canvases.delete(sessionId)
  }
}

/** Removing a tile of an even grid re-tiles the rest so they stay the same size. */
function retileAfterRemove(sessionId: string, api: DockviewApi, wasEven: boolean, saveNow: () => void): void {
  setTimeout(() => {
    if (wasEven && api.panels.length > 0 && !isEvenGridOf(api)) arrange(sessionId)
    else saveNow()
  }, 0)
}

function whenCanvas(sessionId: string): Promise<DockviewApi> {
  const api = canvases.get(sessionId)
  if (api) return Promise.resolve(api)
  return new Promise((resolve) => {
    const list = waiters.get(sessionId) ?? []
    list.push(resolve)
    waiters.set(sessionId, list)
  })
}

export function canvasFor(sessionId: string): DockviewApi | undefined {
  return canvases.get(sessionId)
}

/** The session a dockview instance belongs to. */
export function sessionOfApi(api: DockviewApi): string | undefined {
  for (const [id, a] of canvases) if (a === api) return id
  return undefined
}

// ---------- placing panes ----------

type Direction = 'right' | 'below' | 'within'

/**
 * Where a new pane goes so all tiles stay the same size. `retile` = add it
 * anywhere, then re-arrange everything into an even grid.
 */
function evenPlacement(api: DockviewApi): { position?: AddPanelPositionOptions; retile: boolean } {
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

/** Split the given/active pane along its longer side (or the given direction). */
function placement(api: DockviewApi, direction?: Direction, referencePanel?: string) {
  const ref = referencePanel ? api.getPanel(referencePanel) : api.activePanel
  if (!ref) return undefined
  if (direction) return { referencePanel: ref.id, direction }
  const g = ref.group
  return { referencePanel: ref.id, direction: (g.width >= g.height * 1.3 ? 'right' : 'below') as Direction }
}

/** Add a pane with even tiling (or at an explicit split). */
function place(sessionId: string, api: DockviewApi, add: (position: AddPanelPositionOptions | undefined) => void, direction?: Direction, referencePanel?: string): void {
  if (direction || referencePanel) return add(placement(api, direction, referencePanel))
  const { position, retile } = evenPlacement(api)
  add(position)
  if (retile) arrange(sessionId)
}

/** A session is full at MAX_PANES_PER_SESSION panes on screen. */
function hasRoom(sessionId: string): boolean {
  const count = canvases.get(sessionId)?.panels.length ?? 0
  if (count < MAX_PANES_PER_SESSION) return true
  toast(`This session already shows ${MAX_PANES_PER_SESSION} panes. Start a new session for more — click “New session” in the side panel.`, 'error')
  return false
}

export interface OpenTerminalOptions extends Omit<PtyCreateOptions, 'cols' | 'rows'> {
  direction?: Direction
  referencePanel?: string
  /** Session to open in (default: the project's active session). */
  sessionId?: string
}

export async function openTerminal(opts: OpenTerminalOptions): Promise<PtyInfo | null> {
  const { direction, referencePanel, sessionId: wanted, ...create } = opts
  const sessionId = wanted ?? activeSessionId(opts.workspaceId)
  if (!hasRoom(sessionId)) return null
  showSession(sessionId)
  let info: PtyInfo
  try {
    info = await window.api.pty.create({ ...create, cols: 100, rows: 30 })
  } catch (err) {
    toast(errorText(err), 'error')
    return null
  }
  rememberPty(info)
  const api = await whenCanvas(sessionId)
  place(sessionId, api, (position) => addTerminalPanel(api, info, position), direction, referencePanel)
  return info
}

function terminalParams(info: PtyInfo): PanelParams {
  // agentId/accountId are kept so a restored layout can bring the agent back.
  return { kind: 'terminal', workspaceId: info.workspaceId, ptyId: info.id, agentId: info.agentId, accountId: info.accountId }
}

function addTerminalPanel(api: DockviewApi, info: PtyInfo, position: AddPanelPositionOptions | undefined): void {
  api.addPanel({
    id: `term-${info.id}`,
    component: 'terminal',
    title: info.title,
    params: terminalParams(info) as unknown as Record<string, unknown>,
    renderer: 'always',
    position
  })
}

/** Show a new terminal process right of an existing pane (account switch keeps the old one). */
export function openPtyBeside(existingPtyId: string, info: PtyInfo): void {
  rememberPty(info)
  const found = findPtyPanel(existingPtyId)
  const sessionId = found?.sessionId ?? activeSessionId(info.workspaceId)
  const api = canvases.get(sessionId)
  if (!api) return
  addTerminalPanel(api, info, found ? { referencePanel: found.panel.id, direction: 'right' } : placement(api))
}

// ---------- finding and focusing ----------

function findPtyPanel(ptyId: string): { sessionId: string; panel: IDockviewPanel } | undefined {
  for (const [sessionId, api] of canvases) {
    const panel = api.panels.find((p) => paramsOf(p).ptyId === ptyId)
    if (panel) return { sessionId, panel }
  }
  return undefined
}

export function focusPanel(sessionId: string, panelId: string): void {
  showSession(sessionId)
  // Wait a frame so a hidden canvas is visible before focusing.
  requestAnimationFrame(() => canvases.get(sessionId)?.getPanel(panelId)?.api.setActive())
}

/** Bring a process's pane forward (putting it back on screen if it was taken off). */
export function focusPty(ptyId: string): void {
  const found = findPtyPanel(ptyId)
  if (found) return focusPanel(found.sessionId, found.panel.id)
  for (const [sessionId, list] of Object.entries(useApp.getState().hidden)) {
    const pane = list.find((h) => h.params.ptyId === ptyId)
    if (pane) return void showHiddenPane(sessionId, pane.id)
  }
}

/** Close a pane for good (a terminal's process stops). */
export function closePanel(sessionId: string, panelId: string): void {
  canvases.get(sessionId)?.getPanel(panelId)?.api.close()
}

// ---------- taking panes off the screen and back ----------

/** Take a pane off the screen; its process keeps running and it stays listed in the side panel. */
export function hidePanel(sessionId: string, panelId: string): void {
  const api = canvases.get(sessionId)
  const panel = api?.getPanel(panelId)
  if (!api || !panel) return
  const pane: HiddenPane = { id: panel.id, title: panel.api.title ?? panel.title ?? 'Terminal', params: paramsOf(panel) }
  const wasEven = isEvenGridOf(api)
  setHidden(sessionId, [...hiddenOf(sessionId).filter((h) => h.id !== pane.id), pane])
  rearranging++
  try {
    api.removePanel(panel)
  } finally {
    rearranging--
  }
  retileAfterRemove(sessionId, api, wasEven, () => save(sessionId))
}

function addPaneFromParams(api: DockviewApi, pane: HiddenPane, position: AddPanelPositionOptions | undefined): void {
  api.addPanel({
    id: pane.id,
    component: pane.params.kind ?? 'terminal',
    title: pane.title,
    params: pane.params as unknown as Record<string, unknown>,
    renderer: 'always',
    position
  })
}

/** Put a pane that was taken off the screen back (in a new tile). */
export async function showHiddenPane(sessionId: string, paneId: string): Promise<void> {
  const pane = hiddenOf(sessionId).find((h) => h.id === paneId)
  if (!pane || !hasRoom(sessionId)) return
  showSession(sessionId)
  const api = await whenCanvas(sessionId)
  setHidden(sessionId, hiddenOf(sessionId).filter((h) => h.id !== paneId))
  rearranging++
  try {
    place(sessionId, api, (position) => addPaneFromParams(api, pane, position))
  } finally {
    rearranging--
  }
  save(sessionId)
  requestAnimationFrame(() => api.getPanel(paneId)?.api.setActive())
}

/** Stop a pane that is off the screen. */
export function closeHiddenPane(sessionId: string, paneId: string): void {
  const pane = hiddenOf(sessionId).find((h) => h.id === paneId)
  if (!pane) return
  setHidden(sessionId, hiddenOf(sessionId).filter((h) => h.id !== paneId))
  if (pane.params.ptyId) void window.api.pty.dispose(pane.params.ptyId)
  save(sessionId)
}

/** Move a pane (on screen or not) to another session of the same project. */
export async function moveToSession(fromSessionId: string, paneId: string, toSessionId: string): Promise<void> {
  if (fromSessionId === toSessionId) return
  const from = workspaceOfSession(fromSessionId)
  if (!from || from !== workspaceOfSession(toSessionId)) {
    toast('Panes can only move between sessions of the same project (they work in its folder).', 'error')
    return
  }
  const source = canvases.get(fromSessionId)
  const live = source?.getPanel(paneId)
  const hidden = hiddenOf(fromSessionId).find((h) => h.id === paneId)
  if (!live && !hidden) return
  if (!hasRoom(toSessionId)) return
  const pane: HiddenPane = live ? { id: live.id, title: live.api.title ?? live.title ?? 'Terminal', params: paramsOf(live) } : hidden!

  // Off the old session (without stopping the process)...
  if (live && source) {
    const wasEven = isEvenGridOf(source)
    rearranging++
    try {
      source.removePanel(live)
    } finally {
      rearranging--
    }
    retileAfterRemove(fromSessionId, source, wasEven, () => save(fromSessionId))
  } else {
    setHidden(fromSessionId, hiddenOf(fromSessionId).filter((h) => h.id !== paneId))
    save(fromSessionId)
  }
  // ...onto the new one.
  const target = await whenCanvas(toSessionId)
  rearranging++
  try {
    place(toSessionId, target, (position) => addPaneFromParams(target, pane, position))
  } finally {
    rearranging--
  }
  save(toSessionId)
  focusPanel(toSessionId, paneId)
}

// ---------- processes ----------

/** Record a new process locally so its pane can attach before the next broadcast. */
export function rememberPty(info: PtyInfo): void {
  useApp.setState((s) => ({ ptys: { ...s.ptys, [info.id]: info } }))
}

export function setPanelPty(panel: { api: { updateParameters(p: Record<string, unknown>): void; setTitle(t: string): void } }, info: PtyInfo): void {
  rememberPty(info)
  panel.api.updateParameters(terminalParams(info) as unknown as Record<string, unknown>)
  panel.api.setTitle(info.title)
}

// ---------- layout ----------

/** Re-arrange a session: tiles = 1 (single), 2 (2-up), 4 (4-up) or undefined (Tidy: one tile per pane). */
export function arrange(sessionId: string, tiles?: number): void {
  const api = canvases.get(sessionId)
  if (!api || api.panels.length === 0) return
  const states: PanelState[] = api.panels.map((p) => {
    const params = paramsOf(p)
    return {
      id: p.id,
      contentComponent: params.kind ?? 'terminal',
      title: p.api.title ?? '',
      params: params as unknown as Record<string, unknown>,
      renderer: 'always'
    }
  })
  rearranging++
  try {
    api.fromJSON(buildGridLayout(states, { tiles, width: api.width, height: api.height }))
  } finally {
    rearranging--
  }
  // Save right away: the app may be closed before the debounced save runs.
  save(sessionId)
}

/** Pane kinds older versions saved that no longer exist (Thread mode's conversation panes). */
const isGone = (kind: unknown): boolean => kind === 'thread'

export async function restoreLayout(sessionId: string, api: DockviewApi, layout: unknown): Promise<void> {
  if (!layout) return
  const saved = layout as Partial<SavedSession>
  const dock = saved.v === 2 ? saved.dock : layout
  if (saved.v === 2) setHidden(sessionId, (Array.isArray(saved.hidden) ? saved.hidden : []).filter((h) => !isGone(h.params?.kind)))
  if (dock) {
    rearranging++
    try {
      api.fromJSON(dock as Parameters<DockviewApi['fromJSON']>[0])
      // They open as empty placeholders (so the rest of the layout survives), then go.
      for (const p of api.panels.filter((panel) => isGone(paramsOf(panel).kind))) api.removePanel(p)
    } catch {
      api.clear()
    } finally {
      rearranging--
    }
  }
  publish(sessionId)
}

/** A session was deleted: stop everything in it. */
export function disposeSession(sessionId: string): void {
  for (const pane of hiddenOf(sessionId)) if (pane.params.ptyId) void window.api.pty.dispose(pane.params.ptyId)
  setHidden(sessionId, [])
  const api = canvases.get(sessionId)
  for (const p of api?.panels ?? []) {
    const ptyId = paramsOf(p).ptyId
    if (ptyId) void window.api.pty.dispose(ptyId)
  }
}

// ---------- one pane filling the screen ----------

/** Let one pane fill the whole canvas (the others keep running behind it); again to go back. */
export function toggleMaximize(sessionId: string, panelId?: string): void {
  const api = canvases.get(sessionId)
  if (!api) return
  if (api.hasMaximizedGroup()) return api.exitMaximizedGroup()
  const panel = panelId ? api.getPanel(panelId) : api.activePanel
  if (!panel) return
  panel.api.setActive()
  api.maximizeGroup(panel)
}

export function activeTerminalPtyId(): string | undefined {
  const { activePanel, snapshot: snap } = useApp.getState()
  const wsId = activePanel?.workspaceId ?? snap?.ui.activeWorkspaceId
  const sessionId = activePanel?.sessionId ?? (wsId ? activeSessionId(wsId) : undefined)
  const panel = sessionId ? canvases.get(sessionId)?.activePanel : undefined
  return panel ? paramsOf(panel).ptyId : undefined
}
