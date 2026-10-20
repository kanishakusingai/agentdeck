import { create } from 'zustand'
import type { AppSnapshot, RunSummary } from '@shared/api'
import type { DetectedAgent, Mode, PtyInfo, Routine, Settings, SidebarTab, UiState, UsageLimitEvent } from '@shared/types'

export type PanelKind = 'terminal' | 'browser' | 'thread'

export interface PanelSummary {
  id: string
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
  runs: RunSummary[]
  panels: Record<string, PanelSummary[]>
  activePanel: { workspaceId: string; panelId: string } | null
  settingsOpen: SettingsSection | null
  selectedThreadId: string | null
  selectedRoutineId: string | null
  selectedRunId: string | null
  routineDraft: Partial<Routine> | null
  threadQuery: string
  toasts: Toast[]
}

export const useApp = create<State>(() => ({
  ready: false,
  snapshot: null,
  ptys: {},
  agents: [],
  limits: {},
  runs: [],
  panels: {},
  activePanel: null,
  settingsOpen: null,
  selectedThreadId: null,
  selectedRoutineId: null,
  selectedRunId: null,
  routineDraft: null,
  threadQuery: '',
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

export const setMode = (mode: Mode): void => patchUi({ mode })
export const setActiveWorkspace = (activeWorkspaceId: string | undefined): void => patchUi({ activeWorkspaceId })
export const toggleSidebar = (open?: boolean): void => patchUi({ sidebarOpen: open ?? !ui().sidebarOpen })
export const toggleRail = (open?: boolean): void => patchUi({ railOpen: open ?? !ui().railOpen })
export const setSidebarTab = (sidebarTab: SidebarTab): void => patchUi({ sidebarTab, sidebarOpen: true })

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
  const [snapshot, ptyList, agents, runs] = await Promise.all([
    a.app.getSnapshot(),
    a.pty.list(),
    a.agents.detect(),
    a.routines.listRuns()
  ])
  useApp.setState({
    snapshot,
    ptys: Object.fromEntries(ptyList.map((p) => [p.id, p])),
    agents,
    runs,
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
  a.routines.onRuns((list) => useApp.setState({ runs: list }))
}
