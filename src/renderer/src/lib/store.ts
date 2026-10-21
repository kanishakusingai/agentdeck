import { create } from 'zustand'
import type { AppSnapshot } from '@shared/api'
import type { DetectedAgent, PtyInfo, Settings, SidebarBrowser, SidebarTab, UiState, UsageLimitEvent } from '@shared/types'
import type { PanelParams } from './canvas'
import { addBrowser, closeBrowser, DEFAULT_BROWSERS, MAIN_BROWSER, shownAfterClose, withUrl } from './sidebar'

export type PanelKind = 'terminal' | 'browser'

/** A pane taken off the screen (its process keeps running); clicking it in the side panel brings it back. */
export interface HiddenPane {
  id: string
  title: string
  params: PanelParams
}

export interface PanelSummary {
  id: string
  agentId?: string
  kind: PanelKind
  title: string
  ptyId?: string
}

export interface Toast {
  id: number
  kind: 'info' | 'error' | 'success'
  text: string
}

export type SettingsSection = 'agents' | 'voice' | 'terminal' | 'shortcuts'

interface State {
  ready: boolean
  snapshot: AppSnapshot | null
  ptys: Record<string, PtyInfo>
  agents: DetectedAgent[]
  limits: Record<string, UsageLimitEvent>
  panels: Record<string, PanelSummary[]>
  activePanel: { workspaceId: string; sessionId: string; panelId: string } | null
  /** Panes taken off the screen with their ×, per session: still running, listed in the side panel. */
  hidden: Record<string, HiddenPane[]>
  settingsOpen: SettingsSection | null
  /** Page titles of the sidebar's browser tabs (not saved). */
  browserTitles: Record<string, string>
  toasts: Toast[]
}

export const useApp = create<State>(() => ({
  ready: false,
  snapshot: null,
  ptys: {},
  agents: [],
  limits: {},
  panels: {},
  activePanel: null,
  hidden: {},
  settingsOpen: null,
  browserTitles: {},
  toasts: []
}))

const api = (): typeof window.api => window.api

// ---------- derived helpers ----------

export const ui = (): UiState => useApp.getState().snapshot!.ui
export const settings = (): Settings => useApp.getState().snapshot!.settings

function patchUi(patch: Partial<UiState>): void {
  const snap = useApp.getState().snapshot
  if (!snap) return
  const next = { ...snap.ui, ...patch }
  useApp.setState({ snapshot: { ...snap, ui: next } })
  void api().app.setUi(next)
}

export const setActiveWorkspace = (activeWorkspaceId: string | undefined): void => patchUi({ activeWorkspaceId })
export const setActiveSession = (workspaceId: string, sessionId: string): void => {
  if (ui().activeSessions?.[workspaceId] === sessionId) return
  patchUi({ activeSessions: { ...ui().activeSessions, [workspaceId]: sessionId } })
}
export const toggleSidebar = (open?: boolean): void => patchUi({ sidebarOpen: open ?? !ui().sidebarOpen })
export const toggleRail = (open?: boolean): void => patchUi({ railOpen: open ?? !ui().railOpen })
export const setSidebarTab = (sidebarTab: SidebarTab): void => patchUi({ sidebarTab, sidebarOpen: true })
export const setSidebarWidth = (width: number): void => {
  const sidebarWidth = Math.round(width)
  if (ui().sidebarWidth !== sidebarWidth) patchUi({ sidebarWidth })
}

export const sidebarBrowsers = (u: UiState = ui()): SidebarBrowser[] => (u.sidebarBrowsers?.length ? u.sidebarBrowsers : DEFAULT_BROWSERS)
export const shownSidebarBrowser = (u: UiState = ui()): string => {
  const id = u.sidebarBrowser ?? MAIN_BROWSER
  return sidebarBrowsers(u).some((b) => b.id === id) ? id : MAIN_BROWSER
}
export const showSidebarBrowser = (id: string): void => patchUi({ sidebarTab: 'browser', sidebarOpen: true, sidebarBrowser: id })
export function newSidebarBrowser(): void {
  const id = crypto.randomUUID().slice(0, 8)
  patchUi({ sidebarBrowsers: addBrowser(sidebarBrowsers(), id), sidebarBrowser: id, sidebarTab: 'browser', sidebarOpen: true })
}
export function closeSidebarBrowser(id: string): void {
  const list = sidebarBrowsers()
  useApp.setState((s) => {
    const { [id]: _gone, ...browserTitles } = s.browserTitles
    return { browserTitles }
  })
  patchUi({ sidebarBrowsers: closeBrowser(list, id), sidebarBrowser: shownAfterClose(list, shownSidebarBrowser(), id) })
}
export function setBrowserTitle(id: string, title: string): void {
  if (useApp.getState().browserTitles[id] !== title) useApp.setState((s) => ({ browserTitles: { ...s.browserTitles, [id]: title } }))
}
/** Remember a sidebar browser's address so it reopens there after a restart. */
export function rememberSidebarBrowserUrl(id: string, url: string): void {
  const list = sidebarBrowsers()
  const tab = list.find((b) => b.id === id)
  if (tab && tab.url !== url) patchUi({ sidebarBrowsers: withUrl(list, id, url) })
}
/** Fold a project shut in the side panel (or open it again). */
export function toggleProjectCollapsed(workspaceId: string): void {
  const shut = ui().collapsedSessions ?? []
  patchUi({ collapsedSessions: shut.includes(workspaceId) ? shut.filter((id) => id !== workspaceId) : [...shut, workspaceId] })
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const snap = useApp.getState().snapshot
  if (!snap) return
  const next = { ...snap.settings, ...patch }
  useApp.setState({ snapshot: { ...snap, settings: next } })
  await api().app.setSettings(next)
}

let toastId = 0
export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const id = ++toastId
  useApp.setState((s) => ({ toasts: [...s.toasts, { id, kind, text }] }))
  setTimeout(() => useApp.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), kind === 'error' ? 7000 : 4000)
}

/** Show an IPC error in plain words. */
export function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

export async function refreshAgents(): Promise<void> {
  useApp.setState({ agents: await api().agents.detect() })
}

// ---------- boot ----------

export async function boot(): Promise<void> {
  const a = api()
  const [snapshot, ptyList, agents] = await Promise.all([a.app.getSnapshot(), a.pty.list(), a.agents.detect()])
  useApp.setState({
    snapshot,
    ptys: Object.fromEntries(ptyList.map((p) => [p.id, p])),
    agents,
    ready: true
  })
  // Keep the active workspace valid.
  if (!snapshot.workspaces.some((w) => w.id === snapshot.ui.activeWorkspaceId)) {
    setActiveWorkspace(snapshot.workspaces[0]?.id)
  }

  a.app.onSnapshot((next) => {
    // The renderer owns UI state; keep its copy to avoid flicker.
    const current = useApp.getState().snapshot
    useApp.setState({ snapshot: { ...next, ui: current?.ui ?? next.ui } })
  })
  a.pty.onInfo((list) => {
    useApp.setState((s) => {
      const ptys = Object.fromEntries(list.map((p) => [p.id, p]))
      const limits = Object.fromEntries(Object.entries(s.limits).filter(([id]) => ptys[id]?.status === 'limited'))
      return { ptys, limits }
    })
  })
  a.pty.onLimit((event) => useApp.setState((s) => ({ limits: { ...s.limits, [event.ptyId]: event } })))
}
